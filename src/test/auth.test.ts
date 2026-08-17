/**
 * Auth flow integration tests.
 *
 * NOTE: this app's registration endpoint is POST /api/auth/signup (not
 * /api/auth/register) and it returns a userId + one-time recovery words rather
 * than a token — the token comes from POST /api/auth/login. Tests follow the
 * app's real contract.
 */
import { describe, expect, it } from 'vitest';
import { agent, registerAndLogin } from './helpers';

describe('auth: signup', () => {
  it('registers a user and returns userId + recovery words', async () => {
    const res = await agent.post('/api/auth/signup').send({
      name: 'Alice Ocean',
      email: 'alice@test.dev',
      password: 'password123',
      countryCode: 'BD',
    });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBeTruthy();
    expect(Array.isArray(res.body.recoveryWords)).toBe(true);
    expect(res.body.recoveryWords).toHaveLength(12);
  });

  it('rejects missing name/email/password', async () => {
    const res = await agent.post('/api/auth/signup').send({ name: 'No Fields' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('rejects an invalid email', async () => {
    const res = await agent.post('/api/auth/signup').send({
      name: 'Bad Email',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    const { email } = await registerAndLogin({ name: 'Dup User', email: 'dup@test.dev' });
    const res = await agent.post('/api/auth/signup').send({
      name: 'Dup User Two',
      email,
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

describe('auth: login + session', () => {
  it('logs in with valid credentials and returns a token', async () => {
    const { email } = await registerAndLogin({ name: 'Login User', email: 'login@test.dev' });

    const res = await agent.post('/api/auth/login').send({ email, password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(email);
  });

  it('rejects invalid credentials', async () => {
    const { email } = await registerAndLogin({ name: 'Bad Pass', email: 'badpass@test.dev' });

    const res = await agent.post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns the profile from GET /api/auth/me with a valid token', async () => {
    const user = await registerAndLogin({ name: 'Me User', email: 'me@test.dev' });

    const res = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.userId);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.profile).toBeTruthy();
  });

  it('rejects GET /api/auth/me without a token', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects GET /api/auth/me with a garbage token', async () => {
    const res = await agent.get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('auth: login rate limiter', () => {
  it('returns 429 after a failed login attempt within the 30s lockout window', async () => {
    // Fresh email so we don't trip on state from other tests in this file.
    const { email } = await registerAndLogin({ name: 'Rate Limit', email: 'ratelimit@test.dev' });

    // First failed attempt → 401 and starts the lockout.
    const first = await agent.post('/api/auth/login').send({ email, password: 'nope-nope-nope' });
    expect(first.status).toBe(401);

    // Immediate second attempt → rate-limited with 429.
    const second = await agent.post('/api/auth/login').send({ email, password: 'nope-nope-nope' });
    expect(second.status).toBe(429);
    expect(second.body.error).toMatch(/lockout|wait/i);
  });

  it('does not rate-limit successful logins', async () => {
    const user = await registerAndLogin({ name: 'No Lockout', email: 'nolockout@test.dev' });
    const res = await agent.post('/api/auth/login').send({
      email: user.email,
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
