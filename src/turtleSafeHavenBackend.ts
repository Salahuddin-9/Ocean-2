/**
 * Ocean — SafeHaven backend (Safe Place / Emergency Refuge Network)
 * -----------------------------------------------------------------
 * A civic-resilience module that builds ALONGSIDE the emergency community pools
 * (turtleEmergencyPoolsBackend), SafeSOS, Safety Shield, Safe Shelter, SOS Alerts
 * and the Blood Donor Registry — covering the part those modules do not: a
 * community SAFE PLACE NETWORK. A verified network of refuges (shops, cafes,
 * pharmacies, transit stops, medical points, community centres, homes) that
 * people can run to in an emergency, plus a one-tap "I'm seeking refuge"
 * broadcast when someone is heading to one.
 *
 *  Three moving parts:
 *   1. Safe havens registry — a place is EXPLICITLY registered by its owner /
 *      operator as a safe haven. Only a FUZZY area label is ever stored or shown
 *      ("North Beach, near the blue mosque") — an exact street address is NEVER
 *      stored or broadcast. Neighbours verify a haven is real (3 verifications
 *      promote it to `verified`); the owner toggles open/closed and can remove it.
 *   2. "I'm seeking refuge" event — a one-tap panic-style broadcast. The fuzzy
 *      `areaLabel` + message are ALWAYS broadcast. Precise GPS is attached ONLY
 *      when the user ticks the opt-in on that tap (`shareLocation: true`), rounded
 *      to ~1m, and is revealed ONLY to the initiator, to acknowledged responders
 *      and to the operator of the referenced haven. Rate-limited to 2 / 15 min
 *      (shared emergency engine isUserRateLimited).
 *   3. Refuge reachability — the initiator's safety circle (their explicitly
 *      user-set emergency contacts, re-read from db.safeSOS.contacts) is snapshotted
 *      onto the event so the broadcast reaches people the user chose. Acknowledging
 *      a refuge event ("on my way / urgent / noted") rewards the RESPONDER.
 *
 *  Safety coins (community.json wallet via turtleCommunityBackend.addBalance):
 *   +10 registering a safe haven (first time), +5 verifying a haven (once per
 *   haven per user), +25 acknowledging someone else's refuge event (once per
 *   event per user — never the initiator, no incentive to fake), +15 to the haven
 *   operator when a refuge event referencing their haven is resolved.
 *
 *  Privacy guarantees (rule 4):
 *   - Emergency contacts are only ever read from the user's own explicitly-set
 *     circle (db.safeSOS.contacts) — never auto-created here.
 *   - Location is shared ONLY via an explicit per-press opt-in.
 *   - Precise coords / the haven contact line are NEVER in list views; on detail
 *     they are revealed only to the initiator, acknowledged responders and the
 *     haven operator. A user's home address is never stored or broadcast.
 *
 *  Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 *  `db.safeHaven` (idempotent ensure, defensive `?? []` reads). Never stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited, SAFETY_DISCLAIMERS } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HavenType =
  | 'shop' | 'cafe' | 'pharmacy' | 'transit' | 'medical' | 'community' | 'home' | 'other';
export type RefugeStatus = 'active' | 'resolved' | 'expired' | 'suppressed';
export type AckType = 'on_my_way' | 'urgent' | 'noted';

export interface SafeHaven {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  type: HavenType;
  /** Fuzzy area label — the ONLY location stored. Exact address is never kept. */
  areaLabel: string;
  whenOpen: string;
  capacity: number;
  note: string;
  /** Optional contact line — revealed only to the owner and to people who
   *  created a refuge event referencing this haven. Never in lists. */
  contactLine?: string;
  open: boolean;
  verifierIds: string[];
  reports: { reason: string; at: number }[];
  suppressed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HavenAck {
  userId: string;
  userName: string;
  type: AckType;
  at: number;
}

export interface RefugeEvent {
  id: string;
  havenId?: string;
  initiatorId: string;
  initiatorName: string;
  note: string;
  /** Fuzzy area — always broadcast. */
  areaLabel: string;
  /** Precise GPS — ONLY on explicit opt-in (`shareLocation: true`). */
  shareLocation: boolean;
  location?: { lat: number; lng: number; accuracy?: number };
  /** Snapshot of the initiator's explicitly-set safety circle at creation. */
  contactIds: string[];
  acks: HavenAck[];
  reports: { reason: string; at: number }[];
  status: RefugeStatus;
  createdAt: number;
  resolvedAt?: number;
  resolvedById?: string;
}

