/**
 * Ocean — Cyclone Evacuation Route Optimizer backend (FEATURE 128)
 * ------------------------------------------------------------------
 * Given a user's location, rank the nearest open shelters on routes that avoid
 * flooded / congested areas, using community data already in the db:
 *   - shelters      -> db.safeShelter.shelters (fuzzy areaLabel, never precise)
 *   - flood reports -> db.floodMapper.reports (lat/lng + depth)
 *   - hazard posts  -> db.safeWatch.posts (areaLabel hazards, e.g. road/water)
 *
 * The engine computes flood "zones" (clusters of depth reports per fuzzy area),
 * finds the best-matching zone for each open shelter, then samples 8 points
 * along the straight-line corridor user -> shelter and penalises any corridor
 * that crosses deep water or reported hazards. Output: ranked evacuation
 * options with an estimated km, a hazard level and plain-language advice.
 *
 * Honesty note: shelters are fuzzy-area only by design (SafeShelter privacy
 * rule), so distances are estimates derived from flood-zone centroids, not turn
 * by turn navigation. The result is directional guidance, not GPS navigation.
 *
 * Routes:
 *   POST /api/shelter/evacuate       -> { lat, lng } (or { areaLabel }) -> ranked options
 *   GET  /api/shelter/evacuate/status -> flood zones + shelter summary (guest-safe)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface EvacOption {
  shelterId: string;
  name: string;
  areaLabel: string;
  capacity: number;
  open: boolean;
  amenities: string[];
  /** Estimated straight-line distance in km (0 = unknown). */
  estKm: number;
  hazardScore: number; // 0..100
  hazardLevel: 'low' | 'moderate' | 'high';
  floodDepthCm: number; // max depth crossed on the corridor (0 = none known)
  advice: string;
  verified: boolean;
}

export interface FloodZone {
  areaLabel: string;
  centroidLat: number;
  centroidLng: number;
  reportCount: number;
  maxDepthCm: number;
}

const EARTH_R = 6371;
const SAMPLE_POINTS = 8;
const CORRIDOR_RADIUS_KM = 2.5;
const MAX_OPTIONS = 8;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

function depthOf(r: any): number {
  const d = Number(r?.depth ?? r?.depthCm ?? r?.waterDepth ?? 0);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

function areaOf(r: any): string {
  return String(r?.areaLabel || r?.area || r?.locationLabel || '').trim();
}

function coordOf(r: any): { lat: number; lng: number } | null {
  const lat = Number(r?.lat ?? r?.latitude);
  const lng = Number(r?.lng ?? r?.longitude ?? r?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function tokens(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9\u00C0-\uFFFF]+/)
    .filter((t) => t.length > 2);
}

/** Textual overlap score between two area labels (0..1). */
function labelOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const hits = ta.filter((t) => tb.includes(t)).length;
  return hits / Math.max(ta.length, tb.length);
}

function hazardLevelOf(score: number): EvacOption['hazardLevel'] {
  if (score >= 60) return 'high';
  if (score >= 30) return 'moderate';
  return 'low';
}

