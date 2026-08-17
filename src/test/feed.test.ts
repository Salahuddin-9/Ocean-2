/**
 * Feed + posts integration tests.
 *
 * POST /api/posts/create takes a `{ post }` object (id + content/image/video/
 * audio) and is auth-optional; GET /api/posts/feed returns { feed, total }.
 * The create route also enforces a server-side text safety filter (blocking
 * explicit terms with 400, blurring others).
 */
import { describe, expect, it } from 'vitest';
import { agent, registerAndLogin } from './helpers';

describe('posts + feed', () => {
  it('creates a post and it appears in the feed', async () => {
    const user = await registerAndLogin({ name: 'Feed User', email: 'feed@test.dev' });
    const postId = `test-post-${Date.now()}`;

    const create = await agent
      .post('/api/posts/create')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ post: { id: postId, title: 'Hello Ocean', content: 'First integration test post.' } });

    expect(create.status).toBe(200);
    expect(create.body.success).toBe(true);
    expect(create.body.post.id).toBe(postId);

    const feed = await agent
      .get('/api/posts/feed')
      .set('Authorization', `Bearer ${user.token}`);

    expect(feed.status).toBe(200);
    expect(Array.isArray(feed.body.feed)).toBe(true);
    expect(feed.body.feed.some((p: any) => p.id === postId)).toBe(true);
  });

  it('rejects a post without an id or content', async () => {
    const res = await agent.post('/api/posts/create').send({ post: { title: 'empty' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid post/i);
  });

  it('blocks posts containing explicit text with the server safety filter', async () => {
    const res = await agent
      .post('/api/posts/create')
      .send({ post: { id: `nsfw-post-${Date.now()}`, content: 'watch this porn video' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/blocked/i);
  });

  it('flags posts containing blur-terms as NSFW instead of blocking', async () => {
    const res = await agent
      .post('/api/posts/create')
      .send({ post: { id: `blur-post-${Date.now()}`, title: 'Meme', content: 'contains gore content' } });

    expect(res.status).toBe(200);
    expect(res.body.post.isNsfw).toBe(true);
    expect(res.body.post.nsfwVerdict).toBe('blur');
  });

  it('feed works without auth (guest feed)', async () => {
    const res = await agent.get('/api/posts/feed');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.feed)).toBe(true);
  });
});
