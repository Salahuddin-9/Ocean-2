import WebSocket from 'ws';

const base = 'http://localhost:3000';
const stamp = Date.now();
const email = `probe2-${stamp}@test.dev`;

async function main() {
  await fetch(`${base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Probe2', email, password: 'password123', countryCode: 'BD' }),
  });
  const l = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const lb = await l.json();
  const c = await fetch(`${base}/api/chat/conversations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lb.token}` },
    body: JSON.stringify({ participantIds: [] }),
  });
  const cb = await c.json();
  const convId = cb.conversation.id;
  console.log('conv:', convId);

  const ws = new WebSocket(base.replace('http', 'ws') + '/ws/chat');
  ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: lb.token })));
  ws.on('message', async (d) => {
    const m = JSON.parse(d.toString());
    if (m.type === 'auth_ok') {
      ws.send(JSON.stringify({ type: 'message', conversationId: convId, content: 'persist-probe-msg' }));
    } else if (m.type === 'message_received') {
      console.log('message_received payload:', JSON.stringify(m).slice(0, 300));
      const g = await fetch(`${base}/api/chat/conversations/${convId}/messages`, { headers: { Authorization: `Bearer ${lb.token}` } });
      const gb = await g.json();
      console.log('REST messages status', g.status, 'body:', JSON.stringify(gb).slice(0, 300));
      process.exit(0);
    }
  });
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
}

main().catch((e) => { console.error(e); process.exit(1); });
