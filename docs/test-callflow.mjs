// Quick end-to-end verification of the Meet (random video chat) + call API flow.
// Run: node docs/test-callflow.mjs
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

const email = `calltester${Date.now()}@test.com`;
const results = [];

// 1. Signup
const signup = await api('/api/auth/signup', 'POST', {
  name: 'Call Tester', email, password: 'Test@12345', countryCode: 'BD',
});
results.push(['signup', signup.status, signup.json.message || signup.json.error]);
if (signup.status !== 200) { console.log(JSON.stringify(results, null, 2)); process.exit(1); }

// 2. Login to obtain a token
const login = await api('/api/auth/login', 'POST', { email, password: 'Test@12345' });
results.push(['login', login.status, login.json.message || (login.json.token ? 'token-ok' : 'no-token')]);
const token = login.json.token || login.json.sessionToken;
if (!token) { console.log(JSON.stringify(results, null, 2)); process.exit(1); }

// 3. Meet matchmaking (should return waiting/queue state — no partner yet)
const match = await api('/api/meet/match', 'POST', { interests: ['Coding', 'AI'] }, token);
results.push(['meet/match', match.status, JSON.stringify(match.json).slice(0, 160)]);

// 4. Meet queue stats
const stats = await api('/api/meet/queue-stats', 'GET', undefined, token);
results.push(['meet/queue-stats', stats.status, JSON.stringify(stats.json).slice(0, 120)]);

// 5. Meet leave (cleanup so we don't leave a stale queue entry)
const leave = await api('/api/meet/leave', 'POST', undefined, token);
results.push(['meet/leave', leave.status, JSON.stringify(leave.json).slice(0, 120)]);

// 6. Call history write
const calls = await api('/api/calls', 'POST', {
  targetUserId: 'some-user', callType: 'video', durationSec: 12, status: 'completed',
}, token);
results.push(['calls POST', calls.status, JSON.stringify(calls.json).slice(0, 120)]);

// 7. Call history read
const callsGet = await api('/api/calls', 'GET', undefined, token);
results.push(['calls GET', callsGet.status, `count=${(callsGet.json.calls || []).length}`]);

console.log('\n=== Ocean calling flow verification ===');
for (const [name, status, detail] of results) {
  console.log(`${status === 200 ? '✅' : '❌'} ${name.padEnd(20)} → HTTP ${status}  ${detail}`);
}
