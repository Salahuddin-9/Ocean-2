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

export type StreakType = 'learning' | 'creator' | 'helper';

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
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

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
    res.json({ streak, advanced, note: advanced ? 'Streak advanced!' : 'Already checked in today — come back tomorrow.' });
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
