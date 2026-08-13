/**
 * Ocean — Dynamic Contextual Ghosting / Ghost View (Feature 145)
 * ---------------------------------------------------------------
 * When a user views a post in "Ghost Mode" the view is recorded in a SEPARATE
 * ledger and NEVER feeds back into the ranking engine — no view counts, no
 * engagement signals, no author-trust updates. The main feed's counters stay
 * untouched. Ghost counts are visible only as aggregate totals (no identity).
 *
 * Model (global db, idempotent ensure):
 *   db.ghostViews — array of { id, postId, viewerId, viewedAt }
 *
 * Routes:
 *   POST /api/posts/:id/ghost-view     -> record ghost view (auth; idempotent per user per 10min)
 *   GET  /api/posts/:id/ghost-status   -> { totalGhostViews, myGhostViews } (guest-safe, no identity)
 *   GET  /api/posts/ghost-my           -> posts I ghost-viewed recently (auth)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface GhostView {
  id: string;
  postId: string;
  viewerId: string;
  viewedAt: number;
}

const GHOST_COOLDOWN_MS = 10 * 60 * 1000;

function ensureCollection(db: any): void {
  if (!Array.isArray(db.ghostViews)) db.ghostViews = [];
}

/** Verify the post exists (bounty-style lookup). */
function findPostById(db: any, postId: string): boolean {
  if (!postId) return false;
  for (const u of db.users || []) {
    if ((u.profile?.posts || []).some((p: any) => p && p.id === postId)) return true;
  }
  return (db.posts || []).some((p: any) => p && p.id === postId);
}

export function registerGhostViewRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = getCtx();

  // POST /api/posts/:id/ghost-view — record without any ranking feedback
  app.post('/api/posts/:id/ghost-view', requireAuth, (req, res) => {
    const user = (req as any).user;
    const postId = String(req.params.id || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = loadDatabase();
    ensureCollection(db);
    if (!findPostById(db, postId)) return res.status(404).json({ error: 'Post not found.' });

    const list = db.ghostViews as GhostView[];
    const recent = list.some(
      (g) => g.postId === postId && g.viewerId === user.id && Date.now() - g.viewedAt < GHOST_COOLDOWN_MS
    );
    if (!recent) {
      list.push({ id: `gv-${Date.now()}-${Math.floor(Math.random() * 999)}`, postId, viewerId: user.id, viewedAt: Date.now() });
    }
    saveDatabase(db);

    const totalGhostViews = list.filter((g) => g.postId === postId).length;
    res.json({
      success: true,
      ghosted: !recent, // false when a recent ghost view already existed (cooldown)
      totalGhostViews,
      // Explicitly state the guarantee:
      rankingImpact: 'none — ghost views never feed the ranking engine',
    });
  });

  // GET /api/posts/:id/ghost-status — aggregate counts only
  app.get('/api/posts/:id/ghost-status', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const me = getRequestUser(req);
    const list = (db.ghostViews as GhostView[]).filter((g) => g.postId === req.params.id);
    res.json({
      postId: req.params.id,
      totalGhostViews: list.length,
      myGhostViews: me ? list.filter((g) => g.viewerId === me.id).length : 0,
    });
  });

  // GET /api/posts/ghost/my — posts I ghost-viewed (auth).
  // NOTE: not /api/posts/ghost-my — server.ts's GET /api/posts/:postId is registered
  // earlier and would shadow a 2-segment static path.
  app.get('/api/posts/ghost/my', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.ghostViews as GhostView[])
      .filter((g) => g.viewerId === user.id)
      .sort((a, b) => b.viewedAt - a.viewedAt)
      .slice(0, 50);
    res.json({ views: mine });
  });
}
