import request from 'supertest';
import { app } from '../server.ts';

async function main() {
  // Register + login to get a real token
  const email = `vfy-${Date.now()}@test.dev`;
  const signup = await request(app).post('/api/auth/signup').send({ name: 'Vfy User', email, password: 'password123' });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  const token = login.body.token;
  console.log('login status:', login.status, 'token?', !!token);

  // With token
  const withTok = await request(app)
    .post('/api/emergency/pools')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Auth test pool', description: 'test', urgency: 'low' });
  console.log('WITH token ->', withTok.status, JSON.stringify(withTok.body).slice(0, 100));

  // Without token
  const noTok = await request(app)
    .post('/api/emergency/pools')
    .send({ title: 'Anon test pool', description: 'test', urgency: 'low' });
  console.log('WITHOUT token ->', noTok.status, JSON.stringify(noTok.body).slice(0, 100));
  process.exit(0);
}
main();
