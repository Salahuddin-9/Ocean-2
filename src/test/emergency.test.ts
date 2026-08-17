/**
 * Emergency pools regression tests.
 *
 * Guards the P0 fix: the mutating /api/emergency/pools* routes previously read
 * `(req as any).user` without mounting requireAuth, so they crashed with 500 for
 * everyone (even valid tokens). Now: 401 anonymous, 200 authenticated.
 */
import { describe, expect, it } from 'vitest';
import { agent, registerAndLogin } from './helpers';

describe('emergency pools auth', () => {
  it('rejects pool creation without auth (401, not 500)', async () => {
    const res = await agent.post('/api/emergency/pools').send({
      title: 'Anon pool',
      description: 'should be rejected',
      urgency: 'low',
    });
    expect(res.status).toBe(401);
  });

  it('creates a pool with a valid token', async () => {
    const user = await registerAndLogin({ name: 'Pool Creator', email: 'poolcreator@test.dev' });
    const res = await agent
      .post('/api/emergency/pools')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ title: 'Verified pool', description: 'help needed near the market', urgency: 'high' });

    expect(res.status).toBe(200);
    expect(res.body.pool.id).toBeTruthy();
    expect(res.body.pool.createdById).toBe(user.userId);
    expect(res.body.pool.participantIds).toContain(user.userId);
  });

  it('rejects join without auth', async () => {
    const res = await agent.post('/api/emergency/pools/pool-x/join').send({ join: true });
    expect(res.status).toBe(401);
  });
});