export function registerEvacuationRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = ctx;

  // Build flood zones from db.floodMapper.reports (defensive reads).
  function buildZones(db: any): FloodZone[] {
    const reports = Array.isArray(db?.floodMapper?.reports) ? db.floodMapper.reports : [];
    const byArea = new Map<string, { lats: number[]; lngs: number[]; depths: number[]; label: string }>();
    for (const r of reports) {
      const c = coordOf(r);
      const label = areaOf(r) || 'Unknown area';
      const key = label.toLowerCase();
      const e = byArea.get(key) || { lats: [], lngs: [], depths: [], label };
      if (c) {
        e.lats.push(c.lat);
        e.lngs.push(c.lng);
      }
      e.depths.push(depthOf(r));
      byArea.set(key, e);
    }
    const zones: FloodZone[] = [];
    for (const e of byArea.values()) {
      if (e.lats.length === 0) continue;
      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
      zones.push({
        areaLabel: e.label,
        centroidLat: avg(e.lats),
        centroidLng: avg(e.lngs),
        reportCount: e.depths.length,
        maxDepthCm: Math.max(0, ...e.depths),
      });
    }
    return zones.sort((a, b) => b.maxDepthCm - a.maxDepthCm);
  }

  // Corridor hazard: sample the straight line from origin to target; count flood
  // reports within CORRIDOR_RADIUS_KM of each sample. Watch hazards (areaLabel
  // only, no coords) add a flat penalty once per hazard, any non-closed status.
  function corridorHazard(db: any, from: { lat: number; lng: number }, to: { lat: number; lng: number }): { score: number; maxDepthCm: number } {
    const reports = Array.isArray(db?.floodMapper?.reports) ? db.floodMapper.reports : [];
    const floodPoints = reports
      .map((r: any) => ({ ...coordOf(r), depth: depthOf(r) }))
      .filter((p: any) => p && p.lat !== undefined);
    const watch = Array.isArray(db?.safeWatch?.posts) ? db.safeWatch.posts : [];
    const openHazards = watch.filter(
      (w: any) =>
        w &&
        (w.category === 'water' || w.category === 'road') &&
        !['resolved', 'dismissed', 'expired'].includes(w.status)
    ).length;
    let score = openHazards * 2;
    let maxDepth = 0;
    for (let i = 0; i <= SAMPLE_POINTS; i++) {
      const t = i / SAMPLE_POINTS;
      const lat = from.lat + (to.lat - from.lat) * t;
      const lng = from.lng + (to.lng - from.lng) * t;
      for (const p of floodPoints) {
        const d = haversineKm(lat, lng, p.lat, p.lng);
        if (d <= CORRIDOR_RADIUS_KM) {
          score += Math.min(30, (p.depth || 1) * 2);
          maxDepth = Math.max(maxDepth, p.depth || 0);
        }
      }
    }
    return { score: Math.min(100, score), maxDepthCm: maxDepth };
  }

  // POST /api/shelter/evacuate — ranked evacuation options.
  app.post('/api/shelter/evacuate', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const body = req.body || {};
      const db = loadDatabase();
      const shelters = Array.isArray(db?.safeShelter?.shelters) ? db.safeShelter.shelters : [];
      const zones = buildZones(db);

      // Rate limit: 12 evacuation plans / hour per user (consistent with the
      // other safety modules). The planning log doubles as an audit trail.
      if (!Array.isArray(db.evacuationLog)) db.evacuationLog = [];
      const hourAgo = Date.now() - 60 * 60 * 1000;
      db.evacuationLog = db.evacuationLog.filter((e: any) => e && e.at >= hourAgo);
      if (db.evacuationLog.filter((e: any) => e && e.userId === me.id).length >= 12) {
        return res.status(429).json({ error: 'You have planned many evacuations this hour. Please wait a moment.' });
      }
      db.evacuationLog.push({ userId: me.id, at: Date.now() });

      const nLat = Number(body.lat);
      const nLng = Number(body.lng);
      const hasCoords = Number.isFinite(nLat) && Number.isFinite(nLng);
      const areaLabel = String(body.areaLabel || '').trim();

      if (!hasCoords && !areaLabel) {
        return res.status(400).json({ error: 'Provide your lat/lng or an area label.' });
      }
      if (hasCoords && (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180)) {
        return res.status(400).json({ error: 'Coordinates out of range.' });
      }

      const origin = hasCoords ? { lat: nLat, lng: nLng } : null;
      const options: EvacOption[] = [];

      for (const sh of shelters) {
        if (!sh || sh.open === false) continue;
        const shArea = String(sh.areaLabel || '');
        // Best zone for this shelter: strongest label overlap, else nearest centroid.
        let zone: FloodZone | null = null;
        let bestOverlap = 0;
        for (const z of zones) {
          const ov = labelOverlap(shArea, z.areaLabel);
          if (ov > bestOverlap) {
            bestOverlap = ov;
            zone = z;
          }
        }
        if (!zone && zones.length > 0) {
          // Nearest flood zone centroid (used only to estimate distance).
          let bestD = Infinity;
          for (const z of zones) {
            if (!origin) continue;
            const d = haversineKm(origin.lat, origin.lng, z.centroidLat, z.centroidLng);
            if (d < bestD) {
              bestD = d;
              zone = z;
            }
          }
        }

        let estKm = 0;
        let hazard: { score: number; maxDepthCm: number } = { score: 0, maxDepthCm: 0 };
        const target = zone ? { lat: zone.centroidLat, lng: zone.centroidLng } : null;

        if (origin && target) {
          estKm = Math.round(haversineKm(origin.lat, origin.lng, target.lat, target.lng) * 10) / 10;
          hazard = corridorHazard(db, origin, target);
        } else if (!origin && zone) {
          // Area-only mode: distance unknown, hazard from zone depth.
          hazard = { score: Math.min(100, zone.maxDepthCm * 3), maxDepthCm: zone.maxDepthCm };
        }

        // Shelters with verified status + open capacity get a small boost (lower score).
        const verifiedBoost = sh.verified ? -8 : 0;
        const hazardScore = Math.max(0, Math.min(100, hazard.score + verifiedBoost));
        const level = hazardLevelOf(hazardScore);

        const advice =
          level === 'high'
            ? 'Corridor crosses reported deep water — avoid this route unless no alternative.'
            : level === 'moderate'
              ? 'Some flood reports along the route — travel with caution, prefer higher ground.'
              : 'Relatively clear corridor — a recommended evacuation option.';
        const hasDeepWater = hazard.maxDepthCm >= 60;
        const finalAdvice = hasDeepWater
          ? `⚠ Deep water (~${Math.round(hazard.maxDepthCm)}cm) reported on this corridor — do not attempt on foot. ` + advice
          : advice;

        options.push({
          shelterId: sh.id,
          name: String(sh.name || 'Shelter'),
          areaLabel: shArea || 'Area unknown',
          capacity: Number(sh.capacity) || 0,
          open: true,
          amenities: Array.isArray(sh.amenities) ? sh.amenities : [],
          estKm,
          hazardScore: Math.round(hazardScore),
          hazardLevel: level,
          floodDepthCm: Math.round(hazard.maxDepthCm),
          advice: finalAdvice,
          verified: !!sh.verified,
        });
      }

      options.sort((a, b) => {
        if (a.estKm && b.estKm && a.estKm !== b.estKm) return a.estKm - b.estKm;
        return a.hazardScore - b.hazardScore;
      });

      // Overall safety bearing: azimuth away from the deepest flood zone.
      let safeBearing = 0;
      let nearestDeep: FloodZone | null = null;
      if (origin && zones.length > 0) {
        for (const z of zones) {
          if (z.maxDepthCm >= 30) {
            const d = haversineKm(origin.lat, origin.lng, z.centroidLat, z.centroidLng);
            if (!nearestDeep || d < haversineKm(origin.lat, origin.lng, nearestDeep.centroidLat, nearestDeep.centroidLng)) {
              nearestDeep = z;
            }
          }
        }
        if (nearestDeep) {
          const dLat = nearestDeep.centroidLat - origin.lat;
          const dLng = nearestDeep.centroidLng - origin.lng;
          const away = (Math.atan2(dLng, dLat) * 180) / Math.PI + 180; // opposite direction
          safeBearing = ((Math.round(away) % 360) + 360) % 360;
        }
      }

      saveDatabase(db);
      res.json({
        origin: origin ? { lat: origin.lat, lng: origin.lng } : null,
        areaLabel,
        options: options.slice(0, MAX_OPTIONS),
        floodZones: zones.slice(0, 6).map((z) => ({
          areaLabel: z.areaLabel,
          reportCount: z.reportCount,
          maxDepthCm: z.maxDepthCm,
          centroidLat: z.centroidLat,
          centroidLng: z.centroidLng,
        })),
        safeBearing,
        evacuatedBy: me.name || me.username || 'User',
        disclaimer:
          'Directional guidance from community reports — not GPS navigation. In a live cyclone, follow official evacuation orders.',
      });
    } catch (e: any) {
      console.warn('[evacuation] error:', e?.message || e);
      res.status(500).json({ error: 'Evacuation planning failed.' });
    }
  });

  // GET /api/shelter/evacuate/status — flood zones + shelter summary (guest-safe).
  app.get('/api/shelter/evacuate/status', (req, res) => {
    try {
      const db = loadDatabase();
      const zones = buildZones(db);
      const shelters = Array.isArray(db?.safeShelter?.shelters) ? db.safeShelter.shelters : [];
      const open = shelters.filter((s: any) => s && s.open !== false);
      const viewer = getRequestUser(req);
      res.json({
        zones: zones.slice(0, 6),
        zoneCount: zones.length,
        shelterCount: open.length,
        viewerId: viewer?.id ?? null,
      });
    } catch (e: any) {
      console.warn('[evacuation] status error:', e?.message || e);
      res.status(500).json({ error: 'Status failed.' });
    }
  });
}
