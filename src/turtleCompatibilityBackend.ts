/**
 * Ocean — Compatibility Matrix (Feature 220)
 * ---------------------------------------------
 * Scores compatibility between two users from their declared preferences:
 * interests, values, lifestyle and region. Returns a 0–100 score with a
 * breakdown of matched vs. diverged dimensions.
 *
 * Routes:
 *   POST /api/match/compatibility  (auth) { targetUserId } -> score breakdown
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface CompatibilityPrefs {
  interests: string[];
  values: string[];
  lifestyle: string[];
  region: string;
}

const DIMENSIONS = ['interests', 'values', 'lifestyle', 'region'] as const;

function normalize(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x).toLowerCase().trim()).filter(Boolean).slice(0, 10);
}

function extractPrefs(u: any): CompatibilityPrefs {
  const p = u?.profile || {};
  return {
    interests: normalize(p.interests || p.hobbies),
    values: normalize(p.values || p.importantValues),
    lifestyle: normalize(p.lifestyle || [p.smoking, p.prayer, p.diet].filter(Boolean)),
    region: String(p.city || p.region || '').toLowerCase().trim(),
  };
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0.5; // unknown dimension = neutral
  const setA = new Set(a);
  const inter = b.filter((x) => setA.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return inter / Math.max(1, union);
}

export function compatibilityScore(a: CompatibilityPrefs, b: CompatibilityPrefs) {
  const detail = DIMENSIONS.map((d) => {
    if (d === 'region') {
      const score = a.region && b.region ? (a.region === b.region ? 1 : 0.3) : 0.5;
      return { dimension: d, score: Math.round(score * 100), a: a.region, b: b.region };
    }
    const score = jaccard(a[d], b[d]);
    return { dimension: d, score: Math.round(score * 100), a: a[d], b: b[d] };
  });
  const total = Math.round(detail.reduce((acc, d) => acc + d.score, 0) / detail.length);
  return { score: total, detail };
}

function resolveUser(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  const byId = (db.users || []).find((u: any) => u && u.id === q);
  if (byId) return byId;
  return (db.users || []).find((u: any) => u && (u.name === q || u.username === q)) || null;
}

export function registerCompatibilityRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase } = getCtx();

  app.post('/api/match/compatibility', requireAuth, (req, res) => {
    const user = (req as any).user;
    const targetRef = String((req.body || {}).targetUserId || '');
    const db = loadDatabase();
    const target = resolveUser(db, targetRef);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const mine = extractPrefs(user);
    const theirs = extractPrefs(target);
    const result = compatibilityScore(mine, theirs);
    res.json({
      targetUserId: target.id,
      targetName: target.name || target.username || 'User',
      ...result,
    });
  });
}
