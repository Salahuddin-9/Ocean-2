/**
 * Ocean — Flood Depth Mapper backend (FEATURE 127 — Safety & Civic Resilience)
 * ----------------------------------------------------------------------------
 * A civic-resilience layer that extends the emergency UX (EmergencyView /
 * turtleEmergencyPoolsBackend). It sits beside the sibling safety modules
 * (SafeSOS / SOS Alert / Safety Shield / Safe Shelter / SafeWatch / OfflineMesh)
 * and covers the *flood observability* slice those modules do not: a community
 * flood-depth map and help-escalation board for waterlogged areas.
 *
 *  - Flood depth reports — an EXPLICIT per-tap user action ("the water here is
 *    about knee-deep"). The fuzzy `areaLabel` is ALWAYS what is broadcast. Precise
 *    GPS is attached ONLY when the user ticks the opt-in on that tap
 *    (`shareLocation: true`), rounded to ~1m, and is revealed only to the report
 *    author and (for help requests) to acknowledged responders. A user's home
 *    address is never stored or broadcast by default.
 *  - Help escalations — a report can escalate to "needs help" (crying wolf is
 *    rate-limited: 2 posts / 15 min via the shared emergency engine). Neighbours
 *    respond ("on my way") which is a HELPER action and earns safety coins.
 *  - Confirmation-based verification — a depth report is corroborated by 3
 *    neighbours (`confirmations`) before it is promoted to `confirmed`.
 *  - Flood-prone spots — a community-curated registry of known flood spots
 *    (fuzzy area + typical depth + risk level), corroborated by neighbours.
 *  - "I'm safe here" check-ins — an opt-in fuzzy-area ping so the community knows
 *    who is accounted for during flooding (coin reward, 30-min cooldown).
 *  - Area risk zones — derived per fuzzy area from live reports: low / moderate /
 *    high / severe (a live help request or >=150cm depth = severe).
 *
 *  Safety coins (community.json balances via turtleCommunityBackend.addBalance):
 *   +8 corroborating a flood report (once per report per user),
 *   +15 responding to a help request (once),
 *   +10 "I'm safe here" check-in (rate-limited to once per 30 min),
 *   +3 corroborating a flood-prone spot (once).
 *  Rewards flow to HELPERS (verifiers / responders) — never to the poster, so
 *  there is no incentive to flood the board with fake depth readings or false
 *  help requests (the anti-fake-alarm principle used across this batch).
 *
 *  Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 *  `db.floodMapper` (idempotent ensure, defensive reads via ?? []). Never stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FloodKind = 'depth' | 'help' | 'safe';
export type FloodStatus = 'active' | 'confirmed' | 'resolved' | 'expired';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe';
export type AckType = 'on_my_way' | 'got_them' | 'noted';

export interface FloodAck {
  byUserId: string;
  byName: string;
  type: AckType;
  at: number;
}

export interface FloodReport {
  id: string;
  kind: FloodKind;
  /** Water depth in cm (depth reports only). */
  depthCm: number;
  /** Fuzzy area label — always broadcast. Never a full address. */
  areaLabel: string;
  note: string;
  createdById: string;
  createdByName: string;
  status: FloodStatus;
  /** Neighbour corroborations (one per user) — verification for depth reports. */
  confirmations: string[];
  /** Responders to a help request. */
  acks: FloodAck[];
  /** Precise GPS — ONLY when the author opted in on this tap. */
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  resolvedByName?: string;
}

export interface FloodSpot {
  id: string;
  areaLabel: string;
  typicalDepthCm: number;
  riskLevel: RiskLevel;
  note: string;
  createdById: string;
  createdByName: string;
  confirmations: string[];
  createdAt: number;
}

