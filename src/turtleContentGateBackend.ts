/**
 * Ocean — Age-Appropriate Content Gate (Feature 203)
 * ----------------------------------------------------
 * Lets creators tag posts with a minimum age rating. Readers whose profile
 * DOB puts them under the rating see a friendly gate instead of the content.
 *
 * Model (global db):
 *   db.contentRatings — map keyed by postId: { minAge: number, note?: string, setBy }
 *   Age resolution: user.profile.dob (ISO date) or user.dob.
 *
 * Routes:
 *   POST /api/content-rating/:postId   (auth) set/update rating on MY post
 *   GET  /api/content-rating/:postId   (public) rating for a post
 *   GET  /api/content-rating/gate/:postId  (public) { allowed, minAge, myAge } for current user
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ContentRating {
  minAge: number;
  note?: string;
  setBy: string;
  at: number;
}

function ensureCollection(db: any): void {
  if (!db.contentRatings || typeof db.contentRatings !== 'object') db.contentRatings = {};
}

function resolveAgeYears(u: any): number | null {
  const dob = u?.profile?.dob || u?.dob || u?.profile?.birthday || u?.birthday;
  if (!dob) return null;
  const t = new Date(dob).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
}

function postOwnerOf(db: any, postId: string): string | null {
  const all: any[] = [];
  if (Array.isArray(db.posts)) for (const p of db.posts) all.push(p);
  if (Array.isArray(db.users)) {
    for (const u of db.users) {
      if (Array.isArray(u?.profile?.posts)) for (const p of u.profile.posts) all.push(p);
    }
  }
  const post = all.find((p) => p && (p.id === postId || p.postId === postId));
  return post ? String(post.creator || post.authorId || post.userId || '') : null;
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerContentGateRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/content-rating/:postId', requireAuth, (req, res) => {
    const user = (req as any).user;
    const minAge = Math.max(0, Math.min(21, Math.floor(Number((req.body || {}).minAge) || 0)));
    const db = loadDatabase();
    ensureCollection(db);
    const owner = postOwnerOf(db, req.params.postId);
    if (owner && owner !== user.id && !user.isAdmin) {
      return res.status(403).json({ error: 'Only the post owner can set a rating.' });
    }
    db.contentRatings[req.params.postId] = {
      minAge,
      note: s((req.body || {}).note, 200),
      setBy: user.id,
      at: Date.now(),
    };
    saveDatabase(db);
    res.json({ rating: db.contentRatings[req.params.postId] });
  });

  app.get('/api/content-rating/:postId', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ rating: db.contentRatings[req.params.postId] || null });
  });

  app.get('/api/content-rating/gate/:postId', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const rating: ContentRating | undefined = db.contentRatings[req.params.postId];
    if (!rating || !rating.minAge) return res.json({ allowed: true, minAge: 0 });
    const user = (req as any).user;
    const myAge = user ? resolveAgeYears(user) : null;
    // unknown age => allow with a consent notice (we never hard-block on unknown)
    const allowed = myAge === null || myAge >= rating.minAge;
    res.json({ allowed, minAge: rating.minAge, myAge, note: rating.note });
  });
}
