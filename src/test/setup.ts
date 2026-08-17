/**
 * Vitest global setup (runs in every test worker before the test file imports
 * the app).
 *
 * Isolation strategy:
 *  - NODE_ENV=test → server.ts skips `startServer()` (no port binding, no Vite
 *    dev middleware) and exports the Express `app` for supertest.
 *  - The worker `chdir`s into a fresh temp dir BEFORE `server.ts` is imported,
 *    so:
 *      • database.json / sessions.json / uploads/ resolve to the temp dir
 *        (the real repo data is never read or written),
 *      • firebase-applet-config.json is not found in cwd → `getFirestoreClient()`
 *        returns null → Firestore sync is disabled, so tests can never read or
 *        write the real cloud project.
 *  - Each test file gets its own worker + its own temp dir (vitest isolation),
 *    so state cannot leak between files.
 *
 * The temp dir is removed after the run.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';

process.env.NODE_ENV = 'test';

const projectRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-test-'));

// Move the worker into the sandbox BEFORE any app module is imported so
// server.ts / chatServer.ts resolve their data files and Firebase config
// relative to the temp dir.
process.chdir(tempRoot);

// Belt-and-braces: force the data paths explicitly regardless of cwd.
process.env.DB_FILE = path.join(tempRoot, 'database.json');
process.env.SESSIONS_FILE = path.join(tempRoot, 'sessions.json');

afterAll(() => {
  try {
    process.chdir(projectRoot);
  } catch {
    /* worker is about to be torn down anyway */
  }
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    /* best effort cleanup */
  }
});
