/**
 * Ocean — Co-Streaming & Revenue Split backend
 * ----------------------------------------------
 * Two creators co-host a live session; tips/gifts sent during the stream are
 * split between host and co-host by a preset ratio (splitConfig.ratioA /
 * ratioB, integers 0-100 that must sum to 100).
 *
 * Wallet: tips are drawn from the REAL coin wallet (community.json) via
 * addBalance / spendBalance from ./turtleCommunityBackend. The tipper spends
 * `amount`; the host receives ratioA% and the co-host ratioB% (computed so the
 * two shares always sum to exactly the tip amount — the remainder of integer
 * rounding goes to the co-host). If there is no co-host, the host receives the
 * full amount.
 *
 * State lives in the global db under `db.liveSessions` (idempotent ensure).
 *
 * Routes (all under /api/live/*):
 *   POST /api/live/session                  create a session (host = me, status idle)
 *   GET  /api/live/session                  list: all live + my sessions (idle/live/ended)
 *   GET  /api/live/session/:id              one session with its tip history
 *   POST /api/live/session/:id/cohost       (host) set co-host + split ratio
 *   POST /api/live/session/:id/start        (host) status -> live
 *   POST /api/live/session/:id/end          (host) status -> ended
 *   POST /api/live/session/:id/tip          send a tip (spend wallet, credit per split)
 *   POST /api/live/session/:id/join         add caller to the viewers list
 *   GET  /api/live/users                    co-host picker user map
 *
 * A lightweight in-process scheduler (60s tick) auto-ends live sessions that
 * have run for more than LIVE_MAX_MS so no session can be stuck "live" forever.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

/** A single tip/gift recorded against a live session. */
export interface LiveTip {
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  amount: number;
  at: number;
  split: { host: number; cohost: number };
}

/** A co-streaming live session stored in db.liveSessions. */
export interface LiveSession {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  coHostId: string | null;
  coHostName?: string;
  status: 'idle' | 'live' | 'ended';
  startedAt: number | null;
  endedAt: number | null;
  /** ratioA = host share %, ratioB = co-host share %, always sum to 100. */
  splitConfig: { ratioA: number; ratioB: number };
  tipTotal: number;
  tips: LiveTip[];
  viewers: string[];
}

const LIVE_MAX_MS = 6 * 60 * 60 * 1000; // 6 hours — auto-end stale live sessions
const SCHEDULER_INTERVAL_MS = 60_000;

let schedulerStarted = false;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollection(db: any): void {
  if (!Array.isArray(db.liveSessions)) db.liveSessions = [];
}

/** Lightweight auto-end scheduler — idempotent per period, never heavy in the tick. */
function startAutoEndScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  setInterval(() => {
    try {
      const ctx = getCtx();
      const db = ctx.loadDatabase();
      ensureCollection(db);
      const nowMs = Date.now();
      let changed = false;
      for (const s of db.liveSessions as LiveSession[]) {
        if (s.status === 'live' && s.startedAt && nowMs - s.startedAt > LIVE_MAX_MS) {
          s.status = 'ended';
          s.endedAt = nowMs;
          changed = true;
        }
      }
      if (changed) ctx.saveDatabase(db);
    } catch (e) {
      console.warn('[co-stream] scheduler tick error:', e);
    }
  }, SCHEDULER_INTERVAL_MS);
}

/**
 * Compute the split for a tip amount. ratioA (host) / ratioB (co-host) are
 * 0-100 summing 100. Host share = round(amount * ratioA / 100); co-host share
 * = amount - host share so the two always sum to exactly `amount`. When there
 * is no co-host the host receives the full amount.
 */
function computeSplit(amount: number, ratioA: number, ratioB: number, hasCohost: boolean): { host: number; cohost: number } {
  if (!hasCohost) return { host: amount, cohost: 0 };
  const host = Math.round(amount * (ratioA / 100));
  return { host, cohost: amount - host };
}

