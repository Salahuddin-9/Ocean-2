/**
 * Ocean — Blood Donor Registry backend (FEATURE 119 — Safety & Civic Resilience)
 * ------------------------------------------------------------------------------
 * A voluntary, privacy-first blood-donor directory + blood-request broadcast feed
 * that extends the Emergency Pools system (turtleEmergencyPoolsBackend's BLOOD_NEEDED
 * category). It does NOT duplicate SOS — it is a standalone registry and request feed.
 *
 *  Three moving parts:
 *   1. Donor registry — a user EXPLICITLY registers as a donor (self-reported blood
 *      group, fuzzy area label, availability, optional clinic verification reference
 *      code, optional contact line). `isVerified` is derived from the presence of a
 *      verification reference code. A donor can opt out at any time (removed from the
 *      directory). Contact info is NEVER shown in directory lists.
 *   2. Blood requests — one-tap broadcast of a blood-needed request. The fuzzy `area`
 *      label is always broadcast; precise GPS is attached ONLY when the user opts in
 *      on that tap (`shareLocation: true`) and is only revealed to the requester and
 *      to donors who offered to help. Posting requires accepting the medical
 *      disclaimer (SAFETY_DISCLAIMERS.BLOOD_NEEDED) and is rate-limited (2 / 15 min,
 *      mirroring turtleEmergencyPools).
 *   3. Offer → accept — donors offer to donate on a request; the requester accepts an
 *      offer, which reveals the donor's contact line to the requester ONLY at that
 *      point. Fake/commercial requests are suppressed after 3 reports.
 *
 *  Safety coins (community.json wallet via turtleCommunityBackend.addBalance):
 *   +25 registering as a donor (first time), +15 offering to donate (once per
 *   request per donor), +50 when a donor's offer is accepted by a requester.
 *   Rewards flow to helpers — never to the requester (no incentive to post fake need).
 *
 *  Persistence: global db via ctx.loadDatabase()/saveDatabase() under `db.bloodDonor`
 *  (idempotent ensure, defensive reads via `?? []`). Never stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited, SAFETY_DISCLAIMERS } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'UNKNOWN';
export type DonorAvailability = 'always' | 'weekends' | 'only_emergency';
export type BloodRequestStatus = 'active' | 'resolved' | 'expired' | 'suppressed';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export interface DonorProfile {
  id: string;
  userId: string;
  userName: string;
  bloodGroup: BloodGroup;
  /** Fuzzy area label — NEVER precise coordinates. */
  area: string;
  availability: DonorAvailability;
  note: string;
  /** True when the donor supplied a clinic/hospital verification reference code. */
  isVerified: boolean;
  verificationReferenceCode?: string;
  lastDonatedAt?: number;
  donationCount: number;
  /** Optional safe contact line (e.g. @username). NEVER shown in directory lists;
   *  only revealed to a requester after they accept this donor's offer. */
  contactLine?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BloodOffer {
  id: string;
  requestId: string;
  donorId: string;
  donorName: string;
  donorBloodGroup: BloodGroup;
  donorArea: string;
  message: string;
  status: 'offered' | 'accepted' | 'withdrawn' | 'declined';
  createdAt: number;
  awarded: boolean;
}

export interface BloodRequest {
  id: string;
  creatorId: string;
  creatorName: string;
  bloodGroup: BloodGroup;
  urgency: Urgency;
  /** Fuzzy area label — always broadcast. */
  area: string;
  hospital?: string;
  message: string;
  referenceCode?: string;
  status: BloodRequestStatus;
  /** True only when the creator explicitly opted in on this tap. */
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  resolvedById?: string;
  acceptedOfferId?: string;
  reports: { reason: string; details: string; by: string; at: number }[];
}

