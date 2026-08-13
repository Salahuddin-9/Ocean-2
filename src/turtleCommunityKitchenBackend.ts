/**
 * Ocean — Disaster Community Kitchen Coordination backend (FEATURE 129)
 * ----------------------------------------------------------------------
 * Community kitchens for disaster relief: users register a kitchen location
 * (fuzzy area + optional opt-in coords), list what food they have, and open /
 * close it; people in need place food requests; volunteers fulfil them for
 * coins. A simple map-style area view is served by the list route.
 *
 * Privacy (SafeShelter precedent): exact addresses are never stored — a fuzzy
 * `areaLabel` is required; precise lat/lng is OPTIONAL per registration and
 * rounded to ~11m.
 *
 * Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 * `db.communityKitchens` (idempotent ensure). Coins via community.json wallet.
 *
 * Routes:
 *   GET  /api/disaster/kitchens                  -> list (?area=, ?status=, ?mine=1), guest-safe
 *   POST /api/disaster/kitchens                  -> register a kitchen (3 / 15 min)
 *   POST /api/disaster/kitchens/:id/update       -> owner updates status / meals
 *   POST /api/disaster/kitchens/:id/verify       -> verify (3 -> verified, +coins to owner)
 *   POST /api/disaster/kitchens/:id/report       -> report closed / unsafe
 *   POST /api/disaster/kitchens/:id/request      -> request food at this kitchen
 *   POST /api/disaster/kitchen-requests/:id/fulfill -> mark a request fulfilled (+coins)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';
import { isUserRateLimited } from './turtleEmergencyPools';

export type KitchenStatus = 'open' | 'closed' | 'out_of_food';
export type RequestStatus = 'open' | 'fulfilled' | 'expired';

export interface KitchenFoodRequest {
  id: string;
  kitchenId: string;
  requesterId: string;
  requesterName: string;
  foodType: string;
  people: number;
  notes: string;
  status: RequestStatus;
  fulfilledById?: string;
  fulfilledByName?: string;
  fulfilledAt?: number;
  createdAt: number;
}

export interface CommunityKitchen {
  id: string;
  name: string;
  /** Fuzzy area label — the only location that is ever broadcast. */
  areaLabel: string;
  /** Optional coarse coords, opt-in per registration, rounded to ~11m. */
  lat?: number;
  lng?: number;
  shareLocation: boolean;
  foodTypes: string[];
  /** Approx meals the kitchen can serve per day. 0 = unknown. */
  mealsPerDay: number;
  openHours: string;
  status: KitchenStatus;
  notes: string;
  ownerId: string;
  ownerName: string;
  verifiedBy: string[];
  verified: boolean;
  reports: { reason: string; at: number }[];
  requestCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CommunityKitchenState {
  kitchens: CommunityKitchen[];
  requests: KitchenFoodRequest[];
}

const VERIFIED_THRESHOLD = 3;
const MAX_KITCHENS_KEPT = 500;
const MAX_REQUESTS_KEPT = 2000;
const FOOD_OPTIONS = ['rice', 'daal', 'bread', 'water', 'milk', 'baby-food', 'medicine', 'cooked-meal', 'dry-rations'];
const STATUSES: KitchenStatus[] = ['open', 'closed', 'out_of_food'];

const COIN_REGISTER = 8; // once per kitchen
const COIN_VERIFIED = 20; // to owner at 3rd verification
const COIN_FULFILL = 6; // to the fulfiller, once per request

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function now(): number {
  return Date.now();
}

function str(v: unknown, max = 300): string {
  return String(v ?? '').trim().slice(0, max);
}

function userName(u: any): string {
  return String(u?.name || u?.username || 'User');
}

function sanitizeStatus(v: unknown): KitchenStatus {
  const s = String(v ?? '').trim().toLowerCase();
  return STATUSES.includes(s as KitchenStatus) ? (s as KitchenStatus) : 'open';
}

function sanitizeFoodTypes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).map((s) => s.trim().toLowerCase()).filter((s) => FOOD_OPTIONS.includes(s)).slice(0, 6);
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/** Idempotent ensure of db.communityKitchens — safe to run on every load. */
function ensureState(db: any): CommunityKitchenState {
  if (!db.communityKitchens || typeof db.communityKitchens !== 'object' || Array.isArray(db.communityKitchens)) {
    db.communityKitchens = {};
  }
  const s = db.communityKitchens;
  if (!Array.isArray(s.kitchens)) s.kitchens = [];
  if (!Array.isArray(s.requests)) s.requests = [];
  return s;
}