export interface FloodRiskZone {
  area: string;
  reportCount: number;
  maxDepthCm: number;
  helpRequests: number;
  riskLevel: RiskLevel;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_EXPIRY_MS = 24 * 60 * 60 * 1000; // flood reports stay live 24h
const MAX_KEPT = 300;
const CONFIRMATIONS_REQUIRED = 3;
const MAX_DEPTH_CM = 500;
const CHECKIN_REWARD_MS = 30 * 60 * 1000; // "I'm safe here" coin cooldown
const MAX_CHECKIN_LOG = 1000;

// Safety coins (community.json wallet) — helpers only, never the poster.
const COIN_CONFIRM = 8;        // neighbour corroborating a flood report
const COIN_ACK = 15;           // responder to a help request
const COIN_CHECKIN = 10;       // "I'm safe here" check-in
const COIN_SPOT_CONFIRM = 3;   // neighbour corroborating a flood-prone spot

const DISCLAIMER =
  'Flood depth readings are self-reported by neighbours and confirmed by the ' +
  'community — they are NOT official water-level records. Never enter floodwater ' +
  'to take a reading. For life-threatening emergencies call your local emergency ' +
  'services immediately. Precise location is only shared when you explicitly opt ' +
  'in on a report, and only ever with the reporter / acknowledged responders.';

const KIND_LABELS: Record<FloodKind, string> = {
  depth: 'Water depth',
  help: 'Needs help',
  safe: 'Water receded',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
};

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

function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function sanitizeKind(v: unknown): FloodKind {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'depth' || s === 'help' || s === 'safe' ? s : 'depth';
}

function sanitizeRisk(v: unknown): RiskLevel {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'low' || s === 'moderate' || s === 'high' || s === 'severe' ? s : 'moderate';
}

function sanitizeAckType(v: unknown): AckType {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'on_my_way' || s === 'got_them' || s === 'noted' ? s : 'on_my_way';
}

/** Idempotent ensure of db.floodMapper — safe to run on every load. */
function ensureFloodMapper(db: any): any {
  if (!db.floodMapper || typeof db.floodMapper !== 'object' || Array.isArray(db.floodMapper)) {
    db.floodMapper = {};
  }
  const f = db.floodMapper;
  if (!Array.isArray(f.reports)) f.reports = [];
  if (!Array.isArray(f.spots)) f.spots = [];
  if (!Array.isArray(f.checkinLog)) f.checkinLog = [];
  return f;
}

/** Lazy expiry sweep (no cron): overdue open reports become 'expired'. */
function sweepExpired(reports: FloodReport[]): boolean {
  const t = now();
  let changed = false;
  for (const r of reports) {
    if (r && (r.status === 'active' || r.status === 'confirmed') && r.expiresAt && r.expiresAt < t) {
      r.status = 'expired';
      changed = true;
    }
  }
  return changed;
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

/**
 * Report as seen by `viewerId`. Precise GPS is stripped unless the viewer is the
 * author or (for help requests) an acknowledged responder. Always shares the
 * fuzzy area + event text.
 */
function publicReport(r: FloodReport, viewerId: string | null): any {
  const isCreator = viewerId !== null && r.createdById === viewerId;
  const isResponder = viewerId !== null && (r.acks || []).some((a) => a && a.byUserId === viewerId);
  const allowPrecise = r.shareLocation === true && (isCreator || (r.kind === 'help' && isResponder));
  const out: any = {
    id: r.id,
    kind: r.kind,
    kindLabel: KIND_LABELS[r.kind] || r.kind,
    depthCm: r.depthCm || 0,
    areaLabel: r.areaLabel,
    note: r.note,
    createdById: r.createdById,
    createdByName: r.createdByName,
    status: r.status,
    confirmations: (r.confirmations || []).length,
    confirmedByMe: viewerId !== null && (r.confirmations || []).includes(viewerId),
    ackCount: (r.acks || []).length,
    myAck: viewerId !== null ? (r.acks || []).find((a) => a && a.byUserId === viewerId) || null : null,
    shareLocation: r.shareLocation === true,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    resolvedAt: r.resolvedAt,
    resolvedByName: r.resolvedByName,
    isMine: isCreator,
    canConfirm:
      r.kind === 'depth' &&
      !isCreator &&
      (r.status === 'active' || r.status === 'confirmed') &&
      !(r.confirmations || []).includes(viewerId || ''),
    canAck:
      r.kind === 'help' &&
      !isCreator &&
      (r.status === 'active' || r.status === 'confirmed') &&
      !(r.acks || []).some((a) => a && a.byUserId === viewerId),
  };
  if (allowPrecise) {
    out.lat = r.lat;
    out.lng = r.lng;
  }
  return out;
}

/** Derive a risk zone per fuzzy area from live (non-closed) reports. */
function riskZones(reports: FloodReport[]): FloodRiskZone[] {
  const map = new Map<
    string,
    { area: string; reports: number; maxDepth: number; help: number; lastAt: number }
  >();
  for (const r of reports) {
    if (!r || r.status === 'expired' || r.status === 'resolved') continue;
    const key = String(r.areaLabel || 'Other').toLowerCase();
    const e = map.get(key) || {
      area: String(r.areaLabel || 'Other'),
      reports: 0,
      maxDepth: 0,
      help: 0,
      lastAt: 0,
    };
    e.reports += 1;
    if (r.kind === 'depth') e.maxDepth = Math.max(e.maxDepth, r.depthCm || 0);
    if (r.kind === 'help') e.help += 1;
    e.lastAt = Math.max(e.lastAt, r.createdAt || 0);
    map.set(key, e);
  }
  return Array.from(map.values())
    .sort(
      (a, b) =>
        b.help - a.help || b.maxDepth - a.maxDepth || b.reports - a.reports || b.lastAt - a.lastAt
    )
    .slice(0, 12)
    .map((e) => {
      const level: RiskLevel =
        e.help > 0 || e.maxDepth >= 150
          ? 'severe'
          : e.maxDepth >= 60 || e.reports >= 3
            ? 'high'
            : e.maxDepth >= 15 || e.reports >= 2
              ? 'moderate'
              : 'low';
      return {
        area: e.area,
        reportCount: e.reports,
        maxDepthCm: e.maxDepth,
        helpRequests: e.help,
        riskLevel: level,
      };
    });
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
    console.warn('[flood] coin award error:', e?.message || e);
    return 0;
  }
}

/** Rate-limited "I'm safe here" reward: records a log entry, true if coin awarded. */
function claimCheckinReward(f: any, userId: string): boolean {
  const t = now();
  const log = f.checkinLog as { userId: string; at: number }[];
  const last = [...log].reverse().find((x) => x.userId === userId);
  log.push({ userId, at: t });
  if (log.length > MAX_CHECKIN_LOG) f.checkinLog = log.slice(-500);
  return !last || t - last.at >= CHECKIN_REWARD_MS;
}

function trustForUser(db: any, userId: string): number {
  const u = (db.users || []).find((x: any) => x && x.id === userId);
  return Number(u?.trustScore ?? u?.profile?.trustScore ?? 0);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerFloodDepthMapperRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/flood/overview — aggregate stats + risk zones (guest-safe).
  app.get('/api/flood/overview', (req, res) => {
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const reports = (f.reports || []) as FloodReport[];
    const changed = sweepExpired(reports);
    if (changed) saveDatabase(db);

    const t = now();
    const active = reports.filter((r) => r.status !== 'expired' && r.status !== 'resolved');
    const counts = {
      activeReports: active.filter((r) => r.kind === 'depth').length,
      helpRequests: active.filter((r) => r.kind === 'help').length,
      confirmed: reports.filter((r) => r.status === 'confirmed').length,
      resolved: reports.filter((r) => r.status === 'resolved').length,
      spots: (f.spots || []).length,
    };

    const viewer = getRequestUser(req);
    let me = null;
    if (viewer && viewer.id) {
      let balance = 0;
      try {
        const state = loadCommunity();
        balance = trustPointsForUser(state, viewer.id, trustForUser(db, viewer.id));
      } catch (e: any) {
        console.warn('[flood] overview balance error:', e?.message || e);
      }
      const log = (f.checkinLog || []) as { userId: string; at: number }[];
      const lastCheckin = [...log].reverse().find((x) => x.userId === viewer.id);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      me = {
        id: viewer.id,
        name: userLabel(viewer),
        balance,
        myActiveReports: reports.filter(
          (r) => r.createdById === viewer.id && r.status !== 'expired' && r.status !== 'resolved'
        ).length,
        lastCheckinAt: lastCheckin?.at ?? null,
        checkinsToday: log.filter((x) => x.userId === viewer.id && x.at >= dayStart.getTime()).length,
      };
    }

    res.json({
      counts,
      riskZones: riskZones(reports),
      disclaimer: DISCLAIMER,
      kindLabels: KIND_LABELS,
      riskLabels: RISK_LABELS,
      confirmationsRequired: CONFIRMATIONS_REQUIRED,
      reportExpiryHours: REPORT_EXPIRY_MS / (60 * 60 * 1000),
      coinRewards: { confirm: COIN_CONFIRM, ack: COIN_ACK, checkin: COIN_CHECKIN, spotConfirm: COIN_SPOT_CONFIRM },
      me,
    });
  });

  // GET /api/flood/reports — feed (guest-safe). ?scope=active|mine|closed &kind=&area=
  app.get('/api/flood/reports', (req, res) => {
    const viewer = getRequestUser(req);
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const changed = sweepExpired(f.reports);
    if (changed) saveDatabase(db);

    let list = [...((f.reports || []) as FloodReport[])];
    const scope = String(req.query.scope || 'active');
    const kind = String(req.query.kind || '');
    if (scope === 'mine') {
      list = list.filter((r) => r.createdById === viewer?.id);
    } else if (scope === 'closed') {
      list = list.filter((r) => r.status === 'resolved' || r.status === 'expired');
    } else {
      list = list.filter((r) => r.status !== 'resolved' && r.status !== 'expired');
    }
    if (kind === 'depth' || kind === 'help' || kind === 'safe') {
      list = list.filter((r) => r.kind === kind);
    }
    const area = String(req.query.area || '').trim().toLowerCase();
    if (area) list = list.filter((r) => String(r.areaLabel || '').toLowerCase().includes(area));
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({
      reports: list.slice(0, 100).map((r) => publicReport(r, viewer?.id ?? null)),
      count: list.length,
    });
  });

  // POST /api/flood/reports — submit a depth reading / help request / "water receded" post.
  app.post('/api/flood/reports', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const kind = sanitizeKind(body.kind);
    const areaLabel = str(body.areaLabel, 120);
    const note = str(body.note, 500);
    const rawDepth = Number(body.depthCm);

    if (!areaLabel || areaLabel.length < 3) {
      return res.status(400).json({ error: 'A fuzzy area label is required (e.g. "North Beach, near the market").' });
    }
    if (kind === 'depth' && (!Number.isFinite(rawDepth) || rawDepth <= 0)) {
      return res.status(400).json({ error: 'Water depth is required for a depth report.' });
    }
    if (kind === 'help' && note.length < 5) {
      return res.status(400).json({ error: 'Describe the situation (at least 5 characters).' });
    }

    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const reports = f.reports as FloodReport[];

    // Shared emergency rate limit: 2 depth/help posts per 15 min.
    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: reports
          .filter((r) => r && (r.kind === 'depth' || r.kind === 'help') && r.createdById === me.id)
          .map((r) => r.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res.status(429).json({
        error: `You've posted flood updates recently. Please wait ${rl.remainingSec}s before posting again.`,
      });
    }

    const location = optInLocation(body);
    const report: FloodReport = {
      id: uid('flood'),
      kind,
      depthCm: kind === 'depth' ? Math.max(1, Math.min(MAX_DEPTH_CM, Math.round(rawDepth))) : 0,
      areaLabel,
      note,
      createdById: me.id,
      createdByName: userLabel(me),
      status: 'active',
      confirmations: [],
      acks: [],
      shareLocation: !!location,
      lat: location?.lat,
      lng: location?.lng,
      createdAt: now(),
      expiresAt: now() + REPORT_EXPIRY_MS,
    };
    reports.unshift(report);
    if (reports.length > MAX_KEPT) f.reports = reports.slice(0, MAX_KEPT);
    saveDatabase(db);
    res.json({ report: publicReport(report, me.id) });
  });

