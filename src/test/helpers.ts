/**
 * Shared helpers for the Ocean backend integration tests.
 *
 * Importing this module triggers the import of server.ts, which (with
 * NODE_ENV=test set in setup.ts) registers all routes on the exported Express
 * `app` WITHOUT binding a port or booting Vite. supertest drives that app
 * in-process.
 *
 * Every test file runs in its own worker + temp database, so the state created
 * here never leaks between files.
 */
import request from 'supertest';
import { app } from '../../server';

/** supertest agent bound to the exported Express app (no real port needed). */
export const agent = request(app);

export interface TestUser {
  token: string;
  userId: string;
  email: string;
  name: string;
}

let seq = 0;

/**
 * Register a brand-new user via /api/auth/signup and log them in via
 * /api/auth/login, returning the session token + user id.
 */
export async function registerAndLogin(opts?: {
  name?: string;
  email?: string;
  password?: string;
  countryCode?: string;
}): Promise<TestUser> {
  seq += 1;
  const stamp = `${Date.now()}-${seq}-${Math.floor(Math.random() * 1e6)}`;
  const name = opts?.name ?? `Test User ${stamp}`;
  const email = opts?.email ?? `user-${stamp}@test.dev`;
  const password = opts?.password ?? 'password123';

  const signup = await agent.post('/api/auth/signup').send({
    name,
    email,
    password,
    countryCode: opts?.countryCode ?? 'BD',
  });
  if (signup.status !== 200) {
    throw new Error(`signup failed (${signup.status}): ${JSON.stringify(signup.body)}`);
  }
  const userId: string = signup.body.userId;

  const login = await agent.post('/api/auth/login').send({ email, password });
  if (login.status !== 200) {
    throw new Error(`login failed (${login.status}): ${JSON.stringify(login.body)}`);
  }
  return { token: login.body.token, userId, email, name };
}

/** Minimal valid PNG magic bytes (enough for the server's magic-byte check). */
export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
