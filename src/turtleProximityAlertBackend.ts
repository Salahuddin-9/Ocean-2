/**
 * Ocean — Proximity Alert for Blocked Users (Anti-Stalking, Feature 136)
 * -----------------------------------------------------------------------
 * Silent safety net: when a user shares their location (opt-in, as in the
 * discovery feature), the app periodically compares it against the locations of
 * users they have BLOCKED. If a blocked user is reported within the alert radius
 * (default 50 m), a SILENT alert is recorded — no notification bell noise — so
 * the user can stay aware without escalating.
 *
 * User settings: user.proximityAlertEnabled (bool), user.proximityAlertRadiusM.
 * Model (global db): db.proximityAlerts — array of
 *   { id, watcherId, blockedUserId, blockedName, distanceM, at, acknowledged }
 *
 * Routes:
 *   GET  /api/safety/proximity/settings      (auth)
 *   POST /api/safety/proximity/settings      (auth) { enabled, radiusM }
 *   POST /api/safety/proximity/check         (auth) { lat, lng } compare vs blocked users
 *   GET  /api/safety/proximity/alerts        (auth)
 *   POST /api/safety/proximity/alerts/:id/ack (auth)
 */
import express from 'express';
import { getCtx } from './turtleServerContext';

interface ProximityAlert {
  id: string;
  watcherId: string;
  blockedUserId: string;
  blockedName: string;
  distanceM: number;
  at: number;
  acknowledged: boolean;
}

const DEFAULT_RADIUS_M = 50;
const MIN_RADIUS_M = 20;
const MAX_RADIUS_M = 500;
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

function uid(): string {
  return `prox-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureAlerts(db: any): ProximityAlert[] {
  if (!Array.isArray(db.proximityAlerts)) db.proximityAlerts = [];
  return db.proximityAlerts as ProximityAlert[];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sharedLocationOf(u: any): { lat: number; lng: number } | null {
  const loc = u?.profile?.location;
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    return { lat: loc.lat, lng: loc.lng };
  }
  if (u?.location && Number.isFinite(u.location.lat) && Number.isFinite(u.location.lng)) {
    return { lat: u.location.lat, lng: u.location.lng };
  }
  return null;
}

export function registerProximityAlertRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/safety/proximity/settings
  app.get('/api/safety/proximity/settings', requireAuth, (req, res) => {
    const me = (req as any).user;
    res.json({
      enabled: me.proximityAlertEnabled !== false,
      radiusM: me.proximityAlertRadiusM || DEFAULT_RADIUS_M,
      defaultRadiusM: DEFAULT_RADIUS_M,
    });
  });

  // POST /api/safety/proximity/settings
  app.post('/api/safety/proximity/settings', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    me.proximityAlertEnabled = body.enabled !== false;
    const radius = Math.floor(Number(body.radiusM) || DEFAULT_RADIUS_M);
    me.proximityAlertRadiusM = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, radius));
    const db = loadDatabase();
    saveDatabase(db);
    res.json({
      enabled: me.proximityAlertEnabled,
      radiusM: me.proximityAlertRadiusM,
      note: me.proximityAlertEnabled
        ? `Anti-stalking alerts ON — you will be notified (silently) when a blocked user is within ${me.proximityAlertRadiusM} m of your shared location.`
        : 'Anti-stalking alerts OFF.',
    });
  });

  // POST /api/safety/proximity/check — compare my location vs my blocked users (auth)
  app.post('/api/safety/proximity/check', requireAuth, (req, res) => {
    const me = (req as any).user;
    const body = req.body || {};
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Valid lat/lng required.' });
    }
    if (!me.proximityAlertEnabled) {
      return res.json({ checked: 0, alerts: [], enabled: false, note: 'Anti-stalking alerts are off.' });
    }
    const radiusM = me.proximityAlertRadiusM || DEFAULT_RADIUS_M;
    const blockedIds = new Set(me.blockedUserIds || []);
    const db = loadDatabase();
    const alerts = ensureAlerts(db);
    const now = Date.now();
    const fresh: ProximityAlert[] = [];

    for (const u of db.users || []) {
      if (!u || u.id === me.id || !blockedIds.has(u.id)) continue;
      const loc = sharedLocationOf(u);
      if (!loc) continue;
      const distanceM = Math.round(haversineKm(lat, lng, loc.lat, loc.lng) * 1000);
      if (distanceM > radiusM) continue;
      // Dedupe: no unacknowledged alert for this pair within the window.
      const recent = alerts.some(
        (a) => a.watcherId === me.id && a.blockedUserId === u.id && !a.acknowledged && now - a.at < DEDUPE_WINDOW_MS
      );
      if (recent) continue;
      const alert: ProximityAlert = {
        id: uid(),
        watcherId: me.id,
        blockedUserId: u.id,
        blockedName: u.name || u.username || 'Blocked user',
        distanceM,
        at: now,
        acknowledged: false,
      };
      alerts.push(alert);
      fresh.push(alert);
    }
    if (alerts.length > 500) alerts.splice(0, alerts.length - 500);
    saveDatabase(db);
    res.json({
      checked: blockedIds.size,
      enabled: true,
      radiusM,
      alerts: fresh,
      message: fresh.length
        ? `⚠️ ${fresh.length} blocked ${fresh.length === 1 ? 'user is' : 'users are'} within ${radiusM} m.`
        : 'No blocked users detected nearby.',
    });
  });

  // GET /api/safety/proximity/alerts — my alert history (auth)
  app.get('/api/safety/proximity/alerts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const mine = ensureAlerts(db)
      .filter((a) => a.watcherId === me.id)
      .sort((a, b) => b.at - a.at)
      .slice(0, 50);
    res.json({ alerts: mine });
  });

  // POST /api/safety/proximity/alerts/:id/ack — acknowledge (auth)
  app.post('/api/safety/proximity/alerts/:id/ack', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const alerts = ensureAlerts(db);
    const alert = alerts.find((a) => a.id === req.params.id && a.watcherId === me.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    alert.acknowledged = true;
    saveDatabase(db);
    res.json({ success: true });
  });
}