  // POST /api/flood/reports/:id/confirm — corroborate a depth report (requireAuth).
  app.post('/api/flood/reports/:id/confirm', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const r = (f.reports || []).find((x: FloodReport) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Report not found.' });
    if (r.kind === 'help') {
      return res.status(400).json({ error: 'Help requests are responded to, not confirmed.' });
    }
    if (r.createdById === me.id) return res.status(400).json({ error: 'You cannot confirm your own report.' });
    if (r.status === 'resolved' || r.status === 'expired') {
      return res.status(400).json({ error: 'This report is already closed.' });
    }
    r.confirmations = r.confirmations || [];
    if (r.confirmations.includes(me.id)) {
      return res.status(400).json({ error: 'You already confirmed this report.' });
    }
    r.confirmations.push(me.id);
    awardCoins(loadCommunity, saveCommunity, me.id, COIN_CONFIRM);
    let promoted = false;
    if (r.confirmations.length >= CONFIRMATIONS_REQUIRED && r.status === 'active') {
      r.status = 'confirmed';
      promoted = true;
    }
    saveDatabase(db);
    res.json({ report: publicReport(r, me.id), confirmations: r.confirmations.length, promoted });
  });

  // POST /api/flood/reports/:id/ack — respond to a help request (requireAuth).
  app.post('/api/flood/reports/:id/ack', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const r = (f.reports || []).find((x: FloodReport) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Report not found.' });
    if (r.kind !== 'help') {
      return res.status(400).json({ error: 'Only help requests can be acknowledged.' });
    }
    if (r.createdById === me.id) return res.status(400).json({ error: 'You cannot respond to your own request.' });
    if (r.status === 'resolved' || r.status === 'expired') {
      return res.status(400).json({ error: 'This request is already closed.' });
    }
    r.acks = r.acks || [];
    if (r.acks.some((a) => a && a.byUserId === me.id)) {
      return res.status(400).json({ error: 'You already responded to this request.' });
    }
    r.acks.push({
      byUserId: me.id,
      byName: userLabel(me),
      type: sanitizeAckType((req.body || {}).type),
      at: now(),
    });
    awardCoins(loadCommunity, saveCommunity, me.id, COIN_ACK);
    saveDatabase(db);
    res.json({ report: publicReport(r, me.id), ackCount: r.acks.length });
  });

