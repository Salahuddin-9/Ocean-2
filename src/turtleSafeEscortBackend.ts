/**
 * Ocean — Safe Escort & Route Safety backend (Safety & Civic Resilience)
 * ----------------------------------------------------------------------
 * A civic-resilience module that builds ALONGSIDE the emergency community pools
 * (turtleEmergencyPoolsBackend), SafeSOS (turtleSafeSOSBackend — whose "safe walk"
 * is a solo check-in timer), Safety Shield and Safe Shelter. This module covers
 * the part those modules do not: community ESCORT MATCHING and ROUTE SAFETY
 * SCORING — the preventive, "stay safe before something happens" layer.
 *
 *  Three moving parts:
 *   1. Escort requests — a user posts "walking home at ~11pm, want an escort".
 *      The fuzzy start/destination area labels are ALWAYS broadcast. Precise
 *      start/destination coords are attached ONLY when the user ticks the opt-in
 *      on that tap (`shareLocation: true`) and are revealed ONLY to the matched
 *      escort after an offer is accepted. An optional contact line is stored on
 *      the request and revealed only to the matched escort at that point.
 *   2. Escort directory — a user EXPLICITLY registers as a community escort
 *      (fuzzy area + availability). Fuzzy area is public; the escort's optional
 *      contact line is revealed only to the requester after they accept the
 *      escort's offer. Escorts can opt out at any time.
 *   3. Route safety ratings — anyone rates a fuzzy route/area (1-5 stars + tags
 *      like "well lit" / "isolated" / "cameras") to build a community safety
 *      score that helps people choose a safer route. Ratings are area-label only
 *      — NEVER precise coordinates.
 *
 *  Safety coins (community.json balances via turtleCommunityBackend.addBalance):
 *   +10 first-time escort registration, +15 to the ESCORT when a request they
 *   matched completes, +5 per route rating (once per area per user). Rewards flow
 *   to helpers — never to the requester (no incentive to post fake needs).
 *
 *  Privacy guarantees (rule 4):
 *   - Escort registration and route ratings are explicit user actions.
 *   - Location is shared ONLY via an explicit per-press opt-in.
 *   - Precise coords / contact lines are NEVER in list views; on detail they are
 *     revealed only to the requester and the matched escort.
 *   - No home address is stored or broadcast anywhere.
 *
 *  Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 *  `db.safeEscort` (idempotent ensure, defensive `?? []` reads). No base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited, SAFETY_DISCLAIMERS } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscortKind = 'walk' | 'ride' | 'wait' | 'companion';
export type EscortAvailability = 'anytime' | 'evenings' | 'nights' | 'weekends';
export type EscortRequestStatus = 'open' | 'matched' | 'completed' | 'cancelled' | 'expired' | 'suppressed';

export interface EscortProfile {
  id: string;
  userId: string;
  userName: string;
  /** Fuzzy area where they offer escort help — NEVER precise coordinates. */
  area: string;
  availability: EscortAvailability;
  note: string;
  /** Optional safe contact line (e.g. @username). Revealed only after an offer
   *  is accepted — NEVER in directory lists. */
  contactLine?: string;
  active: boolean;
  completedCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface EscortOffer {
  id: string;
  requestId: string;
  escortId: string;
  escortName: string;
  escortArea: string;
  note: string;
  status: 'offered' | 'accepted' | 'withdrawn' | 'declined';
  createdAt: number;
}

export interface EscortRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  kind: EscortKind;
  direction: string;
  startArea: string;
  destArea?: string;
  note: string;
  when: string;
  windowMinutes: number;
  status: EscortRequestStatus;
  /** Precise start point — attached only on explicit opt-in. */
  shareLocation: boolean;
  startLat?: number;
  startLng?: number;
  destLat?: number;
  destLng?: number;
  /** Optional requester contact line — revealed to the matched escort ONLY. */
  contactLine?: string;
  matchedOfferId?: string;
  matchedEscortId?: string;
  matchedEscortName?: string;
  completedAt?: number;
  cancelledAt?: number;
  reports: { reason: string; details: string; by: string; at: number }[];
  createdAt: number;
  expiresAt: number;
}

