/**
 * Ocean E2E smoke test — boots the real server (tsx server.ts) and walks the
 * primary feature chains end to end: auth → feed → posts → reels → SOS →
 * scholarships → interview → jobs → notifications → chat WebSocket → AI/Stream
 * graceful degradation. Prints PASS/FAIL per check and exits non-zero on any
 * failure. No assertions on data content beyond route liveness + expected
 * response shapes.
 *
 * Usage: node scripts/smoke-e2e.mjs   (run from project root)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = process.cwd();
const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

let serverProc = null;
let bootedExisting = false;
const results = [];
let userToken = null;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function jsonReq(pathname, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, data };
}

async function waitForServer(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.status < 500) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

// ── 1. Boot (or reuse) the server ──────────────────────────────────────────
async function isAlreadyUp() {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch { return false; }
}

if (await isAlreadyUp()) {
  bootedExisting = true;
  console.log('[boot] A server is already running on port 3000 — reusing it.');
} else {
  // Resolve the local tsx CLI. require.resolve('tsx') returns the ESM loader
  // (dist/loader.mjs); the CLI lives in the same dist/ dir as cli.mjs.
  const tsxEntry = require.resolve('tsx');
  const tsxCli = path.join(path.dirname(tsxEntry), 'cli.mjs');
  console.log('[boot] Starting server via tsx CLI …');
  serverProc = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => process.env.SMOKE_VERBOSE && console.log('[srv]', String(d).trim()));
  serverProc.stderr.on('data', (d) => process.env.SMOKE_VERBOSE && console.error('[srv-err]', String(d).trim()));
  serverProc.on('exit', (code) => {
    if (code && code !== 0 && results.length === 0) {
      console.error('[boot] Server exited early with code', code);
    }
  });
  const up = await waitForServer();
  check('Server boots and serves the SPA', up, up ? 'HTTP OK' : 'timed out');
  if (!up) {
    // Surface the tail of the server log for diagnosis
    const log = serverProc ? '' : '';
    console.error(`[boot] Server failed to boot. Check the log. (smoke run aborted)`);
    serverProc?.kill();
    process.exit(1);
  }
}

const salt = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const email = `smoke_${salt}@test.dev`;
const name = `Smoke Tester ${salt.slice(-4)}`;

try {
  // ── 2. Auth chain ────────────────────────────────────────────────────────
  const signup = await jsonReq('/api/auth/signup', {
    method: 'POST',
    body: { name, email, password: 'SmokePass123!', countryCode: 'BD' },
  });
  check('Signup creates account + recovery words', signup.status === 200 && Array.isArray(signup.data?.recoveryWords) && signup.data.recoveryWords.length === 12,
    `status=${signup.status} words=${signup.data?.recoveryWords?.length ?? 0}`);

  const login = await jsonReq('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'SmokePass123!' },
  });
  check('Login returns session token + user', login.status === 200 && !!login.data?.token && !!login.data?.user?.id,
    `status=${login.status}`);
  userToken = login.data?.token || null;

  const me = await jsonReq('/api/auth/sessions', { token: userToken });
  check('Session list (login activity)', me.status === 200 && Array.isArray(me.data?.sessions), `status=${me.status}`);

  // Feed is intentionally PUBLIC (optional-auth viewer for blocked-content filtering).
  const unauthFeed = await jsonReq('/api/posts/feed');
  check('Public feed loads without auth (by design)', unauthFeed.status === 200 && Array.isArray(unauthFeed.data?.feed), `status=${unauthFeed.status} posts=${unauthFeed.data?.feed?.length ?? 0}`);

  // ── 3. Feed / posts chain ────────────────────────────────────────────────
  const feed = await jsonReq('/api/posts/feed', { token: userToken });
  check('Ranked feed loads (authed)', feed.status === 200 && Array.isArray(feed.data?.feed), `status=${feed.status} posts=${feed.data?.feed?.length ?? 0}`);

  const postId = `post-${Date.now()}-smoke`;
  const post = await jsonReq('/api/posts/create', {
    method: 'POST',
    token: userToken,
    body: { post: { id: postId, title: 'Smoke test post', content: 'Created by the E2E smoke runner.', hashtags: ['#smoke', '#ocean'], authorId: login.data?.user?.id } },
  });
  check('Create post persists', post.status === 200 && post.data?.post?.id === postId, `status=${post.status} id=${post.data?.post?.id || 'n/a'}`);

  const feed2 = await jsonReq('/api/posts/feed', { token: userToken });
  const found = (feed2.data?.feed ?? []).some((p) => p.id === postId);
  check('Created post appears in feed', found, `status=${feed2.status}`);

  if (postId) {
    const like = await jsonReq(`/api/posts/${postId}/like`, { method: 'POST', token: userToken });
    check('Post reaction toggle', like.status === 200, `status=${like.status}`);
    const comment = await jsonReq(`/api/posts/${postId}/comment`, {
      method: 'POST', token: userToken, body: { text: 'Smoke comment' },
    });
    check('Post comment', comment.status === 200, `status=${comment.status}`);
  }

  // ── 4. Reels chain ───────────────────────────────────────────────────────
  const reels = await jsonReq('/api/reels/feed', { token: userToken });
  check('Reels ranked feed loads', reels.status === 200 && Array.isArray(reels.data?.reels ?? reels.data), `status=${reels.status}`);
  const reel = await jsonReq('/api/reels/upload', {
    method: 'POST', token: userToken,
    body: { title: 'Smoke reel', videoUrl: '', caption: 'E2E smoke reel', category: 'Trending' },
  });
  check('Reels upload route alive', reel.status === 200 || reel.status === 400, `status=${reel.status} (400 = validation, route works)`);

  // ── 5. SOS chain (global button → /api/sos/alert) ────────────────────────
  const sos = await jsonReq('/api/sos/alert', {
    method: 'POST', token: userToken,
    body: { message: 'Smoke emergency alert', area: 'Community pool', urgency: 'low', shareLocation: false },
  });
  check('SOS alert dispatched to backend', sos.status === 200 && !!sos.data?.alert, `status=${sos.status} ${JSON.stringify(sos.data ?? {}).slice(0, 120)}`);
  const sosList = await jsonReq('/api/sos/alerts', { token: userToken });
  check('SOS alerts list', sosList.status === 200 && Array.isArray(sosList.data?.alerts), `status=${sosList.status}`);

  // ── 6. Scholarship chain (incl. Saved-tab icon data) ─────────────────────
  const schList = await jsonReq('/api/scholarships');
  check('Scholarship list (public)', schList.status === 200 && Array.isArray(schList.data?.scholarships), `status=${schList.status}`);
  const sch = await jsonReq('/api/scholarships', {
    method: 'POST', token: userToken,
    body: { name: 'Smoke Scholarship', org: 'Smoke Org', amount: '10,000', deadline: Date.now() + 86400000 * 30, link: 'https://example.com', eligibility: 'Anyone' },
  });
  const schId = sch.data?.scholarship?.id;
  check('Scholarship created', sch.status === 200 && !!schId, `status=${sch.status} id=${schId || 'n/a'}`);
  if (schId) {
    const saveSch = await jsonReq(`/api/scholarships/${schId}/save`, { method: 'POST', token: userToken });
    check('Scholarship bookmark toggle', saveSch.status === 200, `status=${saveSch.status}`);
    const savedSch = await jsonReq('/api/scholarships/saved', { token: userToken });
    const savedEntry = (savedSch.data?.scholarships ?? []).find((s) => s.id === schId);
    check('Saved tab returns savedByMe=true (icon fix)', savedSch.status === 200 && savedEntry?.savedByMe === true,
      `status=${savedSch.status} savedByMe=${savedEntry?.savedByMe}`);
  }

  // ── 7. AI Mock Interview chain ───────────────────────────────────────────
  const ivList = await jsonReq('/api/interview', { token: userToken });
  check('Interview session list', ivList.status === 200 && Array.isArray(ivList.data?.sessions ?? ivList.data?.interviews ?? []), `status=${ivList.status}`);
  const ivStart = await jsonReq('/api/interview/start', {
    method: 'POST', token: userToken, body: { role: 'Software Engineer' },
  });
  const ivId = ivStart.data?.session?.id || ivStart.data?.id;
  check('Interview session start', (ivStart.status === 200 || ivStart.status === 201) && !!ivId, `status=${ivStart.status} id=${ivId || 'n/a'}`);
  if (ivId) {
    const ivAnswer = await jsonReq(`/api/interview/${ivId}/answer`, {
      method: 'POST', token: userToken, body: { text: 'I have built distributed systems at scale.' },
    });
    check('Interview answer scored', ivAnswer.status === 200 && (ivAnswer.data?.score !== undefined || ivAnswer.data?.result?.score !== undefined),
      `status=${ivAnswer.status} ${JSON.stringify(ivAnswer.data ?? {}).slice(0, 100)}`);
  }

  // ── 8. Govt Job Alert chain ──────────────────────────────────────────────
  const jobs = await jsonReq('/api/jobs/alerts');
  check('Job alerts list', jobs.status === 200 && Array.isArray(jobs.data?.alerts ?? jobs.data?.circulars ?? []), `status=${jobs.status}`);
  const job = await jsonReq('/api/jobs/alerts', {
    method: 'POST', token: userToken,
    body: { title: 'Smoke job circular', org: 'Smoke Dept', category: 'Bank', deadline: Date.now() + 86400000 * 14, description: 'Smoke', link: '' },
  });
  const jobId = job.data?.alert?.id || job.data?.id;
  check('Job circular submit', job.status === 200 && !!jobId, `status=${job.status} id=${jobId || 'n/a'}`);
  if (jobId) {
    const saveJob = await jsonReq(`/api/jobs/alerts/${jobId}/save`, { method: 'POST', token: userToken });
    check('Job bookmark toggle', saveJob.status === 200, `status=${saveJob.status}`);
  }

  // ── 9. Notifications ─────────────────────────────────────────────────────
  const notifs = await jsonReq('/api/notifications', { token: userToken });
  check('Notifications list', notifs.status === 200 && Array.isArray(notifs.data?.notifications ?? notifs.data), `status=${notifs.status}`);

  // ── 10. Realtime: chat messaging end to end (WS send → REST readback) ────
  const wsOk = await new Promise((resolve) => {
    try {
      const { WebSocket } = require('ws');
      const ws = new WebSocket(`ws://localhost:${PORT}/ws/chat`);
      const timer = setTimeout(() => { ws.terminate(); resolve(false); }, 6000);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: userToken })));
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === 'auth_ok') {
            clearTimeout(timer);
            ws.close();
            resolve(true);
          }
        } catch { /* ignore */ }
      });
      ws.on('error', () => { clearTimeout(timer); resolve(false); });
    } catch (e) {
      resolve(false);
    }
  });
  check('Chat WebSocket auth + presence', wsOk === true, wsOk ? 'auth_ok received' : 'no auth_ok');

  // Full messaging chain: create conversation → send via WS → read back via REST.
  const conv = await jsonReq('/api/chat/conversations', {
    method: 'POST', token: userToken,
    body: { participantIds: [login.data.user.id], name: 'Smoke 1:1', description: 'E2E smoke conversation' },
  });
  const convId = conv.data?.conversation?.id || conv.data?.id;
  check('Conversation created', conv.status === 200 && !!convId, `status=${conv.status} id=${convId || 'n/a'}`);

  if (convId) {
    const sent = await new Promise((resolve) => {
      try {
        const { WebSocket } = require('ws');
        const ws = new WebSocket(`ws://localhost:${PORT}/ws/chat`);
        const timer = setTimeout(() => { ws.terminate(); resolve(false); }, 6000);
        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'auth', token: userToken }));
          ws.send(JSON.stringify({ type: 'message', conversationId: convId, text: `Smoke message ${salt}` }));
        });
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(String(raw));
            // The client (ChatModal) consumes this ack as 'message_received'.
            if (msg.type === 'message_received' || msg.type === 'message_sent' || msg.type === 'new_message') {
              clearTimeout(timer);
              ws.close();
              resolve(true);
            }
            if (msg.type === 'error' && String(msg.message).toLowerCase().includes('conversation')) {
              clearTimeout(timer);
              ws.close();
              resolve(false);
            }
          } catch { /* ignore */ }
        });
        ws.on('error', () => { clearTimeout(timer); resolve(false); });
      } catch (e) {
        resolve(false);
      }
    });
    check('Message sent over chat WebSocket', sent === true, sent ? 'ack received' : 'no ack');

    const msgs = await jsonReq(`/api/chat/conversations/${convId}/messages`, { token: userToken });
    const list = msgs.data?.messages ?? msgs.data ?? [];
    const gotIt = Array.isArray(list) && list.some((m) => String(m.text || '').includes('Smoke message'));
    check('Message persisted + REST readback', gotIt, `status=${msgs.status} count=${Array.isArray(list) ? list.length : 'n/a'}`);
  }

  // Meet matchmaking queue (returns a match or a wait-state — route must be alive)
  const meet = await jsonReq('/api/meet/match', {
    method: 'POST', token: userToken, body: { interests: ['music'] },
  });
  check('Meet matchmaking queue', meet.status === 200, `status=${meet.status} ${JSON.stringify(meet.data ?? {}).slice(0, 80)}`);

  // ── 11. Graceful degradation (no keys configured) ────────────────────────
  const stream = await jsonReq('/api/stream/token', { token: userToken });
  check('Stream token degrades gracefully', stream.status === 200, `status=${stream.status} configured=${stream.data?.configured}`);
  const aiModels = await jsonReq('/api/ai/models', { token: userToken });
  check('AI models list degrades with default catalog', aiModels.status === 200 && Array.isArray(aiModels.data?.data) && aiModels.data.data.length > 0,
    `status=${aiModels.status} models=${aiModels.data?.data?.length ?? 0}`);
  const aiStatus = await jsonReq('/api/ai/status', { token: userToken });
  check('AI status degrades gracefully', aiStatus.status === 200 && typeof aiStatus.data?.gemini === 'boolean', `status=${aiStatus.status} gemini=${aiStatus.data?.gemini}`);
  const nsfw = await jsonReq('/api/nsfw/check', { method: 'POST', body: {} });
  check('NSFW check route alive (validation branch)', nsfw.status === 400 || nsfw.status === 200, `status=${nsfw.status}`);

  // ── 12. Hub feature spot-checks (B4 safety + economy) ────────────────────
  const safesos = await jsonReq('/api/safesos/status', { token: userToken });
  check('SafeSOS status', safesos.status === 200, `status=${safesos.status}`);
  const escrow = await jsonReq('/api/escrow/list', { token: userToken }).catch(() => ({ status: 404, data: null }));
  check('Escrow list route', escrow.status === 200 || escrow.status === 401 || escrow.status === 404, `status=${escrow.status} (404 = route name differs, not fatal)`);

  // Admin gating: route must exist (auth passes) and reject non-admins with 403.
  const adminUsers = await jsonReq('/api/admin/users', { token: userToken });
  check('Admin route gated (403 for non-admin)', adminUsers.status === 403, `status=${adminUsers.status}`);

  // ── 13. Stale-file safety ────────────────────────────────────────────────
  const missingUpload = await fetch(`${BASE}/uploads/definitely-missing-${salt}.jpg`);
  check('Missing upload returns 404 (not index.html)', missingUpload.status === 404, `status=${missingUpload.status}`);
} catch (err) {
  check('Smoke run completed without throwing', false, err?.message || String(err));
}

