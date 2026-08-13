/**
 * Ocean — Reputation Score (Feature 166)
 * --------------------------------------
 * A weighted, explainable reputation score (0-100) combining content quality,
 * community help and moderation flags. Deterministic — every point is traceable
 * to a signal line in the history.
 *
 * Model (global db, idempotent ensure):
 *   db.reputations — array of { id, userId, score, updatedAt }
 *   db.reputationHistory — ring buffer of { id, userId, score, reason, at }
 *
 * Routes:
 *   POST /api/reputation/refresh   (auth) recompute my score
 *   GET  /api/reputation           (auth) my score + history
 *   GET  /api/reputation/:userId   (guest) public score only
 *   GET  /api/reputation/leaderboard (guest) top scorers
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface Reputation {
  id: string;
  userId: string;
  score: number;
  updatedAt: number;
}

export interface ReputationHistory {
  id: string;
  userId: string;
  score: number;
  reason: string;
  at: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.reputations)) db.reputations = [];
  if (!Array.isArray(db.reputationHistory)) db.reputationHistory = [];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Deterministic weighted reputation from live db signals. */
export function computeReputation(db: any, userId: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 50; // baseline

  // 1. Content quality: avg engagement per post (capped contribution ±20).
  const u = (db.users || []).find((x: any) => x && x.id === userId);
  const posts = Array.isArray(u?.profile?.posts) ? u.profile.posts : [];
  if (posts.length > 0) {
    const avg = posts.reduce((sum: number, p: any) => {
      const views = Number(p?.views || 0);
      const likes = Number(p?.likes || p?.reactions || 0);
      const comments = (p?.comments || []).length;
      return sum + views + likes * 5 + comments * 10;
    }, 0) / posts.length;
    const quality = Math.max(-20, Math.min(20, Math.round(Math.log10(Math.max(1, avg + 1)) * 4)));
    score += quality;
    reasons.push(`Content quality: avg engagement ${Math.round(avg)} → ${quality > 0 ? '+' : ''}${quality} points`);
  }

  // 2. Community help: bounties won, SOS events resolved, shelter help responses.
  const bountiesWon = (db.bounties || []).filter((b: any) => b.acceptedBy === userId).length;
  if (bountiesWon > 0) {
    score += Math.min(10, bountiesWon * 3);
    reasons.push(`Bounties won: ${bountiesWon} → +${Math.min(10, bountiesWon * 3)} points`);
  }
  const sosResolved = (db.safesosEvents || db.safetyEvents || []).filter(
    (e: any) => e.responderId === userId || e.resolvedBy === userId
  ).length;
  if (sosResolved > 0) {
    score += Math.min(10, sosResolved * 2);
    reasons.push(`Safety events resolved: ${sosResolved} → +${Math.min(10, sosResolved * 2)} points`);
  }

  // 3. Moderation flags against the user (smart-community + bot reports).
  const flags = (db.smartCommunity?.flags || []).filter((f: any) => f.targetUserId === userId && f.auto).length;
  const botConfirmed = (db.botReports || []).filter((r: any) => r.targetUserId === userId && r.verdict === 'confirmed').length;
  const penalty = flags * 4 + botConfirmed * 15;
  if (penalty > 0) {
    score -= Math.min(40, penalty);
    reasons.push(`Moderation flags (${flags}) + confirmed bot reports (${botConfirmed}) → −${Math.min(40, penalty)} points`);
  }

  // 4. Streaks show sustained positive behavior.
  const bestStreak = (db.streaks || []).filter((s: any) => s.userId === userId).reduce((best: number, s: any) => Math.max(best, s.best || 0), 0);
  if (bestStreak >= 7) {
    score += 3;
    reasons.push(`7+ day streak → +3 points`);
  }

  return { score: clamp(score), reasons };
}

export function registerReputationRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/reputation/refresh
  app.post('/api/reputation/refresh', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const { score, reasons } = computeReputation(db, user.id);
    const list = db.reputations as Reputation[];
    const idx = list.findIndex((r) => r.userId === user.id);
    if (idx >= 0) list[idx] = { ...list[idx], score, updatedAt: Date.now() };
    else list.push({ id: uid('rep'), userId: user.id, score, updatedAt: Date.now() });

    const hist = db.reputationHistory as ReputationHistory[];
    hist.unshift({ id: uid('reph'), userId: user.id, score, reason: reasons.slice(0, 3).join('; ') || 'Baseline', at: Date.now() });
    const mine = hist.filter((h) => h.userId === user.id);
    if (mine.length > 50) {
      const drop = new Set(mine.slice(50).map((h) => h.id));
      for (let i = hist.length - 1; i >= 0; i--) if (drop.has(hist[i].id)) hist.splice(i, 1);
    }
    saveDatabase(db);
    res.json({ score, reasons, updatedAt: Date.now() });
  });

  // GET /api/reputation — mine + history
  app.get('/api/reputation', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const rep = (db.reputations as Reputation[]).find((r) => r.userId === user.id);
    const history = (db.reputationHistory as ReputationHistory[]).filter((h) => h.userId === user.id).slice(0, 20);
    res.json({ score: rep?.score ?? 50, updatedAt: rep?.updatedAt ?? null, history });
  });

  // GET /api/reputation/leaderboard — MUST be registered before :userId so the
  // static path wins (Express matches in registration order).
  app.get('/api/reputation/leaderboard', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const rows = (db.reputations as Reputation[])
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => {
        const u = (db.users || []).find((x: any) => x && x.id === r.userId);
        return { userId: r.userId, name: u ? u.name || u.username || 'User' : 'User', score: r.score };
      });
    res.json({ leaderboard: rows });
  });

  // GET /api/reputation/:userId — public
  app.get('/api/reputation/:userId', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const rep = (db.reputations as Reputation[]).find((r) => r.userId === req.params.userId);
    res.json({ userId: req.params.userId, score: rep?.score ?? 50 });
  });
}
