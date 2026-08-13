/**
 * Ocean — Algorithmic Audit Log (Feature 152)
 * -------------------------------------------
 * Logs every personalized ranking decision: which post, which signals, why.
 * Powers the settings panel's "Why did I see this?" audit trail.
 *
 * The log is written by:
 *   - POST /api/algo/audit/log  (explicit "explain + log" for any post)
 *   - GET  /api/feed/personalized (auto-logs every item it serves, feature 151)
 *
 * Model (global db, idempotent ensure):
 *   db.feedAuditLog — array of { id, userId, postId, postSnippet, reasons[],
 *                     topReason, score, createdAt } (ring buffer, 200/user)
 *
 * Routes:
 *   POST /api/algo/audit/log       (auth) { postId } -> explain + persist
 *   GET  /api/algo/audit           (auth) -> my audit trail
 *   GET  /api/algo/audit/:postId   (auth) -> my entries for one post
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { explainPost, type FeedExplanation } from './turtleFeedExplainBackend';

function ensureCollection(db: any): void {
  if (!Array.isArray(db.feedAuditLog)) db.feedAuditLog = [];
}

/** Shared writer used by this module AND the personalized feed (feature 151). */
export function writeAuditEntry(
  db: any,
  userId: string,
  post: any
): FeedExplanation | null {
  ensureCollection(db);
  if (!post || !post.id) return null;
  const user = (db.users || []).find((u: any) => u && u.id === userId);
  const explanation: FeedExplanation = {
    id: `audit-${Date.now()}-${Math.floor(Math.random() * 99999)}`,
    userId,
    postId: post.id,
    postSnippet: String(post?.content || post?.title || '').trim().slice(0, 120) || '(media post)',
    ...explainPost(db, user || { id: userId }, post),
    createdAt: Date.now(),
  };
  const list = db.feedAuditLog as FeedExplanation[];
  list.unshift(explanation);
  const mine = list.filter((x) => x.userId === userId);
  if (mine.length > 200) {
    const drop = new Set(mine.slice(200).map((x) => x.id));
    for (let i = list.length - 1; i >= 0; i--) if (drop.has(list[i].id)) list.splice(i, 1);
  }
  return explanation;
}

export function registerAuditLogRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/algo/audit/log — explicit explain + persist for one post
  app.post('/api/algo/audit/log', requireAuth, (req, res) => {
    const user = (req as any).user;
    const postId = String((req.body || {}).postId || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = loadDatabase();
    ensureCollection(db);
    const post =
      (db.posts || []).find((p: any) => p && p.id === postId) ||
      (db.users || []).map((u: any) => (u.profile?.posts || []).find((p: any) => p && p.id === postId)).find(Boolean);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const entry = writeAuditEntry(db, user.id, post);
    saveDatabase(db);
    res.json({ entry });
  });

  // GET /api/algo/audit — my trail
  app.get('/api/algo/audit', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.feedAuditLog as FeedExplanation[])
      .filter((x) => x.userId === user.id)
      .slice(0, 100);
    res.json({ entries: mine });
  });

  // GET /api/algo/audit/:postId — my entries for a specific post
  app.get('/api/algo/audit/:postId', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.feedAuditLog as FeedExplanation[])
      .filter((x) => x.userId === user.id && x.postId === req.params.postId)
      .slice(0, 20);
    res.json({ entries: mine });
  });
}
