/**
 * Ocean — Safety Shield backend (Personal SOS + Trusted Circle)
 * --------------------------------------------------------------
 * A self-contained personal-safety module that lives NEXT TO the emergency
 * community pools (turtleEmergencyPoolsBackend) but serves the individual:
 *
 *   - Trusted Circle: a user explicitly adds emergency contacts (userId list).
 *   - SOS broadcast: a one-tap panic button that writes a SafetyEvent. The
 *     event is ALWAYS broadcast (message + fuzzy area label); precise
 *     lat/lng is ONLY attached when the user explicitly opts in on that press
 *     (`shareLocation: true`). Precise coordinates are only revealed to the
 *     initiator and to contacts who have acknowledged the event.
 *   - Check-in / safe-walk: a pending timer ("confirm by T"). If the initiator
 *     does not confirm before the deadline, the event AUTO-ESCALATES to an
 *     active SOS on the next read (deterministic sweep, no cron).
 *   - Emergency profile: optional note/blood type/allergies/home-address label.
 *     The home-address label is NEVER included in list views and only surfaces
 *     on a detail view to acknowledged responders when shareLocation is on.
 *   - Safety coins: award helpers via community.json balances
 *     (turtleCommunityBackend.addBalance) — seed on first contact, + on
 *     acknowledging a SOS, + on completing a check-in.
 *
 * Privacy guarantees (rule 4):
 *   - Contacts are stored ONLY after the user adds them.
 *   - Location is shared ONLY via an explicit per-press opt-in.
 *   - Home address / precise coords are never broadcast by default.
 *
 * Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 * `db.safetyShield` (idempotent ensure). No base64 stored.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SafetyEventKind = 'sos' | 'checkin';
export type SafetyEventStatus = 'active' | 'pending' | 'resolved' | 'expired';

export interface SafetyContact {
  id: string;
  /** The user who added this contact. */
  ownerId: string;
  /** The contact's userId. */
  userId: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  addedAt: number;
}

export interface SafetyAcknowledger {
  id: string;
  name: string;
  note?: string;
  at: number;
}

export interface SafetyEvent {
  id: string;
  kind: SafetyEventKind;
  status: SafetyEventStatus;
  /** Initiator. */
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  /** Fuzzy area label — always shown. Never precise. */
  locationLabel?: string;
  /** True only when the initiator explicitly opted in on this press. */
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  createdAt: number;
  expiresAt: number;
  /** checkin deadline; when past without confirm the event escalates to SOS. */
  confirmBy?: number;
  escalated?: boolean;
  escalatedAt?: number;
  acknowledgedBy: SafetyAcknowledger[];
  resolvedBy?: { id: string; name: string; at: number };
  resolvedAt?: number;
}

export interface SafetyProfile {
  userId: string;
  note?: string;
  bloodType?: string;
  allergies?: string;
  /** Home-address label — revealed only to opted-in, acknowledged responders. */
  addressLabel?: string;
  updatedAt: number;
}

