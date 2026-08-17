/**
 * Upload validation tests (POST /api/upload, multer + magic-byte validation).
 *
 * The endpoint requires auth, whitelists image/video/audio extensions, rejects
 * disguised/corrupt payloads via magic-byte checks, and accepts a real PNG.
 * Test uploads land in the temp dir (worker cwd), never in the repo uploads/.
 */
import { describe, expect, it } from 'vitest';
import { agent, registerAndLogin, PNG_SIGNATURE } from './helpers';

describe('upload validation', () => {
  it('requires authentication', async () => {
    const res = await agent.post('/api/upload').attach('file', PNG_SIGNATURE, {
      filename: 'test.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a disallowed file type (.exe)', async () => {
    const user = await registerAndLogin({ name: 'Upload User', email: 'upload@test.dev' });

    const res = await agent
      .post('/api/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from('MZ this is not a media file at all'), {
        filename: 'evil.exe',
        contentType: 'application/octet-stream',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported file type/i);
  });

  it('rejects content that does not match its extension', async () => {
    const user = await registerAndLogin({ name: 'Spoof User', email: 'spoof@test.dev' });

    // Claims to be a JPEG but contains no valid magic bytes.
    const res = await agent
      .post('/api/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', Buffer.from('plain text pretending to be an image'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unable to verify|does not match/i);
  });

  it('accepts a valid PNG and returns a media URL', async () => {
    const user = await registerAndLogin({ name: 'Png User', email: 'png@test.dev' });

    const res = await agent
      .post('/api/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', PNG_SIGNATURE, {
        filename: 'test.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toMatch(/^\/uploads\//);
    expect(res.body.kind).toBe('image');
  });
});
