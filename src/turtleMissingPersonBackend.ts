/**
 * Ocean — Missing Person Community Alerts backend (Safety & Civic Resilience)
 * ---------------------------------------------------------------------------
 * A civic-resilience feature that builds ALONGSIDE the emergency community pools
 * (turtleEmergencyPoolsBackend), SafeSOS, Safety Shield, Safe Shelter and the
 * Blood Donor Registry — covering the community "help find someone" case those
 * modules do not:
 *
 *   1. Missing-person reports — a family member / neighbour files a report with a
 *      fuzzy last-seen area (ALWAYS broadcast) and, only when the reporter ticks
 *      the opt-in on that press (`shareLocation: true`), precise last-seen coords
 *      (stored once, never broadcast in lists). A photo may be attached as an
 *      already-uploaded `/uploads/...` URL (never base64).
 *   2. Community sightings — anyone who saw the person or has information submits
 *      a sighting. The fuzzy area label is always public; a sighter's precise
 *      coords are attached ONLY on explicit opt-in and revealed only to the
 *      reporter and the sighter themself.
 *   3. Verify + find — neighbours verify a report is real (community attestation,
 *      surfaced as a count in lists), and the reporter marks the person found
 *      safe (which rewards the most-voted sighting author).
 *   4. Fake suppression — 3 fake/spam reports auto-withdraw a listing.
 *
 * Privacy guarantees (rule 4):
 *   - Location is shared ONLY via an explicit per-press opt-in.
 *   - Precise coords + the reporter's contact note are NEVER in list views; on
 *     detail they are revealed only to the reporter and to helpers (people who
 *     submitted a sighting).
 *   - No emergency contacts are stored here at all.
 *
 * Safety coins (community.json balances via turtleCommunityBackend.addBalance):
 *   +10 first sighting on a report, +5 verifying a report is real, +20 to the
 *   most-voted sighting author when the person is found safe. The reporter earns
 *   nothing (no incentive to file fake reports).
 *
 * Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 * `db.missingPerson` (idempotent ensure, defensive `?? []` reads). No base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, trustPointsForUser } from './turtleCommunityBackend';
import { isUserRateLimited } from './turtleEmergencyPools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MissingStatus = 'active' | 'found_safe' | 'withdrawn';
export type SightingKind = 'sighting' | 'information';

export interface MissingSighting {
  id: string;
  reportId: string;
  sighterId: string;
  sighterName: string;
  kind: SightingKind;
  note: string;
  areaLabel?: string;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  helpfulBy: string[];
  createdAt: number;
}

export interface MissingReport {
  id: string;
  reporterId: string;
  reporterName: string;
  personName: string;
  age?: number;
  gender?: string;
  description: string;
  photoUrl?: string;
  areaLabel: string;
  lastSeenAt: number;
  lastSeenText?: string;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  contactNote: string;
  status: MissingStatus;
  foundNotes?: string;
  verifierIds: string[];
  sightings: MissingSighting[];
  reports: { reason: string; details: string; at: number }[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_REPORTS_PER_WINDOW = 2;
const REPORT_WINDOW_MS = 15 * 60 * 1000;
const SIGHTING_WINDOW_MS = 60 * 60 * 1000;
const MAX_SIGHTINGS_PER_WINDOW = 5;
const MAX_REPORTS_TO_CLOSE = 3;
const REPORT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const COINS_SIGHTING = 10;
const COINS_VERIFY = 5;
const COINS_FOUND = 20;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function now(): number {
  return Date.now();
}

function uid(prefix: string): string {
  return `${prefix}-${now()}-${Math.floor(Math.random() * 10000)}`;
}

function isCoord(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
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

function resolveName(user: any): string {
  return String(user?.name || user?.username || 'User');
}

/** Idempotent ensure of db.missingPerson — safe to run on every load. */
function ensureMissingPerson(db: any): any {
  if (!db.missingPerson || typeof db.missingPerson !== 'object' || Array.isArray(db.missingPerson)) {
    db.missingPerson = {};
  }
  const s = db.missingPerson;
  if (!Array.isArray(s.reports)) s.reports = [];
  return s;
}

