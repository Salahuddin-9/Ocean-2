/**
 * Ocean — Micro-Subscriptions "10-Taka Patron" backend
 * -----------------------------------------------------
 * Monthly paid subscriptions between users, paid from the REAL Ocean Coin wallet
 * (community.json `balances`, via turtleCommunityBackend addBalance/spendBalance).
 *
 * Model (global db, idempotent ensure):
 *   db.subscriptions      — array of Subscription records (one per subscriber+creator pair).
 *   db.subscriptionGates  — Record<creatorId, postId[]> : canonical subscriber-only list.
 *                            (mirrored into each Subscription.gatedPosts per the model spec)
 *
 * Lifecycle: active -> paused (insufficient funds on billing tick) / cancelled.
 *   - Subscribe: spendBalance(subscriber, amount) on signup -> credit creator.
 *   - Billing cron (60s tick): for each active sub with nextBillingAt <= now, try to
 *     auto-deduct; renew +30d on success, pause on insufficient funds. Idempotent —
 *     only acts on due subscriptions, then advances nextBillingAt.
 *   - Gate: a creator marks a post id subscriber-only; the client gates rendering
 *     by calling GET /api/subscriptions/status/:creatorId.
 *
 * Routes (all requireAuth):
 *   POST   /api/subscriptions                      { creatorId, amount? }   -> subscribe
 *   GET    /api/subscriptions                       -> my subscriptions (as subscriber)
 *   GET    /api/subscriptions/mine                  -> my patrons + monthly earnings
 *   GET    /api/subscriptions/creators              -> browsable creators (not me) + my active flag
 *   GET    /api/subscriptions/status/:creatorId     -> { active, subscriberId?, gatedPosts }
 *   DELETE /api/subscriptions/:id                   -> cancel
 *   POST   /api/subscriptions/gate                  { postId, subscriberOnly } -> gate toggle
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export interface Subscription {
  id: string;
  subscriberId: string;
  creatorId: string;
  amount: number; // default 10
  currency: 'BDT';
  monthly: true;
  status: SubscriptionStatus;
  startDate: number;
  nextBillingAt: number;
  lastBilledAt: number | null;
  gatedPosts: string[]; // post ids the creator marked subscriber-only
}

/** 30-day billing period. */
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
/** Default subscription amount (Ocean Coins / month). */
const DEFAULT_AMOUNT = 10;
const MAX_AMOUNT = 1000;
/** Billing cron interval. */
const CRON_MS = 60_000;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

let cronStarted = false;

function now(): number {
  return Date.now();
}

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollections(db: any): void {
  if (!Array.isArray(db.subscriptions)) db.subscriptions = [];
  if (!db.subscriptionGates || typeof db.subscriptionGates !== 'object') {
    db.subscriptionGates = {};
  }
}

/** Canonical gated list for a creator (from the mirror on their records or the map). */
function gatedListFor(db: any, creatorId: string): string[] {
  const gates = (db.subscriptionGates || {}) as Record<string, string[]>;
  if (Array.isArray(gates[creatorId])) return gates[creatorId];
  const sub = (db.subscriptions || []).find((s: Subscription) => s.creatorId === creatorId);
  return Array.isArray(sub?.gatedPosts) ? sub.gatedPosts : [];
}

/** Mirror the canonical gated list onto every subscription record of the creator. */
function mirrorGates(db: any, creatorId: string, list: string[]): void {
  for (const s of db.subscriptions as Subscription[]) {
    if (s.creatorId === creatorId) s.gatedPosts = [...list];
  }
}

/**
 * Billing tick — runs every 60s. Only acts on subscriptions that are BOTH active
 * AND due (nextBillingAt <= now). Advances nextBillingAt in the same pass, so a
 * crash can never double-bill. Heavy work stays out of the tick.
 */