export function registerCoStreamRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = ctx;

  startAutoEndScheduler();

  // Create a live session (host = me, status idle).
  app.post('/api/live/session', requireAuth, (req, res) => {
    const user = (req as any).user;
    const title =
      typeof (req.body || {}).title === 'string' && String(req.body.title).trim()
        ? String(req.body.title).trim().slice(0, 120)
        : `${user.name || user.username || 'User'}'s Live`;
    const session: LiveSession = {
      id: uid('live'),
      title,
      hostId: user.id,
      hostName: user.name || user.username || 'User',
      coHostId: null,
      status: 'idle',
      startedAt: null,
      endedAt: null,
      splitConfig: { ratioA: 50, ratioB: 50 },
      tipTotal: 0,
      tips: [],
      viewers: [user.id],
    };
    const db = loadDatabase();
    ensureCollection(db);
    (db.liveSessions as LiveSession[]).push(session);
    saveDatabase(db);
    res.json({ session });
  });

  // List: all live sessions + every session I host or co-host.
  app.get('/api/live/session', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const list = (db.liveSessions as LiveSession[]) || [];
    const live = list.filter((s) => s.status === 'live');
    const mine = list.filter((s) => s.hostId === user.id || s.coHostId === user.id);
    const seen = new Set<string>();
    const out: LiveSession[] = [];
    for (const s of [...live, ...mine]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    res.json({ sessions: out });
  });

  // One session with tip history.
  app.get('/api/live/session/:id', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.liveSessions as LiveSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Live session not found.' });
    res.json({ session });
  });

  // Set co-host + split ratio (host only, not after end).
  app.post('/api/live/session/:id/cohost', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.liveSessions as LiveSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Live session not found.' });
    if (session.hostId !== user.id) {
      return res.status(403).json({ error: 'Only the host can invite a co-host.' });
    }
    if (session.status === 'ended') {
      return res.status(400).json({ error: 'This session has ended.' });
    }
    const coHostId = String((req.body || {}).coHostId || '').trim();
    if (!coHostId) return res.status(400).json({ error: 'coHostId is required.' });
    if (coHostId === session.hostId) {
      return res.status(400).json({ error: 'Co-host must be a different user.' });
    }
    const ratioA = Math.round(Number((req.body || {}).ratioA));
    const ratioB = Math.round(Number((req.body || {}).ratioB));
    if (
      !Number.isFinite(ratioA) || !Number.isFinite(ratioB) ||
      ratioA < 0 || ratioA > 100 || ratioB < 0 || ratioB > 100 || ratioA + ratioB !== 100
    ) {
      return res.status(400).json({ error: 'Split ratios must be integers 0-100 that sum to 100.' });
    }
    const cohostUser = (db.users || []).find((u: any) => u.id === coHostId);
    if (!cohostUser) return res.status(400).json({ error: 'Co-host user not found.' });
    session.coHostId = coHostId;
    session.coHostName = cohostUser.name || cohostUser.username || 'User';
    session.splitConfig = { ratioA, ratioB };
    if (!session.viewers.includes(coHostId)) session.viewers.push(coHostId);
    saveDatabase(db);
    res.json({ session });
  });

  // Start the live (host only, once).
  app.post('/api/live/session/:id/start', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.liveSessions as LiveSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Live session not found.' });
    if (session.hostId !== user.id) {
      return res.status(403).json({ error: 'Only the host can start the stream.' });
    }
    if (session.status === 'ended') {
      return res.status(400).json({ error: 'This session has ended.' });
    }
    session.status = 'live';
    session.startedAt = session.startedAt || Date.now();
    saveDatabase(db);
    res.json({ session });
  });

  // End the live (host only).
  app.post('/api/live/session/:id/end', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.liveSessions as LiveSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Live session not found.' });
    if (session.hostId !== user.id) {
      return res.status(403).json({ error: 'Only the host can end the stream.' });
    }
    session.status = 'ended';
    session.endedAt = Date.now();
    saveDatabase(db);
    res.json({ session });
  });

  // Tip / gift during the stream: tipper spends from the real wallet; host and
  // co-host are credited per splitConfig. 402 if the tipper cannot afford it.
  app.post('/api/live/session/:id/tip', requireAuth, (req, res) => {
    const tipper = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.liveSessions as LiveSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Live session not found.' });
    if (session.status !== 'live') {
      return res.status(400).json({ error: 'Tips are only accepted while the stream is live.' });
    }
    const amount = Math.floor(Number((req.body || {}).amount) || 0);
    if (amount <= 0) return res.status(400).json({ error: 'A positive tip amount is required.' });
    if (amount > 1_000_000) return res.status(400).json({ error: 'Tip amount is too large.' });

    // Nominal recipient (optional) — must be host or co-host; defaults to host.
    let to = session.hostId;
    const rawTo = String((req.body || {}).to || '');
    if (rawTo === session.hostId || rawTo === session.coHostId) to = rawTo;
    const toUser = (db.users || []).find((u: any) => u.id === to);

    // Wallet: spend from tipper, credit host + co-host per split.
    const community = loadCommunity();
    if (!spendBalance(community, tipper.id, amount)) {
      return res.status(402).json({ error: 'Insufficient balance for this tip.' });
    }
    const sc = session.splitConfig || { ratioA: 50, ratioB: 50 };
    const ratioA = Number.isFinite(sc.ratioA) ? sc.ratioA : 50;
    const ratioB = Number.isFinite(sc.ratioB) ? sc.ratioB : 50;
    const split = computeSplit(amount, ratioA, ratioB, !!session.coHostId);
    addBalance(community, session.hostId, split.host);
    if (session.coHostId && split.cohost > 0) addBalance(community, session.coHostId, split.cohost);
    saveCommunity(community);

    // Record the tip with its split detail.
    const tip: LiveTip = {
      from: tipper.id,
      fromName: tipper.name || tipper.username || 'User',
      to,
      toName: toUser ? toUser.name || toUser.username || 'User' : 'Host',
      amount,
      at: Date.now(),
      split,
    };
    if (!Array.isArray(session.tips)) session.tips = [];
    session.tips.push(tip);
    session.tipTotal = (session.tipTotal || 0) + amount;
    if (!session.viewers.includes(tipper.id)) session.viewers.push(tipper.id);
    saveDatabase(db);

    res.json({
      success: true,
      tip,
      tipTotal: session.tipTotal,
      balance: community.balances[tipper.id] || 0,
      split,
    });
  });

  // Join a session as a viewer (dedupe).
  app.post('/api/live/session/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.liveSessions as LiveSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Live session not found.' });
    if (!session.viewers.includes(user.id)) session.viewers.push(user.id);
    saveDatabase(db);
    res.json({ session });
  });

  // Co-host picker user map (public info only).
  app.get('/api/live/users', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const users = (db.users || []).map((u: any) => ({
      id: u.id,
      name: u.name || u.username || 'User',
      username: u.username || '',
      avatarUrl: (u.profile && u.profile.avatarUrl) || '',
    }));
    res.json({
      users,
      me: { id: user.id, name: user.name || user.username || 'User' },
    });
  });
}