export interface RouteRating {
  id: string;
  raterId: string;
  raterName: string;
  /** Fuzzy route label — e.g. "Market Street" or "Gulshan 2 to Banani". */
  areaLabel: string;
  when: string;
  score: number; // 1-5
  tags: string[];
  comment: string;
  createdAt: number;
}

interface SafeEscortState {
  escorts: EscortProfile[];
  requests: EscortRequest[];
  offers: EscortOffer[];
  ratings: RouteRating[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KINDS: EscortKind[] = ['walk', 'ride', 'wait', 'companion'];
const KIND_LABELS: Record<EscortKind, string> = {
  walk: 'Walk home',
  ride: 'Shared ride / rickshaw',
  wait: 'Wait with me',
  companion: 'Errand companion',
};

const AVAILABILITIES: EscortAvailability[] = ['anytime', 'evenings', 'nights', 'weekends'];

const RATING_TAGS = [
  'well_lit', 'dark', 'busy', 'isolated', 'cameras', 'police_patrol',
  'stray_animals', 'construction', 'public_transport', 'no_footpath',
];

const COINS_REGISTER_ESCORT = 10; // first-time escort registration
const COINS_COMPLETE = 15;        // paid to the ESCORT when a matched request completes
const COINS_RATING = 5;           // per route rating (once per area per user)

const MAX_REQUESTS_PER_WINDOW = 2;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_OFFERS_PER_WINDOW = 5;
const OFFER_WINDOW_MS = 60 * 60 * 1000;
const REQUEST_DEFAULT_WINDOW_MIN = 120;
const REQUEST_MIN_WINDOW_MIN = 30;
const REQUEST_MAX_WINDOW_MIN = 24 * 60;
const MAX_REQUESTS_KEPT = 300;
const MAX_RATINGS_KEPT = 500;
const SUPPRESS_AFTER_REPORTS = 3;

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

function sanitizeKind(v: unknown): EscortKind {
  const s = String(v ?? '').trim().toLowerCase();
  return KINDS.includes(s as EscortKind) ? (s as EscortKind) : 'walk';
}

function sanitizeAvailability(v: unknown): EscortAvailability {
  const s = String(v ?? '').trim().toLowerCase();
  return AVAILABILITIES.includes(s as EscortAvailability) ? (s as EscortAvailability) : 'anytime';
}

function isCoord(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Attach precise GPS only on explicit opt-in with valid finite coords. */
function optInLocation(body: any): { lat: number; lng: number } | undefined {
  if (!body || body.shareLocation !== true) return undefined;
  if (!isCoord(body.lat) || !isCoord(body.lng)) return undefined;
  const lat = round6(body.lat);
  const lng = round6(body.lng);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function userLabel(u: any): string {
  return String(u?.name || u?.username || 'User');
}

/** Idempotent ensure of db.safeEscort — safe to run on every load. */
function ensureSafeEscort(db: any): SafeEscortState {
  if (!db.safeEscort || typeof db.safeEscort !== 'object' || Array.isArray(db.safeEscort)) {
    db.safeEscort = {};
  }
  const s = db.safeEscort;
  if (!Array.isArray(s.escorts)) s.escorts = [];
  if (!Array.isArray(s.requests)) s.requests = [];
  if (!Array.isArray(s.offers)) s.offers = [];
  if (!Array.isArray(s.ratings)) s.ratings = [];
  return s;
}

/** Deterministic lazy sweep (no cron): open requests past their window become 'expired'. */
function sweepExpired(s: SafeEscortState): boolean {
  const t = now();
  let changed = false;
  for (const r of s.requests) {
    if (r && r.status === 'open' && r.expiresAt && r.expiresAt < t) {
      r.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

function publicEscort(e: EscortProfile): any {
  return {
    id: e.id,
    userId: e.userId,
    userName: e.userName,
    area: e.area,
    availability: e.availability,
    note: e.note,
    active: e.active,
    completedCount: e.completedCount,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    isMe: false,
  };
}

function publicOffer(o: EscortOffer): any {
  return {
    id: o.id,
    requestId: o.requestId,
    escortId: o.escortId,
    escortName: o.escortName,
    escortArea: o.escortArea,
    note: o.note,
    status: o.status,
    createdAt: o.createdAt,
  };
}

function offersFor(requestId: string, s: SafeEscortState): any[] {
  return (s.offers || [])
    .filter((o) => o && o.requestId === requestId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicOffer);
}

/**
 * Request as seen by `viewerId`. Precise coords + contact lines are stripped
 * unless the viewer is the requester or the matched escort (post-acceptance).
 */
function publicRequest(r: EscortRequest, viewerId: string, s: SafeEscortState): any {
  const out: any = { ...r };
  const isRequester = r.requesterId === viewerId;
  const isMatchedEscort =
    !!r.matchedEscortId && r.matchedEscortId === viewerId && r.status === 'matched';

  const allowPrecise = isRequester || isMatchedEscort;
  if (!allowPrecise) {
    out.shareLocation = false;
    out.startLat = undefined;
    out.startLng = undefined;
    out.destLat = undefined;
    out.destLng = undefined;
  }
  if (!isRequester && !isMatchedEscort) {
    out.contactLine = undefined;
  }
  // Reporters stay anonymous — expose only a count.
  out.reports = undefined;
  out.reportCount = (r.reports || []).length;
  out.isMine = isRequester;
  out.offerCount = (s.offers || []).filter((o) => o && o.requestId === r.id).length;
  out.myOffer =
    (s.offers || []).find((o) => o && o.requestId === r.id && o.escortId === viewerId) || null;
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
    console.warn('[escort] coin award error:', e?.message || e);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerSafeEscortRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/escort/meta — option lists + disclaimer (guest-safe; powers forms).
  app.get('/api/escort/meta', (req, res) => {
    const viewer = getRequestUser(req);
    res.json({
      kinds: KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] })),
      availabilities: AVAILABILITIES,
      ratingTags: RATING_TAGS,
      disclaimer: SAFETY_DISCLAIMERS.GENERAL,
      coinRewards: { registerEscort: COINS_REGISTER_ESCORT, complete: COINS_COMPLETE, rating: COINS_RATING },
      viewerId: viewer?.id ?? null,
    });
  });

  // GET /api/escort/status — my escort profile, my requests, balance. requireAuth.
  app.get('/api/escort/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const changed = sweepExpired(s);

    const myProfile = (s.escorts || []).find((e) => e && e.userId === me.id && e.active) || null;
    const myRequests = (s.requests || []).filter((r) => r && r.requesterId === me.id);
    const myOffers = (s.offers || []).filter((o) => o && o.escortId === me.id);
    const openCount = (s.requests || []).filter((r) => r && r.status === 'open').length;

    let balance = 0;
    try {
      const trust = Number(me?.trustScore ?? me?.profile?.trustScore ?? 0);
      balance = trustPointsForUser(loadCommunity(), me.id, trust);
    } catch (e: any) {
      console.warn('[escort] status balance error:', e?.message || e);
    }

    if (changed) saveDatabase(db);
    res.json({
      me: { id: me.id, name: userLabel(me) },
      profile: myProfile ? publicEscort(myProfile) : null,
      requestCount: myRequests.length,
      openCount,
      offerCount: myOffers.length,
      balance,
    });
  });

  // POST /api/escort/escort — register / update my escort profile (explicit opt-in).
  app.post('/api/escort/escort', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const area = str(body.area, 120);
    if (area.length < 2) {
      return res.status(400).json({ error: 'An approximate area is required (e.g. North Beach).' });
    }

    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const t = now();
    let profile = (s.escorts || []).find((e) => e && e.userId === me.id);
    const isNew = !profile || !profile.active;

    const contactLine = str(body.contactLine, 200);
    if (!profile) {
      profile = {
        id: uid('escort'),
        userId: me.id,
        userName: userLabel(me),
        area,
        availability: sanitizeAvailability(body.availability),
        note: str(body.note, 300),
        contactLine: contactLine || undefined,
        active: true,
        completedCount: 0,
        createdAt: t,
        updatedAt: t,
      };
      s.escorts.push(profile);
    } else {
      profile.userName = userLabel(me);
      profile.area = area;
      profile.availability = sanitizeAvailability(body.availability);
      profile.note = str(body.note, 300);
      profile.contactLine = contactLine || undefined;
      profile.active = true;
      profile.updatedAt = t;
    }

    saveDatabase(db);
    let coins = 0;
    if (isNew) coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_REGISTER_ESCORT);
    res.json({ profile: publicEscort(profile), coins });
  });