  // POST /api/flood/reports/:id/resolve — the reporter marks it resolved (requireAuth).
  app.post('/api/flood/reports/:id/resolve', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const r = (f.reports || []).find((x: FloodReport) => x && x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Report not found.' });
    if (r.createdById !== me.id) return res.status(403).json({ error: 'Only the reporter can resolve it.' });
    if (r.status === 'resolved' || r.status === 'expired') {
      return res.status(400).json({ error: 'This report is already closed.' });
    }
    r.status = 'resolved';
    r.resolvedAt = now();
    r.resolvedByName = userLabel(me);
    saveDatabase(db);
    res.json({ report: publicReport(r, me.id) });
  });

  // GET /api/flood/spots — known flood-prone spots (guest-safe).
  app.get('/api/flood/spots', (req, res) => {
    const viewer = getRequestUser(req);
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const spots = [...((f.spots || []) as FloodSpot[])].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    res.json({
      spots: spots.slice(0, 100).map((s) => ({
        id: s.id,
        areaLabel: s.areaLabel,
        typicalDepthCm: s.typicalDepthCm,
        riskLevel: s.riskLevel,
        riskLabel: RISK_LABELS[s.riskLevel] || s.riskLevel,
        note: s.note,
        createdById: s.createdById,
        createdByName: s.createdByName,
        confirmations: (s.confirmations || []).length,
        confirmedByMe: viewer !== null && (s.confirmations || []).includes(viewer.id),
        createdAt: s.createdAt,
        isMine: viewer !== null && s.createdById === viewer.id,
      })),
      riskLabels: RISK_LABELS,
    });
  });