function runBillingTick(ctx: ReturnType<typeof getCtx>): void {
  try {
    const db = ctx.loadDatabase();
    ensureCollections(db);
    const due = (db.subscriptions as Subscription[]).filter(
      (s) => s.status === 'active' && s.nextBillingAt <= now()
    );
    if (due.length === 0) return;

    const state = ctx.loadCommunity();
    let renewed = 0;
    let paused = 0;
    for (const sub of due) {
      if (spendBalance(state, sub.subscriberId, sub.amount)) {
        addBalance(state, sub.creatorId, sub.amount);
        sub.lastBilledAt = now();
        sub.nextBillingAt = now() + BILLING_PERIOD_MS;
        renewed += 1;
      } else {
        // Insufficient Ocean Coins -> pause, never negative, retry next signup.
        sub.status = 'paused';
        paused += 1;
      }
    }
    ctx.saveCommunity(state);
    ctx.saveDatabase(db);
    if (renewed || paused) {
      console.log(`[subscriptions] billing tick -> renewed=${renewed} paused=${paused}`);
    }
  } catch (e) {
    console.warn('[subscriptions] billing tick error:', e);
  }
}

export function registerSubscriptionsRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = ctx;

  // ---------------------------------------------------------------------------
  // Billing cron (idempotent per period) — guard so re-registration never stacks
  // a second interval.
  // ---------------------------------------------------------------------------
  if (!cronStarted) {
    cronStarted = true;
    setInterval(() => runBillingTick(ctx), CRON_MS);
  }

  // ---------------------------------------------------------------------------
  // Browse creators (not me) with my active-subscription flag
  // ---------------------------------------------------------------------------
  app.get('/api/subscriptions/creators', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const myActive = new Set(
      (db.subscriptions as Subscription[])
        .filter((s) => s.subscriberId === user.id && s.status === 'active')
        .map((s) => s.creatorId)
    );
    const creators = db.users
      .filter((u: any) => u.id !== user.id)
      .map((u: any) => ({
        id: u.id,
        name: u.name,
        username: u.username || '',
        avatarUrl: (u.profile && u.profile.avatarUrl) || '',
        subscribed: myActive.has(u.id),
      }));
    res.json({ creators });
  });

  // ---------------------------------------------------------------------------
  // My subscriptions (as subscriber) with creator info
  // ---------------------------------------------------------------------------
  app.get('/api/subscriptions', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const subs = (db.subscriptions as Subscription[]).filter(
      (s) => s.subscriberId === user.id && s.status !== 'cancelled'
    );
    const enriched = subs.map((s) => {
      const c = db.users.find((u: any) => u.id === s.creatorId);
      return {
        ...s,
        creator: c
          ? { id: c.id, name: c.name, username: c.username || '', avatarUrl: (c.profile && c.profile.avatarUrl) || '' }
          : { id: s.creatorId, name: 'Unknown', username: '', avatarUrl: '' },
      };
    });
    res.json({ subscriptions: enriched });
  });

  // ---------------------------------------------------------------------------
  // My patrons (subscriptions where I am creator) + monthly earnings + gated posts
  // ---------------------------------------------------------------------------
  app.get('/api/subscriptions/mine', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const subs = (db.subscriptions as Subscription[]).filter(
      (s) => s.creatorId === user.id && s.status === 'active'
    );
    const patrons = subs.map((s) => {
      const p = db.users.find((u: any) => u.id === s.subscriberId);
      return {
        ...s,
        subscriber: p
          ? { id: p.id, name: p.name, username: p.username || '', avatarUrl: (p.profile && p.profile.avatarUrl) || '' }
          : { id: s.subscriberId, name: 'Unknown', username: '', avatarUrl: '' },
      };
    });
    const monthlyEarnings = subs.reduce((sum, s) => sum + (s.amount || 0), 0);
    res.json({ patrons, monthlyEarnings, gatedPosts: gatedListFor(db, user.id) });
  });

  // ---------------------------------------------------------------------------
  // Status for a creator — used by the client to gate post rendering
  // ---------------------------------------------------------------------------
  app.get('/api/subscriptions/status/:creatorId', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const sub = (db.subscriptions as Subscription[]).find(
      (s) => s.subscriberId === user.id && s.creatorId === req.params.creatorId && s.status === 'active'
    );
    res.json({
      active: !!sub,
      subscriberId: sub ? sub.subscriberId : undefined,
      gatedPosts: gatedListFor(db, req.params.creatorId),
    });
  });

  // ---------------------------------------------------------------------------
  // Subscribe (dedupe by subscriberId+creatorId)
  // ---------------------------------------------------------------------------
  app.post('/api/subscriptions', requireAuth, (req, res) => {
    const user = (req as any).user;
    const creatorId = String((req.body || {}).creatorId || '');
    const amount = Math.max(1, Math.min(MAX_AMOUNT, Math.floor(Number((req.body || {}).amount) || DEFAULT_AMOUNT)));
    if (!creatorId) return res.status(400).json({ error: 'creatorId is required.' });
    if (creatorId === user.id) return res.status(400).json({ error: 'You cannot subscribe to yourself.' });

    const db = loadDatabase();
    ensureCollections(db);
    const creator = db.users.find((u: any) => u.id === creatorId);
    if (!creator) return res.status(404).json({ error: 'Creator not found.' });

    const subs = db.subscriptions as Subscription[];
    let sub = subs.find((s) => s.subscriberId === user.id && s.creatorId === creatorId);
    if (sub && sub.status === 'active') {
      return res.status(400).json({ error: 'Already subscribed.', subscription: sub });
    }

    // Real Ocean Coin wallet — spend from subscriber, credit creator.
    const state = loadCommunity();
    if (!spendBalance(state, user.id, amount)) {
      return res.status(402).json({ error: 'Insufficient Ocean Coins' });
    }
    addBalance(state, creatorId, amount);
    saveCommunity(state);

    const ts = now();
    if (sub) {
      // Reactivate a paused/cancelled record (keeps one record per pair).
      sub.amount = amount;
      sub.status = 'active';
      sub.startDate = ts;
      sub.lastBilledAt = ts;
      sub.nextBillingAt = ts + BILLING_PERIOD_MS;
      sub.gatedPosts = gatedListFor(db, creatorId);
    } else {
      sub = {
        id: uid('sub'),
        subscriberId: user.id,
        creatorId,
        amount,
        currency: 'BDT',
        monthly: true,
        status: 'active',
        startDate: ts,
        nextBillingAt: ts + BILLING_PERIOD_MS,
        lastBilledAt: ts,
        gatedPosts: gatedListFor(db, creatorId),
      };
      subs.push(sub);
    }
    saveDatabase(db);
    res.json({ subscription: sub, balance: state.balances[user.id] || 0 });
  });

  // ---------------------------------------------------------------------------
  // Cancel (subscriber or creator may cancel; stops future billing)
  // ---------------------------------------------------------------------------
  app.delete('/api/subscriptions/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const sub = (db.subscriptions as Subscription[]).find((s) => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
    if (sub.subscriberId !== user.id && sub.creatorId !== user.id) {
      return res.status(403).json({ error: 'Not your subscription.' });
    }
    sub.status = 'cancelled';
    sub.nextBillingAt = 0; // never due again -> cron ignores it
    saveDatabase(db);
    res.json({ success: true, subscription: sub });
  });

  // ---------------------------------------------------------------------------
  // Gate / ungate a post as subscriber-only (creator only)
  // ---------------------------------------------------------------------------
  app.post('/api/subscriptions/gate', requireAuth, (req, res) => {
    const user = (req as any).user;
    const postId = String((req.body || {}).postId || '').trim();
    const subscriberOnly = !!(req.body || {}).subscriberOnly;
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = loadDatabase();
    ensureCollections(db);
    const gates = db.subscriptionGates as Record<string, string[]>;
    if (!gates[user.id]) gates[user.id] = [];
    const list = gates[user.id];
    const idx = list.indexOf(postId);
    if (subscriberOnly) {
      if (idx === -1) list.push(postId);
    } else if (idx !== -1) {
      list.splice(idx, 1);
    }
    mirrorGates(db, user.id, list);
    saveDatabase(db);
    res.json({ success: true, gatedPosts: [...list] });
  });
}

export { DEFAULT_AMOUNT, BILLING_PERIOD_MS };