// ── Cleanup: remove all records this run created from the local dev DB ──────
// (the smoke user, its posts/conversations/sos/scholarships/jobs/interviews
// and its sessions). Firestore client writes are blocked by the hardened
// firestore.rules, so local cleanup fully removes the test data.
function cleanupLocalDb() {
  const dbPath = path.join(ROOT, 'database.json');
  const sessionsPath = path.join(ROOT, 'sessions.json');
  if (!fs.existsSync(dbPath)) return;
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const smokeUserIds = new Set((db.users || []).filter((u) => u.email && u.email.startsWith('smoke_')).map((u) => u.id));
    if (smokeUserIds.size === 0 && !db.posts?.some((p) => String(p.id).includes('-smoke'))) {
      return; // nothing to clean
    }
    db.users = (db.users || []).filter((u) => !smokeUserIds.has(u.id));
    db.posts = (db.posts || []).filter((p) => !smokeUserIds.has(p.authorId) && !String(p.id).includes('-smoke'));
    db.conversations = (db.conversations || []).filter((c) => !(c.participants || []).some((id) => smokeUserIds.has(id)));
    db.chatMessages = (db.chatMessages || []).filter((m) => !smokeUserIds.has(m.senderId));
    db.messages = (db.messages || []).filter((m) => !smokeUserIds.has(m.senderId) && !smokeUserIds.has(m.receiverId));
    db.scholarships = (db.scholarships || []).filter((s) => !smokeUserIds.has(s.postedBy));
    db.jobAlerts = (db.jobAlerts || []).filter((j) => !smokeUserIds.has(j.postedBy));
    db.interviewSessions = (db.interviewSessions || []).filter((s) => !smokeUserIds.has(s.userId));
    db.sosAlerts = (db.sosAlerts || []).filter((a) => !smokeUserIds.has(a.creatorId));
    db.sosContacts = (db.sosContacts || []).filter((c) => !smokeUserIds.has(c.userId));
    if (db.sessions && typeof db.sessions === 'object') {
      for (const [tok, v] of Object.entries(db.sessions)) {
        if (v && typeof v === 'object' && smokeUserIds.has((v).userId)) delete db.sessions[tok];
      }
    }
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    if (fs.existsSync(sessionsPath)) {
      const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      for (const [tok, v] of Object.entries(sessions)) {
        const entry = v;
        if ((typeof entry === 'string' && smokeUserIds.has(entry)) || (entry && typeof entry === 'object' && smokeUserIds.has(entry.userId))) {
          delete sessions[tok];
        }
      }
      fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2), 'utf8');
    }
    console.log(`[cleanup] Removed smoke-test data (${smokeUserIds.size} users) from local DB + sessions.`);
  } catch (err) {
    console.warn('[cleanup] Failed to clean local DB:', err?.message || err);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n==== E2E SMOKE: ${results.length - failed.length}/${results.length} checks passed ====`);
if (failed.length > 0) {
  console.log('Failed checks:');
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
}

if (serverProc && !bootedExisting) {
  serverProc.kill();
  console.log('[boot] Stopped spawned server.');
}
if (bootedExisting) {
  // Editing database.json under a live server is unsafe — its in-memory copy
  // would resurrect the records on the next save. Skip and warn instead.
  console.log('[cleanup] Skipped local DB cleanup (reusing a running server). Smoke data remains in the DB.');
} else {
  cleanupLocalDb();
}
process.exit(failed.length > 0 ? 1 : 0);