interface BloodDonorState {
  donors: DonorProfile[];
  requests: BloodRequest[];
  offers: BloodOffer[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'];
const AVAILABILITIES: DonorAvailability[] = ['always', 'weekends', 'only_emergency'];
const URGENCIES: Urgency[] = ['low', 'medium', 'high', 'critical'];

const COINS_REGISTER = 25; // first-time donor registration
const COINS_OFFER = 15;    // offering to donate (once per request per donor)
const COINS_ACCEPT = 50;   // donor whose offer is accepted

/** Request lifetime by urgency — critical need expires fastest. */
const REQUEST_EXPIRY_MS: Record<Urgency, number> = {
  critical: 6 * 60 * 60 * 1000,
  high: 24 * 60 * 60 * 1000,
  medium: 48 * 60 * 60 * 1000,
  low: 72 * 60 * 60 * 1000,
};

const MAX_REQUESTS_KEPT = 300;
const MAX_OFFERS_KEPT = 600;

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

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function validBloodGroup(v: unknown): BloodGroup | null {
  const s = String(v ?? '').trim().toUpperCase();
  return BLOOD_GROUPS.includes(s as BloodGroup) ? (s as BloodGroup) : null;
}

function sanitizeAvailability(v: unknown): DonorAvailability {
  const s = String(v ?? '').trim().toLowerCase();
  return AVAILABILITIES.includes(s as DonorAvailability) ? (s as DonorAvailability) : 'always';
}

function sanitizeUrgency(v: unknown): Urgency {
  const s = String(v ?? '').trim().toLowerCase();
  return URGENCIES.includes(s as Urgency) ? (s as Urgency) : 'medium';
}

/** Idempotent ensure of db.bloodDonor — safe to run on every load. */
function ensureBloodDonor(db: any): BloodDonorState {
  if (!db.bloodDonor || typeof db.bloodDonor !== 'object' || Array.isArray(db.bloodDonor)) {
    db.bloodDonor = {};
  }
  const s = db.bloodDonor;
  if (!Array.isArray(s.donors)) s.donors = [];
  if (!Array.isArray(s.requests)) s.requests = [];
  if (!Array.isArray(s.offers)) s.offers = [];
  return s;
}

/** Deterministic lazy sweep (no cron): overdue active requests become 'expired'. */
function sweepExpired(s: BloodDonorState): boolean {
  const t = now();
  let changed = false;
  for (const r of s.requests) {
    if (r && r.status === 'active' && r.expiresAt && r.expiresAt < t) {
      r.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

/** Award safety coins into the community.json wallet. */
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
    console.warn('[blood] coin award error:', e?.message || e);
    return 0;
  }
}

/** Public donor record — contact + verification code are STRIPPED (privacy). */
function publicDonor(d: DonorProfile): any {
  return {
    id: d.id,
    userId: d.userId,
    userName: d.userName,
    bloodGroup: d.bloodGroup,
    area: d.area,
    availability: d.availability,
    note: d.note,
    isVerified: d.isVerified,
    lastDonatedAt: d.lastDonatedAt,
    donationCount: d.donationCount,
    active: d.active,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    isMe: false,
  };
}

function publicOffer(o: BloodOffer): any {
  return {
    id: o.id,
    requestId: o.requestId,
    donorId: o.donorId,
    donorName: o.donorName,
    donorBloodGroup: o.donorBloodGroup,
    donorArea: o.donorArea,
    message: o.message,
    status: o.status,
    createdAt: o.createdAt,
  };
}

function offersFor(requestId: string, s: BloodDonorState): any[] {
  return (s.offers || [])
    .filter((o) => o && o.requestId === requestId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicOffer);
}

/**
 * Request as seen by `viewerId`. Precise GPS is stripped unless the viewer is the
 * creator or a donor who offered (a responder, mirroring the acknowledged-responder
 * reveal in the safety modules).
 */
function publicRequest(r: BloodRequest, viewerId: string, s: BloodDonorState): any {
  const out: any = { ...r };
  const allowPrecise =
    r.creatorId === viewerId ||
    (s.offers || []).some(
      (o) =>
        o &&
        o.requestId === r.id &&
        o.donorId === viewerId &&
        (o.status === 'offered' || o.status === 'accepted')
    );
  if (!allowPrecise) {
    out.lat = undefined;
    out.lng = undefined;
    out.shareLocation = false;
  }
  out.offers = offersFor(r.id, s);
  out.isMine = r.creatorId === viewerId;
  out.offerCount = out.offers.length;
  out.myOffer = (s.offers || []).find((o) => o && o.requestId === r.id && o.donorId === viewerId) || null;
  return out;
}

function userLabel(u: any): string {
  return String(u?.name || u?.username || 'User');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerBloodDonorRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/blood/meta — disclaimer + option lists (guest-safe; powers forms).
  app.get('/api/blood/meta', (req, res) => {
    const viewer = getRequestUser(req);
    res.json({
      bloodGroups: BLOOD_GROUPS,
      availabilities: AVAILABILITIES,
      urgencies: URGENCIES,
      disclaimer: SAFETY_DISCLAIMERS.BLOOD_NEEDED,
      coinRewards: { register: COINS_REGISTER, offer: COINS_OFFER, accept: COINS_ACCEPT },
      viewerId: viewer?.id ?? null,
    });
  });

  // GET /api/blood/status — my donor profile, counts, coins. requireAuth.
  app.get('/api/blood/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const changed = sweepExpired(s);

    const myDonor = (s.donors || []).find((d) => d && d.userId === me.id && d.active) || null;
    const myRequests = (s.requests || []).filter((r) => r && r.creatorId === me.id);
    const myOffers = (s.offers || []).filter((o) => o && o.donorId === me.id);
    const activeRequests = (s.requests || []).filter((r) => r && r.status === 'active').length;

    let balance = 0;
    try {
      const trust = Number(me?.trustScore ?? me?.profile?.trustScore ?? 0);
      balance = trustPointsForUser(loadCommunity(), me.id, trust);
    } catch (e: any) {
      console.warn('[blood] status balance error:', e?.message || e);
    }

    if (changed) saveDatabase(db);
    res.json({
      me: { id: me.id, name: userLabel(me) },
      donor: myDonor ? publicDonor(myDonor) : null,
      requestCount: myRequests.length,
      activeRequests,
      offerCount: myOffers.length,
      balance,
    });
  });

  // POST /api/blood/donor — register / update my donor profile (explicit opt-in).
  app.post('/api/blood/donor', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const bg = validBloodGroup(body.bloodGroup);
    const area = str(body.area, 120);
    if (!bg) return res.status(400).json({ error: 'Please choose a valid blood group.' });
    if (area.length < 2) return res.status(400).json({ error: 'An approximate area is required (e.g. North Beach).' });

    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const t = now();
    let donor = (s.donors || []).find((d) => d && d.userId === me.id);
    const isNew = !donor || !donor.active;

    const refCode = str(body.referenceCode, 80);
    if (!donor) {
      donor = {
        id: uid('donor'),
        userId: me.id,
        userName: userLabel(me),
        bloodGroup: bg,
        area,
        availability: sanitizeAvailability(body.availability),
        note: str(body.note, 300),
        isVerified: !!refCode,
        verificationReferenceCode: refCode || undefined,
        lastDonatedAt: positiveInt(body.lastDonatedAt) || undefined,
        donationCount: Math.max(0, Math.floor(Number(body.donationCount) || 0)),
        contactLine: str(body.contactLine, 200) || undefined,
        active: true,
        createdAt: t,
        updatedAt: t,
      };
      s.donors.push(donor);
    } else {
      donor.userName = userLabel(me);
      donor.bloodGroup = bg;
      donor.area = area;
      donor.availability = sanitizeAvailability(body.availability);
      donor.note = str(body.note, 300);
      donor.verificationReferenceCode = refCode || undefined;
      donor.isVerified = !!donor.verificationReferenceCode;
      const last = positiveInt(body.lastDonatedAt);
      if (last) donor.lastDonatedAt = last;
      if (Number.isFinite(Number(body.donationCount)) && Number(body.donationCount) >= 0) {
        donor.donationCount = Math.floor(Number(body.donationCount));
      }
      donor.contactLine = str(body.contactLine, 200) || undefined;
      donor.active = true;
      donor.updatedAt = t;
    }

    saveDatabase(db);
    let coins = 0;
    if (isNew) coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_REGISTER);
    res.json({ donor: publicDonor(donor), coins });
  });

