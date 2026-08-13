/**
 * Ocean — SafeWatch backend (Neighborhood Safety Watch & Civic Hazard Reporting)
 * -------------------------------------------------------------------------------
 * A civic-resilience layer that extends the emergency UX (EmergencyView /
 * turtleEmergencyPoolsBackend). It sits beside the sibling safety modules
 * (SafeSOS / SOS Alert / Safety Shield / Safe Escort / Safe Shelter / Blood / Missing)
 * and covers the *neighborhood observability* slice: neighbors report civic hazards,
 * verify each other's reports, request "eyes on this", and watch area safety health.
 *
 *  - Hazards: civic infrastructure reports (pothole, streetlight, waterlogging,
 *    power, garbage, structural risk). Fuzzy area label ONLY — exact addresses are
 *    never stored or broadcast. Lifecycle: submitted -> confirmed (3 neighbor
 *    confirmations) -> in_progress -> resolved / dismissed.
 *  - Observations: neighborhood safety observations (unlit area, suspicious
 *    activity) with the same confirmation-based verification.
 *  - Watch alerts: "I need eyes on this area" — a lighter-than-SOS broadcast.
 *    The fuzzy area + message are always broadcast; precise GPS is attached ONLY
 *    if the user opts in on that tap (`shareLocation: true`), rounded to ~1m, and
 *    is revealed only to the alert creator and to acknowledged watchers.
 *  - Watch circle: emergency contacts are stored ONLY after the user explicitly
 *    adds them; they are never shown publicly and never broadcast — an alert
 *    merely records how many circle members it would notify.
 *  - Area watch score: derived from confirmed + resolved reports per fuzzy area
 *    (0-5) so neighbors can see which areas are well-watched.
 *  - Safety coins: earned via the community.json wallet (addBalance) for
 *    confirming reports, for having a report confirmed, for resolving a hazard,
 *    and for acknowledging another user's watch alert.
 *
 *  Privacy (rule 4): a user's full home address is never broadcast by default —
 *  the fuzzy `areaLabel` is always what is shared; precise location only on an
 *  explicit per-tap opt-in, and even then only to the creator + acknowledged
 *  watchers. Emergency contacts are only ever stored after the user sets them.
 *
 *  Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 *  `db.safeWatch` (idempotent ensure, defensive reads via ?? []). Never stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WatchKind = 'hazard' | 'observation' | 'alert';
export type WatchCategory =
  | 'road' | 'streetlight' | 'water' | 'power' | 'garbage'
  | 'structure' | 'unlit' | 'suspicious' | 'safety' | 'other';
export type WatchStatus =
  | 'submitted' | 'confirmed' | 'in_progress' | 'resolved' | 'dismissed'
  | 'active' | 'acknowledged' | 'expired';

export interface WatchContact {
  id: string;
  name: string;
  phone?: string;
  username?: string;
  /** Optional: link to another Ocean user (used for notify-on-alert accounting). */
  linkedUserId?: string;
  createdAt: number;
}

export interface WatchAcknowledgement {
  id: string;
  byUserId: string;
  byName: string;
  note: string;
  at: number;
}

export interface WatchPost {
  id: string;
  kind: WatchKind;
  category: WatchCategory;
  /** Fuzzy area label — always broadcast. Never a full address. */
  areaLabel: string;
  description: string;
  createdById: string;
  createdByName: string;
  status: WatchStatus;
  /** Neighbor confirmations (one per user) that verify a report. */
  confirmations: string[];
  acknowledgements: WatchAcknowledgement[];
  /** Precise GPS — ONLY when the creator opted in on this tap (alert kind). */
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  /** Alert-only: flag that the creator chose to notify their watch circle. */
  notifyCircle: boolean;
  notifiedContactCount: number;
  resolvedAt?: number;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedNote?: string;
  /** Coin guards — each award happens at most once per post. */
  coinAwardedCreator?: boolean;
  coinAwardedResolve?: boolean;
  createdAt: number;
  expiresAt?: number;
}

