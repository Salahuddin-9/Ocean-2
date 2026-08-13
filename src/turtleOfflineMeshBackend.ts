/**
 * Ocean — Offline Mesh & Store-and-Forward Emergency Relay backend (Safety & Civic Resilience)
 * -------------------------------------------------------------------------------------------
 * A civic-resilience module that builds ALONGSIDE the emergency community pools
 * (turtleEmergencyPoolsBackend), SafeSOS, Safety Shield, Safe Shelter, SOS Alerts and
 * the Blood Donor Registry — covering the part those modules do not: a low-bandwidth
 * COMMUNICATION FALLBACK for when the cellular / internet network is down or degraded
 * during a disaster ("mesh networking").
 *
 * Because a browser cannot open real device-to-device radios, this implements the
 * web-achievable equivalent of a mesh: a STORE-AND-FORWARD RELAY.
 *
 *  1. Relay board — anyone posts a short, compact emergency note (kind + urgency +
 *     body + FUZZY area label). The fuzzy area is always broadcast; precise lat/lng is
 *     attached ONLY when the user ticks the opt-in on that tap (`shareLocation: true`)
 *     and is revealed only to the author and to users who relayed the message. Relays
 *     carry a `hopCount` / `relayPath` so the network can see how many devices a
 *     message travelled through.
 *  2. Store-and-forward sync — every user has a durable server-side cursor. When a
 *     device comes back online it calls `/api/mesh/sync` and receives every relay it
 *     missed while offline (the server played the role of an intermediate mesh node).
 *  3. Relay (forward) — a user who receives a relay taps "relay", which appends them
 *     to the message's `relayPath` and bumps `hopCount` (bounded, deduped). Relaying
 *     is a HELPER action and earns safety coins (+3, once per message per user).
 *  4. Reachability beacons — an OPT-IN fuzzy-area "I'm here / I can help" ping so
 *     neighbors know who is reachable when the network is down. Beacons are fuzzy
 *     area labels ONLY — never precise coordinates — and decay as stale after 3h.
 *  5. Fake suppression — 3 reports auto-expire a relay; authors can resolve their own.
 *
 *  Privacy guarantees (rule 4):
 *   - No emergency contacts are stored anywhere in this module.
 *   - Location is shared ONLY via an explicit per-press opt-in on a relay; beacons are
 *     fuzzy-area only. A user's home address is never broadcast or stored.
 *   - Precise coords on a relay are visible only to the author and to relayers.
 *
 *  Safety coins (community.json balances via turtleCommunityBackend.addBalance):
 *   +3 relaying a message (once per message per user), +5 on first reachability beacon.
 *   Rewards flow to helpers — never to the poster (no incentive to flood fake relays).
 *
 *  Persistence: global db via ctx.loadDatabase()/saveDatabase() under `db.offlineMesh`
 *  (idempotent ensure, defensive `?? []` reads). Never stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';
import { isUserRateLimited, SAFETY_DISCLAIMERS } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeshUrgency = 'critical' | 'high' | 'medium' | 'low';
export type MeshKind = 'need_help' | 'can_help' | 'info' | 'check_in' | 'resource';
export type MeshStatus = 'active' | 'acknowledged' | 'resolved' | 'expired';

export interface MeshAckNote {
  byUserId: string;
  byName: string;
  note: string;
  at: number;
}

export interface MeshRelay {
  id: string;
  /** Monotonic sequence id — powers the store-and-forward sync cursor. */
  seq: number;
  kind: MeshKind;
  urgency: MeshUrgency;
  /** Short message body (max 280 chars — keeps the relay low-bandwidth). */
  body: string;
  /** Fuzzy area label — always broadcast, never precise. */
  area: string;
  authorId: string;
  authorName: string;
  /** Precise location — only when the author opted in on this tap. */
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  /** How many devices this message travelled through (store-and-forward hops). */
  hopCount: number;
  /** User ids of every device that relayed the message (deduped, bounded). */
  relayPath: string[];
  /** Users already coin-rewarded for relaying this message. */
  forwardRewards: string[];
  /** Relay-receipt notes (who got the message and relayed it on). */
  ackNotes: MeshAckNote[];
  status: MeshStatus;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  reports: { reason: string; details: string; at: number }[];
}

