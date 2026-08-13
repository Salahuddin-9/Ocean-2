/**
 * Ocean — Behavioral Biometric Verification / Humanity Score (Feature 137)
 * ------------------------------------------------------------------------
 * Scores how "human-like" a user's interaction patterns are. The client collects
 * lightweight behavioral samples (scroll cadence, typing rhythm, click bursts,
 * pointer smoothness, session pacing) and posts ONLY derived aggregates — never
 * raw PII. The server runs deterministic heuristics and persists the score.
 *
 * Model (global db, idempotent ensure):
 *   db.humanityScores — array of { userId, score, tier, breakdown, sampleCount, updatedAt }
 *   db.humanityHistory — array of { id, userId, score, breakdown, sampledAt } (ring buffer)
 *
 * Routes:
 *   POST /api/auth/humanity-score        { samples: {..} } -> score this sample set, persist
 *   GET  /api/auth/humanity-score        -> my current score + recent history
 *   GET  /api/users/:id/humanity         -> public current score (0 when never sampled)
 *   POST /api/auth/humanity-reset        -> clear my history (privacy)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export type HumanityTier = 'high' | 'medium' | 'low' | 'unverified';

export interface HumanitySampleSet {
  /** Standard deviation of inter-click intervals (ms). Bots cluster ~0. */
  clickIntervalStdMs?: number;
  /** Clicks inside a 2s burst window (humans rarely exceed 8). */
  maxClickBurst?: number;
  /** Std dev of keypress intervals (ms). Bots are metronomically even. */
  typingIntervalStdMs?: number;
  /** Std dev of scroll deltas (px). Bots scroll in identical jumps. */
  scrollDeltaStdPx?: number;
  /** Std dev of pointer speed between mousemove samples. */
  pointerSpeedStd?: number;
  /** Session length observed (seconds). */
  sessionSeconds?: number;
  /** Fraction of samples that arrived while the tab was visible. */
  visibilityRatio?: number;
  /** Total raw samples collected. */
  sampleCount?: number;
}

export interface HumanityBreakdown {
  clickRhythm: number;
  typingRhythm: number;
  scrollCadence: number;
  pointerSmoothness: number;
  burstControl: number;
  sessionPacing: number;
}

export interface HumanityRecord {
  userId: string;
  score: number;
  tier: HumanityTier;
  breakdown: HumanityBreakdown;
  sampleCount: number;
  updatedAt: number;
}

export interface HumanitySampleRecord {
  id: string;
  userId: string;
  score: number;
  tier: HumanityTier;
  sampleCount: number;
  sampledAt: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.humanityScores)) db.humanityScores = [];
  if (!Array.isArray(db.humanityHistory)) db.humanityHistory = [];
}

/** Per-signal 0-100 score from a raw value + healthy band. Maps a metric that is
 * "good when near some ideal" onto a score. */
function rhythmScore(stdMs: number | undefined, ideal: number, tolerance: number): number {
  if (!isFiniteNum(stdMs)) return 50; // no data -> neutral
  // Perfectly even (bot-like) is BAD; wildly erratic is also suspicious.
  if (stdMs <= 0.5) return 15;
  return clamp(100 - (Math.abs(stdMs - ideal) / tolerance) * 60, 20, 100);
}

function burstScore(maxBurst: number | undefined): number {
  if (!isFiniteNum(maxBurst)) return 50;
  if (maxBurst <= 4) return 95;
  if (maxBurst <= 8) return 75;
  if (maxBurst <= 14) return 45;
  return 15;
}

function scrollScore(stdPx: number | undefined): number {
  if (!isFiniteNum(stdPx)) return 50;
  if (stdPx <= 0.5) return 10; // perfectly identical jumps = automation
  if (stdPx <= 40) return 90;
  if (stdPx <= 160) return 70;
  return 50;
}

function pointerScore(std: number | undefined): number {
  if (!isFiniteNum(std)) return 50;
  if (std <= 0.05) return 10; // straight-line teleport = bot
  if (std <= 0.8) return 88;
  if (std <= 3) return 70;
  return 55;
}

function pacingScore(seconds: number | undefined): number {
  if (!isFiniteNum(seconds) || seconds <= 0) return 50;
  if (seconds < 3) return 30; // too fast to be a real session
  if (seconds < 20) return 70;
  return 90;
}

