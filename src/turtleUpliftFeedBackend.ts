/**
 * Ocean — Uplift Feed Toggle (Feature 156)
 * ----------------------------------------
 * Sentiment-filters the feed into an "uplift" mode: only positive-toned posts,
 * each with an explainable uplift score. Mirrors the existing mood-chip filters
 * (Learn/Laugh/Relax/Discover) with a dedicated sentiment pass.
 *
 * Routes:
 *   GET /api/feed/uplift?limit=20   -> positive posts sorted by uplift score (guest-safe)
 *   GET /api/feed/mood?mood=uplift  -> alias used by the main feed toggle
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

const POSITIVE_WORDS = [
  'love', 'great', 'good', 'awesome', 'nice', 'amazing', 'thanks', 'thank', 'helpful',
  'excellent', 'best', 'beautiful', 'happy', 'enjoy', 'wonderful', 'proud', 'grateful',
  'inspired', 'hope', 'celebrate', 'success', 'victory', 'smile', 'kind', 'blessed',
  'cute', 'fun', 'hilarious', 'congrats', 'achievement', 'heartwarming', 'sweet', 'win',
];

const NEGATIVE_WORDS = [
  'hate', 'bad', 'terrible', 'awful', 'worst', 'disappointed', 'angry', 'sad', 'wrong',
  'scam', 'fake', 'useless', 'disgusting', 'regret', 'broken', 'failed', 'tragic',
  'violent', 'attack', 'death', 'crisis', 'fear', 'rage', 'hurt',
];

function postText(p: any): string {
  return String(p?.content || '') + ' ' + String(p?.title || '');
}

function postTimestamp(p: any): number {
  const raw = p?.timestamp ?? p?.createdAt ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  return Date.now();
}

/** 0-100 uplift score: positive hits − negative hits, normalized. */
export function upliftScore(text: string): number {
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) pos += 1;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) neg += 1;
  if (pos === 0 && neg === 0) return 40; // neutral baseline — not "uplifting"
  return Math.max(0, Math.min(100, 50 + (pos - neg * 2) * 8));
}

/** Dedupe posts across db.posts + user.profile.posts, with owner name attached. */
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

function upliftRows(db: any, limit: number) {
  return gatherPosts(db)
    .map((p) => ({ post: p, score: upliftScore(postText(p)) }))
    .filter((r) => r.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function registerUpliftFeedRoutes(app: express.Express): void {
  const { loadDatabase } = getCtx();

  // GET /api/feed/uplift
  app.get('/api/feed/uplift', (req, res) => {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const db = loadDatabase();
    const rows = upliftRows(db, limit);

    res.json({
      mode: 'uplift',
      upliftFeed: rows.map((r) => ({
        id: r.post.id,
        title: String(r.post?.content || r.post?.title || '').slice(0, 140),
        owner: r.post._ownerName || 'User',
        upliftScore: r.score,
        type: r.post.videoUrl ? 'reel' : 'post',
        createdAt: postTimestamp(r.post),
      })),
      threshold: 55,
    });
  });

  // GET /api/feed/mood?mood=uplift — alias for the in-app toggle
  app.get('/api/feed/mood', (req, res) => {
    if (req.query.mood !== 'uplift') {
      return res.status(400).json({ error: 'Only mood=uplift is supported by this endpoint.' });
    }
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const db = loadDatabase();
    const rows = upliftRows(db, limit);
    res.json({
      mood: 'uplift',
      posts: rows.map((r) => ({
        id: r.post.id,
        title: String(r.post?.content || r.post?.title || '').slice(0, 140),
        owner: r.post._ownerName || 'User',
        upliftScore: r.score,
      })),
    });
  });
}