export interface WatchAreaRating {
  area: string;
  reportCount: number;
  confirmedCount: number;
  resolvedCount: number;
  score: number;
  level: 'well_watched' | 'watchful' | 'emerging';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: { id: WatchCategory; label: string }[] = [
  { id: 'road', label: 'Road damage' },
  { id: 'streetlight', label: 'Streetlight out' },
  { id: 'water', label: 'Waterlogging' },
  { id: 'power', label: 'Power outage' },
  { id: 'garbage', label: 'Garbage / sanitation' },
  { id: 'structure', label: 'Structural risk' },
  { id: 'unlit', label: 'Unlit area' },
  { id: 'suspicious', label: 'Suspicious activity' },
  { id: 'safety', label: 'Safety concern' },
  { id: 'other', label: 'Other' },
];

const CATEGORY_LABEL: Record<WatchCategory, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.id, c.label])
) as Record<WatchCategory, string>;

const MAX_CONTACTS = 8;
const MAX_KEPT = 300;
const CONFIRMATIONS_REQUIRED = 3;

// Safety coins (community.json wallet).
const COIN_CONFIRM = 3;           // to the neighbor confirming a report
const COIN_CONFIRMED_CREATOR = 10; // to the creator once a report reaches 3 confirmations
const COIN_RESOLVE = 10;          // to the resolver once a hazard is resolved
const COIN_ALERT_ACK = 5;         // to a watcher acknowledging an alert

const POST_RATE_LIMIT = 10;       // hazard + observation posts per hour
const POST_WINDOW_MS = 60 * 60 * 1000;
const ALERT_EXPIRY_MS = 6 * 60 * 60 * 1000; // watch alerts stay live 6h

const DISCLAIMER =
  'SafeWatch is a community-driven neighbourhood watch. Reports are self-reported and ' +
  'confirmed by neighbours — they are NOT official civic records. For life-threatening ' +
  'emergencies call your local emergency services immediately. Precise location is only ' +
  'shared when you explicitly opt in on a watch alert, and only ever with acknowledged watchers.';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function now(): number {
  return Date.now();
}

function uid(prefix: string): string {
  return `${prefix}-${now()}-${Math.floor(Math.random() * 10000)}`;
}

function str(v: unknown, max = 500): string {
  return String(v ?? '').trim().slice(0, max);
}

function userLabel(u: any): string {
  return String(u?.name || u?.username || 'User');
}

function sanitizeKind(v: unknown): WatchKind {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'hazard' || s === 'observation' || s === 'alert' ? s : 'hazard';
}

function sanitizeCategory(v: unknown): WatchCategory {
  const s = String(v ?? '').trim().toLowerCase();
  return CATEGORY_OPTIONS.some((c) => c.id === s) ? (s as WatchCategory) : 'other';
}

/** Idempotent ensure of db.safeWatch — safe to run on every load. */
function ensureSafeWatch(db: any): void {
  if (!db.safeWatch || typeof db.safeWatch !== 'object' || Array.isArray(db.safeWatch)) {
    db.safeWatch = {};
  }
  if (!Array.isArray(db.safeWatch.posts)) db.safeWatch.posts = [];
  if (!Array.isArray(db.safeWatch.contacts)) db.safeWatch.contacts = [];
}

/** The current user's watch-circle record (created lazily on first add). */
function ensureContactRecord(db: any, userId: string): { userId: string; contacts: WatchContact[] } {
  const records = db.safeWatch.contacts;
  let record = records.find((r: any) => r && r.userId === userId);
  if (!record) {
    record = { userId, contacts: [] };
    records.push(record);
  }
  if (!Array.isArray(record.contacts)) record.contacts = [];
  return record;
}

function myContacts(db: any, userId: string): WatchContact[] {
  const record = (db.safeWatch.contacts || []).find((r: any) => r && r.userId === userId);
  return record && Array.isArray(record.contacts) ? record.contacts : [];
}

