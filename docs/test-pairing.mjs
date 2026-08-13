// Verify two users actually get PAIRED by the Meet (Omegle-style) matchmaker.
// Run: node docs/test-pairing.mjs
const BASE = 'http://localhost:3000';

async function api(path, method = 'GET', body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function makeUser(name) {
  const email = `pair${name}${Date.now()}@test.com`;
  await api('/api/auth/signup', 'POST', {
    name, email, password: 'Test@12345', countryCode: 'BD',
  });
  const login = await api('/api/auth/login', 'POST', { email, password: 'Test@12345' });
  return login.json.token;
}

const tokenA = await makeUser('PairA');
const tokenB = await makeUser('PairB');
console.log('Users created.');

// Both search with the same interest at the same time.
const a = await api('/api/meet/match', 'POST', { interests: ['Coding'] }, tokenA);
console.log('A first poll →', a.status, JSON.stringify(a.json).slice(0, 120));
const b = await api('/api/meet/match', 'POST', { interests: ['Coding'] }, tokenB);
console.log('B first poll →', b.status, JSON.stringify(b.json).slice(0, 120));

// A polls again — should now see status 'connected' with roomId + peer.
const a2 = await api('/api/meet/match', 'POST', { interests: ['Coding'] }, tokenA);
console.log('A second poll →', a2.status, JSON.stringify(a2.json).slice(0, 200));

const paired = a2.json.status === 'connected' && a2.json.roomId && a2.json.peer;
console.log(paired ? '\n✅ PAIRING WORKS — room ' + a2.json.roomId + ' with ' + a2.json.peer.name
  : '\n❌ PAIRING NOT CONFIRMED');

// Signal relay smoke test on the paired room.
if (paired) {
  const sig = await api(`/api/meet/room/${a2.json.roomId}/signal`, 'POST',
    { type: 'candidate', payload: { candidate: 'dummy', sdpMid: '0', sdpMLineIndex: 0 } }, tokenA);
  console.log('signal POST →', sig.status);
  const sigs = await api(`/api/meet/room/${a2.json.roomId}/signals?lastTimestamp=0`, 'GET', undefined, tokenA);
  console.log('signals GET →', sigs.status, 'signals=', (sigs.json.signals || []).length);

  const msg = await api(`/api/meet/room/${a2.json.roomId}/message`, 'POST', { text: 'hi stranger!' }, tokenA);
  console.log('message POST →', msg.status);
  const msgs = await api(`/api/meet/room/${a2.json.roomId}/messages`, 'GET', undefined, tokenB);
  console.log('messages GET (as B) →', msgs.status, (msgs.json.messages || []).map(m => m.text));
}

// Cleanup both sides.
await api('/api/meet/leave', 'POST', undefined, tokenA);
await api('/api/meet/leave', 'POST', undefined, tokenB);
console.log('Cleaned up.');