interface SafeHavenState {
  havens: SafeHaven[];
  events: RefugeEvent[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HAVEN_TYPES: HavenType[] = [
  'shop', 'cafe', 'pharmacy', 'transit', 'medical', 'community', 'home', 'other',
];

const HAVEN_TYPE_LABELS: Record<HavenType, string> = {
  shop: 'Shop / store', cafe: 'Cafe / restaurant', pharmacy: 'Pharmacy',
  transit: 'Transit / station', medical: 'Medical point', community: 'Community centre',
  home: 'Safe home', other: 'Other',
};

const COINS_REGISTER_HAVEN = 10;
const COINS_VERIFY_HAVEN = 5;
const COINS_ACK = 25;
const COINS_REFUGE_RESOLVED_OWNER = 15;

const VERIFY_THRESHOLD = 3;
const SUPPRESS_AFTER_REPORTS = 3;
const EVENT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // active refuge events expire after 24h
const MAX_HAVENS_KEPT = 400;
const MAX_EVENTS_KEPT = 300;
const MAX_CAPACITY = 5000;

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

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isCoord(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function sanitizeType(v: unknown): HavenType {
  const s = String(v ?? '').trim().toLowerCase();
  return HAVEN_TYPES.includes(s as HavenType) ? (s as HavenType) : 'other';
}

function sanitizeAck(v: unknown): AckType {
  return v === 'on_my_way' || v === 'urgent' || v === 'noted' ? (v as AckType) : 'noted';
}

function userLabel(u: any): string {
  return String(u?.name || u?.username || 'User');
}

/** Attach precise GPS only on explicit opt-in with valid finite coords. */
function optInLocation(body: any): { lat: number; lng: number; accuracy?: number } | undefined {
  if (!body || body.shareLocation !== true) return undefined;
  if (!isCoord(body.lat) || !isCoord(body.lng)) return undefined;
  const lat = round5(body.lat);
  const lng = round5(body.lng);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng, accuracy: isCoord(body.accuracy) ? Math.round(body.accuracy) : undefined };
}

/** Idempotent ensure of db.safeHaven — safe to run on every load. */
function ensureSafeHaven(db: any): SafeHavenState {
  if (!db.safeHaven || typeof db.safeHaven !== 'object' || Array.isArray(db.safeHaven)) {
    db.safeHaven = {};
  }
  const s = db.safeHaven;
  if (!Array.isArray(s.havens)) s.havens = [];
  if (!Array.isArray(s.events)) s.events = [];
  return s as SafeHavenState;
}

/** Deterministic lazy sweep (no cron): active refuge events older than 24h expire. */
function sweepExpiredEvents(s: SafeHavenState): boolean {
  const t = now();
  let changed = false;
  for (const ev of s.events) {
    if (ev && ev.status === 'active' && t - (ev.createdAt || 0) > EVENT_MAX_AGE_MS) {
      ev.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

/**
 * The user's explicitly-set safety circle (emergency contacts from the SafeSOS
 * module — same global db). Cross-module read is intentional and safe: those
 * contacts are only ever stored after the user sets them.
 */
function safetyCircleIds(db: any, userId: string): string[] {
  try {
    const contacts = db?.safeSOS?.contacts || [];
    return contacts
      .filter((c: any) => c && c.addedById === userId)
      .map((c: any) => c.userId);
  } catch (e: any) {
    console.warn('[safehaven] circle read error:', e?.message || e);
    return [];
  }
}

/** Can `viewerId` see precise details of this refuge event? */
function canSeePrecise(s: SafeHavenState, ev: RefugeEvent, viewerId: string): boolean {
  if (!viewerId) return false;
  if (ev.initiatorId === viewerId) return true;
  if ((ev.acks || []).some((a) => a.userId === viewerId)) return true;
  if (ev.havenId) {
    const h = (s.havens || []).find((x) => x && x.id === ev.havenId);
    if (h && h.ownerId === viewerId) return true;
  }
  return false;
}

/** Haven as seen by `viewerId` — contact line only for the owner or refuge guests. */
function publicHaven(h: SafeHaven, viewerId: string, s: SafeHavenState): any {
  const isOwner = !!viewerId && h.ownerId === viewerId;
  const isGuest =
    !!viewerId &&
    (s.events || []).some(
      (ev) => ev && ev.havenId === h.id && ev.initiatorId === viewerId
    );
  return {
    id: h.id,
    ownerId: h.ownerId,
    ownerName: h.ownerName,
    name: h.name,
    type: h.type,
    areaLabel: h.areaLabel,
    whenOpen: h.whenOpen,
    capacity: h.capacity,
    note: h.note,
    open: h.open,
    verified: !h.suppressed && (h.verifierIds || []).length >= VERIFY_THRESHOLD,
    verifiedCount: (h.verifierIds || []).length,
    reportCount: (h.reports || []).length,
    isOwner,
    verifiedByMe: !!viewerId && (h.verifierIds || []).includes(viewerId),
    contactLine: isOwner || isGuest ? h.contactLine : undefined,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}

/** Refuge event as seen by `viewerId` — precise location stripped unless privileged. */
function publicEvent(s: SafeHavenState, ev: RefugeEvent, viewerId: string): any {
  const haven = ev.havenId
    ? (s.havens || []).find((h) => h && h.id === ev.havenId) || null
    : null;
  const out: any = {
    id: ev.id,
    havenId: ev.havenId,
    havenName: haven ? haven.name : undefined,
    initiatorId: ev.initiatorId,
    initiatorName: ev.initiatorName,
    note: ev.note,
    areaLabel: ev.areaLabel,
    shareLocation: ev.shareLocation,
    status: ev.status,
    acks: (ev.acks || []).map((a) => ({ ...a })),
    ackCount: (ev.acks || []).length,
    contactCount: (ev.contactIds || []).length,
    reportCount: (ev.reports || []).length,
    isMine: !!viewerId && ev.initiatorId === viewerId,
    myAckType: viewerId
      ? ((ev.acks || []).find((a) => a.userId === viewerId)?.type ?? null)
      : null,
    canAck:
      !!viewerId &&
      ev.initiatorId !== viewerId &&
      ev.status === 'active' &&
      !(ev.acks || []).some((a) => a.userId === viewerId),
    createdAt: ev.createdAt,
    resolvedAt: ev.resolvedAt,
    resolvedById: ev.resolvedById,
  };
  if (canSeePrecise(s, ev, viewerId)) {
    out.location = ev.location;
  }
  return out;
}

/** Award safety coins into the community.json wallet. */
function awardCoins(
  loadCommunity: () => any,
  saveCommunity: (st: any) => void,
  userId: string,
  amount: number
): number {
  try {
    const state = loadCommunity();
    addBalance(state, userId, amount);
    saveCommunity(state);
    return state.balances[userId] || 0;
  } catch (e: any) {
    console.warn('[safehaven] coin award error:', e?.message || e);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSafeHavenRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/safehaven/meta — option lists + disclaimer (guest-safe; powers forms).
  app.get('/api/safehaven/meta', (req, res) => {
    const viewer = getRequestUser(req);
    res.json({
      types: HAVEN_TYPES.map((t) => ({ id: t, label: HAVEN_TYPE_LABELS[t] })),
      disclaimer: SAFETY_DISCLAIMERS.GENERAL,
      verifyThreshold: VERIFY_THRESHOLD,
      coinRewards: {
        registerHaven: COINS_REGISTER_HAVEN,
        verifyHaven: COINS_VERIFY_HAVEN,
        ack: COINS_ACK,
        resolvedOwner: COINS_REFUGE_RESOLVED_OWNER,
      },
      viewerId: viewer?.id ?? null,
    });
  });

  // GET /api/safehaven/status — my havens, my events, active refuge count, balance.
  app.get('/api/safehaven/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const changed = sweepExpiredEvents(s);

    const myHavens = (s.havens || []).filter((h) => h && h.ownerId === me.id && !h.suppressed);
    const myEvents = (s.events || []).filter((ev) => ev && ev.initiatorId === me.id);
    const activeRefuge = (s.events || []).filter(
      (ev) => ev && ev.status === 'active' && (ev.contactIds || []).includes(me.id)
    ).length;
    const incomingAcks = myEvents.reduce(
      (n, ev) => n + (ev.acks || []).filter((a) => a.userId !== me.id).length,
      0
    );

    let balance = 0;
    try {
      const trust = Number(me?.trustScore ?? me?.profile?.trustScore ?? 0);
      balance = trustPointsForUser(loadCommunity(), me.id, trust);
    } catch (e: any) {
      console.warn('[safehaven] status balance error:', e?.message || e);
    }

    if (changed) saveDatabase(db);
    res.json({
      me: { id: me.id, name: userLabel(me) },
      havenCount: myHavens.length,
      verifiedHavenCount: myHavens.filter(
        (h) => (h.verifierIds || []).length >= VERIFY_THRESHOLD
      ).length,
      eventCount: myEvents.length,
      activeRefugeForMe: activeRefuge,
      incomingAckCount: incomingAcks,
      balance,
    });
  });

  // GET /api/safehaven/havens — public list (filter ?type=&area=&open=). Fuzzy only.
  app.get('/api/safehaven/havens', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);

    const type = String(req.query.type || '').trim().toLowerCase();
    const area = String(req.query.area || '').trim().toLowerCase();
    const openOnly = req.query.open === 'true' || req.query.open === '1';

    let havens = (s.havens || []).filter((h) => h && !h.suppressed);
    if (type) havens = havens.filter((h) => h.type === type);
    if (area) {
      havens = havens.filter(
        (h) => h.areaLabel.toLowerCase().includes(area) || h.name.toLowerCase().includes(area)
      );
    }
    if (openOnly) havens = havens.filter((h) => h.open);
    havens = [...havens].sort(
      (a, b) =>
        (b.verifierIds || []).length - (a.verifierIds || []).length ||
        (a.open === b.open ? 0 : a.open ? -1 : 1) ||
        b.createdAt - a.createdAt
    );

    res.json({
      havens: havens.map((h) => publicHaven(h, me.id, s)),
      count: havens.length,
    });
  });

  // GET /api/safehaven/havens/:id — detail. Contact line for owner or refuge guests.
  app.get('/api/safehaven/havens/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const h = (s.havens || []).find((x) => x && x.id === req.params.id);
    if (!h || h.suppressed) return res.status(404).json({ error: 'Safe haven not found.' });

    const recentEvents = (s.events || [])
      .filter((ev) => ev && ev.havenId === h.id && (ev.status === 'active' || ev.status === 'resolved'))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((ev) => publicEvent(s, ev, me.id));

    res.json({ haven: publicHaven(h, me.id, s), recentEvents });
  });

  // POST /api/safehaven/havens — register a safe haven (explicit owner action).
  app.post('/api/safehaven/havens', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const name = str(body.name, 120);
    const areaLabel = str(body.areaLabel, 120);
    if (name.length < 2) {
      return res.status(400).json({ error: 'A haven name is required (at least 2 characters).' });
    }
    if (areaLabel.length < 2) {
      return res
        .status(400)
        .json({ error: 'An approximate area is required (e.g. "North Beach, near the mosque"). Exact addresses are never stored.' });
    }

    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const t = now();

    let haven = (s.havens || []).find((h) => h && h.ownerId === me.id && h.name.toLowerCase() === name.toLowerCase());
    const isNew = !haven;
    if (!haven) {
      haven = {
        id: uid('haven'),
        ownerId: me.id,
        ownerName: userLabel(me),
        name,
        type: sanitizeType(body.type),
        areaLabel,
        whenOpen: str(body.whenOpen, 120),
        capacity: clamp(Math.round(Number(body.capacity) || 0), 0, MAX_CAPACITY),
        note: str(body.note, 500),
        contactLine: str(body.contactLine, 200) || undefined,
        open: body.open !== false,
        verifierIds: [],
        reports: [],
        suppressed: false,
        createdAt: t,
        updatedAt: t,
      };
      s.havens.push(haven);
      if (s.havens.length > MAX_HAVENS_KEPT) s.havens = s.havens.slice(-MAX_HAVENS_KEPT);
    } else {
      haven.name = name;
      haven.type = sanitizeType(body.type);
      haven.areaLabel = areaLabel;
      haven.whenOpen = str(body.whenOpen, 120);
      haven.capacity = clamp(Math.round(Number(body.capacity) || 0), 0, MAX_CAPACITY);
      haven.note = str(body.note, 500);
      haven.contactLine = str(body.contactLine, 200) || undefined;
      haven.updatedAt = t;
    }

    saveDatabase(db);
    let coins = 0;
    if (isNew) coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_REGISTER_HAVEN);
    res.json({ haven: publicHaven(haven, me.id, s), coins });
  });

  // POST /api/safehaven/havens/:id/verify — neighbours attest a haven is real.
  app.post('/api/safehaven/havens/:id/verify', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const h = (s.havens || []).find((x) => x && x.id === req.params.id);
    if (!h || h.suppressed) return res.status(404).json({ error: 'Safe haven not found.' });
    if (h.ownerId === me.id) {
      return res.status(400).json({ error: 'You cannot verify your own safe haven.' });
    }
    const verifiers = h.verifierIds || [];
    if (verifiers.includes(me.id)) {
      return res.status(400).json({ error: 'You already verified this safe haven.' });
    }
    verifiers.push(me.id);
    h.updatedAt = now();
    saveDatabase(db);
    const coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_VERIFY_HAVEN);
    res.json({ haven: publicHaven(h, me.id, s), coins });
  });

  // POST /api/safehaven/havens/:id/open — owner toggles open/closed.
  app.post('/api/safehaven/havens/:id/open', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const h = (s.havens || []).find((x) => x && x.id === req.params.id);
    if (!h || h.suppressed) return res.status(404).json({ error: 'Safe haven not found.' });
    if (h.ownerId !== me.id) {
      return res.status(403).json({ error: 'Only the haven operator can change its status.' });
    }
    h.open = typeof (req.body || {}).open === 'boolean' ? (req.body as any).open : !h.open;
    h.updatedAt = now();
    saveDatabase(db);
    res.json({ haven: publicHaven(h, me.id, s) });
  });

  // DELETE /api/safehaven/havens/:id — owner removes their haven.
  app.delete('/api/safehaven/havens/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const idx = (s.havens || []).findIndex(
      (h) => h && h.id === req.params.id && h.ownerId === me.id
    );
    if (idx === -1) return res.status(404).json({ error: 'Safe haven not found.' });
    s.havens.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });

  // POST /api/safehaven/havens/:id/report — fake havens suppressed after 3 reports.
  app.post('/api/safehaven/havens/:id/report', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const h = (s.havens || []).find((x) => x && x.id === req.params.id);
    if (!h || h.suppressed) return res.status(404).json({ error: 'Safe haven not found.' });
    if (h.ownerId === me.id) {
      return res.status(400).json({ error: 'You cannot report your own safe haven.' });
    }
    h.reports = h.reports || [];
    h.reports.push({ reason: str((req.body || {}).reason, 100) || 'other', at: now() });
    if (h.reports.length >= SUPPRESS_AFTER_REPORTS) h.suppressed = true;
    h.updatedAt = now();
    saveDatabase(db);
    res.json({ ok: true, reportCount: h.reports.length });
  });

  // GET /api/safehaven/events — refuge events visible to me (own + my circle + my havens).
  app.get('/api/safehaven/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const changed = sweepExpiredEvents(s);

    const myHavenIds = (s.havens || [])
      .filter((h) => h && h.ownerId === me.id)
      .map((h) => h.id);

    let events = (s.events || []).filter(
      (ev) =>
        ev &&
        (ev.initiatorId === me.id ||
          (ev.contactIds || []).includes(me.id) ||
          (ev.havenId && myHavenIds.includes(ev.havenId)))
    );

    const scope = String(req.query.scope || 'all');
    const havenId = String(req.query.haven || '');
    if (scope === 'mine') events = events.filter((ev) => ev.initiatorId === me.id);
    else if (scope === 'active') events = events.filter((ev) => ev.status === 'active');
    if (havenId) events = events.filter((ev) => ev.havenId === havenId);
    events = [...events].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);

    if (changed) saveDatabase(db);
    res.json({
      events: events.map((ev) => publicEvent(s, ev, me.id)),
      count: events.length,
    });
  });

  // GET /api/safehaven/events/:id — detail with precise info for privileged viewers.
  app.get('/api/safehaven/events/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const changed = sweepExpiredEvents(s);
    const ev = (s.events || []).find((x) => x && x.id === req.params.id);
    if (!ev) return res.status(404).json({ error: 'Refuge event not found.' });
    if (changed) saveDatabase(db);

    let havenContactLine: string | undefined;
    if (ev.havenId) {
      const h = (s.havens || []).find((x) => x && x.id === ev.havenId);
      if (h && canSeePrecise(s, ev, me.id)) havenContactLine = h.contactLine;
    }

    res.json({
      event: publicEvent(s, ev, me.id),
      havenContactLine,
    });
  });

  // POST /api/safehaven/events — one-tap "I'm seeking refuge" broadcast.
  app.post('/api/safehaven/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const areaLabel = str(body.areaLabel, 120);
    const note = str(body.note, 500);
    if (areaLabel.length < 2) {
      return res
        .status(400)
        .json({ error: 'An approximate area is required (e.g. "near the north market").' });
    }
    if (note.length < 3) {
      return res.status(400).json({ error: 'Add a short note (at least 3 characters).' });
    }

    const db = loadDatabase();
    const s = ensureSafeHaven(db);

    // Emergency broadcast rate limit: 2 / 15 min (mirrors turtleEmergencyPools).
    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: (s.events || [])
          .filter((ev) => ev && ev.initiatorId === me.id)
          .map((ev) => ev.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res.status(429).json({
        error: `You've sent refuge alerts recently. Please wait ${rl.remainingSec}s.`,
      });
    }

    const havenId = str(body.havenId, 120);
    let referencedHaven: SafeHaven | null = null;
    if (havenId) {
      referencedHaven = (s.havens || []).find((h) => h && h.id === havenId && !h.suppressed) || null;
    }
    const loc = optInLocation(body);
    const t = now();

    const event: RefugeEvent = {
      id: uid('refuge'),
      havenId: referencedHaven ? referencedHaven.id : undefined,
      initiatorId: me.id,
      initiatorName: userLabel(me),
      note,
      areaLabel,
      shareLocation: !!loc,
      location: loc,
      contactIds: safetyCircleIds(db, me.id),
      acks: [],
      reports: [],
      status: 'active',
      createdAt: t,
    };
    s.events.unshift(event);
    if (s.events.length > MAX_EVENTS_KEPT) s.events = s.events.slice(0, MAX_EVENTS_KEPT);
    saveDatabase(db);
    res.json({ event: publicEvent(s, event, me.id) });
  });

  // POST /api/safehaven/events/:id/ack — a responder acknowledges; earns coins.
  app.post('/api/safehaven/events/:id/ack', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const ev = (s.events || []).find((x) => x && x.id === req.params.id);
    if (!ev) return res.status(404).json({ error: 'Refuge event not found.' });
    if (ev.status !== 'active') {
      return res.status(400).json({ error: 'This refuge event is no longer active.' });
    }
    if (ev.initiatorId === me.id) {
      return res.status(400).json({ error: 'You cannot acknowledge your own refuge event.' });
    }
    if ((ev.acks || []).some((a) => a.userId === me.id)) {
      return res.status(400).json({ error: 'You already acknowledged this event.' });
    }
    // Anyone may respond — the broadcast reaches the initiator's circle + the
    // referenced haven's operator, and the event is public to the community.
    ev.acks.push({ userId: me.id, userName: userLabel(me), type: sanitizeAck((req.body || {}).type), at: now() });
    saveDatabase(db);
    const coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_ACK); // reward the responder
    res.json({ event: publicEvent(s, ev, me.id), coins });
  });

  // POST /api/safehaven/events/:id/resolve — initiator confirms they are safe.
  app.post('/api/safehaven/events/:id/resolve', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const ev = (s.events || []).find((x) => x && x.id === req.params.id);
    if (!ev) return res.status(404).json({ error: 'Refuge event not found.' });
    if (ev.initiatorId !== me.id) {
      return res.status(403).json({ error: 'Only the initiator can resolve this event.' });
    }
    if (ev.status !== 'active') {
      return res.status(400).json({ error: 'This event is already closed.' });
    }
    ev.status = 'resolved';
    ev.resolvedAt = now();
    ev.resolvedById = me.id;
    saveDatabase(db);

    // Reward the referenced haven operator when the refuge event resolves.
    let ownerCoins = 0;
    if (ev.havenId) {
      const h = (s.havens || []).find((x) => x && x.id === ev.havenId);
      if (h && h.ownerId !== me.id) {
        ownerCoins = awardCoins(loadCommunity, saveCommunity, h.ownerId, COINS_REFUGE_RESOLVED_OWNER);
      }
    }
    res.json({ event: publicEvent(s, ev, me.id), ownerCoins });
  });

  // POST /api/safehaven/events/:id/report — fake/abusive refuge events suppressed.
  app.post('/api/safehaven/events/:id/report', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeHaven(db);
    const ev = (s.events || []).find((x) => x && x.id === req.params.id);
    if (!ev) return res.status(404).json({ error: 'Refuge event not found.' });
    if (ev.initiatorId === me.id) {
      return res.status(400).json({ error: 'You cannot report your own event.' });
    }
    ev.reports = ev.reports || [];
    ev.reports.push({ reason: str((req.body || {}).reason, 100) || 'other', at: now() });
    if (ev.reports.length >= SUPPRESS_AFTER_REPORTS) ev.status = 'suppressed';
    saveDatabase(db);
    res.json({ ok: true, reportCount: ev.reports.length });
  });
}

export { HAVEN_TYPES, HAVEN_TYPE_LABELS };
