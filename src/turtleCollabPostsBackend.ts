/**
 * Ocean — Collaborative Posts (Feature 162)
 * -----------------------------------------
 * Multi-author posts: one owner + a collaborators array. All collaborators (and
 * the owner) may edit the post and append sections. Anyone else is read-only.
 *
 * Model (global db, idempotent ensure):
 *   db.collabPosts — array of { id, title, content, authorId, authorName,
 *                      collaborators: {id,name,accepted}[], sections: {id,authorId,authorName,text,at}[],
 *                      status: 'draft'|'published', createdAt, updatedAt }
 *
 * Routes:
 *   POST  /api/collab/create            (auth) { title, content?, inviteeIds[] }
 *   POST  /api/collab/:id/add-section   (auth, collab) { text }
 *   PATCH /api/collab/:id               (auth, collab) { title?, content? }
 *   POST  /api/collab/:id/accept        (auth) join as collaborator if invited
 *   GET   /api/collab                   (auth) my collab posts
 *   GET   /api/collab/:id               (guest) detail
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface CollabSection {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  at: number;
}

export interface CollabPost {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  collaborators: { id: string; name: string; accepted: boolean }[];
  sections: CollabSection[];
  status: 'draft' | 'published';
  createdAt: number;
  updatedAt: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.collabPosts)) db.collabPosts = [];
}

function userName(db: any, u: any): string {
  return u?.name || u?.username || 'User';
}

function canEdit(post: CollabPost, userId: string): boolean {
  if (post.authorId === userId) return true;
  return post.collaborators.some((c) => c.id === userId && c.accepted);
}

function resolveUsers(db: any, ids: string[]): { id: string; name: string }[] {
  return ids
    .map((id) => {
      const u = (db.users || []).find((x: any) => x && x.id === id);
      return u ? { id: u.id, name: userName(db, u) } : null;
    })
    .filter(Boolean) as { id: string; name: string }[];
}

export function registerCollabPostsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/collab/create
  app.post('/api/collab/create', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    const content = String(body.content || '').trim().slice(0, 5000);
    const inviteeIds = Array.isArray(body.inviteeIds) ? body.inviteeIds.map(String).slice(0, 12) : [];

    const db = loadDatabase();
    ensureCollection(db);
    const collaborators = [
      { id: user.id, name: userName(db, user), accepted: true },
      ...resolveUsers(db, inviteeIds.filter((id: string) => id !== user.id)).map((u) => ({ ...u, accepted: false })),
    ];
    const post: CollabPost = {
      id: uid('cp'),
      title: title.slice(0, 160),
      content,
      authorId: user.id,
      authorName: userName(db, user),
      collaborators,
      sections: [],
      status: 'published',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    (db.collabPosts as CollabPost[]).unshift(post);
    saveDatabase(db);
    res.json({ post });
  });

  // POST /api/collab/:id/add-section — collaborators append a section
  app.post('/api/collab/:id/add-section', requireAuth, (req, res) => {
    const user = (req as any).user;
    const text = String((req.body || {}).text || '').trim();
    if (text.length < 2) return res.status(400).json({ error: 'Section text is too short.' });

    const db = loadDatabase();
    ensureCollection(db);
    const post = (db.collabPosts as CollabPost[]).find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (!canEdit(post, user.id)) return res.status(403).json({ error: 'Only the owner or an accepted collaborator can edit.' });

    post.sections.push({ id: uid('sec'), authorId: user.id, authorName: userName(db, user), text: text.slice(0, 2000), at: Date.now() });
    post.updatedAt = Date.now();
    saveDatabase(db);
    res.json({ post });
  });

  // PATCH /api/collab/:id — edit title/content (collab)
  app.patch('/api/collab/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    ensureCollection(db);
    const post = (db.collabPosts as CollabPost[]).find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (!canEdit(post, user.id)) return res.status(403).json({ error: 'Only the owner or an accepted collaborator can edit.' });
    if (typeof body.title === 'string' && body.title.trim().length >= 3) post.title = body.title.trim().slice(0, 160);
    if (typeof body.content === 'string') post.content = body.content.trim().slice(0, 5000);
    post.updatedAt = Date.now();
    saveDatabase(db);
    res.json({ post });
  });

  // POST /api/collab/:id/accept — accept an invitation
  app.post('/api/collab/:id/accept', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const post = (db.collabPosts as CollabPost[]).find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    const collab = post.collaborators.find((c) => c.id === user.id);
    if (!collab) return res.status(403).json({ error: 'You were not invited to this post.' });
    collab.accepted = true;
    post.updatedAt = Date.now();
    saveDatabase(db);
    res.json({ post });
  });

  // GET /api/collab — my collab posts (owned + collaborating)
  app.get('/api/collab', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.collabPosts as CollabPost[])
      .filter((p) => p.authorId === user.id || p.collaborators.some((c) => c.id === user.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    res.json({ posts: mine });
  });

  // GET /api/collab/:id
  app.get('/api/collab/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const post = (db.collabPosts as CollabPost[]).find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    res.json({ post });
  });
}