function publicKitchen(k: CommunityKitchen, viewerId: string | null): any {
  return {
    id: k.id,
    name: k.name,
    areaLabel: k.areaLabel,
    foodTypes: k.foodTypes,
    mealsPerDay: k.mealsPerDay,
    openHours: k.openHours,
    status: k.status,
    notes: k.notes,
    ownerName: k.ownerName,
    verified: !!k.verified,
    verifiedCount: (k.verifiedBy || []).length,
    reportCount: (k.reports || []).length,
    requestCount: k.requestCount || 0,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    isOwner: viewerId !== null && k.ownerId === viewerId,
    verifiedByMe: viewerId !== null && (k.verifiedBy || []).includes(viewerId),
    // Coarse location only when the owner opted in.
    lat: k.shareLocation ? k.lat : undefined,
    lng: k.shareLocation ? k.lng : undefined,
    shareLocation: !!k.shareLocation,
  };
}

function awardCoins(userId: string, amount: number): void {
  try {
    const ctx = getCtx();
    const state = ctx.loadCommunity();
    addBalance(state, userId, amount);
    ctx.saveCommunity(state);
  } catch (e: any) {
    console.warn('[community-kitchen] coin error:', e?.message || e);
  }
}

export function registerCommunityKitchenRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = ctx;

  // GET /api/disaster/kitchens — list with filters (guest-safe).
  app.get('/api/disaster/kitchens', (req, res) => {
    try {
      const db = loadDatabase();
      const s = ensureState(db);
      let list = [...s.kitchens].sort((a, b) => b.createdAt - a.createdAt);
      const area = String(req.query.area || '').trim().toLowerCase();
      if (area) list = list.filter((k) => String(k.areaLabel || '').toLowerCase().includes(area));
      const status = String(req.query.status || '').trim().toLowerCase();
      if (STATUSES.includes(status as KitchenStatus)) list = list.filter((k) => k.status === status);
      const viewer = getRequestUser(req);
      const viewerId = viewer?.id ?? null;
      if (String(req.query.mine || '') === '1' && viewerId) {
        list = list.filter((k) => k.ownerId === viewerId);
      }
      const openRequests = new Map<string, number>();
      for (const r of s.requests) {
        if (r.status === 'open') openRequests.set(r.kitchenId, (openRequests.get(r.kitchenId) || 0) + 1);
      }
      res.json({
        kitchens: list.slice(0, 100).map((k) => ({
          ...publicKitchen(k, viewerId),
          openRequestCount: openRequests.get(k.id) || 0,
        })),
        foodOptions: FOOD_OPTIONS,
        statuses: STATUSES,
        verifiedThreshold: VERIFIED_THRESHOLD,
      });
    } catch (e: any) {
      console.warn('[community-kitchen] list error:', e?.message || e);
      res.status(500).json({ error: 'List failed.' });
    }
  });

  // GET /api/disaster/kitchen-requests — open + recent requests (?kitchenId=, guest-safe).
  app.get('/api/disaster/kitchen-requests', (req, res) => {
    try {
      const db = loadDatabase();
      const s = ensureState(db);
      const kitchenId = String(req.query.kitchenId || '').trim();
      let list = [...s.requests].sort((a, b) => b.createdAt - a.createdAt);
      if (kitchenId) list = list.filter((r) => r.kitchenId === kitchenId);
      const viewer = getRequestUser(req);
      const viewerId = viewer?.id ?? null;
      res.json({
        requests: list.slice(0, 100).map((r) => ({
          id: r.id,
          kitchenId: r.kitchenId,
          requesterName: r.requesterName,
          foodType: r.foodType,
          people: r.people,
          notes: r.notes,
          status: r.status,
          fulfilledByName: r.fulfilledByName,
          fulfilledAt: r.fulfilledAt,
          createdAt: r.createdAt,
          isMine: viewerId !== null && r.requesterId === viewerId,
          canFulfill: viewerId !== null && r.requesterId !== viewerId && r.status === 'open',
        })),
      });
    } catch (e: any) {
      console.warn('[community-kitchen] requests error:', e?.message || e);
      res.status(500).json({ error: 'Requests failed.' });
    }
  });

  // POST /api/disaster/kitchens — register a kitchen (rate-limited: 3 / 15 min).
  app.post('/api/disaster/kitchens', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const body = req.body || {};
      const name = str(body.name, 120);
      const areaLabel = str(body.areaLabel, 120);
      if (name.length < 3) return res.status(400).json({ error: 'Kitchen name is required (min 3 chars).' });
      if (areaLabel.length < 3) {
        return res.status(400).json({ error: 'Area label is required (e.g. "North-side, near the bazaar").' });
      }

      const db = loadDatabase();
      const s = ensureState(db);
      const timestamps = s.kitchens.filter((k) => k && k.ownerId === me.id).map((k) => k.createdAt);
      const rl = isUserRateLimited({ userId: me.id, alertTimestamps: timestamps }, now());
      if (rl.limited) {
        return res.status(429).json({ error: `You have registered kitchens recently. Please wait ${rl.remainingSec}s.` });
      }

      // Coarse coords: opt-in only, validated, rounded to ~11m.
      let shareLocation = false;
      let lat: number | undefined;
      let lng: number | undefined;
      if (body.shareLocation === true) {
        const nLat = Number(body.lat);
        const nLng = Number(body.lng);
        if (Number.isFinite(nLat) && Number.isFinite(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180) {
          shareLocation = true;
          lat = round5(nLat);
          lng = round5(nLng);
        }
      }

      const kitchen: CommunityKitchen = {
        id: uid('kitchen'),
        name,
        areaLabel,
        lat,
        lng,
        shareLocation,
        foodTypes: sanitizeFoodTypes(body.foodTypes),
        mealsPerDay: Math.min(100000, Math.max(0, Math.floor(Number(body.mealsPerDay) || 0))),
        openHours: str(body.openHours, 80) || '8am – 8pm',
        status: sanitizeStatus(body.status),
        notes: str(body.notes, 400),
        ownerId: me.id,
        ownerName: userName(me),
        verifiedBy: [],
        verified: false,
        reports: [],
        requestCount: 0,
        createdAt: now(),
        updatedAt: now(),
      };
      s.kitchens.unshift(kitchen);
      if (s.kitchens.length > MAX_KITCHENS_KEPT) s.kitchens = s.kitchens.slice(0, MAX_KITCHENS_KEPT);
      saveDatabase(db);

      // Registering an open kitchen earns a small community coin reward (once per
      // created kitchen — the create handler itself runs once per kitchen).
      if (kitchen.status === 'open') {
        awardCoins(me.id, COIN_REGISTER);
      }
      res.json({ kitchen: publicKitchen(kitchen, me.id) });
    } catch (e: any) {
      console.warn('[community-kitchen] create error:', e?.message || e);
      res.status(500).json({ error: 'Register failed.' });
    }
  });

  // POST /api/disaster/kitchens/:id/update — owner updates status / details.
  app.post('/api/disaster/kitchens/:id/update', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureState(db);
      const k = s.kitchens.find((x) => x && x.id === req.params.id);
      if (!k) return res.status(404).json({ error: 'Kitchen not found.' });
      if (k.ownerId !== me.id) return res.status(403).json({ error: 'Only the kitchen owner can update it.' });
      if (typeof body.status === 'string') k.status = sanitizeStatus(body.status);
      if (Array.isArray(body.foodTypes)) k.foodTypes = sanitizeFoodTypes(body.foodTypes);
      if (body.mealsPerDay !== undefined) k.mealsPerDay = Math.min(100000, Math.max(0, Math.floor(Number(body.mealsPerDay) || 0)));
      if (body.openHours !== undefined) k.openHours = str(body.openHours, 80) || k.openHours;
      if (body.notes !== undefined) k.notes = str(body.notes, 400);
      k.updatedAt = now();
      saveDatabase(db);
      res.json({ kitchen: publicKitchen(k, me.id) });
    } catch (e: any) {
      console.warn('[community-kitchen] update error:', e?.message || e);
      res.status(500).json({ error: 'Update failed.' });
    }
  });

  // POST /api/disaster/kitchens/:id/verify — independent verification.
  app.post('/api/disaster/kitchens/:id/verify', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const db = loadDatabase();
      const s = ensureState(db);
      const k = s.kitchens.find((x) => x && x.id === req.params.id);
      if (!k) return res.status(404).json({ error: 'Kitchen not found.' });
      if (k.ownerId === me.id) return res.status(400).json({ error: 'You cannot verify your own kitchen.' });
      if ((k.verifiedBy || []).includes(me.id)) return res.status(400).json({ error: 'Already verified by you.' });
      k.verifiedBy = k.verifiedBy || [];
      k.verifiedBy.push(me.id);
      let ownerReward = 0;
      if (!k.verified && k.verifiedBy.length >= VERIFIED_THRESHOLD) {
        k.verified = true;
        awardCoins(k.ownerId, COIN_VERIFIED);
        ownerReward = COIN_VERIFIED;
      }
      k.updatedAt = now();
      saveDatabase(db);
      res.json({ kitchen: publicKitchen(k, me.id), ownerReward });
    } catch (e: any) {
      console.warn('[community-kitchen] verify error:', e?.message || e);
      res.status(500).json({ error: 'Verify failed.' });
    }
  });

  // POST /api/disaster/kitchens/:id/report — report closed / unsafe.
  app.post('/api/disaster/kitchens/:id/report', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureState(db);
      const k = s.kitchens.find((x) => x && x.id === req.params.id);
      if (!k) return res.status(404).json({ error: 'Kitchen not found.' });
      k.reports = k.reports || [];
      k.reports.push({ reason: str(body.reason, 100) || 'other', at: now() });
      if (k.reports.length >= 3) {
        k.status = 'closed';
        k.verified = false;
      }
      saveDatabase(db);
      res.json({ ok: true, reportCount: k.reports.length, status: k.status });
    } catch (e: any) {
      console.warn('[community-kitchen] report error:', e?.message || e);
      res.status(500).json({ error: 'Report failed.' });
    }
  });

  // POST /api/disaster/kitchens/:id/request — request food (requireAuth, 3 open / day).
  app.post('/api/disaster/kitchens/:id/request', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const s = ensureState(db);
      const k = s.kitchens.find((x) => x && x.id === req.params.id);
      if (!k) return res.status(404).json({ error: 'Kitchen not found.' });
      if (k.status === 'closed') return res.status(400).json({ error: 'This kitchen is closed.' });

      const dayStart = now() - 24 * 60 * 60 * 1000;
      const myOpen = s.requests.filter(
        (r) => r.requesterId === me.id && r.status === 'open' && r.createdAt >= dayStart
      ).length;
      if (myOpen >= 3) return res.status(429).json({ error: 'You already have 3 open requests today.' });

      const foodType = str(body.foodType, 60);
      if (!foodType) return res.status(400).json({ error: 'What food do you need?' });
      const request: KitchenFoodRequest = {
        id: uid('kitchenreq'),
        kitchenId: k.id,
        requesterId: me.id,
        requesterName: userName(me),
        foodType,
        people: Math.min(50, Math.max(1, Math.floor(Number(body.people) || 1))),
        notes: str(body.notes, 300),
        status: 'open',
        createdAt: now(),
      };
      s.requests.unshift(request);
      if (s.requests.length > MAX_REQUESTS_KEPT) s.requests = s.requests.slice(0, MAX_REQUESTS_KEPT);
      k.requestCount = (k.requestCount || 0) + 1;
      k.updatedAt = now();
      saveDatabase(db);
      res.json({ request });
    } catch (e: any) {
      console.warn('[community-kitchen] request error:', e?.message || e);
      res.status(500).json({ error: 'Request failed.' });
    }
  });

  // POST /api/disaster/kitchen-requests/:id/fulfill — mark fulfilled (+coins to fulfiller).
  app.post('/api/disaster/kitchen-requests/:id/fulfill', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const db = loadDatabase();
      const s = ensureState(db);
      const r = s.requests.find((x) => x && x.id === req.params.id);
      if (!r) return res.status(404).json({ error: 'Request not found.' });
      if (r.requesterId === me.id) return res.status(400).json({ error: 'You cannot fulfil your own request.' });
      if (r.status !== 'open') return res.status(400).json({ error: 'This request is already handled.' });
      r.status = 'fulfilled';
      r.fulfilledById = me.id;
      r.fulfilledByName = userName(me);
      r.fulfilledAt = now();
      saveDatabase(db);
      awardCoins(me.id, COIN_FULFILL);
      res.json({ request: r });
    } catch (e: any) {
      console.warn('[community-kitchen] fulfill error:', e?.message || e);
      res.status(500).json({ error: 'Fulfil failed.' });
    }
  });
}
