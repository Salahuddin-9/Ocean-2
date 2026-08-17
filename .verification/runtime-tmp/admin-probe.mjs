const base = 'http://localhost:3000';
const adminKey = 'audit-master-key-2026';
const routes = [
  ['GET', '/api/admin/reports'],
  ['GET', '/api/admin/users'],
  ['POST', '/api/admin/scan', {}],
  ['GET', '/api/admin/stream-keys'],
  ['GET', '/api/admin/stream-usage'],
  ['POST', '/api/admin/stream-keys', { label: 'audit', apiKey: 'k', apiSecret: 's', maxConcurrentCalls: 1, lifetimeMinutes: 10 }],
  ['POST', '/api/os/experiments', { name: 'audit-exp', groups: [{ name: 'a' }, { name: 'b' }] }],
  ['GET', '/api/os/experiments'],
  ['GET', '/api/os/flags'],
  ['GET', '/api/redteam/leaderboard'],
];

async function main() {
  // fresh user
  const stamp = Date.now();
  const email = `admin-${stamp}@test.dev`;
  await fetch(`${base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'AdminProbe', email, password: 'password123', countryCode: 'BD' }),
  });
  const l = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const lb = await l.json();
  console.log('login:', l.status);

  let pass = 0, fail = 0;
  for (const [method, path, body] of routes) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey, Authorization: `Bearer ${lb.token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ok = res.status >= 200 && res.status < 300;
    if (ok) pass++; else fail++;
    console.log(`${ok ? '✅' : '❌'} ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 80)}`);
  }
  // negative: admin route WITHOUT key → must 403
  const neg = await fetch(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${lb.token}` } });
  console.log(`${neg.status === 403 ? '✅' : '❌'} admin route without key → ${neg.status} (expect 403)`);
  if (neg.status === 403) pass++; else fail++;
  console.log(`\nADMIN PROBE: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
