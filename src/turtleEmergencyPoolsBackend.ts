/**
 * Ocean — Emergency Community Pools backend
 * ------------------------------------------
 * Community crowdfunded emergency-assistance pools (ported from base44-social-media's
 * EmergencyPool / EmergencyRequest / PoolVote entities, reusing Ocean's
 * turtleEmergencyPools.ts validation + system pool categories).
 *
 * Lifecycle: active -> funding -> voting -> disbursed  (or resolved / expired)
 *  - A user creates a pool with urgency/category/fuzzy location/target funding.
 *  - Others "Join & help" (participant list) and can contribute funds.
 *  - A participant submits a disbursement claim (with proof links); pool -> voting.
 *  - Members vote approve/reject; when approval % >= vote_threshold_pct the claim
 *    auto-approves and the pool is marked disbursed.
 *
 * State lives in emergency.json (same pattern as community.json).
 */

import fs from 'fs';
import path from 'path';
import express from 'express';
import { isUserRateLimited } from './turtleEmergencyPools';
import { getCtx } from './turtleServerContext';

const EMERGENCY_FILE = path.join(process.cwd(), 'emergency.json');

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';
export type PoolCategory =
  | 'medical' | 'security' | 'fire' | 'natural_disaster' | 'stranded'
  | 'football' | 'blood' | 'local_help' | 'study_help' | 'event_volunteer' | 'other';
export type PoolStatus = 'active' | 'funding' | 'voting' | 'disbursed' | 'expired' | 'resolved';

export interface EmergencyPool {
  id: string;
  title: string;
  description: string;
  urgency: UrgencyLevel;
  category: PoolCategory;
  status: PoolStatus;
  locationLabel?: string;
  createdById: string;
  createdByName?: string;
  participantIds: string[];
  helperCount: number;
  targetFunding: number;
  currentFunding: number;
  voteThresholdPct: number;
  createdAt: number;
  expiresAt: number;
  reports?: { reason: string; details: string; at: number }[];
}

export interface EmergencyRequest {
  id: string;
  poolId: string;
  beneficiaryId: string;
  beneficiaryName?: string;
  requestedAmount: number;
  description: string;
  evidenceLinks: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface PoolVote {
  id: string;
  requestId: string;
  voterId: string;
  vote: 'approve' | 'reject';
  createdAt: number;
}

interface EmergencyStore {
  pools: EmergencyPool[];
  requests: EmergencyRequest[];
  votes: PoolVote[];
}

const CATEGORY_OPTIONS: PoolCategory[] = [
  'medical', 'security', 'fire', 'natural_disaster', 'stranded',
  'football', 'blood', 'local_help', 'study_help', 'event_volunteer', 'other',
];

const CATEGORY_LABELS: Record<PoolCategory, string> = {
  medical: 'Medical help', security: 'Security concern', fire: 'Fire / evacuation',
  natural_disaster: 'Natural disaster', stranded: 'Stranded', football: 'Football team fill-in',
  blood: 'Blood needed', local_help: 'Local help', study_help: 'Study help',
  event_volunteer: 'Event volunteer', other: 'Other',
};

const MAX_POOLS_PER_WINDOW = 2;
const POOL_WINDOW_MS = 15 * 60 * 1000; // 15 min
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_TARGET_FUNDING = 1_000_000;

// In-memory cache + persist
let store: EmergencyStore = { pools: [], requests: [], votes: [] };
let loaded = false;
let writeTimer: NodeJS.Timeout | null = null;

function loadStore(): EmergencyStore {
  if (loaded) return store;
  try {
    if (fs.existsSync(EMERGENCY_FILE)) {
      const raw = fs.readFileSync(EMERGENCY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      store = {
        pools: parsed.pools || [],
        requests: parsed.requests || [],
        votes: parsed.votes || [],
      };
    }
  } catch (e) {
    console.error('[emergency] failed to load emergency.json:', e);
  }
  loaded = true;
  return store;
}

function persistStore() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.writeFileSync(EMERGENCY_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
      console.error('[emergency] failed to persist emergency.json:', e);
    }
  }, 150);
}

function now(): number {
  return Date.now();
}

