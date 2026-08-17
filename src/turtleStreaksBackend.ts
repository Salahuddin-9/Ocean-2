/**
 * Ocean — Meaningful Streaks (Feature 164)
 * ----------------------------------------
 * Purposeful streaks: learning, creator, helper. Users check in once per day per
 * type; a missed day resets the current streak (best streak is kept forever).
 *
 * Model (global db, idempotent ensure):
 *   db.streaks — array of { id, userId, type, current, best, lastCheckIn, updatedAt }
 *
 * Routes:
 *   POST /api/streaks/checkin          (auth) { type } -> increment (same-day dedupe)
 *   GET  /api/streaks                  (auth) my streaks
 *   GET  /api/streaks/leaderboard      (guest) ?type=creator -> top current streaks
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

export type StreakType = 'learning' | 'creator' | 'helper';

/** Coin rewards credited to the user's community balance on streak milestones. */
export const STREAK_MILESTONE_REWARDS: Record<number, number> = {
  3: 20,
  7: 50,
  14: 120,
  30: 300,
  60: 700,
  100: 1500,
};

export interface Streak {
  id: string;
  userId: string;
  type: StreakType;
  current: number;
  best: number;
  lastCheckIn: string | null; // YYYY-MM-DD
  updatedAt: number;
}

const TYPES: StreakType[] = ['learning', 'creator', 'helper'];

function uid(): string {
  return `streak-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.streaks)) db.streaks = [];
}

function dayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Register one check-in for a streak; returns the updated record + whether it advanced. */
export function checkIn(db: any, userId: string, type: StreakType): { streak: Streak; advanced: boolean } {
  ensureCollection(db);
  const list = db.streaks as Streak[];
  let streak = list.find((s) => s.userId === userId && s.type === type);
  const today = dayStr(0);
  if (!streak) {
    streak = { id: uid(), userId, type, current: 1, best: 1, lastCheckIn: today, updatedAt: Date.now() };
    list.push(streak);
    return { streak, advanced: true };
  }
  if (streak.lastCheckIn === today) return { streak, advanced: false }; // already checked in today

  if (streak.lastCheckIn === dayStr(1)) streak.current += 1; // consecutive
  else streak.current = 1; // gap -> restart
  streak.best = Math.max(streak.best, streak.current);
  streak.lastCheckIn = today;
  streak.updatedAt = Date.now();
  return { streak, advanced: true };
}

export function registerStreakRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  // POST /api/streaks/checkin
  app.post('/api/streaks/checkin', requireAuth, (req, res) => {
    const user = (req as any).user;
    const type = String((req.body || {}).type || '');
    if (!TYPES.includes(type as StreakType)) {
      return res.status(400).json({ error: 'type must be learning|creator|helper.' });
    }
    const db = loadDatabase();
    const { streak, advanced } = checkIn(db, user.id, type as StreakType);
    saveDatabase(db);

    // Feature #68 — coin rewards: hitting a milestone day credits the user's
    // community balance (community.json, same store the tip/reward features use).
    let rewardAwarded = 0;
    const milestoneReward = advanced ? (STREAK_MILESTONE_REWARDS[streak.current] || 0) : 0;
    if (milestoneReward > 0) {
      try {
        const state = loadCommunity();
        addBalance(state, user.id, milestoneReward);
        saveCommunity(state);
        rewardAwarded = milestoneReward;
      } catch (e) {
        console.warn('[streaks] milestone reward failed (community store not writable):', e);
      }
    }

    res.json({
      streak,
      advanced,
      rewardAwarded,
      note: advanced
        ? (rewardAwarded > 0
            ? `Milestone! +${rewardAwarded} coins added to your balance 🎉`
            : 'Streak advanced!')
        : 'Already checked in today — come back tomorrow.',
    });
  });

  // GET /api/streaks — my streaks
  app.get('/api/streaks', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.streaks as Streak[]).filter((s) => s.userId === user.id);
    const withLabels = TYPES.map((t) => {
      const s = mine.find((x) => x.type === t);
      return {
        type: t,
        label: t === 'learning' ? 'Learning' : t === 'creator' ? 'Creator' : 'Helper',
        icon: t === 'learning' ? '📚' : t === 'creator' ? '🎬' : '🤝',
        current: s?.current ?? 0,
        best: s?.best ?? 0,
        lastCheckIn: s?.lastCheckIn ?? null,
      };
    });
    res.json({ streaks: withLabels });
  });

  // GET /api/streaks/leaderboard — top streaks by type (guest)
  app.get('/api/streaks/leaderboard', (req, res) => {
    const type = String(req.query.type || 'creator');
    if (!TYPES.includes(type as StreakType)) return res.status(400).json({ error: 'Unknown streak type.' });
    const db = loadDatabase();
    ensureCollection(db);
    const rows = (db.streaks as Streak[])
      .filter((s) => s.type === type)
      .sort((a, b) => b.current - a.current)
      .slice(0, 20)
      .map((s) => {
        const u = (db.users || []).find((x: any) => x && x.id === s.userId);
        return { userId: s.userId, name: u ? u.name || u.username || 'User' : 'User', current: s.current, best: s.best };
      });
    res.json({ type, leaderboard: rows });
  });
}