  // POST /api/escort/escort/optout — remove myself from the directory (explicit).
  app.post('/api/escort/escort/optout', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const profile = (s.escorts || []).find((e) => e && e.userId === me.id);
    if (!profile) return res.status(404).json({ error: 'You are not registered as an escort.' });
    profile.active = false;
    profile.updatedAt = now();
    saveDatabase(db);
    res.json({ success: true });
  });

  // GET /api/escort/escorts — public escort directory (filter ?area=&availability=).
  app.get('/api/escort/escorts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const area = String(req.query.area || '').trim().toLowerCase();
    const availability = sanitizeAvailability(String(req.query.availability || ''));

    let escorts = (s.escorts || []).filter((e) => e && e.active);
    if (area) escorts = escorts.filter((e) => e.area.toLowerCase().includes(area));
    if (availability) escorts = escorts.filter((e) => e.availability === availability);
    escorts = [...escorts].sort((a, b) => b.completedCount - a.completedCount || b.updatedAt - a.updatedAt);

    res.json({
      escorts: escorts.map((e) => ({ ...publicEscort(e), isMe: e.userId === me.id })),
      count: escorts.length,
    });
  });

  // POST /api/escort/requests — post an escort request (rate-limited, location opt-in).
  app.post('/api/escort/requests', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const direction = str(body.direction, 160);
    const startArea = str(body.startArea, 120);
    const note = str(body.note, 1000);
    if (direction.length < 3) {
      return res.status(400).json({ error: 'Describe the direction (e.g. "home from work").' });
    }
    if (startArea.length < 2) {
      return res.status(400).json({ error: 'An approximate start area is required.' });
    }
    if (note.length < 5) {
      return res.status(400).json({ error: 'Add a short note (at least 5 characters).' });
    }

    const db = loadDatabase();
    const s = ensureSafeEscort(db);

    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: (s.requests || [])
          .filter((r) => r && r.requesterId === me.id)
          .map((r) => r.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res
        .status(429)
        .json({ error: `You've posted escort requests recently. Please wait ${rl.remainingSec}s.` });
    }

    const t = now();
    const windowMinutes = clamp(
      Math.round(Number(body.windowMinutes) || REQUEST_DEFAULT_WINDOW_MIN),
      REQUEST_MIN_WINDOW_MIN,
      REQUEST_MAX_WINDOW_MIN
    );
    const startLoc = optInLocation(body);
    // Destination precise coords are an independent opt-in with their own values.
    const destLoc =
      body.destShareLocation === true && isCoord(body.destLat) && isCoord(body.destLng)
        ? optInLocation({ shareLocation: true, lat: body.destLat, lng: body.destLng })
        : undefined;

    const request: EscortRequest = {
      id: uid('esc'),
      requesterId: me.id,
      requesterName: userLabel(me),
      kind: sanitizeKind(body.kind),
      direction,
      startArea,
      destArea: str(body.destArea, 120) || undefined,
      note,
      when: str(body.when, 120),
      windowMinutes,
      status: 'open',
      shareLocation: !!startLoc,
      ...(startLoc ? { startLat: startLoc.lat, startLng: startLoc.lng } : {}),
      ...(destLoc ? { destLat: destLoc.lat, destLng: destLoc.lng } : {}),
      contactLine: str(body.contactLine, 200) || undefined,
      reports: [],
      createdAt: t,
      expiresAt: t + windowMinutes * 60000,
    };
    s.requests.unshift(request);
    if (s.requests.length > MAX_REQUESTS_KEPT) s.requests = s.requests.slice(0, MAX_REQUESTS_KEPT);
    saveDatabase(db);
    res.json({ request: publicRequest(request, me.id, s) });
  });

  // GET /api/escort/requests — list (scope=open|mine|completed, ?area=).
  app.get('/api/escort/requests', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const changed = sweepExpired(s);

    const scope = String(req.query.scope || 'open');
    const area = String(req.query.area || '').trim().toLowerCase();
    let list = (s.requests || []).filter((r) => r && r.status !== 'suppressed');
    if (scope === 'mine') {
      list = list.filter(
        (r) => r.requesterId === me.id || (r.matchedEscortId && r.matchedEscortId === me.id)
      );
    } else if (scope === 'completed') {
      list = list.filter((r) => r.status === 'completed' || r.status === 'cancelled' || r.status === 'expired');
    } else {
      list = list.filter((r) => r.status === 'open');
    }
    if (area) {
      list = list.filter(
        (r) =>
          r.startArea.toLowerCase().includes(area) ||
          String(r.destArea || '').toLowerCase().includes(area)
      );
    }
    list = [...list].sort((a, b) => b.createdAt - a.createdAt);

    if (changed) saveDatabase(db);
    res.json({
      requests: list.map((r) => publicRequest(r, me.id, s)),
      count: list.length,
    });
  });

  // GET /api/escort/requests/:id — detail. Precise coords/contact only for the
  // requester and the matched escort; requester sees accepted escort's contact.
  app.get('/api/escort/requests/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const changed = sweepExpired(s);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (changed) saveDatabase(db);

    let matchedEscortContact: string | undefined;
    if (r.requesterId === me.id && r.matchedOfferId) {
      const acc = (s.offers || []).find((o) => o && o.id === r.matchedOfferId);
      const escort = acc ? (s.escorts || []).find((e) => e && e.userId === acc.escortId) : null;
      matchedEscortContact = escort?.contactLine;
    }

    res.json({
      request: publicRequest(r, me.id, s),
      offers: offersFor(r.id, s),
      matchedEscortContact,
      canOffer: r.requesterId !== me.id && r.status === 'open',
    });
  });

  // POST /api/escort/requests/:id/offer — a registered escort offers to help.
  app.post('/api/escort/requests/:id/offer', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.requesterId === me.id) {
      return res.status(400).json({ error: 'You cannot offer on your own request.' });
    }
    if (r.status !== 'open') {
      return res.status(400).json({ error: 'This request is no longer open.' });
    }
    const profile = (s.escorts || []).find((e) => e && e.userId === me.id && e.active);
    if (!profile) {
      return res.status(400).json({ error: 'Register as an escort first (Me tab) before offering.' });
    }
    const existing = (s.offers || []).find(
      (o) => o && o.requestId === r.id && o.escortId === me.id && (o.status === 'offered' || o.status === 'accepted')
    );
    if (existing) {
      return res.status(400).json({ error: 'You already offered on this request.' });
    }
    // Offer rate limit: 5 / hour per escort.
    const myRecent = (s.offers || []).filter(
      (o) => o && o.escortId === me.id && now() - (o.createdAt || 0) < OFFER_WINDOW_MS
    ).length;
    if (myRecent >= MAX_OFFERS_PER_WINDOW) {
      return res.status(429).json({ error: 'You have offered on several requests recently. Please wait a while.' });
    }
    const note = str(req.body?.note, 300);
    if (note.length < 5) {
      return res.status(400).json({ error: 'Add a short message (at least 5 characters).' });
    }

    const offer: EscortOffer = {
      id: uid('offer'),
      requestId: r.id,
      escortId: me.id,
      escortName: profile.userName,
      escortArea: profile.area,
      note,
      status: 'offered',
      createdAt: now(),
    };
    s.offers.push(offer);
    saveDatabase(db);
    res.json({ offer: publicOffer(offer) });
  });

  // POST /api/escort/requests/:id/accept — requester accepts an escort's offer;
  // this MATCHES them and reveals precise coords + the escort's contact line.
  app.post('/api/escort/requests/:id/accept', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.requesterId !== me.id) {
      return res.status(403).json({ error: 'Only the requester can accept an escort offer.' });
    }
    if (r.status !== 'open') {
      return res.status(400).json({ error: 'This request is no longer open.' });
    }
    if (r.matchedOfferId) {
      return res.status(400).json({ error: 'You already accepted an offer on this request.' });
    }
    const offerId = str(req.body?.offerId, 120);
    const offer = (s.offers || []).find((o) => o && o.id === offerId && o.requestId === r.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.status !== 'offered') {
      return res.status(400).json({ error: 'This offer is not available anymore.' });
    }

    offer.status = 'accepted';
    r.status = 'matched';
    r.matchedOfferId = offer.id;
    r.matchedEscortId = offer.escortId;
    r.matchedEscortName = offer.escortName;
    // The matched escort's contact line is revealed to the requester now.
    const escort = (s.escorts || []).find((e) => e && e.userId === offer.escortId);
    saveDatabase(db);

    res.json({
      request: publicRequest(r, me.id, s),
      matchedEscortContact: escort?.contactLine,
      requesterContactLine: r.contactLine,
    });
  });

  // POST /api/escort/requests/:id/complete — requester or matched escort marks
  // the escort done; the ESCORT earns safety coins.
  app.post('/api/escort/requests/:id/complete', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.requesterId !== me.id && r.matchedEscortId !== me.id) {
      return res.status(403).json({ error: 'Only the requester or the matched escort can complete this.' });
    }
    if (r.status !== 'matched') {
      return res.status(400).json({ error: 'This request is not matched yet.' });
    }
    r.status = 'completed';
    r.completedAt = now();
    saveDatabase(db);

    let coins = 0;
    if (r.matchedEscortId) {
      const profile = (s.escorts || []).find((e) => e && e.userId === r.matchedEscortId);
      if (profile) {
        profile.completedCount = (profile.completedCount || 0) + 1;
        profile.updatedAt = now();
        coins = awardCoins(loadCommunity, saveCommunity, profile.userId, COINS_COMPLETE);
      }
      saveDatabase(db);
    }
    res.json({ request: publicRequest(r, me.id, s), escortCoins: coins });
  });

  // POST /api/escort/requests/:id/withdraw — escort withdraws their offer.
  app.post('/api/escort/requests/:id/withdraw', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const offer = (s.offers || []).find(
      (o) => o && o.requestId === req.params.id && o.escortId === me.id
    );
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.status !== 'offered') {
      return res.status(400).json({ error: 'This offer is already decided.' });
    }
    offer.status = 'withdrawn';
    saveDatabase(db);
    res.json({ success: true });
  });

  // POST /api/escort/requests/:id/cancel — requester cancels their request.
  app.post('/api/escort/requests/:id/cancel', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.requesterId !== me.id) {
      return res.status(403).json({ error: 'Only the requester can cancel this request.' });
    }
    if (r.status === 'completed' || r.status === 'cancelled') {
      return res.status(400).json({ error: 'This request is already closed.' });
    }
    r.status = 'cancelled';
    r.cancelledAt = now();
    saveDatabase(db);
    res.json({ request: publicRequest(r, me.id, s) });
  });

  // POST /api/escort/requests/:id/report — fake/spam requests are suppressed
  // after 3 unique reports (mirrors emergency pool report pattern).
  app.post('/api/escort/requests/:id/report', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if ((r.reports || []).some((x) => x.by === me.id)) {
      return res.status(400).json({ error: 'You already reported this request.' });
    }
    r.reports = r.reports || [];
    r.reports.push({
      reason: str(req.body?.reason, 100) || 'other',
      details: str(req.body?.details, 300),
      by: me.id,
      at: now(),
    });
    if (r.reports.length >= SUPPRESS_AFTER_REPORTS) r.status = 'suppressed';
    saveDatabase(db);
    res.json({ ok: true, reportCount: r.reports.length });
  });

  // GET /api/escort/routes — route ratings list (?area=).
  app.get('/api/escort/routes', requireAuth, (req, res) => {
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const area = String(req.query.area || '').trim().toLowerCase();
    let ratings = (s.ratings || []).filter((rt) => rt && rt.score >= 1 && rt.score <= 5);
    if (area) ratings = ratings.filter((rt) => rt.areaLabel.toLowerCase().includes(area));
    ratings = [...ratings].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
    res.json({ ratings: ratings.map((rt) => ({ ...rt })), count: ratings.length });
  });

  // POST /api/escort/routes — add a route safety rating (once per area per user).
  app.post('/api/escort/routes', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const areaLabel = str(body.areaLabel, 120);
    const score = clamp(Math.round(Number(body.score) || 3), 1, 5);
    if (areaLabel.length < 2) {
      return res.status(400).json({ error: 'A route/area label is required (e.g. Market Street).' });
    }

    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const existing = (s.ratings || []).find(
      (rt) => rt && rt.raterId === me.id && rt.areaLabel.toLowerCase() === areaLabel.toLowerCase()
    );
    const isFirst = !existing;
    if (existing) {
      existing.when = str(body.when, 40);
      existing.score = score;
      existing.tags = Array.isArray(body.tags)
        ? (body.tags as string[]).map(String).slice(0, 8).filter((tg) => RATING_TAGS.includes(tg))
        : [];
      existing.comment = str(body.comment, 300);
      existing.createdAt = now();
      saveDatabase(db);
      return res.json({ rating: { ...existing }, coins: 0, updated: true });
    }

    const rating: RouteRating = {
      id: uid('rtg'),
      raterId: me.id,
      raterName: userLabel(me),
      areaLabel,
      when: str(body.when, 40),
      score,
      tags: Array.isArray(body.tags)
        ? (body.tags as string[]).map(String).slice(0, 8).filter((tg) => RATING_TAGS.includes(tg))
        : [],
      comment: str(body.comment, 300),
      createdAt: now(),
    };
    s.ratings.push(rating);
    if (s.ratings.length > MAX_RATINGS_KEPT) s.ratings = s.ratings.slice(-MAX_RATINGS_KEPT);
    saveDatabase(db);
    const coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_RATING);
    res.json({ rating: { ...rating }, coins });
  });

  // GET /api/escort/coverage — aggregate safety score per area (helps route choice).
  app.get('/api/escort/coverage', requireAuth, (req, res) => {
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const byArea = new Map<string, { scores: number[]; tags: Record<string, number> }>();
    (s.ratings || []).forEach((rt: any) => {
      if (!rt || typeof rt.score !== 'number') return;
      const key = String(rt.areaLabel || 'Unknown').toLowerCase();
      if (!byArea.has(key)) byArea.set(key, { scores: [], tags: {} });
      const agg = byArea.get(key)!;
      agg.scores.push(clamp(rt.score, 1, 5));
      (rt.tags || []).forEach((tg: string) => {
        agg.tags[tg] = (agg.tags[tg] || 0) + 1;
      });
    });
    const coverage = Array.from(byArea.entries())
      .map(([key, agg]) => {
        const sum = agg.scores.reduce((a, b) => a + b, 0);
        const avg = sum / agg.scores.length;
        const topTags = Object.entries(agg.tags)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([t]) => t);
        return {
          areaLabel: key,
          ratingCount: agg.scores.length,
          average: Math.round(avg * 10) / 10,
          band: avg >= 4 ? 'safe' : avg >= 2.5 ? 'caution' : 'unsafe',
          topTags,
        };
      })
      .sort((a, b) => b.ratingCount - a.ratingCount);
    res.json({ coverage: coverage.slice(0, 100), count: coverage.length });
  });

  // POST /api/safety/route — Safe Route Navigator (feature #124): given a
  // start→destination pair (fuzzy labels or coords), returns a safety score
  // computed from community route ratings. Degrades gracefully to a heuristic
  // baseline when the route has no ratings yet.
  app.post('/api/safety/route', requireAuth, (req, res) => {
    const body = req.body || {};
    const db = loadDatabase();
    const s = ensureSafeEscort(db);
    const ratings = (s.ratings || []).filter((rt: any) => rt && rt.score >= 1 && rt.score <= 5);

    const startLabel = str(body.startLabel, 120);
    const destLabel = str(body.destLabel, 120);
    if (!startLabel && !destLabel) {
      return res.status(400).json({ error: 'Provide a startLabel and/or destLabel (e.g. Gulshan 2, Banani).' });
    }

    // Find ratings that touch either end of the route (fuzzy label match).
    const query = `${startLabel} ${destLabel}`.toLowerCase();
    const matched = ratings.filter((rt: any) => {
      const label = String(rt.areaLabel || '').toLowerCase();
      return (
        (startLabel && label.includes(startLabel.toLowerCase())) ||
        (destLabel && label.includes(destLabel.toLowerCase())) ||
        (startLabel && startLabel.toLowerCase().includes(label)) ||
        (destLabel && destLabel.toLowerCase().includes(label))
      );
    });

    const NEG_TAGS = ['dark', 'isolated', 'construction', 'no_footpath', 'stray_animals'];
    const POS_TAGS = ['well_lit', 'busy', 'cameras', 'police_patrol', 'public_transport'];

    let avg = 3; // neutral heuristic baseline when unrated
    let confidence = 0;
    let topTags: string[] = [];
    if (matched.length > 0) {
      const sum = matched.reduce((a: number, b: any) => a + clamp(b.score, 1, 5), 0);
      avg = sum / matched.length;
      confidence = Math.min(1, matched.length / 10);
      const tagCounts: Record<string, number> = {};
      matched.forEach((rt: any) =>
        (rt.tags || []).forEach((tg: string) => {
          tagCounts[tg] = (tagCounts[tg] || 0) + 1;
        })
      );
      topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    }

    // Blend in tag signals when ratings exist; final score 0-100.
    let tagAdjust = 0;
    if (topTags.length > 0) {
      const neg = topTags.filter((t) => NEG_TAGS.includes(t)).length;
      const pos = topTags.filter((t) => POS_TAGS.includes(t)).length;
      tagAdjust = (pos - neg) * 2;
    }
    const raw = avg * 20 + tagAdjust;
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    const band = score >= 75 ? 'safe' : score >= 45 ? 'caution' : 'unsafe';
    const tip =
      band === 'safe'
        ? 'This route is rated safe by the community. Prefer well-lit, busy streets.'
        : band === 'caution'
          ? 'Mixed ratings — travel with a companion or during daylight, and avoid isolated stretches.'
          : 'This route has low safety ratings. Consider an alternative or arrange an escort.';

    res.json({
      startLabel: startLabel || destLabel,
      destLabel: destLabel || startLabel,
      safetyScore: score,
      band,
      confidence: Math.round(confidence * 100),
      ratingCount: matched.length,
      averageRating: matched.length ? Math.round(avg * 10) / 10 : null,
      topTags,
      tip,
    });
  });
}