  // POST /api/flood/spots — submit a known flood-prone spot (requireAuth).
  app.post('/api/flood/spots', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const areaLabel = str(body.areaLabel, 120);
    const typicalDepthCm = Math.max(1, Math.min(MAX_DEPTH_CM, Math.round(Number(body.typicalDepthCm) || 0)));
    const note = str(body.note, 300);
    if (!areaLabel || areaLabel.length < 3) {
      return res.status(400).json({ error: 'A fuzzy area label is required.' });
    }
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const spots = f.spots as FloodSpot[];

    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: spots.filter((s) => s && s.createdById === me.id).map((s) => s.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res.status(429).json({ error: `You've added flood spots recently. Please wait ${rl.remainingSec}s.` });
    }

    const spot: FloodSpot = {
      id: uid('fspot'),
      areaLabel,
      typicalDepthCm,
      riskLevel: sanitizeRisk(body.riskLevel),
      note,
      createdById: me.id,
      createdByName: userLabel(me),
      confirmations: [],
      createdAt: now(),
    };
    spots.unshift(spot);
    if (spots.length > 200) f.spots = spots.slice(0, 200);
    saveDatabase(db);
    res.json({ spot: { ...spot, confirmations: 0, confirmedByMe: false, isMine: true } });
  });

  // POST /api/flood/spots/:id/confirm — corroborate a known flood spot (requireAuth).
  app.post('/api/flood/spots/:id/confirm', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const s = (f.spots || []).find((x: FloodSpot) => x && x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Spot not found.' });
    if (s.createdById === me.id) return res.status(400).json({ error: 'You cannot confirm your own spot.' });
    s.confirmations = s.confirmations || [];
    if (s.confirmations.includes(me.id)) {
      return res.status(400).json({ error: 'You already confirmed this spot.' });
    }
    s.confirmations.push(me.id);
    awardCoins(loadCommunity, saveCommunity, me.id, COIN_SPOT_CONFIRM);
    saveDatabase(db);
    res.json({ confirmations: s.confirmations.length, confirmedByMe: true });
  });

  // POST /api/flood/checkin — "I'm safe here" fuzzy-area ping (requireAuth).
  app.post('/api/flood/checkin', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const areaLabel = str(body.areaLabel, 120);
    if (!areaLabel || areaLabel.length < 3) {
      return res.status(400).json({ error: 'A fuzzy area label is required.' });
    }
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const awarded = claimCheckinReward(f, me.id);
    if (awarded) awardCoins(loadCommunity, saveCommunity, me.id, COIN_CHECKIN);
    saveDatabase(db);
    const log = (f.checkinLog || []) as { userId: string; at: number }[];
    const lastCheckin = [...log].reverse().find((x) => x.userId === me.id);
    res.json({
      ok: true,
      awarded,
      coinReward: COIN_CHECKIN,
      lastCheckinAt: lastCheckin?.at ?? null,
      areaLabel,
    });
  });

  // GET /api/flood/status — personal status (requireAuth).
  app.get('/api/flood/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const f = ensureFloodMapper(db);
    const reports = (f.reports || []) as FloodReport[];
    const changed = sweepExpired(reports);
    if (changed) saveDatabase(db);

    let balance = 0;
    try {
      const state = loadCommunity();
      balance = trustPointsForUser(state, me.id, trustForUser(db, me.id));
    } catch (e: any) {
      console.warn('[flood] status balance error:', e?.message || e);
    }
    const log = (f.checkinLog || []) as { userId: string; at: number }[];
    const lastCheckin = [...log].reverse().find((x) => x.userId === me.id);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    res.json({
      balance,
      lastCheckinAt: lastCheckin?.at ?? null,
      checkinsToday: log.filter((x) => x.userId === me.id && x.at >= dayStart.getTime()).length,
      myReports: reports.filter((r) => r.createdById === me.id).slice(0, 50),
      activeSosCount: reports.filter(
        (r) => r.createdById === me.id && r.kind === 'help' && r.status !== 'resolved' && r.status !== 'expired'
      ).length,
    });
  });
}

export { KIND_LABELS, RISK_LABELS, DISCLAIMER };
