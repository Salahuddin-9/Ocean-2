// Independent verification helper — route extraction + runtime route hitting.
// Mode A (extract):  node scripts/runtime-route-check.mjs extract [outJson]
//   Scans server.ts + ALL src/turtle*.ts for app.<method>('path', ...) registrations,
//   classifies auth via requireAuth/requireAdmin in the call window, writes JSON.
// Mode B (hit):      node scripts/runtime-route-check.mjs hit <baseUrl> <token> <routeJson>
//   For each route: no-auth request, valid-auth request (POST/PUT/PATCH/DELETE send {}),
//   invalid-auth request. Prints a summary table + writes audit-route-results.json.
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const mode = process.argv[2];

// ──────────────────────────── EXTRACTION ────────────────────────────
function extract() {
  const files = ['server.ts'];
  const turtleDir = path.join(root, 'src');
  for (const f of fs.readdirSync(turtleDir)) {
    if (f.endsWith('.ts') && f.startsWith('turtle')) files.push(`src/${f}`);
  }
  // root-level turtle engines (NSFW server engine etc.)
  for (const f of fs.readdirSync(root)) {
    if (f.endsWith('.ts') && f.startsWith('turtle')) files.push(f);
  }
  // chatServer WS event types are enumerated separately (not Express routes)
  const routes = [];
  const routeRe = /app\.(get|post|put|patch|delete|use)\(\s*(['"`])([^'"`]+)\2/g;
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    let m;
    while ((m = routeRe.exec(src)) !== null) {
      const method = m[1].toUpperCase();
      const routePath = m[3];
      if (routePath === '*') continue; // SPA fallback, not an API route
      const window = src.slice(m.index, m.index + 1500);
      const hasAuth = /\brequireAuth\b/.test(window);
      const hasAdmin = /\brequireAdmin\b/.test(window);
      const proto = hasAdmin ? 'admin' : hasAuth ? 'auth' : 'public';
      const params = [...routePath.matchAll(/:([A-Za-z0-9_]+)/g)].map((p) => p[1]);
      routes.push({ file, method, path: routePath, proto, params });
    }
  }
  const counts = { total: routes.length, auth: 0, admin: 0, public: 0 };
  for (const r of routes) counts[r.proto] += 1;
  const out = { generatedAt: new Date().toISOString(), counts, routes };
  const outPath = process.argv[3] || path.join(root, '.verification', 'audit-route-list.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Extracted ${routes.length} routes (auth=${counts.auth} admin=${counts.admin} public=${counts.public}) from ${files.length} files → ${outPath}`);
  return out;
}

// ──────────────────────────── RUNTIME HIT ────────────────────────────
async function hit() {
  const base = process.argv[3];
  const token = process.argv[4];
  const listPath = process.argv[5] || path.join(root, '.verification', 'audit-route-list.json');
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  const results = [];
  const isHtml404 = (body, status) =>
    status === 404 && typeof body === 'string' && /Cannot (GET|POST|PUT|PATCH|DELETE)|<!doctype html|<html/i.test(body);

  let seq = 0;
  async function call(method, routePath, auth, body) {
    seq += 1;
    const url = base + routePath;
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = `Bearer ${auth}`;
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(body ?? {}),
        redirect: 'manual',
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      return { status: res.status, body: parsed, html404: isHtml404(text, res.status) };
    } catch (e) {
      return { status: 0, body: String(e), html404: false };
    }
  }

  let hits = 0;
  for (const r of list.routes) {
    if (r.path === '/api/auth/logout') continue; // would kill the session mid-sweep
    const noAuth = await call(r.method, r.path, null, {});
    const valid = await call(r.method, r.path, token, {});
    const invalid = await call(r.method, r.path, 'invalid-token-000', {});
    hits += 3;

    // classify
    let cls;
    if (valid.status === 0 || noAuth.status === 0) cls = '❌ NETWORK';
    else if (valid.html404) cls = '❌ NOT-REGISTERED';
    else if (valid.status >= 500) cls = '❌ 5xx';
    else if (valid.status === 401 || valid.status === 403) cls = '❌ AUTH-BLOCKED';
    else if (r.proto !== 'public' && noAuth.status >= 200 && noAuth.status < 400) cls = '🔒 AUTH-GAP';
    else if (r.proto === 'public' && valid.status >= 400 && valid.status !== 404) cls = '⚠️ PUBLIC-4xx';
    else if (valid.status >= 200 && valid.status < 400) cls = '✅ OK';
    else cls = `⚠️ ${valid.status}`;

    results.push({
      file: r.file, method: r.method, path: r.path, proto: r.proto,
      noAuth: noAuth.status, valid: valid.status, invalid: invalid.status,
      cls, sample: typeof valid.body === 'object' ? JSON.stringify(valid.body).slice(0, 120) : String(valid.body).slice(0, 120),
    });
  }

  // summary
  const byCls = {};
  for (const x of results) byCls[x.cls] = (byCls[x.cls] || 0) + 1;
  console.log(`\nHits: ${hits} requests across ${results.length} routes\n`);
  for (const [k, v] of Object.entries(byCls).sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(22)} ${v}`);
  console.log('\n=== PROBLEM ROUTES (NOT-REGISTERED / 5xx / AUTH-BLOCKED / AUTH-GAP) ===');
  for (const x of results) {
    if (x.cls.startsWith('❌') || x.cls.startsWith('🔒')) {
      console.log(`${x.cls.padEnd(18)} ${x.method.padEnd(6)} ${x.path.padEnd(72)} ${x.file}  (noAuth=${x.noAuth} valid=${x.valid} invalid=${x.invalid})`);
    }
  }
  const outPath = path.join(root, '.verification', 'audit-route-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), byCls, results }, null, 2));
  console.log(`\nFull results → ${outPath}`);
  return results;
}

if (mode === 'extract') extract();
else if (mode === 'hit') hit().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
else console.log('usage: runtime-route-check.mjs <extract|hit> ...');