  // POST /api/blood/donor/optout — remove myself from the directory (explicit).
  app.post('/api/blood/donor/optout', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const donor = (s.donors || []).find((d) => d && d.userId === me.id);
    if (!donor) return res.status(404).json({ error: 'You are not registered as a donor.' });
    donor.active = false;
    donor.updatedAt = now();
    saveDatabase(db);
    res.json({ success: true });
  });

  // GET /api/blood/donors — public donor directory (filter by ?blood=&area=&availability=).
  app.get('/api/blood/donors', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const blood = validBloodGroup(String(req.query.blood || '')) || null;
    const area = String(req.query.area || '').trim().toLowerCase();
    const availability = sanitizeAvailability(String(req.query.availability || ''));

    let donors = (s.donors || []).filter((d) => d && d.active);
    if (blood) donors = donors.filter((d) => d.bloodGroup === blood);
    if (area) donors = donors.filter((d) => d.area.toLowerCase().includes(area));
    if (availability) donors = donors.filter((d) => d.availability === availability);
    donors = [...donors].sort((a, b) => {
      const vb = b.isVerified ? 1 : 0;
      const va = a.isVerified ? 1 : 0;
      if (vb !== va) return vb - va;
      return b.updatedAt - a.updatedAt;
    });

    res.json({
      donors: donors.map((d) => ({ ...publicDonor(d), isMe: d.userId === me.id })),
      count: donors.length,
    });
  });

  // POST /api/blood/requests — broadcast a blood-needed request (rate-limited,
  // disclaimer-gated, location strictly opt-in).
  app.post('/api/blood/requests', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    if (body.acceptedDisclaimer !== true) {
      return res
        .status(400)
        .json({ error: 'You must accept the medical disclaimer before posting a blood request.' });
    }
    const bg = validBloodGroup(body.bloodGroup);
    const message = str(body.message, 1000);
    const area = str(body.area, 120);
    if (!bg) return res.status(400).json({ error: 'Please choose the blood group needed.' });
    if (message.length < 10) return res.status(400).json({ error: 'Describe the need (at least 10 characters).' });
    if (area.length < 2) return res.status(400).json({ error: 'An approximate area is required.' });

    const db = loadDatabase();
    const s = ensureBloodDonor(db);

    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: (s.requests || [])
          .filter((r) => r && r.creatorId === me.id)
          .map((r) => r.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res
        .status(429)
        .json({ error: `You've posted blood requests recently. Please wait ${rl.remainingSec}s.` });
    }

    const urgency = sanitizeUrgency(body.urgency);
    const t = now();

    // Precise location is opt-in per press, validated + rounded.
    let shareLocation = false;
    let lat: number | undefined;
    let lng: number | undefined;
    if (body.shareLocation === true) {
      const nLat = Number(body.lat);
      const nLng = Number(body.lng);
      if (Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180) {
        shareLocation = true;
        lat = Math.round(nLat * 1e6) / 1e6;
        lng = Math.round(nLng * 1e6) / 1e6;
      }
    }

    const request: BloodRequest = {
      id: uid('bloodreq'),
      creatorId: me.id,
      creatorName: userLabel(me),
      bloodGroup: bg,
      urgency,
      area,
      hospital: str(body.hospital, 160) || undefined,
      message,
      referenceCode: str(body.referenceCode, 80) || undefined,
      status: 'active',
      shareLocation,
      lat,
      lng,
      createdAt: t,
      expiresAt: t + (REQUEST_EXPIRY_MS[urgency] || REQUEST_EXPIRY_MS.medium),
      reports: [],
    };
    s.requests.unshift(request);
    if (s.requests.length > MAX_REQUESTS_KEPT) s.requests = s.requests.slice(0, MAX_REQUESTS_KEPT);
    saveDatabase(db);
    res.json({ request: publicRequest(request, me.id, s) });
  });

  // GET /api/blood/requests — list (scope=active|mine|resolved, ?blood=).
  app.get('/api/blood/requests', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const changed = sweepExpired(s);

    const scope = String(req.query.scope || 'active');
    const blood = validBloodGroup(String(req.query.blood || '')) || null;
    let list = (s.requests || []).filter((r) => r && r.status !== 'suppressed');
    if (scope === 'mine') {
      list = list.filter((r) => r.creatorId === me.id);
    } else if (scope === 'resolved') {
      list = list.filter((r) => r.status === 'resolved' || r.status === 'expired');
    } else {
      list = list.filter((r) => r.status === 'active');
    }
    if (blood) list = list.filter((r) => r.bloodGroup === blood);

    const urgencyRank: Record<Urgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    list = [...list].sort(
      (a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || b.createdAt - a.createdAt
    );

    if (changed) saveDatabase(db);
    res.json({ requests: list.map((r) => publicRequest(r, me.id, s)), count: list.length });
  });

  // GET /api/blood/requests/:id — detail with offers; creator sees accepted donor's
  // contact line (revealed only after acceptance).
  app.get('/api/blood/requests/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const changed = sweepExpired(s);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (changed) saveDatabase(db);

    let acceptedDonorContact: string | undefined;
    if (r.creatorId === me.id && r.acceptedOfferId) {
      const acc = (s.offers || []).find((o) => o && o.id === r.acceptedOfferId);
      const donor = acc ? (s.donors || []).find((d) => d && d.userId === acc.donorId) : null;
      acceptedDonorContact = donor?.contactLine;
    }

    res.json({
      request: publicRequest(r, me.id, s),
      acceptedDonorContact,
      isMine: r.creatorId === me.id,
      canOffer: r.creatorId !== me.id,
    });
  });

  // POST /api/blood/requests/:id/offer — a registered donor offers to donate.
  app.post('/api/blood/requests/:id/offer', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.creatorId === me.id) {
      return res.status(400).json({ error: 'You cannot offer on your own request.' });
    }
    if (r.status !== 'active') {
      return res.status(400).json({ error: 'This request is no longer active.' });
    }
    const donor = (s.donors || []).find((d) => d && d.userId === me.id && d.active);
    if (!donor) {
      return res.status(400).json({ error: 'Register as a donor first (Me tab) before offering.' });
    }
    const existing = (s.offers || []).find(
      (o) => o && o.requestId === r.id && o.donorId === me.id && (o.status === 'offered' || o.status === 'accepted')
    );
    if (existing) {
      return res.status(400).json({ error: 'You already offered on this request.' });
    }
    const message = str(req.body?.message, 300);
    if (message.length < 5) {
      return res.status(400).json({ error: 'Add a short message (at least 5 characters).' });
    }

    const offer: BloodOffer = {
      id: uid('offer'),
      requestId: r.id,
      donorId: me.id,
      donorName: donor.userName,
      donorBloodGroup: donor.bloodGroup,
      donorArea: donor.area,
      message,
      status: 'offered',
      createdAt: now(),
      awarded: false,
    };
    s.offers.push(offer);
    if (s.offers.length > MAX_OFFERS_KEPT) s.offers = s.offers.slice(-MAX_OFFERS_KEPT);

    awardCoins(loadCommunity, saveCommunity, me.id, COINS_OFFER);
    offer.awarded = true;
    saveDatabase(db);
    let balance = 0;
    try {
      balance = loadCommunity().balances?.[me.id] || 0;
    } catch (e: any) {
      console.warn('[blood] offer balance error:', e?.message || e);
    }
    res.json({ offer: publicOffer(offer), coins: balance });
  });

  // POST /api/blood/requests/:id/accept — requester accepts an offer; reveals the
  // donor's contact line and rewards the donor.
  app.post('/api/blood/requests/:id/accept', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.creatorId !== me.id) {
      return res.status(403).json({ error: 'Only the requester can accept an offer.' });
    }
    if (r.status !== 'active') {
      return res.status(400).json({ error: 'This request is no longer active.' });
    }
    if (r.acceptedOfferId) {
      return res.status(400).json({ error: 'You already accepted an offer on this request.' });
    }
    const offerId = str(body.offerId, 120);
    const offer = (s.offers || []).find((o) => o && o.id === offerId && o.requestId === r.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.status !== 'offered') {
      return res.status(400).json({ error: 'This offer is not available anymore.' });
    }

    offer.status = 'accepted';
    r.acceptedOfferId = offer.id;
    const donor = (s.donors || []).find((d) => d && d.userId === offer.donorId);
    awardCoins(loadCommunity, saveCommunity, offer.donorId, COINS_ACCEPT);
    saveDatabase(db);

    res.json({
      request: publicRequest(r, me.id, s),
      acceptedOffer: publicOffer(offer),
      donorContact: donor?.contactLine,
    });
  });

  // POST /api/blood/requests/:id/withdraw — donor withdraws their offer.
  app.post('/api/blood/requests/:id/withdraw', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const offer = (s.offers || []).find(
      (o) => o && o.requestId === req.params.id && o.donorId === me.id
    );
    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.status !== 'offered') {
      return res.status(400).json({ error: 'This offer is already decided.' });
    }
    offer.status = 'withdrawn';
    saveDatabase(db);
    res.json({ success: true });
  });

  // POST /api/blood/requests/:id/resolve — requester marks the request fulfilled.
  app.post('/api/blood/requests/:id/resolve', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
    const r = (s.requests || []).find((x) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found.' });
    if (r.creatorId !== me.id) {
      return res.status(403).json({ error: 'Only the requester can mark this resolved.' });
    }
    if (r.status !== 'active') {
      return res.status(400).json({ error: 'This request is already closed.' });
    }
    r.status = 'resolved';
    r.resolvedAt = now();
    r.resolvedById = me.id;
    saveDatabase(db);
    res.json({ success: true, request: publicRequest(r, me.id, s) });
  });

  // POST /api/blood/requests/:id/report — fake / commercial requests are suppressed
  // after 3 unique reports (mirrors emergency pool report pattern).
  app.post('/api/blood/requests/:id/report', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureBloodDonor(db);
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
    if (r.reports.length >= 3) r.status = 'suppressed';
    saveDatabase(db);
    res.json({ ok: true, reportCount: r.reports.length });
  });
}
