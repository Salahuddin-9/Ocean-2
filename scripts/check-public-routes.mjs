// Empirically check whether flagged public mutating routes require auth or crash.
import request from 'supertest';
import { app } from '../server.ts';

const checks = [
  { method: 'post', path: '/api/emergency/pools', body: { title: 'Verification test pool', description: 'test', urgency: 'low' } },
  { method: 'post', path: '/api/posts/create', body: { post: { id: `vfy-${Date.now()}`, content: 'verification test post' } } },
  { method: 'post', path: '/api/factcheck/check', body: { text: 'test claim' } },
  { method: 'post', path: '/api/moderation/analyze', body: { text: 'hello world' } },
  { method: 'post', path: '/api/ai/caption', body: { topic: 'test' } },
  { method: 'post', path: '/api/zakat/calculate', body: { wealth: 1000 } },
];

for (const c of checks) {
  try {
    const res = await request(app)[c.method](c.path).send(c.body);
    console.log(`${res.status}  ${c.method.toUpperCase()} ${c.path}  ${JSON.stringify(res.body).slice(0, 120)}`);
  } catch (e) {
    console.log(`ERR  ${c.method.toUpperCase()} ${c.path}  ${e.message}`);
  }
}
process.exit(0);
