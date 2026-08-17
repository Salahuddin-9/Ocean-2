/**
 * Chat message tests.
 *
 * POST /api/messages/send is intentionally auth-less (legacy direct-message
 * API): body is { senderName, receiverId, text }. GET /api/messages requires
 * auth and returns messages addressed to the logged-in user.
 */
import { describe, expect, it } from 'vitest';
import { agent, registerAndLogin } from './helpers';

describe('chat messages', () => {
  it('sends a message to a receiver and it is stored', async () => {
    const sender = await registerAndLogin({ name: 'Sender User', email: 'sender@test.dev' });
    const receiver = await registerAndLogin({ name: 'Receiver User', email: 'receiver@test.dev' });

    const res = await agent.post('/api/messages/send').send({
      senderName: sender.name,
      receiverId: receiver.userId,
      text: 'Hello from the integration test!',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message.text).toBe('Hello from the integration test!');
    expect(res.body.message.receiverId).toBe(receiver.userId);
  });

  it('rejects a message missing required fields', async () => {
    const res = await agent.post('/api/messages/send').send({ senderName: 'x', text: 'no receiver' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('the receiver can fetch the message via GET /api/messages', async () => {
    const sender = await registerAndLogin({ name: 'Fetch Sender', email: 'fetchsender@test.dev' });
    const receiver = await registerAndLogin({ name: 'Fetch Receiver', email: 'fetchreceiver@test.dev' });

    await agent.post('/api/messages/send').send({
      senderName: sender.name,
      receiverId: receiver.userId,
      text: 'Can you see this?',
    });

    const res = await agent
      .get('/api/messages')
      .set('Authorization', `Bearer ${receiver.token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.some((m: any) => m.text === 'Can you see this?')).toBe(true);
  });

  it('rejects GET /api/messages without auth', async () => {
    const res = await agent.get('/api/messages');
    expect(res.status).toBe(401);
  });
});
