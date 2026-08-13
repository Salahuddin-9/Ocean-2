/**
 * Ocean — Safe Shelter & Disaster Watch backend
 * ---------------------------------------------
 * A civic-resilience module that builds ALONGSIDE the emergency community pools
 * (turtleEmergencyPoolsBackend), the personal Safety Shield (turtleSafetyShieldBackend)
 * and SafeSOS (turtleSafeSOSBackend) — covering the parts those modules do not:
 *   - Shelter registry: community shelters / relief points (schools, community
 *     centres, homes, medical facilities). Fuzzy `areaLabel` only — a shelter's
 *     exact street address is NEVER stored or broadcast.
 *   - "I'm safe here" check-ins: people mark themselves sheltered; occupancy is
 *     derived from active (24h) check-ins.
 *   - On-site help request: an SOS-style request raised AT a shelter. Precise
 *     lat/lng is attached ONLY when the requester explicitly opts in
 *     (`shareLocation: true`) and is revealed only to the requester and the
 *     responder.
 *   - Disaster watch: area-based early-warning alerts (flood / cyclone / fire /
 *     landslide / heatwave / storm / power). Alerts NEVER carry precise
 *     coordinates — only a fuzzy area label + instructions. 3 independent
 *     confirmations promote an alert to `confirmed`.
 *   - Safety coins (community.json balances via addBalance): registering a
 *     shelter, getting a shelter verified (3 verifications), checking in,
 *     confirming an alert, and responding to a help request all earn coins.
 *
 * Privacy guarantees (rule 4):
 *   - No contacts are stored here at all.
 *   - Location is shared ONLY via an explicit per-press opt-in on a help request.
 *   - Shelters are fuzzy-area only; disaster alerts are fuzzy-area only.
 *
 * Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 * `db.safeShelter` (idempotent ensure, defensive `?? []` reads). No base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShelterType = 'school' | 'community' | 'home' | 'medical' | 'government' | 'other';
export type AlertType = 'flood' | 'cyclone' | 'fire' | 'landslide' | 'heatwave' | 'storm' | 'power' | 'other';
export type AlertSeverity = 'info' | 'watch' | 'warning' | 'critical';
export type HelpStatus = 'open' | 'assisting' | 'resolved';

export interface ShelterCheckin {
  userId: string;
  name: string;
  at: number;
}

export interface ShelterHelpRequest {
  id: string;
  shelterId: string;
  requesterId: string;
  requesterName: string;
  note: string;
  /** True only when the requester explicitly opted in on that request. */
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  status: HelpStatus;
  responderId?: string;
  responderName?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface SafeShelter {
  id: string;
  name: string;
  type: ShelterType;
  /** Fuzzy area label — always safe to show; exact address is never stored. */
  areaLabel: string;
  /** Number of people it can shelter. 0 = unknown. */
  capacity: number;
  amenities: string[];
  open: boolean;
  ownerId: string;
  ownerName?: string;
  isHome: boolean;
  /** Optional contact info the owner chose to share (e.g. "Ask for Rina at the gate"). */
  contactNote?: string;
  verifiedBy: string[];
  verified: boolean;
  checkins: ShelterCheckin[];
  helpRequests: ShelterHelpRequest[];
  createdAt: number;
  reports?: { reason: string; details?: string; at: number }[];
}

export interface DisasterAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  /** Fuzzy area label — alerts never carry precise coordinates. */
  areaLabel: string;
  message: string;
  instructions?: string;
  createdById: string;
  createdByName: string;
  confirmedBy: string[];
  confirmed: boolean;
  status: 'active' | 'lifted';
  createdAt: number;
  reports?: { reason: string; at: number }[];
}