function uid(prefix: string): string {
  return `${prefix}-${now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Pool creation rate-limit per user, mirroring turtleEmergencyPools. */
function userPoolRateLimit(userId: string): { limited: boolean; remainingSec: number } {
  const tracker = { userId, alertTimestamps: store.pools.filter(p => p.createdById === userId).map(p => p.createdAt) };
  return isUserRateLimited(tracker, now());
}

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------

export function registerEmergencyPoolsRoutes(app: express.Express) {
  // Pool actions are identity-bound (createdById / participantIds / voterId /
  // beneficiaryName), so every mutating route requires a signed-in user. Without
  // this, `(req as any).user` is undefined and the handlers crash with 500.
  const { requireAuth } = getCtx();
  loadStore();

  // List pools (optional ?status= active|resolved|mine, ?category=)
  app.get('/api/emergency/pools', (req, res) => {
    const me = (req as any).user as { id: string } | undefined;
    let pools = store.pools.filter(p => p.expiresAt > now() || p.status === 'resolved');
    const status = (req.query.status as string) || 'active';
    const category = (req.query.category as string) || '';
    if (category) pools = pools.filter(p => p.category === category);
    if (status === 'mine') {
      pools = pools.filter(p => p.createdById === me?.id || p.participantIds.includes(me?.id || ''));
    } else if (status === 'resolved') {
      pools = pools.filter(p => ['resolved', 'disbursed', 'expired'].includes(p.status));
    } else {
      pools = pools.filter(p => ['active', 'funding', 'voting'].includes(p.status));
    }
    // Sort: critical/high urgency first, then newest
    const urgencyRank: Record<UrgencyLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    pools = pools.sort((a, b) => (urgencyRank[a.urgency] - urgencyRank[b.urgency]) || (b.createdAt - a.createdAt));
    res.json({ pools, categories: CATEGORY_OPTIONS.map(c => ({ id: c, label: CATEGORY_LABELS[c] })) });
  });

  // Get one pool with its requests + votes
  app.get('/api/emergency/pools/:id', (req, res) => {
    const pool = store.pools.find(p => p.id === req.params.id);
    if (!pool) return res.status(404).json({ error: 'Pool not found.' });
    const requests = store.requests.filter(r => r.poolId === pool.id);
    const votes = store.votes.filter(v => requests.some(r => r.id === v.requestId));
    res.json({ pool, requests, votes });
  });

  // Create pool
  app.post('/api/emergency/pools', requireAuth, (req, res) => {
    const me = (req as any).user;
    const { title, description, urgency, category, locationLabel, targetFunding, voteThresholdPct } = req.body || {};

    // Rate limit: 2 pools / 15 min
    const rl = userPoolRateLimit(me.id);
    if (rl.limited) {
      return res.status(429).json({ error: `You've created several pools recently. Please wait ${rl.remainingSec}s.` });
    }
    if (!title || String(title).trim().length < 5) {
      return res.status(400).json({ error: 'Title is required and must be at least 5 characters.' });
    }
    const cat: PoolCategory = CATEGORY_OPTIONS.includes(category) ? category : 'other';
    const urg: UrgencyLevel = ['low', 'medium', 'high', 'critical'].includes(urgency) ? urgency : 'medium';
    const funding = Math.max(0, Math.min(Number(targetFunding) || 0, MAX_TARGET_FUNDING));
    const threshold = Math.max(10, Math.min(Number(voteThresholdPct) || 66, 100));

    const pool: EmergencyPool = {
      id: uid('pool'),
      title: String(title).trim(),
      description: String(description || '').trim(),
      urgency: urg,
      category: cat,
      status: funding > 0 ? 'funding' : 'active',
      locationLabel: String(locationLabel || '').trim(),
      createdById: me.id,
      createdByName: me.name || me.username || 'User',
      participantIds: [me.id],
      helperCount: 1,
      targetFunding: funding,
      currentFunding: 0,
      voteThresholdPct: threshold,
      createdAt: now(),
      expiresAt: now() + DEFAULT_EXPIRY_MS,
    };
    store.pools.push(pool);
    persistStore();
    res.json({ pool });
  });

  // Join / leave a pool
  app.post('/api/emergency/pools/:id/join', requireAuth, (req, res) => {
    const me = (req as any).user;
    const pool = store.pools.find(p => p.id === req.params.id);
    if (!pool) return res.status(404).json({ error: 'Pool not found.' });
    const join = req.body?.join !== false;
    const idx = pool.participantIds.indexOf(me.id);
    if (join && idx === -1) {
      pool.participantIds.push(me.id);
    } else if (!join && idx !== -1) {
      pool.participantIds.splice(idx, 1);
    }
    pool.helperCount = pool.participantIds.length;
    persistStore();
    res.json({ pool });
  });

  // Contribute funds
  app.post('/api/emergency/pools/:id/contribute', requireAuth, (req, res) => {
    const me = (req as any).user;
    const pool = store.pools.find(p => p.id === req.params.id);
    if (!pool) return res.status(404).json({ error: 'Pool not found.' });
    if (pool.status === 'disbursed' || pool.status === 'resolved') {
      return res.status(400).json({ error: 'This pool is already closed.' });
    }
    const amount = Math.max(1, Math.floor(Number(req.body?.amount) || 0));
    if (!amount) return res.status(400).json({ error: 'A positive amount is required.' });

    // Join implicitly on first contribution
    if (!pool.participantIds.includes(me.id)) {
      pool.participantIds.push(me.id);
      pool.helperCount = pool.participantIds.length;
    }
    pool.currentFunding = Math.min(pool.targetFunding || Infinity, pool.currentFunding + amount);
    if (pool.status === 'active') pool.status = 'funding';
    if (pool.currentFunding >= pool.targetFunding && pool.targetFunding > 0) pool.status = 'voting';
    persistStore();
    res.json({ pool });
  });

  // Mark pool resolved
  app.post('/api/emergency/pools/:id/resolve', requireAuth, (req, res) => {
    const me = (req as any).user;
    const pool = store.pools.find(p => p.id === req.params.id);
    if (!pool) return res.status(404).json({ error: 'Pool not found.' });
    if (pool.createdById !== me.id) {
      return res.status(403).json({ error: 'Only the pool creator can resolve it.' });
    }
    pool.status = 'resolved';
    persistStore();
    res.json({ pool });
  });

  // Submit disbursement claim
  app.post('/api/emergency/pools/:id/requests', requireAuth, (req, res) => {
    const me = (req as any).user;
    const pool = store.pools.find(p => p.id === req.params.id);
    if (!pool) return res.status(404).json({ error: 'Pool not found.' });
    if (!pool.participantIds.includes(me.id)) {
      return res.status(403).json({ error: 'Join the pool before submitting a disbursement claim.' });
    }
    if (pool.targetFunding <= 0) {
      return res.status(400).json({ error: 'This pool has no funding target.' });
    }
    const requestedAmount = Number(req.body?.amount) || 0;
    const description = String(req.body?.description || '').trim();
    if (requestedAmount <= 0 || description.length < 5) {
      return res.status(400).json({ error: 'Amount and a short description are required.' });
    }
    const request: EmergencyRequest = {
      id: uid('req'),
      poolId: pool.id,
      beneficiaryId: me.id,
      beneficiaryName: me.name || me.username || 'User',
      requestedAmount: Math.min(requestedAmount, pool.currentFunding),
      description,
      evidenceLinks: Array.isArray(req.body?.evidenceLinks) ? req.body.evidenceLinks.slice(0, 5).map(String) : [],
      status: 'pending',
      createdAt: now(),
    };
    store.requests.push(request);
    if (pool.status === 'active' || pool.status === 'funding') pool.status = 'voting';
    persistStore();
    res.json({ request, pool });
  });

  // Vote on a claim
  app.post('/api/emergency/pools/:id/requests/:requestId/vote', requireAuth, (req, res) => {
    const me = (req as any).user;
    const pool = store.pools.find(p => p.id === req.params.id);
    const request = store.requests.find(r => r.id === req.params.requestId && r.poolId === req.params.id);
    if (!pool || !request) return res.status(404).json({ error: 'Pool or request not found.' });
    if (!pool.participantIds.includes(me.id)) {
      return res.status(403).json({ error: 'Only pool participants can vote.' });
    }
    if (request.status !== 'pending') return res.status(400).json({ error: 'This request is already decided.' });
    const vote = req.body?.vote;
    if (vote !== 'approve' && vote !== 'reject') return res.status(400).json({ error: 'Vote must be approve or reject.' });
    if (store.votes.some(v => v.requestId === request.id && v.voterId === me.id)) {
      return res.status(400).json({ error: 'You already voted on this request.' });
    }
    store.votes.push({ id: uid('vote'), requestId: request.id, voterId: me.id, vote, createdAt: now() });

    const poolVotes = store.votes.filter(v => v.requestId === request.id);
    const approves = poolVotes.filter(v => v.vote === 'approve').length;
    const pct = Math.round((approves / poolVotes.length) * 100);
    const threshold = pool.voteThresholdPct || 66;
    if (pct >= threshold) {
      request.status = 'approved';
      pool.status = 'disbursed';
    }
    persistStore();
    res.json({ request, pool, voteCount: poolVotes.length, approvePct: pct, threshold });
  });

  // Report a fake / spam pool
  app.post('/api/emergency/pools/:id/report', (req, res) => {
    const pool = store.pools.find(p => p.id === req.params.id);
    if (!pool) return res.status(404).json({ error: 'Pool not found.' });
    const reason = String(req.body?.reason || 'other');
    const details = String(req.body?.details || '').slice(0, 500);
    // Log-style report: a pool reported >= 3 times is removed.
    pool.reports = pool.reports || [];
    pool.reports.push({ reason, details, at: now() });
    if (pool.reports.length >= 3) {
      pool.status = 'expired';
    }
    persistStore();
    res.json({ ok: true, reportCount: pool.reports.length });
  });
}

export { CATEGORY_OPTIONS, CATEGORY_LABELS };
