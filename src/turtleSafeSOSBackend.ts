/**
 * Ocean — SafeSOS backend (Safety Circle: SOS broadcast + Safe Walk check-ins)
 * -----------------------------------------------------------------------------
 * A privacy-first personal safety layer that extends the Emergency UX
 * (EmergencyView / turtleEmergencyPoolsBackend). Three moving parts:
 *
 *  1. Emergency contacts — stored ONLY after the user explicitly adds someone
 *     (POST /api/safesos/contacts). A user may also drop a link that someone
 *     else created to them (privacy). No contact is ever auto-created.
 *  2. SOS broadcast      — one-tap panic event shared with the user's chosen
 *     contacts. The fuzzy `locationLabel` ("Old Town, near the market") is
 *     always safe to share. Precise GPS is attached ONLY when the user ticks
 *     the opt-in on that tap (`shareLocation: true`) — it is never stored
 *     otherwise, and the user's home address is never stored or broadcast.
 *  3. Safe Walk          — "walking home alone; if I don't check in by <time>,
 *     check on me." Deadline check-ins, with lazy 'overdue' elevation on read
 *     (no cron needed). Contacts see the walk and its overdue state live.
 *
 * Safety coins: acknowledging someone else's SOS earns the responder +25 coins
 * (once per event, never the initiator — no incentive to fake alarms), and each
 * safe check-in earns +10 (rate-limited to once per 30 min per user). Coins live
 * in community.json and are awarded via addBalance (turtleCommunityBackend).
 *
 * Persistence: global db under `db.safeSOS` (idempotent ensure, defensive reads
 * via `?? []`). Never stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SOSKind = 'sos' | 'checkin' | 'walk';
export type SOSStatus = 'active' | 'overdue' | 'resolved';
export type AckType = 'on_my_way' | 'urgent' | 'noted';

export interface SafeContact {
  id: string;
  userId: string; // the contact's user id
  name: string;
  username?: string;
  relationship: string;
  addedById: string; // who created this link
  addedByName?: string;
  createdAt: number;
}

export interface SOSAck {
  userId: string;
  userName: string;
  type: AckType;
  at: number;
}

export interface SOSEvent {
  id: string;
  kind: SOSKind;
  initiatorId: string;
  initiatorName: string;
  note: string;
  /** Fuzzy area label — always safe to broadcast. */
  locationLabel?: string;
  /** Precise GPS — ONLY present when the user opted in on that tap. */
  location?: { lat: number; lng: number; accuracy?: number };
  status: SOSStatus;
  /** Snapshot of the initiator's contact user-ids at creation time. */
  contactIds: string[];
  acks: SOSAck[];
  reports?: { reason: string; at: number }[];
  createdAt: number;
  resolvedAt?: number;
  resolvedById?: string;
  // walk-only fields
  checkinDue?: number;
  lastCheckinAt?: number;
  checkinCount?: number;
  windowMinutes?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALK_DEFAULT_MIN = 30;
const WALK_MIN_MIN = 5;
const WALK_MAX_MIN = 180;
const CHECKIN_REWARD_MS = 30 * 60 * 1000; // check-in coin reward cooldown
const MAX_EVENTS_KEPT = 300;
const MAX_CHECKIN_LOG = 1000;
const COINS_ACK = 25;
const COINS_CHECKIN = 10;
const VALID_RELATIONSHIPS = ['family', 'friend', 'neighbor', 'colleague', 'other'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): number {
  return Date.now();
}

