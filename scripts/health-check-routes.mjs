/**
 * Route health check — boots the REAL Express app in a temp DB and probes every
 * route from route-inventory.json, recording the actual HTTP status code.
 *
 * Usage: node scripts/health-check-routes.mjs [--limit N]
 *
 * - Copies database.json into a temp dir (never touches the repo DB).
 * - Registers + logs in a user, then replays every route with auth headers.
 * - Replaces :param segments with sample ids from the seeded DB where possible.
 * - Outputs a JSON report: per-route method/path/status + a summary of 500s.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const limit = process.argv.includes('--limit') ? Number(process.argv[process.argv.indexOf('--limit') + 1]) : Infinity;

// ── Build temp sandbox (mirrors src/test/setup.ts) ─────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-health-'));
fs.copyFileSync(path.join(root, 'database.json'), path.join(tmp, 'database.json'));
if (fs.existsSync(path.join(root, 'community.json'))) fs.copyFileSync(path.join(root, 'community.json'), path.join(tmp, 'community.json'));
if (fs.existsSync(path.join(root, 'sessions.json'))) fs.copyFileSync(path.join(root, 'sessions.json'), path.join(tmp, 'sessions.json'));
fs.mkdirSync(path.join(tmp, 'uploads'), { recursive: true });
process.chdir(tmp);
process.env.NODE_ENV = 'test';

const { app } = await import('../server.ts');
const request = (await import('supertest')).default;

const inventory = JSON.parse(fs.readFileSync(path.join(root, 'scripts/route-inventory.json'), 'utf8'));
const routes = inventory.routes;

// ── Seed a user + collect valid ids for param substitution ────────────────
let token = null;
let userId = null;
async function seedUser() {
  const email = `hchk-${Date.now()}@test.dev`;
  const su = await request(app).post('/api/auth/signup').send({ name: 'Health Check', email, password: 'password123' });
  const lg = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  token = lg.body.token;
  if (lg.body.user) userId = lg.body.user.id;
  else if (lg.body.userId) userId = lg.body.userId;
  return { su: su.status, lg: lg.status, token: !!token };
}
await seedUser();

// Sample ids from the DB for param substitution
const db = JSON.parse(fs.readFileSync(path.join(tmp, 'database.json'), 'utf8'));
const sample = {
  userId: userId || db.users?.[0]?.id || 'user-1',
  postId: db.posts?.find((p) => p.id)?.id || db.posts?.[0]?.id || 'post-1',
  commentId: 'comment-1',
  conversationId: db.conversations?.[0]?.id || 'conv-1',
  channelId: 'channel-1',
  id: '1',
};

function substitute(p) {
  return p.replace(/:([A-Za-z]+)/g, (m, name) => sample[name] || m);
}

// ── Probe every route ──────────────────────────────────────────────────────
const results = [];
const seen = new Set();
const methodOrder = { GET: 0, POST: 1, PATCH: 2, PUT: 3, DELETE: 4 };
let tested = 0;

for (const r of routes) {
  const pathStr = substitute(r.path);
  const key = `${r.method} ${pathStr}`;
  if (seen.has(key)) continue; // dedupe identical (method,path) pairs
  seen.add(key);
  if (tested >= limit) break;
  tested++;
  try {
    const req = request(app)[r.method.toLowerCase()](pathStr);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (['POST', 'PATCH', 'PUT'].includes(r.method)) req.send({});
    const res = await Promise.race([
      req,
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 4000)),
    ]);
    results.push({
      method: r.method,
      path: r.path,
      testedPath: pathStr,
      status: res.status,
      file: r.file,
      proto: r.proto || '',
    });
  } catch (e) {
    results.push({ method: r.method, path: r.path, testedPath: pathStr, status: -1, error: String(e.message || e).slice(0, 120), file: r.file, proto: r.proto || '' });
  }
}

// ── Summarize ──────────────────────────────────────────────────────────────
const byStatus = {};
for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

const summary = { total: results.length, byStatus, serverErrors: results.filter((r) => r.status >= 500).map((r) => ({ method: r.method, path: r.path, status: r.status, file: r.file })), timeouts: results.filter((r) => r.status === -1 && r.error === 'TIMEOUT').map((r) => ({ method: r.method, path: r.path, file: r.file })) };

const outFile = path.join(root, 'scripts/route-health.json');
fs.writeFileSync(outFile, JSON.stringify({ summary, results }, null, 2));

console.log('Seeded user: signup/login ok, token', token ? 'yes' : 'NO');
console.log('Tested routes:', results.length);
console.log('Status distribution:', JSON.stringify(byStatus));
console.log('');
console.log('=== 500 / crash routes ===');
for (const s of summary.serverErrors) console.log(`  ${s.status} ${s.method} ${s.path} (${s.file})`);
if (!summary.serverErrors.length) console.log('  (none)');

// ── Cleanup ────────────────────────────────────────────────────────────────
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nReport written to scripts/route-health.json');