export interface SafeShelterState {
  shelters: SafeShelter[];
  alerts: DisasterAlert[];
  /** { shelterId, userId, at } — used to rate-limit check-in coin rewards. */
  checkinLog: { shelterId: string; userId: string; at: number }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERIFIED_THRESHOLD = 3; // independent verifications to mark a shelter verified
const CHECKIN_MAX_MS = 24 * 60 * 60 * 1000; // a check-in counts toward occupancy for 24h
const CHECKIN_REWARD_MS = 24 * 60 * 60 * 1000; // one check-in coin reward per shelter per 24h
const MAX_SHELTERS_KEPT = 500;
const MAX_ALERTS_KEPT = 300;
const MAX_HELP_NOTES = 4000;
const MAX_CAPACITY = 100000;

// Coins
const COIN_OFFER_SHELTER = 10;
const COIN_VERIFIED_SHELTER = 25;
const COIN_SHELTER_CHECKIN = 5;
const COIN_CONFIRM_ALERT = 10;
const COIN_HELP_RESPOND = 20;

export const SHELTER_TYPES: ShelterType[] = ['school', 'community', 'home', 'medical', 'government', 'other'];
export const ALERT_TYPES: AlertType[] = ['flood', 'cyclone', 'fire', 'landslide', 'heatwave', 'storm', 'power', 'other'];
export const SEVERITIES: AlertSeverity[] = ['info', 'watch', 'warning', 'critical'];
export const AMENITY_OPTIONS = ['water', 'food', 'power', 'first-aid', 'charging', 'wifi', 'sleeping'];

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

function str(v: unknown, max = 300): string {
  return String(v ?? '').trim().slice(0, max);
}

function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function userName(u: any): string {
  return String(u?.name || u?.username || 'User');
}

/** Idempotent ensure of db.safeShelter — safe to run on every load. */
function ensureSafeShelter(db: any): SafeShelterState {
  if (!db.safeShelter || typeof db.safeShelter !== 'object' || Array.isArray(db.safeShelter)) {
    db.safeShelter = {};
  }
  const s = db.safeShelter;
  if (!Array.isArray(s.shelters)) s.shelters = [];
  if (!Array.isArray(s.alerts)) s.alerts = [];
  if (!Array.isArray(s.checkinLog)) s.checkinLog = [];
  return s;
}

function findShelter(s: SafeShelterState, id: string): SafeShelter | undefined {
  return (s.shelters || []).find((x) => x && x.id === id);
}

function findAlert(s: SafeShelterState, id: string): DisasterAlert | undefined {
  return (s.alerts || []).find((x) => x && x.id === id);
}

/** Occupancy = active check-ins within the last 24h. */
function occupancyOf(shelter: SafeShelter): number {
  const cutoff = now() - CHECKIN_MAX_MS;
  return (shelter.checkins || []).filter((c) => c && c.at >= cutoff).length;
}

function checkedInByMe(shelter: SafeShelter, userId: string): boolean {
  const cutoff = now() - CHECKIN_MAX_MS;
  return (shelter.checkins || []).some((c) => c && c.userId === userId && c.at >= cutoff);
}

/** Attach precise GPS only on explicit opt-in with valid finite coords. */
function optInLocation(body: any): { lat: number; lng: number } | undefined {
  if (!body || body.shareLocation !== true) return undefined;
  if (!isCoord(body.lat) || !isCoord(body.lng)) return undefined;
  const lat = round5(body.lat);
  const lng = round5(body.lng);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

/** Sanitize a shelter for a viewer. Precise coords on help requests are only
 * revealed to the requester and the assigned responder. */
function publicShelter(shelter: SafeShelter, viewerId: string): any {
  const out: any = {
    id: shelter.id,
    name: shelter.name,
    type: shelter.type,
    areaLabel: shelter.areaLabel,
    capacity: shelter.capacity,
    amenities: shelter.amenities || [],
    open: !!shelter.open,
    ownerId: shelter.ownerId,
    ownerName: shelter.ownerName,
    isHome: !!shelter.isHome,
    contactNote: shelter.contactNote,
    verified: !!shelter.verified,
    verifiedCount: (shelter.verifiedBy || []).length,
    createdAt: shelter.createdAt,
    reportCount: (shelter.reports || []).length,
    occupancy: occupancyOf(shelter),
    isOwner: shelter.ownerId === viewerId,
    checkedInByMe: checkedInByMe(shelter, viewerId),
    verifiedByMe: (shelter.verifiedBy || []).includes(viewerId),
    helpRequests: (shelter.helpRequests || []).map((h) => {
      const allowPrecise = h.requesterId === viewerId || h.responderId === viewerId;
      const p: any = {
        id: h.id,
        shelterId: h.shelterId,
        requesterId: h.requesterId,
        requesterName: h.requesterName,
        note: h.note,
        status: h.status,
        responderId: h.responderId,
        responderName: h.responderName,
        createdAt: h.createdAt,
        resolvedAt: h.resolvedAt,
        shareLocation: !!h.shareLocation,
        isMine: h.requesterId === viewerId,
        canRespond: h.requesterId !== viewerId && h.status === 'open',
      };
      if (allowPrecise && h.shareLocation) {
        p.lat = h.lat;
        p.lng = h.lng;
      }
      return p;
    }),
  };
  return out;
}

function publicAlert(a: DisasterAlert): any {
  return {
    id: a.id,
    type: a.type,
    severity: a.severity,
    areaLabel: a.areaLabel,
    message: a.message,
    instructions: a.instructions,
    createdById: a.createdById,
    createdByName: a.createdByName,
    confirmed: !!a.confirmed,
    confirmedCount: (a.confirmedBy || []).length,
    status: a.status,
    createdAt: a.createdAt,
    reportCount: (a.reports || []).length,
  };
}

// ---------------------------------------------------------------------------
// Coin helpers (community.json wallet)
// ---------------------------------------------------------------------------

function awardCoins(userId: string, amount: number): void {
  try {
    const ctx = getCtx();
    const state = ctx.loadCommunity();
    addBalance(state, userId, amount);
    ctx.saveCommunity(state);
  } catch (e: any) {
    console.warn('[safe-shelter] coin award error:', e?.message || e);
  }
}

function reportBalance(user: any): number {
  try {
    const ctx = getCtx();
    const state = ctx.loadCommunity();
    const trust = Number(user?.trustScore ?? user?.profile?.trustScore ?? 0);
    return trustPointsForUser(state, user.id, trust);
  } catch (e: any) {
    console.warn('[safe-shelter] balance error:', e?.message || e);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSafeShelterRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase } = ctx;

  // ── STATUS: overview for the SafeShelterView header strip ────────────────
  app.get('/api/shelter/status', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const myShelters = (s.shelters || []).filter((x) => x && x.ownerId === user.id);
      const checkedInShelterIds = (s.shelters || [])
        .filter((x) => x && checkedInByMe(x, user.id))
        .map((x) => x.id);
      const activeAlerts = (s.alerts || []).filter((a) => a && a.status === 'active');
      res.json({
        me: { id: user.id, name: userName(user) },
        shelterCount: (s.shelters || []).length,
        openShelterCount: (s.shelters || []).filter((x) => x && x.open).length,
        verifiedShelterCount: (s.shelters || []).filter((x) => x && x.verified).length,
        activeAlertCount: activeAlerts.length,
        confirmedAlertCount: activeAlerts.filter((a) => a.confirmed).length,
        myShelterCount: myShelters.length,
        checkedInShelterIds,
        balance: reportBalance(user),
      });
    } catch (e: any) {
      console.warn('[safe-shelter] status error:', e?.message || e);
      res.status(500).json({ error: 'Status failed.' });
    }
  });