function uid(prefix: string): string {
  return `${prefix}-${now()}-${Math.floor(Math.random() * 10000)}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/** Idempotent ensure of db.safeSOS — safe to run on every load. */
function ensureSafeSOS(db: any): any {
  if (!db.safeSOS || typeof db.safeSOS !== 'object' || Array.isArray(db.safeSOS)) {
    db.safeSOS = {};
  }
  const s = db.safeSOS;
  if (!Array.isArray(s.contacts)) s.contacts = [];
  if (!Array.isArray(s.events)) s.events = [];
  if (!Array.isArray(s.checkinLog)) s.checkinLog = [];
  return s;
}

/**
 * Lazily elevates active Safe Walks whose deadline has passed to 'overdue'
 * (read-time evaluation — no cron). Returns true if anything changed.
 */
function elevateOverdueWalks(s: any): boolean {
  const t = now();
  let changed = false;
  for (const ev of s.events || []) {
    if (ev && ev.kind === 'walk' && ev.status === 'active' && ev.checkinDue && ev.checkinDue < t) {
      ev.status = 'overdue';
      changed = true;
    }
  }
  return changed;
}

/** Award safety coins into the community.json wallet. */
function awardCoins(userId: string, amount: number): void {
  try {
    const ctx = getCtx();
    const state = ctx.loadCommunity();
    addBalance(state, userId, amount);
    ctx.saveCommunity(state);
  } catch (e: any) {
    console.warn('[safesos] coin award error:', e?.message || e);
  }
}

/** Rate-limited check-in reward: records a log entry, returns true if coin awarded. */
function claimCheckinReward(s: any, userId: string): boolean {
  const t = now();
  const log = s.checkinLog as { userId: string; at: number }[];
  const last = [...log].reverse().find((x) => x.userId === userId);
  log.push({ userId, at: t });
  if (log.length > MAX_CHECKIN_LOG) s.checkinLog = log.slice(-500);
  return !last || t - last.at >= CHECKIN_REWARD_MS;
}

function resolveContactName(user: any): string {
  return String(user?.name || user?.username || 'User');
}

/** Can `viewerId` see / respond to this initiator's event? */
function isCircleMember(s: any, event: any, viewerId: string): boolean {
  if (event?.contactIds?.includes(viewerId)) return true;
  return (s.contacts || []).some(
    (c: any) => c && c.addedById === viewerId && c.userId === event?.initiatorId
  );
}

function sanitizeNote(v: unknown): string {
  return String(v || '').trim().slice(0, 500);
}

function sanitizeLabel(v: unknown): string {
  return String(v || '').trim().slice(0, 120);
}

function sanitizeRelationship(v: unknown): string {
  const r = String(v || 'friend').trim().toLowerCase();
  return VALID_RELATIONSHIPS.includes(r) ? r : 'friend';
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSafeSOSRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity } = ctx;

  // GET /api/safesos/status — overview: circle size, active alerts, coins.
  app.get('/api/safesos/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const changed = elevateOverdueWalks(s);

    const mine = (s.contacts || []).filter((c: any) => c && c.addedById === me.id);
    const incoming = (s.contacts || []).filter((c: any) => c && c.userId === me.id);
    const visible = (s.events || []).filter(
      (ev: any) => ev && (ev.initiatorId === me.id || (ev.contactIds || []).includes(me.id))
    );
    const activeSos = visible.filter(
      (ev: any) => ev.initiatorId !== me.id && (ev.status === 'active' || ev.status === 'overdue')
    );
    const activeWalk =
      (s.events || []).find(
        (ev: any) => ev && ev.kind === 'walk' && ev.initiatorId === me.id && ev.status !== 'resolved'
      ) || null;

    const log = (s.checkinLog || []) as { userId: string; at: number }[];
    const lastCheckin = [...log].reverse().find((x) => x.userId === me.id);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const checkinsToday = log.filter((x) => x.userId === me.id && x.at >= dayStart.getTime()).length;

    let balance = 0;
    try {
      const state = loadCommunity();
      const trust = Number(me?.trustScore ?? me?.profile?.trustScore ?? 0);
      balance = trustPointsForUser(state, me.id, trust);
    } catch (e: any) {
      console.warn('[safesos] status balance error:', e?.message || e);
    }

    if (changed) saveDatabase(db);
    res.json({
      me: { id: me.id, name: resolveContactName(me) },
      contactCount: mine.length,
      incomingCount: incoming.length,
      activeSosCount: activeSos.length,
      activeWalk,
      lastCheckinAt: lastCheckin?.at ?? null,
      checkinsToday,
      balance,
    });
  });

  // GET /api/safesos/contacts — the user's circle + people who added them.
  app.get('/api/safesos/contacts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const contacts = (s.contacts || []).filter((c: any) => c && c.addedById === me.id);
    const incoming = (s.contacts || []).filter((c: any) => c && c.userId === me.id);
    res.json({
      contacts: contacts.sort((a: SafeContact, b: SafeContact) => b.createdAt - a.createdAt),
      incoming: incoming.sort((a: SafeContact, b: SafeContact) => b.createdAt - a.createdAt),
    });
  });

  // POST /api/safesos/contacts — explicitly add an emergency contact.
  app.post('/api/safesos/contacts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const queryName = String(body.name || '').trim();
    const contactUserId = String(body.contactUserId || '').trim();
    const db = loadDatabase();
    const s = ensureSafeSOS(db);

    if (!contactUserId && !queryName) {
      return res.status(400).json({ error: 'Provide a user id or a name/username.' });
    }

    const users = (db.users || []) as any[];
    let target: any = null;
    if (contactUserId) {
      target = users.find((u) => u && String(u.id) === contactUserId);
    }
    if (!target && queryName) {
      const q = queryName.replace(/^@/, '').toLowerCase();
      target =
        users.find((u) => u && String(u.username || '').toLowerCase() === q) ||
        users.find((u) => u && String(u.name || '').toLowerCase() === q);
    }
    if (!target) {
      return res.status(404).json({ error: 'No user found with that name or id.' });
    }
    if (String(target.id) === String(me.id)) {
      return res.status(400).json({ error: 'You cannot add yourself as a contact.' });
    }

    const existing = (s.contacts || []).find(
      (c: any) => c && c.addedById === me.id && String(c.userId) === String(target.id)
    );
    if (existing) {
      existing.relationship = sanitizeRelationship(body.relationship);
      existing.name = resolveContactName(target);
      existing.username = target.username;
      saveDatabase(db);
      return res.json({ contact: existing, alreadyExists: true });
    }

    const contact: SafeContact = {
      id: uid('contact'),
      userId: String(target.id),
      name: resolveContactName(target),
      username: target.username ? String(target.username) : undefined,
      relationship: sanitizeRelationship(body.relationship),
      addedById: me.id,
      addedByName: resolveContactName(me),
      createdAt: now(),
    };
    s.contacts.push(contact);
    saveDatabase(db);
    res.json({ contact });
  });

  // DELETE /api/safesos/contacts/:contactId — drop a contact the user added.
  app.delete('/api/safesos/contacts/:contactId', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const idx = (s.contacts || []).findIndex(
      (c: any) => c && c.id === req.params.contactId && c.addedById === me.id
    );
    if (idx === -1) return res.status(404).json({ error: 'Contact not found.' });
    s.contacts.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });

  // DELETE /api/safesos/incoming/:contactId — remove a link someone else created to me.
  app.delete('/api/safesos/incoming/:contactId', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const idx = (s.contacts || []).findIndex(
      (c: any) => c && c.id === req.params.contactId && String(c.userId) === String(me.id)
    );
    if (idx === -1) return res.status(404).json({ error: 'Link not found.' });
    s.contacts.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });

  // GET /api/safesos/events — alerts visible to the user (own + from their circle).
  app.get('/api/safesos/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const changed = elevateOverdueWalks(s);

    let events = (s.events || []).filter(
      (ev: any) => ev && (ev.initiatorId === me.id || (ev.contactIds || []).includes(me.id))
    );
    const scope = String(req.query.scope || 'all');
    const kind = String(req.query.kind || '');
    if (scope === 'mine') events = events.filter((ev: any) => ev.initiatorId === me.id);
    else if (scope === 'active') {
      events = events.filter((ev: any) => ev.status === 'active' || ev.status === 'overdue');
    }
    if (kind === 'sos' || kind === 'checkin' || kind === 'walk') {
      events = events.filter((ev: any) => ev.kind === kind);
    }
    events = [...events].sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    if (changed) saveDatabase(db);
    res.json({ events });
  });

  // POST /api/safesos/events — one-tap SOS or a "I'm safe now" check-in broadcast.
  app.post('/api/safesos/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const kind: SOSKind = body.kind === 'checkin' ? 'checkin' : 'sos';
    const db = loadDatabase();
    const s = ensureSafeSOS(db);

    if (kind === 'sos') {
      // Emergency broadcast rate limit: 2 / 15 min (mirrors turtleEmergencyPools).
      const rl = isUserRateLimited(
        {
          userId: me.id,
          alertTimestamps: (s.events || [])
            .filter((ev: any) => ev && ev.kind === 'sos' && ev.initiatorId === me.id)
            .map((ev: any) => ev.createdAt),
        },
        now()
      );
      if (rl.limited) {
        return res.status(429).json({
          error: `You've sent several SOS alerts recently. Please wait ${rl.remainingSec}s.`,
        });
      }
    }

    const circle = (s.contacts || [])
      .filter((c: any) => c && c.addedById === me.id)
      .map((c: any) => c.userId);

    const event: SOSEvent = {
      id: uid(kind === 'sos' ? 'sos' : 'checkin'),
      kind,
      initiatorId: me.id,
      initiatorName: resolveContactName(me),
      note: sanitizeNote(body.note),
      locationLabel: body.locationLabel ? sanitizeLabel(body.locationLabel) : undefined,
      location: optInLocation(body),
      status: kind === 'sos' ? 'active' : 'resolved',
      contactIds: circle,
      acks: [],
      createdAt: now(),
      resolvedAt: kind === 'sos' ? undefined : now(),
      resolvedById: kind === 'sos' ? undefined : me.id,
    };

    if (kind === 'checkin' && !event.note) event.note = 'I am safe';
    if (kind === 'checkin' && claimCheckinReward(s, me.id)) {
      awardCoins(me.id, COINS_CHECKIN);
    }

    s.events.unshift(event);
    if (s.events.length > MAX_EVENTS_KEPT) s.events = s.events.slice(0, MAX_EVENTS_KEPT);
    saveDatabase(db);
    res.json({ event });
  });

  // POST /api/safesos/events/:id/ack — a contact responds to someone's alert.
  app.post('/api/safesos/events/:id/ack', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const event = (s.events || []).find((ev: any) => ev && ev.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Alert not found.' });
    if (event.status === 'resolved') return res.status(400).json({ error: 'This alert is already resolved.' });
    if (event.initiatorId === me.id) {
      return res.status(400).json({ error: 'You cannot acknowledge your own alert.' });
    }
    if (!isCircleMember(s, event, me.id)) {
      return res.status(403).json({ error: 'Only safety-circle members can acknowledge this alert.' });
    }
    const rawType = (req.body || {}).type;
    const type: AckType =
      rawType === 'on_my_way' || rawType === 'urgent' || rawType === 'noted'
        ? (rawType as AckType)
        : 'noted';
    if (event.acks.some((a: SOSAck) => a.userId === me.id)) {
      return res.status(400).json({ error: 'You already acknowledged this alert.' });
    }
    event.acks.push({ userId: me.id, userName: resolveContactName(me), type, at: now() });
    awardCoins(me.id, COINS_ACK); // reward the responder, never the initiator
    saveDatabase(db);
    res.json({ event });
  });

  // POST /api/safesos/events/:id/resolve — the initiator marks the alert resolved.
  app.post('/api/safesos/events/:id/resolve', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const event = (s.events || []).find((ev: any) => ev && ev.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Alert not found.' });
    if (event.initiatorId !== me.id) {
      return res.status(403).json({ error: 'Only the initiator can resolve this alert.' });
    }
    event.status = 'resolved';
    event.resolvedAt = now();
    event.resolvedById = me.id;
    saveDatabase(db);
    res.json({ event });
  });

  // POST /api/safesos/events/:id/report — report a fake/abusive alert.
  app.post('/api/safesos/events/:id/report', requireAuth, (req, res) => {
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const event = (s.events || []).find((ev: any) => ev && ev.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Alert not found.' });
    event.reports = event.reports || [];
    event.reports.push({ reason: String((req.body || {}).reason || 'other').slice(0, 100), at: now() });
    // 3+ reports suppress the alert (mirrors emergency pool report pattern).
    if (event.reports.length >= 3) {
      event.status = 'resolved';
      event.resolvedAt = now();
      event.resolvedById = 'system';
    }
    saveDatabase(db);
    res.json({ ok: true, reportCount: event.reports.length });
  });

  // POST /api/safesos/walk — start a Safe Walk with a deadline check-in.
  app.post('/api/safesos/walk', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    const s = ensureSafeSOS(db);

    const existing = (s.events || []).find(
      (ev: any) => ev && ev.kind === 'walk' && ev.initiatorId === me.id && ev.status !== 'resolved'
    );
    if (existing) {
      return res.status(400).json({ error: 'You already have an active safe walk. End it first.' });
    }

    const minutes = clamp(
      Math.round(Number(body.minutes) || WALK_DEFAULT_MIN),
      WALK_MIN_MIN,
      WALK_MAX_MIN
    );
    const circle = (s.contacts || [])
      .filter((c: any) => c && c.addedById === me.id)
      .map((c: any) => c.userId);
    const t = now();

    const event: SOSEvent = {
      id: uid('walk'),
      kind: 'walk',
      initiatorId: me.id,
      initiatorName: resolveContactName(me),
      note: sanitizeNote(body.note),
      locationLabel: body.locationLabel ? sanitizeLabel(body.locationLabel) : undefined,
      location: optInLocation(body),
      status: 'active',
      contactIds: circle,
      acks: [],
      createdAt: t,
      checkinDue: t + minutes * 60000,
      lastCheckinAt: t,
      checkinCount: 1,
      windowMinutes: minutes,
    };
    s.events.unshift(event);
    if (s.events.length > MAX_EVENTS_KEPT) s.events = s.events.slice(0, MAX_EVENTS_KEPT);
    saveDatabase(db);
    res.json({ event });
  });

  // POST /api/safesos/walk/:id/checkin — check in (extends the window, revives overdue).
  app.post('/api/safesos/walk/:id/checkin', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const event = (s.events || []).find(
      (ev: any) => ev && ev.id === req.params.id && ev.kind === 'walk'
    );
    if (!event) return res.status(404).json({ error: 'Walk not found.' });
    if (event.initiatorId !== me.id) {
      return res.status(403).json({ error: 'Only the walker can check in.' });
    }
    if (event.status === 'resolved') return res.status(400).json({ error: 'This walk already ended.' });
    const t = now();
    const win = Math.max(Number(event.windowMinutes) || WALK_DEFAULT_MIN, WALK_MIN_MIN);
    event.status = 'active';
    event.lastCheckinAt = t;
    event.checkinCount = (event.checkinCount || 0) + 1;
    event.checkinDue = t + win * 60000;
    if (claimCheckinReward(s, me.id)) awardCoins(me.id, COINS_CHECKIN);
    saveDatabase(db);
    res.json({ event });
  });

  // POST /api/safesos/walk/:id/end — end a Safe Walk (walker is safe).
  app.post('/api/safesos/walk/:id/end', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeSOS(db);
    const event = (s.events || []).find(
      (ev: any) => ev && ev.id === req.params.id && ev.kind === 'walk'
    );
    if (!event) return res.status(404).json({ error: 'Walk not found.' });
    if (event.initiatorId !== me.id) {
      return res.status(403).json({ error: 'Only the walker can end this walk.' });
    }
    event.status = 'resolved';
    event.resolvedAt = now();
    event.resolvedById = me.id;
    saveDatabase(db);
    res.json({ event });
  });
}