export interface SafetyShieldState {
  contacts: SafetyContact[];
  events: SafetyEvent[];
  profiles: SafetyProfile[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOS_EXPIRY_MS = 24 * 60 * 60 * 1000; // active SOS auto-expires after 24h
const CHECKIN_MAX_MIN = 120; // a check-in cannot run longer than 2 hours
const CHECKIN_MIN_MIN = 1;
const SEED_SAFETY_COINS = 100; // granted when a user sets up their first contact
const COIN_ACK_SOS = 15; // responder reward for acknowledging a SOS
const COIN_CHECKIN_COMPLETE = 10; // initiator reward for a confirmed check-in

// ---------------------------------------------------------------------------
// Small helpers
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

function str(v: unknown, max = 500): string {
  return String(v ?? '').trim().slice(0, max);
}

function userSummary(u: any) {
  return {
    id: u?.id,
    name: u?.name || u?.username || 'User',
    username: u?.username || u?.profile?.username || '',
    avatarUrl: u?.profile?.avatarUrl || '',
  };
}

function findUserById(db: any, userId: string): any {
  return (db.users || []).find((u: any) => u && u.id === userId) || null;
}

function findUserByName(db: any, username: string): any {
  const q = username.toLowerCase();
  return (
    (db.users || []).find((u: any) => {
      const uname = String(u?.username || u?.profile?.username || '').toLowerCase();
      return uname === q;
    }) || null
  );
}

// ---------------------------------------------------------------------------
// State ensure + deterministic sweep
// ---------------------------------------------------------------------------

/** Idempotent ensure of db.safetyShield — safe to run on every load. */
function ensureSafetyShield(db: any): SafetyShieldState {
  if (!db.safetyShield || typeof db.safetyShield !== 'object' || Array.isArray(db.safetyShield)) {
    db.safetyShield = {};
  }
  const s = db.safetyShield;
  if (!Array.isArray(s.contacts)) s.contacts = [];
  if (!Array.isArray(s.events)) s.events = [];
  if (!Array.isArray(s.profiles)) s.profiles = [];
  return s;
}

/**
 * Deterministic lazy sweep (no cron): overdue pending check-ins escalate to
 * active SOS; expired active SOS events are marked expired. Returns whether
 * anything changed so the caller can persist once.
 */
function sweepEvents(s: SafetyShieldState): boolean {
  let changed = false;
  const t = now();
  for (const ev of s.events) {
    if (ev.kind === 'checkin' && ev.status === 'pending' && ev.confirmBy && ev.confirmBy < t) {
      ev.kind = 'sos';
      ev.status = 'active';
      ev.escalated = true;
      ev.escalatedAt = t;
      ev.expiresAt = t + SOS_EXPIRY_MS;
      changed = true;
    }
    if (ev.status === 'active' && ev.expiresAt && ev.expiresAt < t) {
      ev.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function contactsForOwner(s: SafetyShieldState, ownerId: string): SafetyContact[] {
  return s.contacts.filter((c) => c.ownerId === ownerId);
}

function isContactOf(s: SafetyShieldState, ownerId: string, userId: string): boolean {
  return s.contacts.some((c) => c.ownerId === ownerId && c.userId === userId);
}

function canViewEvent(s: SafetyShieldState, ev: SafetyEvent, viewerId: string): boolean {
  if (ev.userId === viewerId) return true;
  if (isContactOf(s, ev.userId, viewerId)) return true;
  if (ev.acknowledgedBy.some((a) => a.id === viewerId)) return true;
  return false;
}

function hasAcknowledged(ev: SafetyEvent, viewerId: string): boolean {
  return ev.acknowledgedBy.some((a) => a.id === viewerId);
}

/**
 * Sanitize an event for a viewer. Precise coords + the shareLocation flag are
 * stripped unless the viewer is the initiator or an acknowledged responder.
 */
function publicEvent(ev: SafetyEvent, viewerId: string): any {
  const out: any = { ...ev };
  const allowPrecise = ev.userId === viewerId || hasAcknowledged(ev, viewerId);
  if (!allowPrecise) {
    out.lat = undefined;
    out.lng = undefined;
    out.shareLocation = false;
  }
  return out;
}

function profileForViewer(
  profiles: SafetyProfile[],
  userId: string,
  allowPrecise: boolean
): SafetyProfile | null {
  const p = profiles.find((pr) => pr.userId === userId);
  if (!p) return null;
  if (allowPrecise) return { ...p };
  return { ...p, addressLabel: undefined };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSafetyShieldRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = ctx;

  // GET /api/safety/status — meta for the SafetyShieldView (contacts, friend
  // suggestions, my emergency profile, my safety-coin balance). requireAuth.
  app.get('/api/safety/status', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      if (sweepEvents(s)) saveDatabase(db);

      const dbUser = findUserById(db, user.id);
      const contacts = contactsForOwner(s, user.id).map((c) => {
        const u = findUserById(db, c.userId);
        return { ...c, ...(u ? userSummary(u) : { name: c.name }) };
      });

      // Friends of the user that are not yet trusted contacts (quick-pick).
      const friendIds = Array.isArray(dbUser?.friends) ? dbUser.friends : [];
      const friendSuggestions = friendIds
        .filter((fid: string) => !s.contacts.some((c) => c.ownerId === user.id && c.userId === fid))
        .map((fid: string) => findUserById(db, fid))
        .filter(Boolean)
        .map((u: any) => userSummary(u))
        .slice(0, 12);

      const profile = profileForViewer(s.profiles, user.id, true);
      const coins = loadCommunity().balances?.[user.id] || 0;

      res.json({ contacts, friendSuggestions, profile, coins });
    } catch (e: any) {
      console.warn('[safety-shield] status error:', e?.message || e);
      res.status(500).json({ error: 'Status failed.' });
    }
  });

  // GET /api/safety/events?scope=active|all|mine|forMe — events visible to the
  // viewer (sanitized), newest first. requireAuth.
  app.get('/api/safety/events', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      if (sweepEvents(s)) saveDatabase(db);

      const scope = String(req.query.scope || 'active');
      let events = s.events.filter((ev) => canViewEvent(s, ev, user.id));

      if (scope === 'mine') {
        events = events.filter((ev) => ev.userId === user.id);
      } else if (scope === 'forMe') {
        events = events.filter(
          (ev) => ev.userId !== user.id && (isContactOf(s, ev.userId, user.id) || hasAcknowledged(ev, user.id))
        );
      } else if (scope === 'all') {
        // everything visible
      } else {
        events = events.filter((ev) => ev.status === 'active' || ev.status === 'pending');
      }

      events = events.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
      const payload = events.map((ev) => {
        const pub = publicEvent(ev, user.id);
        return {
          ...pub,
          isMine: ev.userId === user.id,
          canRespond: ev.userId !== user.id && isContactOf(s, ev.userId, user.id),
          acknowledgedByMe: hasAcknowledged(ev, user.id),
        };
      });
      res.json({ events: payload, count: payload.length });
    } catch (e: any) {
      console.warn('[safety-shield] events error:', e?.message || e);
      res.status(500).json({ error: 'Events failed.' });
    }
  });

  // GET /api/safety/events/:id — detail incl. redacted creator emergency
  // profile. requireAuth.
  app.get('/api/safety/events/:id', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      if (sweepEvents(s)) saveDatabase(db);

      const ev = s.events.find((e) => e.id === req.params.id);
      if (!ev) return res.status(404).json({ error: 'Event not found.' });
      if (!canViewEvent(s, ev, user.id)) {
        return res.status(403).json({ error: 'You are not a trusted contact for this alert.' });
      }
      const allowPrecise = ev.userId === user.id || hasAcknowledged(ev, user.id);
      res.json({
        event: publicEvent(ev, user.id),
        creatorProfile: profileForViewer(s.profiles, ev.userId, allowPrecise),
        isMine: ev.userId === user.id,
        canRespond: ev.userId !== user.id && isContactOf(s, ev.userId, user.id),
        acknowledgedByMe: hasAcknowledged(ev, user.id),
      });
    } catch (e: any) {
      console.warn('[safety-shield] event detail error:', e?.message || e);
      res.status(500).json({ error: 'Event detail failed.' });
    }
  });

  // POST /api/safety/events — broadcast an SOS or start a check-in timer.
  // Location is only stored when the user explicitly opts in (shareLocation).
  app.post('/api/safety/events', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      if (sweepEvents(s)) saveDatabase(db);

      const kind = body.kind === 'checkin' ? 'checkin' : 'sos';

      // One live alert per user — prevents duplicate panics.
      const live = s.events.find(
        (ev) => ev.userId === user.id && (ev.status === 'active' || ev.status === 'pending')
      );
      if (live) {
        return res.status(429).json({
          error:
            live.kind === 'checkin'
              ? `You already have a check-in running. Resolve or confirm it first.`
              : `You already have an active SOS alert (${live.id}). Resolve it before starting another.`,
        });
      }

      const t = now();
      const message = str(body.message, 300);
      const locationLabel = str(body.locationLabel, 160);

      // Precise location is opt-in per press.
      let shareLocation = body.shareLocation === true;
      let lat: number | undefined;
      let lng: number | undefined;
      const nLat = Number(body.lat);
      const nLng = Number(body.lng);
      if (
        shareLocation &&
        Number.isFinite(nLat) &&
        Number.isFinite(nLng) &&
        nLat >= -90 && nLat <= 90 &&
        nLng >= -180 && nLng <= 180
      ) {
        lat = Math.round(nLat * 1e6) / 1e6;
        lng = Math.round(nLng * 1e6) / 1e6;
      } else {
        shareLocation = false;
      }

      let confirmBy: number | undefined;
      if (kind === 'checkin') {
        const mins = Math.floor(Number(body.confirmInMin) || CHECKIN_MIN_MIN);
        confirmBy = t + clamp(mins, CHECKIN_MIN_MIN, CHECKIN_MAX_MIN) * 60 * 1000;
      }

      const ev: SafetyEvent = {
        id: uid('safety'),
        kind,
        status: kind === 'checkin' ? 'pending' : 'active',
        userId: user.id,
        userName: user.name || user.username || 'User',
        userAvatar: user.profile?.avatarUrl || '',
        message,
        locationLabel,
        shareLocation,
        lat,
        lng,
        createdAt: t,
        expiresAt: kind === 'checkin' ? t + clamp((Number(body.confirmInMin) || CHECKIN_MIN_MIN), CHECKIN_MIN_MIN, CHECKIN_MAX_MIN) * 60 * 1000 : t + SOS_EXPIRY_MS,
        confirmBy,
        acknowledgedBy: [],
      };
      s.events.unshift(ev);
      saveDatabase(db);
      res.json({ event: publicEvent(ev, user.id), isMine: true, canRespond: false, acknowledgedByMe: false });
    } catch (e: any) {
      console.warn('[safety-shield] create event error:', e?.message || e);
      res.status(500).json({ error: 'Failed to broadcast alert.' });
    }
  });

  // POST /api/safety/events/:id/acknowledge — a trusted contact responds
  // ("I'm on my way"). Awards safety coins once per responder per event.
  app.post('/api/safety/events/:id/acknowledge', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      if (sweepEvents(s)) saveDatabase(db);

      const ev = s.events.find((e) => e.id === req.params.id);
      if (!ev) return res.status(404).json({ error: 'Event not found.' });
      if (ev.userId === user.id) {
        return res.status(400).json({ error: 'You cannot respond to your own alert.' });
      }
      if (!isContactOf(s, ev.userId, user.id)) {
        return res.status(403).json({ error: 'Only trusted contacts of the initiator can respond.' });
      }
      if (ev.status !== 'active') {
        return res.status(400).json({ error: 'This alert is not active anymore.' });
      }
      if (hasAcknowledged(ev, user.id)) {
        return res.status(400).json({ error: 'You already acknowledged this alert.' });
      }

      const note = str(req.body?.note, 200);
      ev.acknowledgedBy.push({ id: user.id, name: user.name || user.username || 'User', note: note || undefined, at: now() });
      saveDatabase(db);

      // Safety coin reward for the responder (one time per event).
      const comm = loadCommunity();
      addBalance(comm, user.id, COIN_ACK_SOS);
      saveCommunity(comm);

      res.json({ event: publicEvent(ev, user.id), coins: comm.balances?.[user.id] || 0 });
    } catch (e: any) {
      console.warn('[safety-shield] acknowledge error:', e?.message || e);
      res.status(500).json({ error: 'Acknowledge failed.' });
    }
  });

  // POST /api/safety/events/:id/resolve — the initiator confirms a check-in
  // (cancels escalation, awards coins) or ends an SOS; acknowledged responders
  // may also close an active SOS. Sets resolved.
  app.post('/api/safety/events/:id/resolve', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      if (sweepEvents(s)) saveDatabase(db);

      const ev = s.events.find((e) => e.id === req.params.id);
      if (!ev) return res.status(404).json({ error: 'Event not found.' });
      if (ev.userId !== user.id && !hasAcknowledged(ev, user.id)) {
        return res.status(403).json({ error: 'Only the initiator or a responder can resolve this alert.' });
      }
      if (ev.status === 'resolved' || ev.status === 'expired') {
        return res.status(400).json({ error: 'This alert is already closed.' });
      }

      const wasCheckin = ev.kind === 'checkin';
      ev.status = 'resolved';
      ev.resolvedBy = { id: user.id, name: user.name || user.username || 'User', at: now() };
      ev.resolvedAt = now();
      saveDatabase(db);

      // Completing a check-in (before it escalated) earns the initiator coins.
      let coins = 0;
      if (wasCheckin && ev.userId === user.id && !ev.escalated) {
        const comm = loadCommunity();
        addBalance(comm, user.id, COIN_CHECKIN_COMPLETE);
        saveCommunity(comm);
        coins = comm.balances?.[user.id] || 0;
      }

      res.json({ event: publicEvent(ev, user.id), coins });
    } catch (e: any) {
      console.warn('[safety-shield] resolve error:', e?.message || e);
      res.status(500).json({ error: 'Resolve failed.' });
    }
  });

  // GET /api/safety/contacts — list my trusted circle (requireAuth).
  app.get('/api/safety/contacts', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      const contacts = contactsForOwner(s, user.id).map((c) => {
        const u = findUserById(db, c.userId);
        return { ...c, ...(u ? userSummary(u) : {}) };
      });
      res.json({ contacts });
    } catch (e: any) {
      console.warn('[safety-shield] contacts error:', e?.message || e);
      res.status(500).json({ error: 'Contacts failed.' });
    }
  });

  // POST /api/safety/contacts — add an emergency contact by userId or username.
  // Stored ONLY after this explicit user action. Seeds safety coins on first.
  app.post('/api/safety/contacts', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureSafetyShield(db);

      let target: any = null;
      const userId = str(body.userId, 120);
      const username = str(body.username, 120);
      if (userId) target = findUserById(db, userId);
      else if (username) target = findUserByName(db, username);
      if (!target) return res.status(404).json({ error: 'No user found with that id or username.' });
      if (target.id === user.id) {
        return res.status(400).json({ error: 'You cannot add yourself as an emergency contact.' });
      }
      if (s.contacts.some((c) => c.ownerId === user.id && c.userId === target.id)) {
        return res.status(400).json({ error: 'That person is already a trusted contact.' });
      }

      const summary = userSummary(target);
      s.contacts.push({
        id: uid('contact'),
        ownerId: user.id,
        userId: target.id,
        name: summary.name,
        username: summary.username,
        avatarUrl: summary.avatarUrl,
        addedAt: now(),
      });
      saveDatabase(db);

      // Seed safety coins when the user sets up their first contact.
      const count = contactsForOwner(s, user.id).length;
      let coins = 0;
      if (count === 1) {
        const comm = loadCommunity();
        comm.balances[user.id] = Math.max(comm.balances[user.id] || 0, SEED_SAFETY_COINS);
        saveCommunity(comm);
        coins = comm.balances[user.id];
      }

      res.json({ contact: s.contacts[s.contacts.length - 1], coins });
    } catch (e: any) {
      console.warn('[safety-shield] add contact error:', e?.message || e);
      res.status(500).json({ error: 'Add contact failed.' });
    }
  });

  // DELETE /api/safety/contacts/:userId — remove a trusted contact.
  app.delete('/api/safety/contacts/:userId', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      const before = s.contacts.length;
      s.contacts = s.contacts.filter((c) => !(c.ownerId === user.id && c.userId === req.params.userId));
      if (s.contacts.length === before) {
        return res.status(404).json({ error: 'Contact not found.' });
      }
      saveDatabase(db);
      res.json({ ok: true, contacts: contactsForOwner(s, user.id) });
    } catch (e: any) {
      console.warn('[safety-shield] remove contact error:', e?.message || e);
      res.status(500).json({ error: 'Remove contact failed.' });
    }
  });

  // POST /api/safety/search — find users by name/username to add as contacts.
  app.post('/api/safety/search', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const q = str(req.body?.q, 80).toLowerCase();
      if (q.length < 2) return res.json({ results: [] });
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      const results = (db.users || [])
        .filter((u: any) => u && u.id !== user.id)
        .filter((u: any) => {
          const hay = `${u.name} ${u.username} ${u.profile?.username || ''}`.toLowerCase();
          return hay.includes(q);
        })
        .map((u: any) => userSummary(u))
        .filter((u: any) => !s.contacts.some((c) => c.ownerId === user.id && c.userId === u.id))
        .slice(0, 8);
      res.json({ results });
    } catch (e: any) {
      console.warn('[safety-shield] search error:', e?.message || e);
      res.status(500).json({ error: 'Search failed.' });
    }
  });

  // POST /api/safety/profile — set my emergency profile (note, blood type,
  // allergies, home-address label). Stored only on explicit save.
  app.post('/api/safety/profile', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureSafetyShield(db);
      let profile = s.profiles.find((p) => p.userId === user.id);
      if (!profile) {
        profile = { userId: user.id, updatedAt: now() };
        s.profiles.push(profile);
      }
      profile.note = str(body.note, 300) || undefined;
      profile.bloodType = str(body.bloodType, 20) || undefined;
      profile.allergies = str(body.allergies, 200) || undefined;
      profile.addressLabel = str(body.addressLabel, 160) || undefined;
      profile.updatedAt = now();
      saveDatabase(db);
      res.json({ profile: { ...profile } });
    } catch (e: any) {
      console.warn('[safety-shield] profile error:', e?.message || e);
      res.status(500).json({ error: 'Profile save failed.' });
    }
  });
}
