/**
 * Ocean — Stealth Recommend (Feature 168)
 * --------------------------------------
 * "Recommend to friend": a silent signal that feeds the ranking system. Each
 * recommendation bumps the post's stealth-boost count (consulted by ranking) and
 * lands in the friend's recommendation inbox.
 *
 * Model (global db, idempotent ensure):
 *   db.stealthRecs — array of { id, fromId, fromName, toId, postId, postTitle, at }
 *   db.stealthBoosts — Record<postId, number> (ranking signal, bumped on recommend)
 *
 * Routes:
 *   POST /api/stealthrec            (auth) { postId, toUserId } -> recommend
 *   GET  /api/stealthrec/mine       (auth) posts I recommended
 *   GET  /api/stealthrec/inbox      (auth) posts friends recommended to me
 *   GET  /api/stealthrec/boost/:postId (guest) current stealth boost for a post
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface StealthRec {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  postId: string;
  postTitle: string;
  at: number;
}

function uid(): string {
  return `sr-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.stealthRecs)) db.stealthRecs = [];
  if (!db.stealthBoosts || typeof db.stealthBoosts !== 'object' || Array.isArray(db.stealthBoosts)) {
    db.stealthBoosts = {};
  }
}

function findPostTitle(db: any, postId: string): string {
  for (const u of db.users || []) {
    const p = (u.profile?.posts || []).find((x: any) => x && x.id === postId);
    if (p) return String(p?.content || p?.title || '').slice(0, 90);
  }
  const p = (db.posts || []).find((x: any) => x && x.id === postId);
  return p ? String(p?.content || p?.title || '').slice(0, 90) : '';
}

export function registerStealthRecRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/stealthrec — recommend a post to a friend
  app.post('/api/stealthrec', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const postId = String(body.postId || '').trim();
    const toId = String(body.toUserId || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId is required.' });
    if (!toId) return res.status(400).json({ error: 'toUserId is required.' });
    if (toId === user.id) return res.status(400).json({ error: 'You cannot recommend to yourself.' });

    const db = loadDatabase();
    ensureCollections(db);
    const toUser = (db.users || []).find((u: any) => u && u.id === toId);
    if (!toUser) return res.status(404).json({ error: 'Recipient not found.' });

    // Dedupe: same from+to+post only once per hour.
    const hourAgo = Date.now() - 3600_000;
    const dup = (db.stealthRecs as StealthRec[]).some(
      (r) => r.fromId === user.id && r.toId === toId && r.postId === postId && r.at >= hourAgo
    );
    if (!dup) {
      (db.stealthRecs as StealthRec[]).unshift({
        id: uid(),
        fromId: user.id,
        fromName: user.name || user.username || 'User',
        toId,
        postId,
        postTitle: findPostTitle(db, postId) || '(media post)',
        at: Date.now(),
      });
      // Ranking signal: bump the stealth boost for the post.
      const boosts = db.stealthBoosts as Record<string, number>;
      boosts[postId] = (boosts[postId] || 0) + 1;
    }
    saveDatabase(db);
    res.json({
      success: true,
      stealthBoost: (db.stealthBoosts as Record<string, number>)[postId] || 0,
      note: 'Recommendation recorded as a silent ranking signal — the friend just sees it in their inbox.',
    });
  });

  // GET /api/stealthrec/mine — posts I recommended
  app.get('/api/stealthrec/mine', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const mine = (db.stealthRecs as StealthRec[]).filter((r) => r.fromId === user.id).slice(0, 50);
    res.json({ recs: mine });
  });

  // GET /api/stealthrec/inbox — posts recommended to me
  app.get('/api/stealthrec/inbox', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const inbox = (db.stealthRecs as StealthRec[])
      .filter((r) => r.toId === user.id)
      .sort((a, b) => b.at - a.at)
      .slice(0, 50);
    res.json({ recs: inbox });
  });

  // GET /api/stealthrec/boost/:postId — ranking signal value (guest)
  app.get('/api/stealthrec/boost/:postId', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const boosts = db.stealthBoosts as Record<string, number>;
    res.json({ postId: req.params.postId, stealthBoost: boosts[req.params.postId] || 0 });
  });
}