export interface MeshBeacon {
  userId: string;
  userName: string;
  /** Fuzzy area label ONLY — beacons never carry precise coordinates. */
  area: string;
  status: 'online' | 'offline';
  capacity: 'can_help' | 'need_help' | 'neutral';
  note: string;
  updatedAt: number;
}

interface MeshStoreShape {
  relays: MeshRelay[];
  beacons: MeshBeacon[];
  syncCursors: Record<string, number>;
  nextSeq: number;
  beaconRewarded: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MESH_KINDS: MeshKind[] = ['need_help', 'can_help', 'info', 'check_in', 'resource'];
const MESH_URGENCIES: MeshUrgency[] = ['critical', 'high', 'medium', 'low'];

const MAX_BODY = 280;
const MAX_AREA = 120;
const MAX_RELAYS_KEPT = 500;
const MAX_BEACONS_KEPT = 300;
const MAX_HOPS = 8; // bound the relay path so a message cannot loop forever
const MAX_RELAY_PATH = 50;

const COINS_RELAY = 3; // relaying a message (helper reward, once per message per user)
const COINS_FIRST_BEACON = 5; // first reachability beacon ever

/** Relay lifetime by urgency — a message must outlive the outage it covers. */
const MESH_EXPIRY_MS: Record<MeshUrgency, number> = {
  critical: 12 * 60 * 60 * 1000,
  high: 48 * 60 * 60 * 1000,
  medium: 96 * 60 * 60 * 1000,
  low: 7 * 24 * 60 * 60 * 1000,
};

const URGENCY_RANK: Record<MeshUrgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** A beacon older than this is considered stale (the neighbor may have left). */
const BEACON_STALE_MS = 3 * 60 * 60 * 1000;

const DEFAULT_EXPIRY_MS = MESH_EXPIRY_MS.medium;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function now(): number {
  return Date.now();
}

function uid(prefix: string): string {
  return `${prefix}-${now()}-${Math.floor(Math.random() * 10000)}`;
}

function str(v: unknown, max = MAX_BODY): string {
  return String(v ?? '').trim().slice(0, max);
}

function sanitizeUrgency(v: unknown): MeshUrgency {
  const s = String(v ?? '').trim().toLowerCase();
  return MESH_URGENCIES.includes(s as MeshUrgency) ? (s as MeshUrgency) : 'medium';
}

function sanitizeKind(v: unknown): MeshKind {
  const s = String(v ?? '').trim().toLowerCase();
  return MESH_KINDS.includes(s as MeshKind) ? (s as MeshKind) : 'info';
}

function userLabel(u: any): string {
  return String(u?.name || u?.username || 'User');
}

/** Idempotent ensure of db.offlineMesh — safe to run on every load. */
function ensureMeshDb(db: any): MeshStoreShape {
  if (!db.offlineMesh || typeof db.offlineMesh !== 'object' || Array.isArray(db.offlineMesh)) {
    db.offlineMesh = {};
  }
  const mesh = db.offlineMesh;
  if (!Array.isArray(mesh.relays)) mesh.relays = [];
  if (!Array.isArray(mesh.beacons)) mesh.beacons = [];
  if (!mesh.syncCursors || typeof mesh.syncCursors !== 'object' || Array.isArray(mesh.syncCursors)) {
    mesh.syncCursors = {};
  }
  if (typeof mesh.nextSeq !== 'number' || !Number.isFinite(mesh.nextSeq)) mesh.nextSeq = 1;
  if (!Array.isArray(mesh.beaconRewarded)) mesh.beaconRewarded = [];
  return mesh as MeshStoreShape;
}

/** Deterministic lazy sweep (no cron): overdue open relays become 'expired'. */
function sweepExpired(relays: MeshRelay[]): boolean {
  const t = now();
  let changed = false;
  for (const r of relays) {
    if (r && (r.status === 'active' || r.status === 'acknowledged') && r.expiresAt && r.expiresAt < t) {
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
    console.warn('[mesh] coin award error:', e?.message || e);
    return 0;
  }
}

/**
 * Relay as seen by `viewerId` (may be null for guests). Precise GPS is stripped
 * unless the viewer is the author or has relayed the message; report details never
 * leak into list/detail views.
 */
function publicRelay(r: MeshRelay, viewerId: string | null | undefined): any {
  const vid = viewerId || '';
  const isAuthor = r.authorId === vid;
  const inPath = (r.relayPath || []).includes(vid);
  const allowPrecise = isAuthor || inPath;
  const out: any = { ...r };
  if (!allowPrecise) {
    out.lat = undefined;
    out.lng = undefined;
    out.shareLocation = false;
  }
  out.reportCount = (r.reports || []).length;
  delete out.reports;
  out.isMine = isAuthor;
  out.relayed = inPath;
  out.myAck = (r.ackNotes || []).find((n) => n && n.byUserId === vid) || null;
  out.ackCount = (r.ackNotes || []).length;
  return out;
}

/** Round to ~1m precision and clamp to valid ranges. */
function clampCoord(v: unknown, lo: number, hi: number): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  if (n < lo || n > hi) return undefined;
  return Math.round(n * 1e6) / 1e6;
}

/** The user's current beacon record, if any. */
function myBeacon(mesh: MeshStoreShape, userId: string): MeshBeacon | undefined {
  return (mesh.beacons || []).find((b) => b && b.userId === userId);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerOfflineMeshRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/mesh/meta — disclaimer, form options, coin rewards (guest-safe).
  app.get('/api/mesh/meta', (req, res) => {
    const viewer = getRequestUser(req);
    res.json({
      disclaimer: SAFETY_DISCLAIMERS.GENERAL,
      kinds: MESH_KINDS,
      urgencies: MESH_URGENCIES,
      coinRewards: { relay: COINS_RELAY, firstBeacon: COINS_FIRST_BEACON },
      maxBody: MAX_BODY,
      maxArea: MAX_AREA,
      cooldownSec: 15 * 60, // 2 relays / 15 min
      viewerId: viewer?.id ?? null,
    });
  });

  // POST /api/mesh/relay — post an emergency relay to the store-and-forward network.
  app.post('/api/mesh/relay', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const msg = str(body.body, MAX_BODY);
    if (msg.length < 5) {
      return res.status(400).json({ error: 'Describe the relay (at least 5 characters).' });
    }
    const urgency = sanitizeUrgency(body.urgency);
    const kind = sanitizeKind(body.kind);
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);

    // Shared emergency rate limit: 2 relays / 15 min (prevents network flood).
    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: (mesh.relays || [])
          .filter((r) => r && r.authorId === me.id)
          .map((r) => r.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res.status(429).json({ error: `You've posted relays recently. Please wait ${rl.remainingSec}s.` });
    }

    // Precise location is opt-in per press, validated + rounded to ~1m.
    let shareLocation = false;
    let lat: number | undefined;
    let lng: number | undefined;
    if (body.shareLocation === true) {
      const nLat = clampCoord(body.lat, -90, 90);
      const nLng = clampCoord(body.lng, -180, 180);
      if (nLat !== undefined && nLng !== undefined) {
        shareLocation = true;
        lat = nLat;
        lng = nLng;
      }
    }

    const relay: MeshRelay = {
      id: uid('mesh'),
      seq: mesh.nextSeq,
      kind,
      urgency,
      body: msg,
      area: str(body.area, MAX_AREA) || 'Area not specified',
      authorId: me.id,
      authorName: userLabel(me),
      shareLocation,
      lat,
      lng,
      hopCount: 0,
      relayPath: [],
      forwardRewards: [],
      ackNotes: [],
      status: 'active',
      createdAt: now(),
      expiresAt: now() + (MESH_EXPIRY_MS[urgency] || DEFAULT_EXPIRY_MS),
      reports: [],
    };
    mesh.nextSeq += 1;
    mesh.relays.unshift(relay);
    if (mesh.relays.length > MAX_RELAYS_KEPT) mesh.relays = mesh.relays.slice(0, MAX_RELAYS_KEPT);
    saveDatabase(db);
    res.json({ relay: publicRelay(relay, me.id) });
  });

  // GET /api/mesh/relay — the public relay board (guest-safe read).
  app.get('/api/mesh/relay', (req, res) => {
    const viewer = getRequestUser(req);
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);
    const changed = sweepExpired(mesh.relays);
    const status = String(req.query.status || 'active');
    const kind = String(req.query.kind || '');
    const area = String(req.query.area || '').trim().toLowerCase();

    let list = (mesh.relays || []) as MeshRelay[];
    if (status === 'mine') {
      list = list.filter((r) => r && r.authorId === viewer?.id);
    } else if (status === 'resolved') {
      list = list.filter((r) => r && (r.status === 'resolved' || r.status === 'expired'));
    } else {
      list = list.filter((r) => r && (r.status === 'active' || r.status === 'acknowledged'));
    }
    if (kind) list = list.filter((r) => r && r.kind === kind);
    if (area) list = list.filter((r) => r && r.area.toLowerCase().includes(area));
    list = [...list].sort(
      (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.seq - a.seq
    );

    if (changed) saveDatabase(db);
    res.json({
      relays: list.map((r) => publicRelay(r, viewer?.id)),
      kinds: MESH_KINDS,
      urgencies: MESH_URGENCIES,
      total: list.length,
    });
  });

  // GET /api/mesh/sync?after=<seq> — store-and-forward catch-up (requireAuth).
  // While the device was offline the server queued relays; this returns everything
  // the device hasn't seen yet and advances the durable per-user cursor.
  app.get('/api/mesh/sync', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);
    const afterRaw = Number(req.query.after);
    const stored = mesh.syncCursors[me.id] || 0;
    const after = Number.isFinite(afterRaw) && afterRaw >= 0 ? afterRaw : stored;
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 100));

    const changed = sweepExpired(mesh.relays);
    const unseen = (mesh.relays || [])
      .filter((r) => r && (r.status === 'active' || r.status === 'acknowledged') && r.seq > after)
      .sort((a, b) => b.seq - a.seq);
    const relays = unseen.slice(0, limit);
    const newCursor = relays.length > 0 ? Math.max(after, relays[0].seq) : after;
    const cursorMoved = newCursor !== stored;
    mesh.syncCursors[me.id] = newCursor;

    if (changed || cursorMoved || relays.length > 0) saveDatabase(db);
    res.json({
      relays: relays.map((r) => publicRelay(r, me.id)),
      cursor: newCursor,
      missed: unseen.length,
      wasOffline: stored > 0 && unseen.length > 0,
    });
  });

  // POST /api/mesh/relay/:id/ack — I received this; relay it onward (+hop, +coins).
  app.post('/api/mesh/relay/:id/ack', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);
    const relay = (mesh.relays || []).find((r) => r && r.id === req.params.id);
    if (!relay) return res.status(404).json({ error: 'Relay not found.' });
    if (relay.authorId === me.id) {
      return res.status(400).json({ error: 'You cannot relay your own message.' });
    }
    if (relay.status !== 'active' && relay.status !== 'acknowledged') {
      return res.status(400).json({ error: 'This relay is already closed.' });
    }
    if ((relay.relayPath || []).includes(me.id)) {
      return res.status(400).json({ error: 'You already relayed this message.' });
    }
    if ((relay.relayPath || []).length >= MAX_RELAY_PATH) {
      return res.status(400).json({ error: 'This relay has reached its hop limit.' });
    }

    const relayed = !!(relay.forwardRewards || []).includes(me.id);
    relay.relayPath = relay.relayPath || [];
    relay.ackNotes = relay.ackNotes || [];
    relay.relayPath.push(me.id);
    relay.hopCount = Math.min(MAX_HOPS, relay.relayPath.length);
    relay.ackNotes.push({
      byUserId: me.id,
      byName: userLabel(me),
      note: str(body.note, 160),
      at: now(),
    });
    if (relay.status === 'active') relay.status = 'acknowledged';

    let coins = 0;
    if (!relayed) {
      relay.forwardRewards = relay.forwardRewards || [];
      relay.forwardRewards.push(me.id);
      coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_RELAY);
    }
    saveDatabase(db);
    res.json({ relay: publicRelay(relay, me.id), coins, hopCount: relay.hopCount });
  });

  // POST /api/mesh/relay/:id/resolve — author marks the situation resolved.
  app.post('/api/mesh/relay/:id/resolve', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);
    const relay = (mesh.relays || []).find((r) => r && r.id === req.params.id);
    if (!relay) return res.status(404).json({ error: 'Relay not found.' });
    if (relay.authorId !== me.id) return res.status(403).json({ error: 'Only the author can resolve it.' });
    if (relay.status !== 'active' && relay.status !== 'acknowledged') {
      return res.status(400).json({ error: 'This relay is already closed.' });
    }
    relay.status = 'resolved';
    relay.resolvedAt = now();
    saveDatabase(db);
    res.json({ success: true, relay: publicRelay(relay, me.id) });
  });

  // POST /api/mesh/relay/:id/report — fake/spam suppression (3 reports → expired).
  app.post('/api/mesh/relay/:id/report', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);
    const relay = (mesh.relays || []).find((r) => r && r.id === req.params.id);
    if (!relay) return res.status(404).json({ error: 'Relay not found.' });
    if (relay.authorId === me.id) {
      return res.status(400).json({ error: 'You cannot report your own relay.' });
    }
    const reason = str(req.body?.reason || 'other', 60);
    relay.reports = relay.reports || [];
    relay.reports.push({ reason, details: str(req.body?.details, 300), at: now() });
    if (relay.reports.length >= 3) relay.status = 'expired';
    saveDatabase(db);
    res.json({ ok: true, reportCount: relay.reports.length, status: relay.status });
  });

  // POST /api/mesh/beacon — opt-in reachability ping (fuzzy area ONLY, never precise).
  app.post('/api/mesh/beacon', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);

    const existing = myBeacon(mesh, me.id);
    const status = body.status === 'offline' ? 'offline' : 'online';
    const capacity =
      body.capacity === 'can_help' || body.capacity === 'need_help' ? body.capacity : 'neutral';
    const beacon: MeshBeacon = {
      userId: me.id,
      userName: userLabel(me),
      area: str(body.area, MAX_AREA),
      status,
      capacity,
      note: str(body.note, 160),
      updatedAt: now(),
    };

    let coins = 0;
    if (!existing) {
      // First beacon ever → small helper reward (bounded to once per user).
      mesh.beaconRewarded = mesh.beaconRewarded || [];
      if (!mesh.beaconRewarded.includes(me.id)) {
        mesh.beaconRewarded.push(me.id);
        coins = awardCoins(loadCommunity, saveCommunity, me.id, COINS_FIRST_BEACON);
      }
    }
    if (existing) {
      const idx = mesh.beacons.indexOf(existing);
      mesh.beacons[idx] = beacon;
    } else {
      mesh.beacons.unshift(beacon);
    }
    if (mesh.beacons.length > MAX_BEACONS_KEPT) mesh.beacons = mesh.beacons.slice(0, MAX_BEACONS_KEPT);
    saveDatabase(db);
    res.json({ beacon, coins });
  });

  // GET /api/mesh/beacons — who is reachable nearby (guest-safe read, fuzzy areas only).
  app.get('/api/mesh/beacons', (req, res) => {
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);
    const t = now();
    const list = [...(mesh.beacons || [])]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100)
      .map((b) => ({
        userId: b.userId,
        userName: b.userName,
        area: b.area || 'Area not specified',
        status: b.status,
        capacity: b.capacity,
        note: b.note,
        updatedAt: b.updatedAt,
        stale: t - b.updatedAt > BEACON_STALE_MS,
      }));
    res.json({ beacons: list, count: list.length, staleAfterHr: Math.round(BEACON_STALE_MS / 3600000) });
  });

  // GET /api/mesh/status — network activity + my catch-up state (requireAuth).
  app.get('/api/mesh/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const mesh = ensureMeshDb(db);
    const changed = sweepExpired(mesh.relays);
    if (changed) saveDatabase(db);
    const t = now();
    const active = (mesh.relays || []).filter((r) => r && (r.status === 'active' || r.status === 'acknowledged'));
    const cursor = mesh.syncCursors[me.id] || 0;
    const unread = active.filter((r) => r.seq > cursor).length;
    const recent = active.filter((r) => t - r.createdAt < 30 * 60 * 1000).length;
    const freshBeacons = (mesh.beacons || []).filter((b) => t - b.updatedAt <= BEACON_STALE_MS).length;
    res.json({
      activeRelays: active.length,
      activeInLast30m: recent,
      unread,
      freshBeacons,
      myRelayCount: (mesh.relays || []).filter((r) => r && r.authorId === me.id).length,
      myBeacon: myBeacon(mesh, me.id) || null,
      cursor,
      coinRewards: { relay: COINS_RELAY, firstBeacon: COINS_FIRST_BEACON },
    });
  });
}