/** Lazy expiry sweep (no cron): overdue active/acknowledged alerts become 'expired'. */
function sweepExpired(posts: WatchPost[]): boolean {
  const t = now();
  let changed = false;
  for (const p of posts) {
    if (p && p.kind === 'alert' && (p.status === 'active' || p.status === 'acknowledged') && p.expiresAt && p.expiresAt < t) {
      p.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

/** Safety coins into the community.json wallet. */
function awardCoins(
  loadCommunity: () => any,
  saveCommunity: (s: any) => void,
  userId: string,
  amount: number
): number {
  try {
    const state = loadCommunity();
    addBalance(state, userId, amount);
    saveCommunity(state);
    return state.balances[userId] || 0;
  } catch (e: any) {
    console.warn('[safewatch] coin award error:', e?.message || e);
    return 0;
  }
}

/**
 * Post as seen by `viewerId`. Precise GPS is stripped unless the viewer is the
 * creator or an acknowledged watcher. Always shares the fuzzy area + event text.
 */
function publicPost(p: WatchPost, viewerId: string | null): any {
  const isCreator = viewerId !== null && p.createdById === viewerId;
  const isWatcher =
    viewerId !== null && (p.acknowledgements || []).some((x) => x && x.byUserId === viewerId);
  const allowPrecise = p.kind === 'alert' && p.shareLocation && (isCreator || isWatcher);
  const out: any = {
    id: p.id,
    kind: p.kind,
    category: p.category,
    categoryLabel: CATEGORY_LABEL[p.category] || p.category,
    areaLabel: p.areaLabel,
    description: p.description,
    createdById: p.createdById,
    createdByName: p.createdByName,
    status: p.status,
    confirmations: (p.confirmations || []).length,
    confirmedByMe: viewerId !== null && (p.confirmations || []).includes(viewerId),
    ackCount: (p.acknowledgements || []).length,
    myAck: viewerId !== null ? (p.acknowledgements || []).find((x) => x && x.byUserId === viewerId) || null : null,
    shareLocation: p.kind === 'alert' ? p.shareLocation === true : false,
    notifyCircle: p.notifyCircle === true,
    notifiedContactCount: p.notifiedContactCount || 0,
    resolvedAt: p.resolvedAt,
    resolvedBy: p.resolvedBy,
    resolvedByName: p.resolvedByName,
    resolvedNote: p.resolvedNote,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    isMine: isCreator,
    canConfirm:
      p.kind !== 'alert' &&
      (p.status === 'submitted' || p.status === 'confirmed' || p.status === 'in_progress') &&
      !isCreator &&
      !(p.confirmations || []).includes(viewerId || ''),
  };
  if (allowPrecise) {
    out.lat = p.lat;
    out.lng = p.lng;
  }
  return out;
}

/** Area watch score: 0-5 derived from confirmed + resolved reports per fuzzy area. */
function areaRatings(posts: WatchPost[]): WatchAreaRating[] {
  const map = new Map<string, { area: string; reports: number; confirmed: number; resolved: number; lastAt: number }>();
  for (const p of posts) {
    if (!p || p.kind === 'alert') continue;
    const key = String(p.areaLabel || 'Other').toLowerCase();
    const e = map.get(key) || {
      area: String(p.areaLabel || 'Other'),
      reports: 0,
      confirmed: 0,
      resolved: 0,
      lastAt: 0,
    };
    e.reports += 1;
    if (p.status === 'confirmed' || p.status === 'in_progress' || p.status === 'resolved') e.confirmed += 1;
    if (p.status === 'resolved') e.resolved += 1;
    e.lastAt = Math.max(e.lastAt, p.createdAt || 0);
    map.set(key, e);
  }
  const out = Array.from(map.values()).sort(
    (a, b) => b.reports - a.reports || b.lastAt - a.lastAt
  );
  return out.slice(0, 8).map((e) => {
    const raw = 1 + e.confirmed * 0.5 + e.resolved * 0.5;
    const score = Math.min(5, Math.round(raw * 2) / 2);
    const level: WatchAreaRating['level'] = score >= 4 ? 'well_watched' : score >= 2.5 ? 'watchful' : 'emerging';
    return {
      area: e.area,
      reportCount: e.reports,
      confirmedCount: e.confirmed,
      resolvedCount: e.resolved,
      score,
      level,
    };
  });
}

function trustForUser(db: any, userId: string): number {
  const u = (db.users || []).find((x: any) => x && x.id === userId);
  return Number(u?.trustScore ?? u?.profile?.trustScore ?? 0);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSafeWatchRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/watch/status — aggregate stats + area ratings (guest-safe; authed adds my wallet).
  app.get('/api/watch/status', (req, res) => {
    const db = loadDatabase();
    ensureSafeWatch(db);
    const posts = (db.safeWatch.posts || []) as WatchPost[];
    const changed = sweepExpired(posts);
    if (changed) saveDatabase(db);

    const counts = {
      hazards: posts.filter((p) => p.kind === 'hazard').length,
      observations: posts.filter((p) => p.kind === 'observation').length,
      alerts: posts.filter((p) => p.kind === 'alert' && (p.status === 'active' || p.status === 'acknowledged')).length,
      open: posts.filter((p) => p.kind !== 'alert' && !['resolved', 'dismissed', 'expired'].includes(p.status)).length,
      confirmed: posts.filter((p) => p.kind !== 'alert' && p.status === 'confirmed').length,
      resolved: posts.filter((p) => p.kind !== 'alert' && p.status === 'resolved').length,
    };

    const viewer = getRequestUser(req);
    let me = null;
    if (viewer && viewer.id) {
      let balance = 0;
      try {
        const state = loadCommunity();
        balance = trustPointsForUser(state, viewer.id, trustForUser(db, viewer.id));
      } catch (e: any) {
        console.warn('[safewatch] status balance error:', e?.message || e);
      }
      me = {
        id: viewer.id,
        name: userLabel(viewer),
        trustPoints: balance,
        balanceRaw: loadCommunitySafe(db, viewer.id, loadCommunity),
        myOpenCount: posts.filter(
          (p) => p.createdById === viewer.id && p.kind !== 'alert' && !['resolved', 'dismissed', 'expired'].includes(p.status)
        ).length,
        myActiveAlerts: posts.filter(
          (p) => p.createdById === viewer.id && p.kind === 'alert' && (p.status === 'active' || p.status === 'acknowledged')
        ).length,
        contactCount: myContacts(db, viewer.id).length,
      };
    }

    res.json({
      counts,
      areaRatings: areaRatings(posts),
      disclaimer: DISCLAIMER,
      categories: CATEGORY_OPTIONS,
      coinRewards: {
        confirm: COIN_CONFIRM,
        confirmedCreator: COIN_CONFIRMED_CREATOR,
        resolve: COIN_RESOLVE,
        alertAck: COIN_ALERT_ACK,
      },
      confirmationsRequired: CONFIRMATIONS_REQUIRED,
      maxContacts: MAX_CONTACTS,
      me,
    });
  });

  // GET /api/watch/posts — feed (guest-safe). ?kind=&area=&scope=mine&status=open|closed
  app.get('/api/watch/posts', (req, res) => {
    const viewer = getRequestUser(req);
    const db = loadDatabase();
    ensureSafeWatch(db);
    const changed = sweepExpired(db.safeWatch.posts);
    if (changed) saveDatabase(db);

    let list = [...(db.safeWatch.posts || [])] as WatchPost[];
    const kind = String(req.query.kind || '').trim();
    if (kind === 'reports' || kind === 'report') {
      // "reports" = civic hazards + safety observations (no watch alerts).
      list = list.filter((p) => p.kind === 'hazard' || p.kind === 'observation');
    } else if (kind === 'hazard' || kind === 'observation' || kind === 'alert') {
      list = list.filter((p) => p.kind === kind);
    }
    const scope = String(req.query.scope || 'feed');
    if (scope === 'mine') {
      list = list.filter((p) => p.createdById === viewer?.id);
    } else {
      const st = String(req.query.status || 'open');
      if (st === 'open') {
        list = list.filter((p) =>
          p.kind === 'alert'
            ? p.status === 'active' || p.status === 'acknowledged'
            : p.status !== 'resolved' && p.status !== 'dismissed' && p.status !== 'expired'
        );
      } else if (st === 'closed') {
        list = list.filter((p) => ['resolved', 'dismissed', 'expired'].includes(p.status));
      }
    }
    const area = String(req.query.area || '').trim().toLowerCase();
    if (area) list = list.filter((p) => String(p.areaLabel || '').toLowerCase().includes(area));
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({
      posts: list.slice(0, 100).map((p) => publicPost(p, viewer?.id ?? null)),
      count: list.length,
    });
  });

  // GET /api/watch/posts/:id — detail (guest-safe, privacy-stripped for non-watchers).
  app.get('/api/watch/posts/:id', (req, res) => {
    const viewer = getRequestUser(req);
    const db = loadDatabase();
    ensureSafeWatch(db);
    const changed = sweepExpired(db.safeWatch.posts);
    if (changed) saveDatabase(db);
    const p = (db.safeWatch.posts || []).find((x: WatchPost) => x && x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Report not found.' });
    res.json({ post: publicPost(p, viewer?.id ?? null) });
  });

  // POST /api/watch/posts — create a hazard / observation / watch alert (requireAuth).
  app.post('/api/watch/posts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const kind = sanitizeKind(body.kind);
    const description = str(body.description, 600);
    const areaLabel = str(body.areaLabel, 120);
    if (description.length < 5) {
      return res.status(400).json({ error: 'Describe the report (at least 5 characters).' });
    }
    const db = loadDatabase();
    ensureSafeWatch(db);
    const posts = db.safeWatch.posts as WatchPost[];

    // Watch-alert rate limit (shared emergency engine: 2 / 15 min).
    if (kind === 'alert') {
      const rl = isUserRateLimited(
        {
          userId: me.id,
          alertTimestamps: posts.filter((p) => p && p.kind === 'alert' && p.createdById === me.id).map((p) => p.createdAt),
        },
        now()
      );
      if (rl.limited) {
        return res.status(429).json({ error: `You've raised watch alerts recently. Please wait ${rl.remainingSec}s.` });
      }
    } else {
      // Hazards + observations: 10 / hour per user.
      const hourAgo = now() - POST_WINDOW_MS;
      const recent = posts.filter(
        (p) => p && p.kind !== 'alert' && p.createdById === me.id && p.createdAt >= hourAgo
      ).length;
      if (recent >= POST_RATE_LIMIT) {
        return res.status(429).json({ error: `You've posted ${POST_RATE_LIMIT} reports this hour. Please slow down.` });
      }
    }

    // Precise location is opt-in per tap, validated + rounded to ~1m.
    let shareLocation = false;
    let lat: number | undefined;
    let lng: number | undefined;
    if (kind === 'alert' && body.shareLocation === true) {
      const nLat = Number(body.lat);
      const nLng = Number(body.lng);
      if (Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180) {
        shareLocation = true;
        lat = Math.round(nLat * 1e6) / 1e6;
        lng = Math.round(nLng * 1e6) / 1e6;
      }
    }

    const circle = kind === 'alert' && body.notifyCircle === true ? myContacts(db, me.id) : [];

    const post: WatchPost = {
      id: uid('watch'),
      kind,
      category: kind === 'alert' ? 'safety' : sanitizeCategory(body.category),
      areaLabel: areaLabel || (kind === 'alert' ? 'Area hidden by user' : 'Area not specified'),
      description,
      createdById: me.id,
      createdByName: userLabel(me),
      status: kind === 'alert' ? 'active' : 'submitted',
      confirmations: [],
      acknowledgements: [],
      shareLocation,
      lat,
      lng,
      notifyCircle: circle.length > 0,
      notifiedContactCount: circle.length,
      createdAt: now(),
      expiresAt: kind === 'alert' ? now() + ALERT_EXPIRY_MS : undefined,
    };
    posts.unshift(post);
    if (posts.length > MAX_KEPT) db.safeWatch.posts = posts.slice(0, MAX_KEPT);
    saveDatabase(db);
    res.json({ post: publicPost(post, me.id), contactCount: circle.length });
  });

  // POST /api/watch/posts/:id/confirm — verify a report (requireAuth, one per user).
  app.post('/api/watch/posts/:id/confirm', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSafeWatch(db);
    const p = (db.safeWatch.posts || []).find((x: WatchPost) => x && x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Report not found.' });
    if (p.kind === 'alert') return res.status(400).json({ error: 'Watch alerts are acknowledged, not confirmed.' });
    if (p.createdById === me.id) return res.status(400).json({ error: 'You cannot confirm your own report.' });
    if (['resolved', 'dismissed', 'expired'].includes(p.status)) {
      return res.status(400).json({ error: 'This report is already closed.' });
    }
    p.confirmations = p.confirmations || [];
    if (p.confirmations.includes(me.id)) {
      return res.status(400).json({ error: 'You already confirmed this report.' });
    }
    p.confirmations.push(me.id);
    awardCoins(loadCommunity, saveCommunity, me.id, COIN_CONFIRM);

    let promoted = false;
    if (p.confirmations.length >= CONFIRMATIONS_REQUIRED && p.status === 'submitted') {
      p.status = 'confirmed';
      if (!p.coinAwardedCreator) {
        p.coinAwardedCreator = true;
        awardCoins(loadCommunity, saveCommunity, p.createdById, COIN_CONFIRMED_CREATOR);
      }
      promoted = true;
    }
    saveDatabase(db);
    res.json({ post: publicPost(p, me.id), confirmations: p.confirmations.length, promoted });
  });

  // POST /api/watch/posts/:id/ack — acknowledge a watch alert (requireAuth).
  app.post('/api/watch/posts/:id/ack', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    ensureSafeWatch(db);
    const p = (db.safeWatch.posts || []).find((x: WatchPost) => x && x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Alert not found.' });
    if (p.kind !== 'alert') return res.status(400).json({ error: 'Only watch alerts can be acknowledged.' });
    if (p.createdById === me.id) return res.status(400).json({ error: 'You cannot acknowledge your own alert.' });
    if (p.status !== 'active' && p.status !== 'acknowledged') {
      return res.status(400).json({ error: 'This alert is already closed.' });
    }
    p.acknowledgements = p.acknowledgements || [];
    if (p.acknowledgements.some((x) => x && x.byUserId === me.id)) {
      return res.status(400).json({ error: 'You already acknowledged this alert.' });
    }
    p.acknowledgements.push({
      id: uid('watchack'),
      byUserId: me.id,
      byName: userLabel(me),
      note: str(body.note, 200),
      at: now(),
    });
    if (p.status === 'active') p.status = 'acknowledged';
    awardCoins(loadCommunity, saveCommunity, me.id, COIN_ALERT_ACK);
    saveDatabase(db);
    res.json({ post: publicPost(p, me.id), ackCount: p.acknowledgements.length });
  });

  // POST /api/watch/posts/:id/status — advance hazard lifecycle (requireAuth).
  app.post('/api/watch/posts/:id/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    ensureSafeWatch(db);
    const p = (db.safeWatch.posts || []).find((x: WatchPost) => x && x.id === req.params.id);
    if (!p) return res.status(404).json({ error: 'Report not found.' });
    const target = String(body.status || '').trim();

    if (p.kind === 'alert') {
      if (target === 'resolved') {
        if (p.createdById !== me.id) return res.status(403).json({ error: 'Only the alert creator can resolve it.' });
        if (p.status !== 'active' && p.status !== 'acknowledged') {
          return res.status(400).json({ error: 'This alert is already closed.' });
        }
        p.status = 'resolved';
        p.resolvedAt = now();
        p.resolvedBy = me.id;
        p.resolvedByName = userLabel(me);
        p.resolvedNote = str(body.note, 200) || undefined;
        saveDatabase(db);
        return res.json({ post: publicPost(p, me.id) });
      }
      return res.status(400).json({ error: 'Watch alerts support only "resolved".' });
    }

    // hazard / observation lifecycle
    const canWork = p.createdById === me.id || (p.confirmations || []).includes(me.id);
    if (target === 'in_progress') {
      if (!canWork) return res.status(403).json({ error: 'Only the reporter or a confirmer can start work.' });
      if (p.status !== 'submitted' && p.status !== 'confirmed') {
        return res.status(400).json({ error: 'Only open reports can move to in_progress.' });
      }
      p.status = 'in_progress';
    } else if (target === 'resolved') {
      if (p.createdById !== me.id) return res.status(403).json({ error: 'Only the reporter can resolve it.' });
      if (p.status === 'resolved' || p.status === 'dismissed') {
        return res.status(400).json({ error: 'This report is already closed.' });
      }
      p.status = 'resolved';
      p.resolvedAt = now();
      p.resolvedBy = me.id;
      p.resolvedByName = userLabel(me);
      p.resolvedNote = str(body.note, 200) || undefined;
      if (!p.coinAwardedResolve) {
        p.coinAwardedResolve = true;
        awardCoins(loadCommunity, saveCommunity, me.id, COIN_RESOLVE);
      }
    } else if (target === 'dismissed') {
      if (p.createdById !== me.id) return res.status(403).json({ error: 'Only the reporter can dismiss it.' });
      if (p.status === 'resolved' || p.status === 'dismissed') {
        return res.status(400).json({ error: 'This report is already closed.' });
      }
      p.status = 'dismissed';
    } else {
      return res.status(400).json({ error: 'status must be in_progress, resolved or dismissed.' });
    }
    saveDatabase(db);
    res.json({ post: publicPost(p, me.id) });
  });

  // GET /api/watch/contacts — my watch circle (requireAuth).
  app.get('/api/watch/contacts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSafeWatch(db);
    res.json({ contacts: myContacts(db, me.id) });
  });

  // POST /api/watch/contacts — add an emergency contact (stored ONLY when the user sets it).
  app.post('/api/watch/contacts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const name = str(body.name, 60);
    if (name.length < 2) return res.status(400).json({ error: 'Contact name is required.' });
    const db = loadDatabase();
    ensureSafeWatch(db);
    const record = ensureContactRecord(db, me.id);
    if (record.contacts.length >= MAX_CONTACTS) {
      return res.status(400).json({ error: `You can have up to ${MAX_CONTACTS} emergency contacts.` });
    }
    const contact: WatchContact = {
      id: uid('watchc'),
      name,
      phone: str(body.phone, 30) || undefined,
      username: str(body.username, 40) || undefined,
      linkedUserId:
        typeof body.linkedUserId === 'string' && body.linkedUserId.trim()
          ? body.linkedUserId.trim().slice(0, 60)
          : undefined,
      createdAt: now(),
    };
    record.contacts.push(contact);
    saveDatabase(db);
    res.json({ contact, contacts: record.contacts });
  });

  // POST /api/watch/contacts/:contactId/remove — remove an emergency contact.
  app.post('/api/watch/contacts/:contactId/remove', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    ensureSafeWatch(db);
    const record = ensureContactRecord(db, me.id);
    const idx = record.contacts.findIndex((c) => c && c.id === req.params.contactId);
    if (idx < 0) return res.status(404).json({ error: 'Contact not found.' });
    record.contacts.splice(idx, 1);
    saveDatabase(db);
    res.json({ contacts: record.contacts });
  });
}

export { CATEGORY_OPTIONS, CATEGORY_LABEL, DISCLAIMER };

// ---------------------------------------------------------------------------
// Small internal helper (kept at the bottom, after register, to avoid shadowing)
// ---------------------------------------------------------------------------

/** Read-only balance read that never throws. */
function loadCommunitySafe(db: any, userId: string, loadCommunity: () => any): number {
  try {
    const state = loadCommunity();
    return state.balances?.[userId] ?? 0;
  } catch (e: any) {
    console.warn('[safewatch] balance read error:', e?.message || e);
    return 0;
  }
}