/** List view — NEVER exposes precise coords, contact note, or sighting internals. */
function toListReport(r: any): any {
  return {
    id: r.id,
    reporterId: r.reporterId,
    reporterName: r.reporterName,
    personName: r.personName,
    age: r.age,
    gender: r.gender,
    description: r.description,
    photoUrl: r.photoUrl,
    areaLabel: r.areaLabel,
    lastSeenAt: r.lastSeenAt,
    lastSeenText: r.lastSeenText,
    status: r.status,
    verifierCount: (r.verifierIds || []).length,
    sightingCount: (r.sightings || []).length,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Detail view — precise coords + the reporter's contact note are revealed only
 * to the reporter and to people who submitted a sighting (helpers). A sighter's
 * precise coords are revealed only to the reporter and the sighter themself.
 */
function toDetailReport(r: any, viewerId: string | null): any {
  const isReporter = !!viewerId && viewerId === r.reporterId;
  const isSighter = !!viewerId && (r.sightings || []).some((s: any) => s && s.sighterId === viewerId);
  const canSeeContact = isReporter || isSighter;
  const clone: any = {
    ...r,
    sightings: (r.sightings || []).map((s: any) => {
      if (!s) return s;
      const own = !!viewerId && viewerId === s.sighterId;
      if (isReporter || own) return s;
      const { lat, lng, ...rest } = s;
      return rest;
    }),
  };
  if (!canSeeContact) {
    delete clone.lat;
    delete clone.lng;
    delete clone.contactNote;
  }
  return {
    ...clone,
    verifierCount: (r.verifierIds || []).length,
    sightingCount: (r.sightings || []).length,
  };
}

/** Award safety coins into the community.json wallet (never throws). */
function awardCoins(userId: string, amount: number): void {
  try {
    const ctx = getCtx();
    const state = ctx.loadCommunity();
    addBalance(state, userId, amount);
    ctx.saveCommunity(state);
  } catch (e: any) {
    console.warn('[missing-person] coin award error:', e?.message || e);
  }
}

/** Current user's displayed points (trustScore*100 + stored balance). */
function balanceOf(user: any): number {
  try {
    const state = getCtx().loadCommunity();
    return trustPointsForUser(state, user.id, Number(user?.trustScore ?? 0));
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerMissingPersonRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = ctx;

  // GET /api/missing/reports — list (guest-safe). ?status=active|found|mine, ?area=
  app.get('/api/missing/reports', (req, res) => {
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const viewer = getRequestUser(req);
    const status = String((req.query.status as string) || 'active');
    const area = String((req.query.area as string) || '').trim().toLowerCase();
    const cutoff = now() - REPORT_EXPIRY_MS;
    let reports = (s.reports || []).filter((r: any) => r && r.createdAt > cutoff);
    if (area) {
      reports = reports.filter((r: any) =>
        String(r?.areaLabel || '').toLowerCase().includes(area) ||
        String(r?.personName || '').toLowerCase().includes(area)
      );
    }
    if (status === 'mine') {
      reports = reports.filter((r: any) => r && r.reporterId === viewer?.id);
    } else if (status === 'found') {
      reports = reports.filter((r: any) => r && ['found_safe', 'withdrawn'].includes(r.status));
    } else {
      reports = reports.filter((r: any) => r && r.status === 'active');
    }
    reports.sort(
      (a: any, b: any) => (b?.updatedAt || b?.createdAt || 0) - (a?.updatedAt || a?.createdAt || 0)
    );
    res.json({
      reports: reports.map((r: any) => toListReport(r)),
      balance: viewer ? balanceOf(viewer) : 0,
      mine: viewer?.id ?? null,
    });
  });

  // GET /api/missing/reports/:id — detail (guest-safe, privacy-scrubbed per viewer)
  app.get('/api/missing/reports/:id', (req, res) => {
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const viewer = getRequestUser(req);
    const report = (s.reports || []).find((r: any) => r && r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.json({ report: toDetailReport(report, viewer?.id ?? null) });
  });

  // POST /api/missing/reports — file a missing-person report (requireAuth)
  app.post('/api/missing/reports', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const rl = isUserRateLimited(
      {
        userId: me.id,
        alertTimestamps: (s.reports || [])
          .filter((r: any) => r && r.reporterId === me.id)
          .map((r: any) => r.createdAt),
      },
      now()
    );
    if (rl.limited) {
      return res.status(429).json({ error: `Please wait ${rl.remainingSec}s before filing another report.` });
    }
    const body = req.body || {};
    const personName = String(body.personName || '').trim();
    const description = String(body.description || '').trim();
    const areaLabel = String(body.areaLabel || '').trim();
    if (personName.length < 2) return res.status(400).json({ error: 'The person\'s name is required.' });
    if (description.length < 10) return res.status(400).json({ error: 'Description must be at least 10 characters.' });
    if (areaLabel.length < 2) return res.status(400).json({ error: 'Last-seen area is required (an approximate area is fine).' });
    const loc = optInLocation(body);

    const report = {
      id: uid('mp'),
      reporterId: me.id,
      reporterName: resolveName(me),
      personName: personName.slice(0, 80),
      age: Number.isFinite(Number(body.age)) ? Math.max(0, Math.min(120, Math.round(Number(body.age)))) : undefined,
      gender: typeof body.gender === 'string' && body.gender.trim() ? String(body.gender).trim().slice(0, 20) : undefined,
      description: description.slice(0, 2000),
      photoUrl: typeof body.photoUrl === 'string' && /^\/uploads\//.test(body.photoUrl) ? body.photoUrl.slice(0, 300) : undefined,
      areaLabel: areaLabel.slice(0, 120),
      lastSeenAt: Number.isFinite(Number(body.lastSeenAt)) ? Math.max(0, Number(body.lastSeenAt)) : now(),
      lastSeenText: String(body.lastSeenText || '').trim().slice(0, 120),
      shareLocation: !!loc,
      ...(loc ? { lat: loc.lat, lng: loc.lng } : {}),
      contactNote: String(body.contactNote || '').trim().slice(0, 500),
      status: 'active' as MissingStatus,
      verifierIds: [],
      sightings: [],
      reports: [],
      createdAt: now(),
      updatedAt: now(),
    };
    s.reports.push(report);
    saveDatabase(db);
    res.json({ report: toDetailReport(report, me.id) });
  });

  // POST /api/missing/reports/:id/sightings — submit a sighting (requireAuth)
  app.post('/api/missing/reports/:id/sightings', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const report = (s.reports || []).find((r: any) => r && r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (report.status !== 'active') return res.status(400).json({ error: 'This report is closed.' });
    if (report.reporterId === me.id) {
      return res.status(403).json({ error: 'The reporter cannot submit a sighting on their own report.' });
    }
    // Rate limit: 5 sightings / hour per user across all reports.
    const allSightings = (s.reports || []).flatMap((r: any) =>
      (r?.sightings || []).filter((x: any) => x && x.sighterId === me.id)
    );
    const inWindow = allSightings.filter((x: any) => now() - (x?.createdAt || 0) < SIGHTING_WINDOW_MS).length;
    if (inWindow >= MAX_SIGHTINGS_PER_WINDOW) {
      return res.status(429).json({ error: 'You have submitted several sightings recently. Please wait a while.' });
    }
    const body = req.body || {};
    const note = String(body.note || '').trim();
    if (note.length < 5) {
      return res.status(400).json({ error: 'Please describe what you saw or the information you have (min 5 characters).' });
    }
    const kind: SightingKind = body.kind === 'information' ? 'information' : 'sighting';
    const loc = optInLocation(body);
    const firstSighting = !(report.sightings || []).some((x: any) => x && x.sighterId === me.id);
    const sighting: MissingSighting = {
      id: uid('sgt'),
      reportId: report.id,
      sighterId: me.id,
      sighterName: resolveName(me),
      kind,
      note: note.slice(0, 1000),
      areaLabel: String(body.areaLabel || '').trim().slice(0, 120),
      shareLocation: !!loc,
      ...(loc ? { lat: loc.lat, lng: loc.lng } : {}),
      helpfulBy: [],
      createdAt: now(),
    };
    report.sightings = report.sightings || [];
    report.sightings.push(sighting);
    report.updatedAt = now();
    saveDatabase(db);
    if (firstSighting) awardCoins(me.id, COINS_SIGHTING);
    res.json({ report: toDetailReport(report, me.id), coinAwarded: firstSighting });
  });

  // POST /api/missing/reports/:id/sightings/:sightId/helpful — mark a sighting helpful (requireAuth)
  app.post('/api/missing/reports/:id/sightings/:sightId/helpful', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const report = (s.reports || []).find((r: any) => r && r.id === req.params.id);
    const sighting = (report?.sightings || []).find((x: any) => x && x.id === req.params.sightId);
    if (!report || !sighting) return res.status(404).json({ error: 'Report or sighting not found.' });
    if (sighting.sighterId === me.id) {
      return res.status(403).json({ error: 'You cannot mark your own sighting helpful.' });
    }
    sighting.helpfulBy = sighting.helpfulBy || [];
    const idx = sighting.helpfulBy.indexOf(me.id);
    if (idx >= 0) sighting.helpfulBy.splice(idx, 1);
    else sighting.helpfulBy.push(me.id);
    report.updatedAt = now();
    saveDatabase(db);
    res.json({ helpfulCount: sighting.helpfulBy.length, helpful: idx < 0 });
  });

  // POST /api/missing/reports/:id/verify — community verification the report is real (requireAuth)
  app.post('/api/missing/reports/:id/verify', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const report = (s.reports || []).find((r: any) => r && r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (report.reporterId === me.id) {
      return res.status(403).json({ error: 'You cannot verify your own report.' });
    }
    report.verifierIds = report.verifierIds || [];
    if (report.verifierIds.includes(me.id)) {
      return res.json({ verified: true, verifierCount: report.verifierIds.length, coinAwarded: false });
    }
    report.verifierIds.push(me.id);
    report.updatedAt = now();
    saveDatabase(db);
    awardCoins(me.id, COINS_VERIFY);
    res.json({ verified: true, verifierCount: report.verifierIds.length, coinAwarded: true });
  });

  // POST /api/missing/reports/:id/found — reporter marks the person found safe (requireAuth)
  app.post('/api/missing/reports/:id/found', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const report = (s.reports || []).find((r: any) => r && r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (report.reporterId !== me.id) {
      return res.status(403).json({ error: 'Only the person who filed this report can mark it found safe.' });
    }
    if (report.status !== 'active') return res.status(400).json({ error: 'This report is already closed.' });
    report.status = 'found_safe';
    report.foundNotes = String(req.body?.foundNotes || '').trim().slice(0, 1000);
    report.updatedAt = now();
    const mostHelpful = [...(report.sightings || [])].sort(
      (a: any, b: any) => (b?.helpfulBy?.length || 0) - (a?.helpfulBy?.length || 0)
    )[0];
    saveDatabase(db);
    let rewardedSighter: string | null = null;
    if (
      mostHelpful &&
      mostHelpful.sighterId !== me.id &&
      (mostHelpful.helpfulBy?.length || 0) > 0
    ) {
      rewardedSighter = mostHelpful.sighterId;
      awardCoins(mostHelpful.sighterId, COINS_FOUND);
    }
    res.json({ report: toDetailReport(report, me.id), rewardedSighter });
  });

  // POST /api/missing/reports/:id/report — report a fake/spam listing (requireAuth)
  app.post('/api/missing/reports/:id/report', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const report = (s.reports || []).find((r: any) => r && r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (report.reporterId === me.id) {
      return res.status(403).json({ error: 'You cannot report your own listing.' });
    }
    const reason = String(req.body?.reason || 'fake_report').slice(0, 60);
    const details = String(req.body?.details || '').slice(0, 500);
    report.reports = report.reports || [];
    report.reports.push({ reason, details, at: now() });
    if (report.reports.length >= MAX_REPORTS_TO_CLOSE) {
      report.status = 'withdrawn';
    }
    report.updatedAt = now();
    saveDatabase(db);
    res.json({ ok: true, reportCount: report.reports.length, withdrawn: report.status === 'withdrawn' });
  });

  // GET /api/missing/status — my summary + balance (requireAuth)
  app.get('/api/missing/status', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const s = ensureMissingPerson(db);
    const myReports = (s.reports || []).filter((r: any) => r && r.reporterId === me.id);
    const mySightings = (s.reports || []).flatMap((r: any) =>
      (r?.sightings || []).filter((x: any) => x && x.sighterId === me.id)
    );
    res.json({
      myReportCount: myReports.length,
      activeCount: (s.reports || []).filter((r: any) => r && r.status === 'active').length,
      mySightingCount: mySightings.length,
      balance: balanceOf(me),
    });
  });
}