function computeBreakdown(s: HumanitySampleSet): HumanityBreakdown {
  return {
    clickRhythm: rhythmScore(s.clickIntervalStdMs, 140, 500),
    typingRhythm: rhythmScore(s.typingIntervalStdMs, 90, 400),
    scrollCadence: scrollScore(s.scrollDeltaStdPx),
    pointerSmoothness: pointerScore(s.pointerSpeedStd),
    burstControl: burstScore(s.maxClickBurst),
    sessionPacing: pacingScore(s.sessionSeconds),
  };
}

/** Deterministic final score from the six sub-signals (equal weights, clamped). */
export function scoreHumanity(s: HumanitySampleSet): { score: number; breakdown: HumanityBreakdown } {
  const b = computeBreakdown(s);
  const raw = (b.clickRhythm + b.typingRhythm + b.scrollCadence + b.pointerSmoothness + b.burstControl + b.sessionPacing) / 6;
  return { score: Math.round(clamp(raw, 5, 100)), breakdown: b };
}

function tierFor(score: number): HumanityTier {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function registerHumanityRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/auth/humanity-score — score a freshly collected sample set
  app.post('/api/auth/humanity-score', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as { samples?: HumanitySampleSet };
    const s: HumanitySampleSet = body.samples || {};
    const sampleCount = isFiniteNum(s.sampleCount) ? Math.round(s.sampleCount) : 0;
    if (sampleCount < 3) {
      return res.status(400).json({ error: 'Not enough behavioral samples yet — keep interacting (min 3).' });
    }

    const { score, breakdown } = scoreHumanity(s);
    const tier = tierFor(score);

    const db = loadDatabase();
    ensureCollections(db);
    const scores = db.humanityScores as HumanityRecord[];
    const idx = scores.findIndex((r) => r.userId === user.id);
    const record: HumanityRecord = {
      userId: user.id,
      score,
      tier,
      breakdown,
      sampleCount,
      updatedAt: Date.now(),
    };
    if (idx >= 0) scores[idx] = record;
    else scores.push(record);

    // ring-buffer history (keep last 50 per user)
    const hist = db.humanityHistory as HumanitySampleRecord[];
    hist.unshift({ id: `hs-${Date.now()}-${Math.floor(Math.random() * 999)}`, userId: user.id, score, tier, sampleCount, sampledAt: Date.now() });
    const mine = hist.filter((h) => h.userId === user.id);
    if (mine.length > 50) {
      const drop = new Set(mine.slice(50).map((h) => h.id));
      for (let i = hist.length - 1; i >= 0; i--) if (drop.has(hist[i].id)) hist.splice(i, 1);
    }
    saveDatabase(db);
    res.json({ score, tier, breakdown, sampleCount });
  });

  // GET /api/auth/humanity-score — my score + recent history
  app.get('/api/auth/humanity-score', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const mine = (db.humanityScores as HumanityRecord[]).find((r) => r.userId === user.id);
    const history = (db.humanityHistory as HumanitySampleRecord[])
      .filter((h) => h.userId === user.id)
      .slice(0, 20);
    res.json({
      score: mine?.score ?? null,
      tier: mine?.tier ?? 'unverified',
      breakdown: mine?.breakdown ?? null,
      sampleCount: mine?.sampleCount ?? 0,
      updatedAt: mine?.updatedAt ?? null,
      history,
    });
  });

  // GET /api/users/:id/humanity — public score (no history, no identity leakage)
  app.get('/api/users/:id/humanity', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const mine = (db.humanityScores as HumanityRecord[]).find((r) => r.userId === req.params.id);
    res.json({ userId: req.params.id, score: mine?.score ?? null, tier: mine?.tier ?? 'unverified' });
  });

  // POST /api/auth/humanity-reset — wipe my behavioral history (privacy)
  app.post('/api/auth/humanity-reset', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const scores = db.humanityScores as HumanityRecord[];
    const si = scores.findIndex((r) => r.userId === user.id);
    if (si >= 0) scores.splice(si, 1);
    const hist = db.humanityHistory as HumanitySampleRecord[];
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].userId === user.id) hist.splice(i, 1);
    saveDatabase(db);
    res.json({ success: true });
  });
}
