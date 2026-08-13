/**
 * Ocean — Server Context seam
 * ---------------------------
 * Gives self-contained feature modules (src/turtle<Feature>Backend.ts) access to the
 * server's private functions WITHOUT editing server.ts per feature.
 *
 * server.ts calls `setServerContext({...})` exactly once at startup (after the hoisted
 * function declarations are in scope, before `registerOceanFeatures(app)` runs).
 * Feature modules read the context via `getCtx()` at route-registration time.
 *
 * Canonical feature-module skeleton:
 *   import express from 'express';
 *   import { getCtx } from './turtleServerContext';
 *
 *   export function registerWhiteboardRoutes(app: express.Express) {
 *     const { requireAuth, loadDatabase, saveDatabase } = getCtx();
 *     app.get('/api/whiteboard/session', requireAuth, (req, res) => {
 *       const db = loadDatabase();
 *       const user = (req as any).user;            // full user record, user.id is the id
 *       // ... mutate db ...
 *       saveDatabase(db);
 *       res.json({ success: true });
 *     });
 *   }
 *
 * Rules for feature modules:
 *  - CREATE ONLY NEW FILES. Never edit server.ts / chatServer.ts / App.tsx / database.json.
 *  - Read the logged-in user via `(req as any).user` (set by requireAuth). There is no req.userId.
 *  - Persist either to the global db (ctx.loadDatabase / ctx.saveDatabase) or a dedicated
 *    JSON state file (community.json / emergency.json pattern) for high-write subsystems.
 *  - Award/spend coins via turtleCommunityBackend addBalance/spendBalance + ctx.loadCommunity/saveCommunity.
 */

import type { Request, Response, NextFunction } from 'express';

export interface ServerContext {
  /** Express middleware: requires `Authorization: Bearer <token>`; sets (req as any).user + (req as any).sessionToken. */
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  /** Express middleware: admin gate (user.isAdmin OR x-admin-key === MASTER_KEY). */
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
  /** Re-reads database.json from disk; returns the global db object. */
  loadDatabase: () => any;
  /** Atomic write-lock serialized writer (tmp + rename) + queued Firestore sync. */
  saveDatabase: (db: any) => void;
  /** Re-reads community.json (balances wallet lives here). */
  loadCommunity: () => any;
  saveCommunity: (state: any) => void;
  /** Resolves a bearer token to a userId (activeSessions Map, fallback db.sessions, 30-day expiry). */
  getUserIdFromToken: (token: string) => string | null;
  /** Returns user object or null WITHOUT attaching req.user (guest-safe). */
  getRequestUser: (req: Request) => any;
  /** Absolute path of the uploads dir (multer dest). */
  uploadsDir: string;
  /** Set of unplayable video extensions rejected at upload. */
  UNPLAYABLE_VIDEO_EXT: Set<string>;
}

let ctx: ServerContext | null = null;

export function setServerContext(c: ServerContext): void {
  ctx = c;
}

export function getCtx(): ServerContext {
  if (!ctx) {
    throw new Error(
      'ServerContext not configured — call setServerContext() in server.ts before registering feature routes.'
    );
  }
  return ctx;
}
