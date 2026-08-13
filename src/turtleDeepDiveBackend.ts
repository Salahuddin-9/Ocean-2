/**
 * Ocean — Deep Dive Mode (Feature 246)
 * --------------------------------------
 * Topic hubs: users create a hub around a subject (climate, coding, recipes…),
 * posts/reels get attached, and the hub surfaces a curated long-form view.
 *
 * Model (global db): db.topicHubs — array of
 *   { id, ownerId, title, description, emoji, tags: string[], posts: string[], at }
 *
 * Routes:
 *   GET  /api/hubs            (auth) all hubs
 *   POST /api/hubs            (auth) create hub { title, description, emoji, tags }
 *   POST /api/hubs/:id/attach (auth) attach a post/reel id { postId }
 *   GET  /api/hubs/:id        (auth) hub detail with attached post metadata
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface TopicHub {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  emoji: string;
  tags: string[];
  posts: string[];
  at: number;
}

function uid(): string {
  return `hub-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.topicHubs)) db.topicHubs = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Dedupe posts across db.posts + user.profile.posts (canonical store merge). */
function gatherPosts(db: any): any[] {
  const postMap = new Map<string, any>();
  (db.posts || []).forEach((p: any) => { if (p && p.id) postMap.set(p.id, p); });
  (db.users || []).forEach((u: any) => {
    (u.profile?.posts || []).forEach((p: any) => {
      if (p && p.id && !postMap.has(p.id)) postMap.set(p.id, { ...p, _ownerName: u.name || u.username });
    });
  });
  return Array.from(postMap.values());
}

export function registerDeepDiveRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/hubs', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const hubs = (db.topicHubs as TopicHub[]).sort((a, b) => b.at - a.at);
    const posts = gatherPosts(db);
    const withCounts = hubs.map((h) => ({
      ...h,
      attached: h.posts.length,
      postPreview: h.posts.slice(0, 1).map((pid) => {
        const p = (posts as any[]).find((x) => String(x.id) === String(pid));
        return p ? { id: p.id, text: (p.text || p.caption || p.title || '').slice(0, 80) } : null;
      }).filter(Boolean)[0] || null,
    }));
    res.json({ hubs: withCounts });
  });

  app.post('/api/hubs', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = s(b.title, 120);
    if (!title) return res.status(400).json({ error: 'Hub title is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const tags = Array.isArray(b.tags) ? b.tags.slice(0, 10).map((t: unknown) => s(t, 40)).filter(Boolean) : [];
    const hub: TopicHub = {
      id: uid(),
      ownerId: user.id,
      title,
      description: s(b.description, 1000),
      emoji: s(b.emoji, 4) || '📚',
      tags,
      posts: [],
      at: Date.now(),
    };
    (db.topicHubs as TopicHub[]).unshift(hub);
    saveDatabase(db);
    res.json({ hub });
  });

  app.post('/api/hubs/:id/attach', requireAuth, (req, res) => {
    const b = (req.body || {}) as any;
    const postId = s(b.postId, 120);
    if (!postId) return res.status(400).json({ error: 'postId is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const hub = (db.topicHubs as TopicHub[]).find((h) => h.id === req.params.id);
    if (!hub) return res.status(404).json({ error: 'Hub not found.' });
    if (!hub.posts.includes(postId)) hub.posts.push(postId);
    saveDatabase(db);
    res.json({ hub, attached: hub.posts.length });
  });

  app.get('/api/hubs/:id', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const hub = (db.topicHubs as TopicHub[]).find((h) => h.id === req.params.id);
    if (!hub) return res.status(404).json({ error: 'Hub not found.' });
    const posts = gatherPosts(db);
    const attached = hub.posts
      .map((pid) => (posts as any[]).find((x) => String(x.id) === String(pid)))
      .filter(Boolean)
      .slice(0, 50);
    res.json({ hub, attached });
  });
}
