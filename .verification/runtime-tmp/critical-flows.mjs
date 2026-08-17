// Critical-flow + WebSocket + 2FA verification (Phase 3) — isolated server.
// Usage: node critical-flows.mjs <baseUrl>
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const base = process.argv[2] || 'http://localhost:3000';
const results = [];
function record(name, pass, detail) { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name} — ${detail}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function totp(secretBase32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = secretBase32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0, bytes = [];
  for (const c of cleaned) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

async function registerUser(name) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `${name.toLowerCase()}-${stamp}@test.dev`;
  const signup = await fetch(`${base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'password123', countryCode: 'BD' }),
  });
  const sb = await signup.json();
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const lb = await login.json();
  return { userId: sb.userId, token: lb.token, email };
}

function wsAuth(wsUrl, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const received = [];
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 15000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      received.push(msg);
      if (msg.type === 'auth_ok') { clearTimeout(timer); resolve({ ws, received }); }
      if (msg.type === 'error') { clearTimeout(timer); reject(new Error(msg.message)); }
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function main() {
  const A = await registerUser('Alice');
  const B = await registerUser('Bob');
  record('register+login two users', !!(A.userId && B.userId && A.token && B.token), `${A.email} / ${B.email}`);
  const auth = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

  // ── 1. Conversation + WS messaging ───────────────────────────────
  let convId;
  try {
    const conv = await fetch(`${base}/api/chat/conversations`, {
      method: 'POST', headers: auth(A.token),
      body: JSON.stringify({ participantIds: [B.userId] }),
    });
    const cb = await conv.json();
    convId = cb.id || cb.conversationId || cb.conversation?.id;
    record('create direct conversation', conv.status === 200 && !!convId, JSON.stringify(cb).slice(0, 110));
  } catch (e) { record('create direct conversation', false, String(e)); }

  const wsUrl = base.replace('http', 'ws') + '/ws/chat';
  let wsA = null, wsB = null;
  try { ({ ws: wsA } = await wsAuth(wsUrl, A.token)); record('WS A auth_ok', true, ''); } catch (e) { record('WS A auth_ok', false, String(e)); }
  try { ({ ws: wsB } = await wsAuth(wsUrl, B.token)); record('WS B auth_ok', true, ''); } catch (e) { record('WS B auth_ok', false, String(e)); }

  if (convId && wsA && wsB) {
    const b2Messages = [];
    wsB.on('message', (d) => { try { b2Messages.push(JSON.parse(d.toString())); } catch {} });
    wsA.send(JSON.stringify({ type: 'typing', conversationId: convId, isTyping: true }));
    await sleep(500);
    wsA.send(JSON.stringify({ type: 'message', conversationId: convId, text: 'Hello from the audit WS test!' }));
    await sleep(1500);
    const gotInbound = b2Messages.some((m) => m.type === 'message_received' && /audit WS test/.test(m.message?.text || m.text || ''));
    record('B receives A message via WS', gotInbound, `types=${JSON.stringify(b2Messages.map((m) => m.type)).slice(0, 140)}`);
    const msgs = await fetch(`${base}/api/chat/conversations/${convId}/messages`, { headers: auth(A.token) });
    const mb = await msgs.json();
    record('message persisted (REST)', msgs.status === 200 && JSON.stringify(mb).includes('audit WS test'), `status=${msgs.status}`);
    wsA.send(JSON.stringify({ type: 'typing', conversationId: convId, isTyping: false }));
    await sleep(400);
    record('typing event received by peer', b2Messages.some((m) => m.type === 'typing_state'), `types=${JSON.stringify(b2Messages.map((m) => m.type)).slice(0, 140)}`);
  }

  // ── 2. Post → like → comment → feed ──────────────────────────────
  let postId;
  try {
    const pid = `post-audit-${Date.now()}`;
    const post = await fetch(`${base}/api/posts/create`, {
      method: 'POST', headers: auth(A.token),
      body: JSON.stringify({ post: { id: pid, title: 'Audit flow post', content: 'created during verification', visibility: 'public', authorId: A.userId } }),
    });
    const pb = await post.json();
    postId = pb.post?.id || pb.id;
    record('create post', post.status === 200 && !!postId, `status=${post.status} id=${postId}`);
  } catch (e) { record('create post', false, String(e)); }

  if (postId) {
    const like = await fetch(`${base}/api/posts/${postId}/like`, { method: 'POST', headers: auth(B.token) });
    record('like post', like.status === 200, `status=${like.status} ${(await like.text()).slice(0, 80)}`);
    const comment = await fetch(`${base}/api/posts/${postId}/comment`, {
      method: 'POST', headers: auth(B.token), body: JSON.stringify({ text: 'Nice audit post' }),
    });
    record('comment on post', comment.status === 200, `status=${comment.status}`);
    const feed = await fetch(`${base}/api/posts/feed?limit=20`, { headers: auth(A.token) });
    const fb = await feed.json();
    const fstr = JSON.stringify(fb);
    record('feed contains post', feed.status === 200 && fstr.includes(postId), `status=${feed.status} rankingScore=${fstr.includes('rankingScore')}`);
  }

  // ── 3. Upload image ──────────────────────────────────────────────
  try {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]), Buffer.alloc(32)]);
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'audit.png');
    const up = await fetch(`${base}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${A.token}` }, body: fd });
    const ub = await up.json();
    record('upload PNG image', up.status === 200 && !!ub.url, `status=${up.status} ${JSON.stringify(ub).slice(0, 100)}`);
  } catch (e) { record('upload PNG image', false, String(e)); }

  // ── 4. Story ─────────────────────────────────────────────────────
  try {
    const st = await fetch(`${base}/api/stories/create`, {
      method: 'POST', headers: auth(A.token),
      body: JSON.stringify({ mediaUrl: '/uploads/nonexistent.png', caption: 'audit story', type: 'image' }),
    });
    const sb = await st.json();
    const storyId = sb.story?.id || sb.id;
    record('create story', st.status === 200 && !!storyId, `status=${st.status} ${JSON.stringify(sb).slice(0, 100)}`);
    if (storyId) {
      const mine = await fetch(`${base}/api/stories/mine`, { headers: auth(A.token) });
      record('list my stories', mine.status === 200, `status=${mine.status}`);
    }
  } catch (e) { record('create story', false, String(e)); }

  // ── 5. Religious event + RSVP ────────────────────────────────────
  try {
    const ev = await fetch(`${base}/api/events`, {
      method: 'POST', headers: auth(A.token),
      body: JSON.stringify({ title: 'Audit community event', at: Date.now() + 86400000, category: 'Other', venue: 'Dhaka' }),
    });
    const eb = await ev.json();
    const eventId = eb.event?.id;
    record('create event (religious)', ev.status === 200 && !!eventId, `status=${ev.status} ${JSON.stringify(eb).slice(0, 100)}`);
    if (eventId) {
      const rsvp = await fetch(`${base}/api/events/${eventId}/rsvp`, { method: 'POST', headers: auth(B.token), body: JSON.stringify({}) });
      const rb = await rsvp.json();
      record('RSVP to event', rsvp.status === 200 && rb.rsvps >= 2, `status=${rsvp.status} ${JSON.stringify(rb).slice(0, 80)}`);
    }
  } catch (e) { record('create event + RSVP', false, String(e)); }

  // ── 6. SOS alert ─────────────────────────────────────────────────
  try {
    const sos = await fetch(`${base}/api/sos/alert`, {
      method: 'POST', headers: auth(A.token),
      body: JSON.stringify({ type: 'panic', location: { lat: 23.81, lng: 90.41 }, message: 'audit sos' }),
    });
    record('SOS alert dispatch', sos.status === 200, `status=${sos.status} ${(await sos.text()).slice(0, 100)}`);
  } catch (e) { record('SOS alert dispatch', false, String(e)); }

  // ── 7. Wallet transfer (Ocean Pay) ───────────────────────────────
  try {
    const bal = await fetch(`${base}/api/wallet/balance`, { headers: auth(A.token) });
    const bb = await bal.json();
    record('wallet balance read', bal.status === 200, `status=${bal.status} balance=${bb.balance}`);
    const tr = await fetch(`${base}/api/wallet/transfer`, {
      method: 'POST', headers: auth(A.token),
      body: JSON.stringify({ toUserId: B.userId, amount: 5 }),
    });
    record('wallet transfer 5 coins', tr.status === 200, `status=${tr.status} ${(await tr.text()).slice(0, 100)}`);
  } catch (e) { record('wallet balance/transfer', false, String(e)); }

  // ── 8. Meet matchmaking ──────────────────────────────────────────
  try {
    const mm = await fetch(`${base}/api/meet/match`, {
      method: 'POST', headers: auth(A.token), body: JSON.stringify({ interests: ['tech', 'music'] }),
    });
    record('meet match enqueue', mm.status === 200, `status=${mm.status} ${(await mm.text()).slice(0, 100)}`);
  } catch (e) { record('meet match enqueue', false, String(e)); }

  // ── 9. 2FA flow ──────────────────────────────────────────────────
  try {
    const setup = await fetch(`${base}/api/2fa/setup`, { method: 'POST', headers: auth(A.token) });
    const sb = await setup.json();
    record('2FA setup', setup.status === 200 && !!sb.secret, `status=${setup.status}`);
    if (sb.secret) {
      const code = totp(sb.secret);
      const verify = await fetch(`${base}/api/2fa/verify`, { method: 'POST', headers: auth(A.token), body: JSON.stringify({ code }) });
      record('2FA verify with valid code', verify.status === 200, `status=${verify.status}`);
      const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: auth(A.token) });
      const challenge = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: A.email, password: 'password123' }),
      });
      const ch = await challenge.json();
      record('login now requires 2FA', ch.twoFactorRequired === true, `status=${challenge.status} twoFactorRequired=${ch.twoFactorRequired}`);
      if (ch.twoFactorToken) {
        const final = await fetch(`${base}/api/auth/login/2fa`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ twoFactorToken: ch.twoFactorToken, code: totp(sb.secret) }),
        });
        const fb = await final.json();
        record('login completes with TOTP code', final.status === 200 && !!fb.token, `status=${final.status}`);
      }
    }
  } catch (e) { record('2FA flow', false, String(e)); }

  // ── 10. Graceful degradation probes (B token — A was logged out by the 2FA flow) ──
  try {
    const st = await fetch(`${base}/api/stream/token`, { method: 'POST', headers: auth(B.token), body: JSON.stringify({}) });
    const sb = await st.json();
    record('stream token (no keys → configured:false)', st.status === 200 && sb.configured === false, `status=${st.status} configured=${sb.configured}`);
  } catch (e) { record('stream token graceful', false, String(e)); }
  try {
    const ai = await fetch(`${base}/api/ai/image`, { method: 'POST', headers: auth(B.token), body: JSON.stringify({ prompt: 'a sunset' }) });
    const ab = await ai.json();
    record('AI image (no key → placeholder)', ai.status === 200, `status=${ai.status} hasSvg=${JSON.stringify(ab).includes('svg')}`);
  } catch (e) { record('AI image placeholder', false, String(e)); }
  try {
    const guest = await fetch(`${base}/api/posts/feed?limit=5`);
    record('guest feed works (no auth)', guest.status === 200, `status=${guest.status}`);
  } catch (e) { record('guest feed', false, String(e)); }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n==== FLOW SUMMARY: ${passed}/${results.length} passed ====`);
  fs.writeFileSync(path.join(process.cwd(), 'flows-results.json'), JSON.stringify(results, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
