/**
 * Ocean — Silent Drop (Feature 167)
 * ---------------------------------
 * A post that self-destructs: visible for a short window (default 20 minutes)
 * and only to the first N viewers (default 50). A background cron retires drops
 * that exceeded either limit — exactly the expiringAt / maxViews model.
 *
 * Model (global db, idempotent ensure):
 *   db.silentDrops — array of { id, title, text, authorId, authorName, expiresAt,
 *                      maxViews, viewCount, visible, createdAt }
 *
 * Routes:
 *   POST /api/silentdrop             (auth) create
 *   POST /api/silentdrop/:id/view    (auth) mark viewed (counts toward maxViews)
 *   GET  /api/silentdrop/active      (guest) visible drops
 *   POST /api/silentdrop/cleanup     (auth) run cleanup now
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface SilentDrop {
  id: string;
  title: string;
  text: string;
  authorId: string;
  authorName: string;
  expiresAt: number;
  maxViews: number;
  viewCount: number;
  viewedBy: string[]; // dedupe — one slot per user, refreshes don't consume views
  visible: boolean;
  createdAt: number;
}

const DEFAULT_MINUTES = 20;
const DEFAULT_MAX_VIEWS = 50;
const CRON_MS = 60_000;

function uid(): string {
  return `sd-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.silentDrops)) db.silentDrops = [];
}

/** Retire drops past their expiry or viewer cap. Returns how many were retired. */
export function cleanupDrops(db: any): number {
  ensureCollection(db);
  const now = Date.now();
  let retired = 0;
  for (const d of db.silentDrops as SilentDrop[]) {
    if (d.visible && (now > d.expiresAt || d.viewCount >= d.maxViews)) {
      d.visible = false;
      retired += 1;
    }
  }
  return retired;
}

let cronStarted = false;

export function registerSilentDropRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase } = ctx;

  // Background cleanup cron (idempotent guard — same pattern as subscriptions billing).
  if (!cronStarted) {
    cronStarted = true;
    setInterval(() => {
      try {
        const db = loadDatabase();
        const retired = cleanupDrops(db);
        if (retired > 0) {
          saveDatabase(db);
          console.log(`[silent-drop] cleanup retired ${retired} drop(s)`);
        }
      } catch (e: any) {
        console.warn('[silent-drop] cron error:', e?.message || e);
      }
    }, CRON_MS);
  }

  // POST /api/silentdrop — create
  app.post('/api/silentdrop', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || 'Silent drop').trim().slice(0, 120);
    const text = String(body.text || '').trim();
    if (text.length < 2) return res.status(400).json({ error: 'Drop content is too short.' });
    const minutes = Math.max(1, Math.min(1440, Math.floor(Number(body.minutes) || DEFAULT_MINUTES)));
    const maxViews = Math.max(1, Math.min(500, Math.floor(Number(body.maxViews) || DEFAULT_MAX_VIEWS)));

    const db = loadDatabase();
    ensureCollection(db);
    const drop: SilentDrop = {
      id: uid(),
      title,
      text: text.slice(0, 4000),
      authorId: user.id,
      authorName: user.name || user.username || 'User',
      expiresAt: Date.now() + minutes * 60000,
      maxViews,
      viewCount: 0,
      viewedBy: [],
      visible: true,
      createdAt: Date.now(),
    };
    (db.silentDrops as SilentDrop[]).unshift(drop);
    saveDatabase(db);
    res.json({ drop, note: `Visible ${minutes} min / first ${maxViews} viewers — then it vanishes.` });
  });

  // POST /api/silentdrop/:id/view — count a view (deduped per viewer)
  app.post('/api/silentdrop/:id/view', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const drop = (db.silentDrops as SilentDrop[]).find((d) => d.id === req.params.id);
    if (!drop) return res.status(404).json({ error: 'Drop not found.' });
    if (!drop.visible) return res.status(410).json({ error: 'This drop has already vanished.' });
    if (!Array.isArray(drop.viewedBy)) drop.viewedBy = [];
    const fresh = !drop.viewedBy.includes(user.id);
    if (fresh) {
      drop.viewedBy.push(user.id);
      drop.viewCount = drop.viewedBy.length; // trust the dedupe list as source of truth
    }
    const stillVisible = drop.viewCount < drop.maxViews && Date.now() <= drop.expiresAt;
    if (!stillVisible) drop.visible = false;
    saveDatabase(db);
    res.json({ drop, stillVisible, viewsLeft: Math.max(0, drop.maxViews - drop.viewCount) });
  });

  // GET /api/silentdrop/active — visible drops (guest-safe)
  app.get('/api/silentdrop/active', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    cleanupDrops(db); // opportunistic cleanup on read
    saveDatabase(db);
    const visible = (db.silentDrops as SilentDrop[])
      .filter((d) => d.visible)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    res.json({ drops: visible });
  });

  // POST /api/silentdrop/cleanup — run cleanup now
  app.post('/api/silentdrop/cleanup', requireAuth, (req, res) => {
    const db = loadDatabase();
    const retired = cleanupDrops(db);
    saveDatabase(db);
    res.json({ retired });
  });
}
