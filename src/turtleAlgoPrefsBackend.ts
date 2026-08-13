/**
 * Ocean — User-Controlled Algo Panel (Feature 151)
 * ------------------------------------------------
 * Lets the user tune their feed weights (educational / entertainment / news /
 * politics / sports / art). The personalized feed endpoint scores posts with
 * ATLAS-style signals (engagement + recency) multiplied by the user's category
 * weights, and auto-logs every decision to the Algorithmic Audit Log (152).
 *
 * Model (global db, idempotent ensure):
 *   db.algoPreferences — array of { id, userId, weights: AlgoWeights, updatedAt }
 *
 * Routes:
 *   GET  /api/algo/preferences         (auth) my weights (defaults on first hit)
 *   PUT  /api/algo/preferences         (auth) { weights } validate + save
 *   GET  /api/feed/personalized        (auth) re-ranked feed + audit logging
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { writeAuditEntry } from './turtleAuditLogBackend';

export interface AlgoWeights {
  educational: number; // 0-3
  entertainment: number;
  news: number;
  politics: number;
  sports: number;
  art: number;
}

const CATEGORIES: (keyof AlgoWeights)[] = ['educational', 'entertainment', 'news', 'politics', 'sports', 'art'];

const DEFAULT_WEIGHTS: AlgoWeights = { educational: 1, entertainment: 1, news: 1, politics: 1, sports: 1, art: 1 };

// Hashtag/keyword -> category map (word-boundary matched against post tags+text).
const CATEGORY_KEYWORDS: Record<keyof AlgoWeights, string[]> = {
  educational: ['learn', 'tutorial', 'course', 'science', 'coding', 'study', 'tips', 'lesson', 'math', 'history', 'explain', '101', 'howto'],
  entertainment: ['funny', 'music', 'meme', 'memes', 'movie', 'dance', 'comedy', 'song', 'entertainment', 'lol', 'viral', 'trending'],
  news: ['news', 'breaking', 'update', 'headline', 'report', 'live', 'alert'],
  politics: ['politics', 'election', 'government', 'minister', 'policy', 'vote', 'parliament', 'political'],
  sports: ['cricket', 'football', 'match', 'sports', 'goal', 'tournament', 'basketball', 'tennis', 'athlete'],
  art: ['art', 'painting', 'design', 'photo', 'photography', 'drawing', 'sketch', 'creative', 'illustration'],
};

function clampWeight(n: number): number {
  // 0 is a valid "minimize" weight — `Number(n) || 1` would wrongly coerce 0 -> 1.
  const num = Number(n);
  return Number.isFinite(num) ? Math.max(0, Math.min(3, Math.round(num * 10) / 10)) : 1;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.algoPreferences)) db.algoPreferences = [];
}

function getPrefs(db: any, userId: string): AlgoWeights {
  const p = (db.algoPreferences || []).find((x: any) => x.userId === userId);
  return p ? { ...DEFAULT_WEIGHTS, ...p.weights } : { ...DEFAULT_WEIGHTS };
}

function postText(p: any): string {
  return String(p?.content || '') + ' ' + String(p?.title || '');
}

function postTimestamp(p: any): number {
  const raw = p?.timestamp ?? p?.createdAt ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  return Date.now();
}

/** Which categories a post belongs to (by hashtags + keyword scan). */
function categoriesOf(p: any): (keyof AlgoWeights)[] {
  const text = postText(p).toLowerCase();
  const tags = (text.match(/#[a-zA-Z0-9_]+/g) || []).map((h: string) => h.slice(1));
  const hits = new Set<keyof AlgoWeights>();
  for (const cat of CATEGORIES) {
    const words = CATEGORY_KEYWORDS[cat];
    if (tags.some((t) => words.includes(t))) hits.add(cat);
    else if (words.some((w) => text.includes(w))) hits.add(cat);
  }
  return Array.from(hits);
}

function engagementScore(p: any): number {
  const views = Number(p?.views || 0);
  const likes = Number(p?.likes || p?.reactions || 0);
  const comments = Number(p?.comments?.length || 0);
  return 20 + Math.log10(Math.max(1, views + likes * 5 + comments * 10 + 1)) * 18;
}

function recencyScore(p: any): number {
  const ageH = (Date.now() - postTimestamp(p)) / 3600_000;
  if (ageH < 1) return 98;
  if (ageH < 24) return 88;
  if (ageH < 168) return 60;
  return 30;
}

/** Personalized score: base signals × user preference multiplier. */
export function personalScore(p: any, weights: AlgoWeights): { score: number; matched: (keyof AlgoWeights)[]; boost: number } {
  const base = engagementScore(p) * 0.6 + recencyScore(p) * 0.4;
  const matched = categoriesOf(p);
  let boost = 1;
  for (const cat of matched) boost *= Math.max(0.35, weights[cat]);
  if (matched.length === 0) boost = 0.9; // uncategorized slightly de-emphasized
  return { score: Math.round(base * boost), matched, boost };
}

export function registerAlgoPrefsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/algo/preferences
  app.get('/api/algo/preferences', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ weights: getPrefs(db, user.id) });
  });

  // PUT /api/algo/preferences
  app.put('/api/algo/preferences', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}).weights || {};
    const weights: AlgoWeights = { ...DEFAULT_WEIGHTS };
    for (const cat of CATEGORIES) {
      if (typeof body[cat] === 'number' || typeof body[cat] === 'string') {
        weights[cat] = clampWeight(Number(body[cat]));
      }
    }
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.algoPreferences as { id: string; userId: string; weights: AlgoWeights; updatedAt: number }[];
    const idx = list.findIndex((x) => x.userId === user.id);
    if (idx >= 0) list[idx] = { ...list[idx], weights, updatedAt: Date.now() };
    else list.push({ id: `ap-${Date.now()}-${Math.floor(Math.random() * 999)}`, userId: user.id, weights, updatedAt: Date.now() });
    saveDatabase(db);
    res.json({ weights });
  });

  // GET /api/feed/personalized — preference-weighted feed + audit log
  app.get('/api/feed/personalized', requireAuth, (req, res) => {
    const user = (req as any).user;
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const db = loadDatabase();
    ensureCollection(db);
    const weights = getPrefs(db, user.id);

    const postMap = new Map<string, any>();
    (db.posts || []).forEach((p: any) => { if (p && p.id) postMap.set(p.id, p); });
    (db.users || []).forEach((u: any) => {
      (u.profile?.posts || []).forEach((p: any) => { if (p && p.id && !postMap.has(p.id)) postMap.set(p.id, { ...p, _ownerName: u.name || u.username }); });
    });
    const posts = Array.from(postMap.values());

    const scored = posts
      .map((p) => {
        const { score, matched, boost } = personalScore(p, weights);
        return { post: p, score, matched, boost };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Auto-log every decision to the audit trail (feature 152).
    scored.forEach((s) => writeAuditEntry(db, user.id, s.post));
    saveDatabase(db);

    res.json({
      weights,
      feed: scored.map((s) => ({
        id: s.post.id,
        title: String(s.post?.content || s.post?.title || '').slice(0, 120),
        owner: s.post._ownerName || 'User',
        score: s.score,
        matched: s.matched,
        boost: s.boost,
        type: s.post.videoUrl ? 'reel' : 'post',
      })),
      auditLogged: scored.length,
    });
  });
}
