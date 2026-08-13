/**
 * Ocean — Community Revenue Share backend
 * ----------------------------------------
 * Ad-revenue split to group admins. A monetized group accumulates simulated ad
 * revenue into its `adRevenuePool`; when the pool is distributed, each admin
 * receives `round(pool * sharePercent/100 * weight)` coins (equal split weight
 * = 1/n) credited into the REAL community.json wallet via
 * turtleCommunityBackend.addBalance — never a separate coin store.
 *
 * Routes (all under /api/revenue/*, auth = requireAuth):
 *   GET  /api/revenue/groups                 -> groups where caller is an admin
 *   POST /api/revenue/groups                 -> create/update monetization record
 *   GET  /api/revenue/groups/:id             -> record + history + pending estimate
 *   POST /api/revenue/groups/:id/deposit     -> add simulated ad revenue (admin)
 *   POST /api/revenue/groups/:id/distribute  -> split pool to admins' wallets (admin)
 *   POST /api/revenue/groups/:id/admins      -> set the admin list (admin)
 *
 * A lightweight 60s in-process cron auto-distributes any group whose pool is
 * > 0 and whose last distribution is older than 24h. It is idempotent: a
 * distributed pool drops to 0, and the 24h window prevents re-distribution.
 *
 * State lives in the global db under `db.revenueShare` (idempotent ensure).
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

export interface RevenueShareHistoryEntry {
  at: number;
  amount: number;
  perAdmin: { userId: string; amount: number }[];
}

export interface RevenueShareGroup {
  id: string; // groupId
  groupName: string;
  adRevenuePool: number;
  sharePercent: number; // 0-100
  admins: string[]; // user ids
  lastDistributedAt: number;
  history: RevenueShareHistoryEntry[];
}

export interface PendingEstimate {
  pool: number;
  sharePercent: number;
  perAdmin: { userId: string; amount: number }[];
  total: number;
}

const AUTO_DISTRIBUTE_MS = 24 * 60 * 60 * 1000; // 24h
const CRON_TICK_MS = 60_000; // check once per minute
const MAX_HISTORY = 100;
const MAX_ADMINS = 50;

let cronStarted = false;

/** Clamp a numeric share percent to [0, 100] (whole numbers). */
function clampPct(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** De-dupe + trim an admin id list (user ids are strings). */
function sanitizeAdmins(raw: unknown, max = MAX_ADMINS): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const a of raw) {
    const s = String(a).trim();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function isAdmin(group: RevenueShareGroup, userId: string): boolean {
  return Array.isArray(group.admins) && group.admins.includes(userId);
}

/**
 * Compute the pending distribution estimate without mutating anything.
 * Each admin is owed round(pool * sharePercent/100 * (1/adminCount)).
 */
export function pendingEstimate(group: RevenueShareGroup): PendingEstimate {
  const pool = group.adRevenuePool || 0;
  const sharePercent = clampPct(group.sharePercent);
  const admins = sanitizeAdmins(group.admins);
  if (pool <= 0 || admins.length === 0 || sharePercent <= 0) {
    return {
      pool,
      sharePercent,
      perAdmin: admins.map(userId => ({ userId, amount: 0 })),
      total: 0,
    };
  }
  const weight = 1 / admins.length;
  const perAdmin = admins.map(userId => ({
    userId,
    amount: Math.round(pool * (sharePercent / 100) * weight),
  }));
  const total = perAdmin.reduce((sum, a) => sum + a.amount, 0);
  return { pool, sharePercent, perAdmin, total };
}

export function registerRevenueShareRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  function ensureCollection(db: any): void {
    if (!Array.isArray(db.revenueShare)) db.revenueShare = [];
  }

  function findGroup(db: any, id: string): RevenueShareGroup | undefined {
    return ((db.revenueShare as RevenueShareGroup[]) || []).find(g => g.id === id);
  }

  /**
   * Credit each admin's wallet share and mutate the group record (pool, history).
   * Returns null when there is nothing to distribute (idempotent). The caller
   * persists the global db afterwards; wallet persistence happens in here.
   */
  function distributePool(group: RevenueShareGroup): { distributed: number; perAdmin: { userId: string; amount: number }[] } | null {
    const pool = group.adRevenuePool || 0;
    if (pool <= 0) return null;
    const sharePercent = clampPct(group.sharePercent);
    if (sharePercent <= 0) return null;
    const admins = sanitizeAdmins(group.admins);
    if (admins.length === 0) return null;

    const weight = 1 / admins.length;
    const perAdmin = admins.map(userId => ({
      userId,
      amount: Math.round(pool * (sharePercent / 100) * weight),
    }));
    const distributed = perAdmin.reduce((sum, a) => sum + a.amount, 0);
    if (distributed <= 0) return null;

    // Award REAL coins into the community.json wallet.
    const state = loadCommunity();
    for (const a of perAdmin) {
      if (a.amount > 0) addBalance(state, a.userId, a.amount);
    }
    saveCommunity(state);

    // Mutate the group record (caller persists db).
    group.adRevenuePool = pool - distributed;
    group.lastDistributedAt = Date.now();
    if (!Array.isArray(group.history)) group.history = [];
    group.history.push({ at: group.lastDistributedAt, amount: distributed, perAdmin });
    if (group.history.length > MAX_HISTORY) group.history = group.history.slice(-MAX_HISTORY);
    return { distributed, perAdmin };
  }

  // ── CRON: auto-distribute pools that have sat for 24h+ ─────────────────────
  function startAutoDistributionCron(): void {
    if (cronStarted) return;
    cronStarted = true;
    setInterval(() => {
      try {
        const db = loadDatabase();
        ensureCollection(db);
        const groups = (db.revenueShare as RevenueShareGroup[]) || [];
        const nowMs = Date.now();
        let changed = false;
        for (const group of groups) {
          const pool = group.adRevenuePool || 0;
          const sharePercent = clampPct(group.sharePercent);
          const last = group.lastDistributedAt || 0;
          const due = pool > 0 && sharePercent > 0 && (last === 0 || nowMs - last >= AUTO_DISTRIBUTE_MS);
          if (due && distributePool(group)) changed = true;
        }
        if (changed) saveDatabase(db);
      } catch (e) {
        console.warn('[revenue-share] cron tick error:', e);
      }
    }, CRON_TICK_MS);
  }

  // List groups where the caller is an admin.
  app.get('/api/revenue/groups', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const groups = ((db.revenueShare as RevenueShareGroup[]) || []).filter(g => isAdmin(g, user.id));
    res.json({ groups });
  });

  // Create or update a monetization record for a group.
  app.post('/api/revenue/groups', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as { groupId?: unknown; groupName?: unknown; sharePercent?: unknown };
    const groupId = String(body.groupId || '').trim();
    if (!groupId) return res.status(400).json({ error: 'groupId is required.' });
    if (groupId.length > 120) return res.status(400).json({ error: 'groupId is too long.' });
    const sharePercent = clampPct(body.sharePercent);
    const db = loadDatabase();
    ensureCollection(db);
    let group = findGroup(db, groupId);
    if (!group) {
      group = {
        id: groupId,
        groupName: String(body.groupName || groupId).trim() || groupId,
        adRevenuePool: 0,
        sharePercent,
        admins: [user.id],
        lastDistributedAt: 0,
        history: [],
      };
      (db.revenueShare as RevenueShareGroup[]).push(group);
    } else {
      group.groupName = String(body.groupName || group.groupName || groupId).trim() || group.groupName || groupId;
      group.sharePercent = sharePercent;
      if (!isAdmin(group, user.id)) group.admins.push(user.id);
    }
    saveDatabase(db);
    res.json({ success: true, group });
  });

  // Get one monetization record + distribution history + pending estimate.
  app.get('/api/revenue/groups/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const group = findGroup(db, req.params.id);
    if (!group) return res.status(404).json({ error: 'Monetization record not found.' });
    if (!isAdmin(group, user.id)) return res.status(403).json({ error: 'Only group admins can view this record.' });
    res.json({ group, pending: pendingEstimate(group) });
  });

  // Deposit simulated ad revenue into the pool.
  app.post('/api/revenue/groups/:id/deposit', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const group = findGroup(db, req.params.id);
    if (!group) return res.status(404).json({ error: 'Monetization record not found.' });
    if (!isAdmin(group, user.id)) return res.status(403).json({ error: 'Only group admins can deposit.' });
    const amount = Math.max(1, Math.floor(Number(req.body?.amount) || 0));
    if (amount <= 0) return res.status(400).json({ error: 'A positive deposit amount is required.' });
    group.adRevenuePool = (group.adRevenuePool || 0) + amount;
    saveDatabase(db);
    res.json({ success: true, group, pool: group.adRevenuePool });
  });

  // Distribute the pool to admins' wallets now (manual trigger).
  app.post('/api/revenue/groups/:id/distribute', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const group = findGroup(db, req.params.id);
    if (!group) return res.status(404).json({ error: 'Monetization record not found.' });
    if (!isAdmin(group, user.id)) return res.status(403).json({ error: 'Only group admins can distribute.' });
    const result = distributePool(group);
    if (!result) {
      return res.json({ success: true, distributed: 0, perAdmin: [], group, pending: pendingEstimate(group) });
    }
    saveDatabase(db);
    res.json({ success: true, ...result, group, pending: pendingEstimate(group) });
  });

  // Replace the admin list (caller is kept so they can never lock themselves out).
  app.post('/api/revenue/groups/:id/admins', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const group = findGroup(db, req.params.id);
    if (!group) return res.status(404).json({ error: 'Monetization record not found.' });
    if (!isAdmin(group, user.id)) return res.status(403).json({ error: 'Only group admins can change the admin list.' });
    let admins = sanitizeAdmins((req.body || {}).admins);
    if (!admins.includes(user.id)) admins = [user.id, ...admins];
    group.admins = admins;
    saveDatabase(db);
    res.json({ success: true, group });
  });

  // Start the 24h auto-distribution cron.
  startAutoDistributionCron();
}