  // ── SHELTERS ──────────────────────────────────────────────────────────────

  // List shelters (optional ?area= fuzzy filter, ?mine=1).
  app.get('/api/shelter/list', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      let shelters = [...(s.shelters || [])].sort((a, b) => b.createdAt - a.createdAt);
      const area = String(req.query.area || '').trim().toLowerCase();
      if (area) shelters = shelters.filter((x) => String(x.areaLabel || '').toLowerCase().includes(area));
      if (String(req.query.mine || '') === '1') shelters = shelters.filter((x) => x.ownerId === user.id);
      res.json({
        shelters: shelters.slice(0, 100).map((x) => publicShelter(x, user.id)),
        types: SHELTER_TYPES,
        amenities: AMENITY_OPTIONS,
      });
    } catch (e: any) {
      console.warn('[safe-shelter] list error:', e?.message || e);
      res.status(500).json({ error: 'List failed.' });
    }
  });

  // Register a shelter (rate-limited: 2 / 15 min, mirrors emergency pools).
  app.post('/api/shelter', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureSafeShelter(db);

      const timestamps = (s.shelters || [])
        .filter((x) => x && x.ownerId === user.id)
        .map((x) => x.createdAt);
      const rl = isUserRateLimited({ userId: user.id, alertTimestamps: timestamps }, now());
      if (rl.limited) {
        return res.status(429).json({
          error: `You have registered several shelters recently. Please wait ${rl.remainingSec}s.`,
        });
      }

      const name = str(body.name, 120);
      const areaLabel = str(body.areaLabel, 120);
      if (name.length < 3) return res.status(400).json({ error: 'Shelter name is required (min 3 characters).' });
      if (areaLabel.length < 3) return res.status(400).json({ error: 'Area label is required (e.g. "North Beach, near the school").' });

      const type: ShelterType = SHELTER_TYPES.includes(body.type) ? body.type : 'community';
      const capacity = clamp(Math.floor(Number(body.capacity) || 0), 0, MAX_CAPACITY);
      const amenities = Array.isArray(body.amenities)
        ? body.amenities.map(String).filter((a) => AMENITY_OPTIONS.includes(a)).slice(0, AMENITY_OPTIONS.length)
        : [];

      const shelter: SafeShelter = {
        id: uid('shelter'),
        name,
        type,
        areaLabel,
        capacity,
        amenities,
        open: body.open !== false,
        ownerId: user.id,
        ownerName: userName(user),
        isHome: body.isHome === true,
        contactNote: str(body.contactNote, 160) || undefined,
        verifiedBy: [],
        verified: false,
        checkins: [],
        helpRequests: [],
        createdAt: now(),
      };
      s.shelters.unshift(shelter);
      if (s.shelters.length > MAX_SHELTERS_KEPT) s.shelters = s.shelters.slice(0, MAX_SHELTERS_KEPT);
      saveDatabase(db);

      awardCoins(user.id, COIN_OFFER_SHELTER);
      res.json({ shelter: publicShelter(shelter, user.id), coins: reportBalance(user) });
    } catch (e: any) {
      console.warn('[safe-shelter] create error:', e?.message || e);
      res.status(500).json({ error: 'Register shelter failed.' });
    }
  });

  // Verify a shelter (one per user). 3rd verification promotes it to verified
  // and rewards the owner.
  app.post('/api/shelter/:id/verify', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const shelter = findShelter(s, req.params.id);
      if (!shelter) return res.status(404).json({ error: 'Shelter not found.' });
      if (shelter.ownerId === user.id) {
        return res.status(400).json({ error: 'You cannot verify your own shelter.' });
      }
      if ((shelter.verifiedBy || []).includes(user.id)) {
        return res.status(400).json({ error: 'You already verified this shelter.' });
      }
      shelter.verifiedBy = shelter.verifiedBy || [];
      shelter.verifiedBy.push(user.id);
      let ownerReward = 0;
      if (!shelter.verified && shelter.verifiedBy.length >= VERIFIED_THRESHOLD) {
        shelter.verified = true;
        awardCoins(shelter.ownerId, COIN_VERIFIED_SHELTER);
        ownerReward = COIN_VERIFIED_SHELTER;
      }
      saveDatabase(db);
      res.json({ shelter: publicShelter(shelter, user.id), ownerReward });
    } catch (e: any) {
      console.warn('[safe-shelter] verify error:', e?.message || e);
      res.status(500).json({ error: 'Verify failed.' });
    }
  });

  // Toggle "I'm safe here" check-in / check-out.
  app.post('/api/shelter/:id/checkin', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const shelter = findShelter(s, req.params.id);
      if (!shelter) return res.status(404).json({ error: 'Shelter not found.' });

      const idx = (shelter.checkins || []).findIndex((c) => c && c.userId === user.id);
      let action: 'checked-in' | 'checked-out' = 'checked-out';
      let reward = 0;
      const t = now();
      if (idx >= 0) {
        // Toggle off.
        shelter.checkins.splice(idx, 1);
        action = 'checked-out';
      } else {
        shelter.checkins.push({ userId: user.id, name: userName(user), at: t });
        if (shelter.checkins.length > 2000) shelter.checkins = shelter.checkins.slice(-1500);
        action = 'checked-in';
        // One coin reward per shelter per 24h per user.
        const log = s.checkinLog || [];
        const last = [...log].reverse().find(
          (x) => x && x.shelterId === shelter.id && x.userId === user.id
        );
        log.push({ shelterId: shelter.id, userId: user.id, at: t });
        if (log.length > 1000) s.checkinLog = log.slice(-500);
        if (!last || t - last.at >= CHECKIN_REWARD_MS) {
          awardCoins(user.id, COIN_SHELTER_CHECKIN);
          reward = COIN_SHELTER_CHECKIN;
        }
      }
      saveDatabase(db);
      res.json({ shelter: publicShelter(shelter, user.id), action, reward });
    } catch (e: any) {
      console.warn('[safe-shelter] checkin error:', e?.message || e);
      res.status(500).json({ error: 'Check-in failed.' });
    }
  });

  // Owner updates a shelter's open/capacity/amenities/contact note.
  app.post('/api/shelter/:id/update', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const shelter = findShelter(s, req.params.id);
      if (!shelter) return res.status(404).json({ error: 'Shelter not found.' });
      if (shelter.ownerId !== user.id) {
        return res.status(403).json({ error: 'Only the shelter owner can update it.' });
      }
      if (typeof body.open === 'boolean') shelter.open = body.open;
      if (body.capacity !== undefined) {
        shelter.capacity = clamp(Math.floor(Number(body.capacity) || 0), 0, MAX_CAPACITY);
      }
      if (Array.isArray(body.amenities)) {
        shelter.amenities = body.amenities.map(String).filter((a) => AMENITY_OPTIONS.includes(a)).slice(0, AMENITY_OPTIONS.length);
      }
      if (body.contactNote !== undefined) shelter.contactNote = str(body.contactNote, 160) || undefined;
      saveDatabase(db);
      res.json({ shelter: publicShelter(shelter, user.id) });
    } catch (e: any) {
      console.warn('[safe-shelter] update error:', e?.message || e);
      res.status(500).json({ error: 'Update failed.' });
    }
  });

  // Request help at this shelter (explicit SOS-style action; precise location
  // only when the requester opts in).
  app.post('/api/shelter/:id/help', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const shelter = findShelter(s, req.params.id);
      if (!shelter) return res.status(404).json({ error: 'Shelter not found.' });

      const note = str(body.note, MAX_HELP_NOTES);
      if (note.length < 5) {
        return res.status(400).json({ error: 'Describe the help you need (min 5 characters).' });
      }
      const loc = optInLocation(body);
      const req_: ShelterHelpRequest = {
        id: uid('help'),
        shelterId: shelter.id,
        requesterId: user.id,
        requesterName: userName(user),
        note,
        shareLocation: !!loc,
        lat: loc?.lat,
        lng: loc?.lng,
        status: 'open',
        createdAt: now(),
      };
      shelter.helpRequests = shelter.helpRequests || [];
      shelter.helpRequests.unshift(req_);
      if (shelter.helpRequests.length > 200) shelter.helpRequests = shelter.helpRequests.slice(0, 200);
      saveDatabase(db);
      res.json({ request: publicShelter(shelter, user.id).helpRequests.find((h: any) => h.id === req_.id), shelter: publicShelter(shelter, user.id) });
    } catch (e: any) {
      console.warn('[safe-shelter] help error:', e?.message || e);
      res.status(500).json({ error: 'Help request failed.' });
    }
  });

  // Respond to a help request — "I'm on the way". Rewards the responder once.
  app.post('/api/shelter/help/:requestId/respond', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const shelter = (s.shelters || []).find((x) =>
        x && (x.helpRequests || []).some((h) => h && h.id === req.params.requestId)
      );
      if (!shelter) return res.status(404).json({ error: 'Help request not found.' });
      const req_ = (shelter.helpRequests || []).find((h) => h && h.id === req.params.requestId);
      if (!req_) return res.status(404).json({ error: 'Help request not found.' });
      if (req_.requesterId === user.id) {
        return res.status(400).json({ error: 'You cannot respond to your own help request.' });
      }
      if (req_.status !== 'open') {
        return res.status(400).json({ error: 'This help request is already being handled.' });
      }
      req_.status = 'assisting';
      req_.responderId = user.id;
      req_.responderName = userName(user);
      saveDatabase(db);
      awardCoins(user.id, COIN_HELP_RESPOND);
      res.json({ request: publicShelter(shelter, user.id).helpRequests.find((h: any) => h.id === req_.id) });
    } catch (e: any) {
      console.warn('[safe-shelter] respond error:', e?.message || e);
      res.status(500).json({ error: 'Respond failed.' });
    }
  });

  // Resolve a help request (requester or responder).
  app.post('/api/shelter/help/:requestId/resolve', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const shelter = (s.shelters || []).find((x) =>
        x && (x.helpRequests || []).some((h) => h && h.id === req.params.requestId)
      );
      if (!shelter) return res.status(404).json({ error: 'Help request not found.' });
      const req_ = (shelter.helpRequests || []).find((h) => h && h.id === req.params.requestId);
      if (!req_) return res.status(404).json({ error: 'Help request not found.' });
      if (req_.requesterId !== user.id && req_.responderId !== user.id) {
        return res.status(403).json({ error: 'Only the requester or responder can resolve this.' });
      }
      if (req_.status === 'resolved') return res.status(400).json({ error: 'Already resolved.' });
      req_.status = 'resolved';
      req_.resolvedAt = now();
      saveDatabase(db);
      res.json({ request: publicShelter(shelter, user.id).helpRequests.find((h: any) => h.id === req_.id) });
    } catch (e: any) {
      console.warn('[safe-shelter] resolve error:', e?.message || e);
      res.status(500).json({ error: 'Resolve failed.' });
    }
  });

  // Report a fake / unsafe shelter (3 reports hides it).
  app.post('/api/shelter/:id/report', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const shelter = findShelter(s, req.params.id);
      if (!shelter) return res.status(404).json({ error: 'Shelter not found.' });
      shelter.reports = shelter.reports || [];
      shelter.reports.push({
        reason: String(req.body?.reason || 'other').slice(0, 100),
        details: String(req.body?.details || '').slice(0, 400),
        at: now(),
      });
      let hidden = false;
      if (shelter.reports.length >= 3) {
        shelter.open = false;
        hidden = true;
      }
      saveDatabase(db);
      res.json({ ok: true, reportCount: shelter.reports.length, hidden });
    } catch (e: any) {
      console.warn('[safe-shelter] report error:', e?.message || e);
      res.status(500).json({ error: 'Report failed.' });
    }
  });

  // ── DISASTER WATCH ─────────────────────────────────────────────────────────

  // List alerts (active by default, ?scope=all for history).
  app.get('/api/shelter/alerts', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      let alerts = [...(s.alerts || [])].sort((a, b) => b.createdAt - a.createdAt);
      const scope = String(req.query.scope || 'active');
      if (scope !== 'all') alerts = alerts.filter((a) => a.status === 'active');
      const payload = alerts.slice(0, 60).map((a) => ({
        ...publicAlert(a),
        confirmedByMe: (a.confirmedBy || []).includes(user.id),
        isMine: a.createdById === user.id,
      }));
      res.json({ alerts: payload, types: ALERT_TYPES, severities: SEVERITIES });
    } catch (e: any) {
      console.warn('[safe-shelter] alerts error:', e?.message || e);
      res.status(500).json({ error: 'Alerts failed.' });
    }
  });

  // Broadcast a disaster alert (rate-limited: 2 / 15 min). Alerts are
  // fuzzy-area only — precise coordinates are never stored for alerts.
  app.post('/api/shelter/alerts', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureSafeShelter(db);

      const timestamps = (s.alerts || [])
        .filter((a) => a && a.createdById === user.id)
        .map((a) => a.createdAt);
      const rl = isUserRateLimited({ userId: user.id, alertTimestamps: timestamps }, now());
      if (rl.limited) {
        return res.status(429).json({
          error: `You have broadcast several alerts recently. Please wait ${rl.remainingSec}s.`,
        });
      }

      const type: AlertType = ALERT_TYPES.includes(body.type) ? body.type : 'other';
      const severity: AlertSeverity = SEVERITIES.includes(body.severity) ? body.severity : 'watch';
      const areaLabel = str(body.areaLabel, 120);
      const message = str(body.message, 600);
      if (areaLabel.length < 3) return res.status(400).json({ error: 'Area label is required (e.g. "River basin near the bridge").' });
      if (message.length < 10) return res.status(400).json({ error: 'A short message is required (min 10 characters).' });

      const alert: DisasterAlert = {
        id: uid('alert'),
        type,
        severity,
        areaLabel,
        message,
        instructions: str(body.instructions, 400) || undefined,
        createdById: user.id,
        createdByName: userName(user),
        confirmedBy: [],
        confirmed: false,
        status: 'active',
        createdAt: now(),
      };
      s.alerts.unshift(alert);
      if (s.alerts.length > MAX_ALERTS_KEPT) s.alerts = s.alerts.slice(0, MAX_ALERTS_KEPT);
      saveDatabase(db);
      res.json({ alert: { ...publicAlert(alert), confirmedByMe: false, isMine: true } });
    } catch (e: any) {
      console.warn('[safe-shelter] alert create error:', e?.message || e);
      res.status(500).json({ error: 'Broadcast failed.' });
    }
  });

  // Confirm an alert (one per user). The 3rd confirmation promotes it.
  app.post('/api/shelter/alerts/:id/confirm', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const alert = findAlert(s, req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found.' });
      if (alert.createdById === user.id) {
        return res.status(400).json({ error: 'You cannot confirm your own alert.' });
      }
      if (alert.status !== 'active') return res.status(400).json({ error: 'This alert is no longer active.' });
      if ((alert.confirmedBy || []).includes(user.id)) {
        return res.status(400).json({ error: 'You already confirmed this alert.' });
      }
      alert.confirmedBy = alert.confirmedBy || [];
      alert.confirmedBy.push(user.id);
      let promoted = false;
      if (!alert.confirmed && alert.confirmedBy.length >= VERIFIED_THRESHOLD) {
        alert.confirmed = true;
        promoted = true;
      }
      saveDatabase(db);
      awardCoins(user.id, COIN_CONFIRM_ALERT);
      res.json({ alert: publicAlert(alert), promoted });
    } catch (e: any) {
      console.warn('[safe-shelter] alert confirm error:', e?.message || e);
      res.status(500).json({ error: 'Confirm failed.' });
    }
  });

  // Lift an alert (creator or any confirmer) — the danger has passed.
  app.post('/api/shelter/alerts/:id/lift', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const alert = findAlert(s, req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found.' });
      if (alert.createdById !== user.id && !(alert.confirmedBy || []).includes(user.id)) {
        return res.status(403).json({ error: 'Only the creator or a confirmer can lift this alert.' });
      }
      if (alert.status !== 'active') return res.status(400).json({ error: 'This alert is already lifted.' });
      alert.status = 'lifted';
      saveDatabase(db);
      res.json({ alert: publicAlert(alert) });
    } catch (e: any) {
      console.warn('[safe-shelter] alert lift error:', e?.message || e);
      res.status(500).json({ error: 'Lift failed.' });
    }
  });

  // Report a false alarm (3 reports lifts the alert).
  app.post('/api/shelter/alerts/:id/report', requireAuth, (req, res) => {
    try {
      const db = loadDatabase();
      const s = ensureSafeShelter(db);
      const alert = findAlert(s, req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found.' });
      alert.reports = alert.reports || [];
      alert.reports.push({ reason: String(req.body?.reason || 'other').slice(0, 100), at: now() });
      let lifted = false;
      if (alert.reports.length >= 3 && alert.status === 'active') {
        alert.status = 'lifted';
        lifted = true;
      }
      saveDatabase(db);
      res.json({ ok: true, reportCount: alert.reports.length, lifted });
    } catch (e: any) {
      console.warn('[safe-shelter] alert report error:', e?.message || e);
      res.status(500).json({ error: 'Report failed.' });
    }
  });
}
