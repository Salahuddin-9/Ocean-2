/**
 * Ocean — Azan Auto-Mute (Feature 223)
 * --------------------------------------
 * Prayer-time integration: computes today's five prayer times (deterministic
 * astronomical approximation, adjustable offset for city) and lets users opt
 * into auto-muting notifications during prayer windows.
 *
 * Model (global db): db.azanPrefs — map userId -> { enabled, offsetMin }
 *
 * Routes:
 *   GET  /api/azan/times      (public) today's prayer times (+ next prayer)
 *   GET  /api/azan/prefs      (auth) my preference
 *   POST /api/azan/prefs      (auth) { enabled, offsetMin }
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

// Deterministic approximation for Dhaka (23.81N, 90.41E). Offsets are
// configurable per user; a production version should use an aladhan-style API.
function prayerTimes(now: Date, offsetMin: number) {
  const day = now.getDate();
  const month = now.getMonth() + 1;
  // sine-ish seasonal correction: ~ +6h offset + daylight variation
  const season = Math.sin(((month - 3) / 12) * Math.PI * 2) * 22; // minutes
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 52);
  const times = [
    { name: 'Fajr', minutes: 0 + season + offsetMin },
    { name: 'Sunrise', minutes: 39 + season + offsetMin },
    { name: 'Dhuhr', minutes: 312 - season + offsetMin },
    { name: 'Asr', minutes: 471 - season + offsetMin },
    { name: 'Maghrib', minutes: 575 - season + offsetMin },
    { name: 'Isha', minutes: 633 - season + offsetMin },
  ];
  const items = times.map((t) => {
    const d = new Date(base.getTime() + t.minutes * 60000);
    return { name: t.name, at: d.getTime(), label: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
  });
  const nowMs = now.getTime();
  const next = items.find((i) => i.at > nowMs) || items[0];
  const inMute = items.slice(0, 5).some((i) => nowMs >= i.at - 10 * 60000 && nowMs <= i.at + 15 * 60000);
  return { items, next, inMute, day };
}

function ensureCollection(db: any): void {
  if (!db.azanPrefs || typeof db.azanPrefs !== 'object') db.azanPrefs = {};
}

/**
 * Pure helper for other modules (chatServer notification suppression): is this
 * user's notification auto-mute ACTIVE right now (pref enabled AND inside a
 * prayer window)? Reads db.azanPrefs; never mutates, never throws.
 */
export function isAzanMutedForUser(db: any, userId: string, now: Date = new Date()): boolean {
  try {
    const prefs = db?.azanPrefs?.[userId];
    if (!prefs || !prefs.enabled) return false;
    const offsetMin = Math.max(-60, Math.min(60, Math.floor(Number(prefs.offsetMin) || 0)));
    return prayerTimes(now, offsetMin).inMute;
  } catch {
    return false;
  }
}

/**
 * Compute the current mute state for every user in a list — used when
 * broadcasting a chat event so each recipient's payload can carry a
 * per-user `muted` flag. Returns a Map<userId, boolean>.
 */
export function azanMuteMapForUsers(db: any, userIds: string[], now: Date = new Date()): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const uid of userIds || []) {
    map.set(uid, isAzanMutedForUser(db, uid, now));
  }
  return map;
}

export function registerAzanRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/azan/times', (req, res) => {
    const offsetMin = Math.max(-60, Math.min(60, Math.floor(Number((req.query as any).offset) || 0)));
    res.json(prayerTimes(new Date(), offsetMin));
  });

  app.get('/api/azan/prefs', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ prefs: db.azanPrefs[user.id] || { enabled: false, offsetMin: 0 } });
  });

  app.post('/api/azan/prefs', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const db = loadDatabase();
    ensureCollection(db);
    const cur = db.azanPrefs[user.id] || { enabled: false, offsetMin: 0 };
    db.azanPrefs[user.id] = {
      enabled: b.enabled != null ? Boolean(b.enabled) : cur.enabled,
      offsetMin: Number.isFinite(Number(b.offsetMin)) ? Math.max(-60, Math.min(60, Math.floor(Number(b.offsetMin)))) : cur.offsetMin,
    };
    saveDatabase(db);
    res.json({ prefs: db.azanPrefs[user.id] });
  });
}
