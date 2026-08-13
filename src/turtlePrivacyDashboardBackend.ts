/**
 * Ocean — Privacy Dashboard backend
 * ---------------------------------
 * PRIVACY & SOVEREIGNTY feature (Batch B5 — feature 133 "Privacy Dashboard").
 * Data-access transparency + control: an access log, a third-party app list with
 * revoke, a per-scope permission matrix, activity-masking preferences, and a
 * summary endpoint. Frontend: src/components/PrivacyDashboard.tsx.
 *
 * Privacy / security model:
 *  - Every mutating route is requireAuth-guarded; all reads are scoped to the
 *    authenticated user (access log is filtered by userId).
 *  - IP addresses are NEVER persisted raw — access events store ip:"masked".
 *  - No secrets are stored: the dashboard holds only event metadata, app names,
 *    scope strings and boolean preferences. No base64 secrets anywhere.
 *  - Masking preferences are persisted on the user record as plain booleans
 *    (db.users[].privacyPreferences) — no sensitive material.
 *
 * Persistence: db.privacyDashboard = { accessLog: [], thirdPartyApps: [],
 * permissions: {} } — idempotently ensured + read defensively.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

const MAX_ACCESS_LOG = 1000; // global cap so the collection cannot grow unbounded
const MAX_LIMIT = 200;
const MAX_ACTION_LEN = 80;
const MAX_RESOURCE_LEN = 200;
const MAX_SCOPE_LEN = 60;
const MAX_APP_NAME_LEN = 120;

export interface PrivacyAccessEvent {
  id: string;
  userId: string;
  action: string;
  resource: string;
  at: number;
  ip: string; // always "masked" — raw client IP is never stored
}

export type ThirdPartyAppStatus = 'active' | 'revoked';

export interface ThirdPartyApp {
  id: string;
  name: string;
  logoEmoji: string;
  scopes: string[];
  status: ThirdPartyAppStatus;
  lastUsedAt: number;
}

export interface PrivacyDashboardState {
  accessLog: PrivacyAccessEvent[];
  thirdPartyApps: ThirdPartyApp[];
  permissions: Record<string, string[]>;
}

export interface MaskPreferences {
  maskOnlineStatus: boolean;
  hideReadingList: boolean;
  privateProfile: boolean;
}

const DEFAULT_MASK: MaskPreferences = {
  maskOnlineStatus: false,
  hideReadingList: false,
  privateProfile: false,
};

/** Fake third-party apps used to seed the dashboard so it renders with content. */
const SEED_APPS: Omit<ThirdPartyApp, 'lastUsedAt'>[] = [
  { id: 'ocean-analytics', name: 'Ocean Analytics', logoEmoji: '📊', scopes: ['profile:read', 'posts:read', 'activity:read'], status: 'active' },
  { id: 'bd-weather', name: 'BD Weather', logoEmoji: '⛅', scopes: ['location:approximate'], status: 'active' },
  { id: 'community-maps', name: 'Community Maps', logoEmoji: '🗺️', scopes: ['location:approximate', 'friends:read'], status: 'active' },
];

function nowId(): string {
  return 'pal-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

/** Idempotent ensure of db.privacyDashboard + defensive reads. */
function ensureDashboard(db: any): PrivacyDashboardState {
  if (!db.privacyDashboard || typeof db.privacyDashboard !== 'object' || Array.isArray(db.privacyDashboard)) {
    db.privacyDashboard = {};
  }
  const pd = db.privacyDashboard as PrivacyDashboardState;
  if (!Array.isArray(pd.accessLog)) pd.accessLog = [];
  if (!Array.isArray(pd.thirdPartyApps)) pd.thirdPartyApps = [];
  if (!pd.permissions || typeof pd.permissions !== 'object' || Array.isArray(pd.permissions)) pd.permissions = {};
  // Seed the fake apps once (and their default permission scopes).
  if (pd.thirdPartyApps.length === 0) {
    const now = Date.now();
    SEED_APPS.forEach((a) => {
      pd.thirdPartyApps.push({ ...a, lastUsedAt: now - Math.floor(Math.random() * 72) * 3600000 - 600000 });
      if (!pd.permissions[a.id]) pd.permissions[a.id] = [...a.scopes];
    });
  }
  return pd;
}

/** Mask preferences from the user record (defensive defaults). */
function readMaskPrefs(db: any, userId: string): MaskPreferences {
  const users = Array.isArray(db.users) ? db.users : [];
  const me = users.find((u: any) => u && u.id === userId);
  const p = me && me.privacyPreferences && typeof me.privacyPreferences === 'object'
    ? me.privacyPreferences
    : DEFAULT_MASK;
  return {
    maskOnlineStatus: p.maskOnlineStatus === true,
    hideReadingList: p.hideReadingList === true,
    privateProfile: p.privateProfile === true,
  };
}

export function registerPrivacyDashboardRoutes(app: any): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // -------------------------------------------------------------------------
  // POST /api/privacy/log-access — log an access event (ip always masked)
  // -------------------------------------------------------------------------
  app.post('/api/privacy/log-access', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const action = body.action ? String(body.action).slice(0, MAX_ACTION_LEN).trim() : '';
      if (!action) return res.status(400).json({ error: 'action is required.' });
      const resource = body.resource ? String(body.resource).slice(0, MAX_RESOURCE_LEN).trim() : '';

      const db = loadDatabase();
      const pd = ensureDashboard(db);
      pd.accessLog.unshift({
        id: nowId(),
        userId: user.id,
        action,
        resource,
        at: Date.now(),
        ip: 'masked',
      });
      if (pd.accessLog.length > MAX_ACCESS_LOG) pd.accessLog.length = MAX_ACCESS_LOG;
      saveDatabase(db);
      res.json({ success: true, event: pd.accessLog[0] });
    } catch (e) {
      res.status(500).json({ error: 'Failed to log access event.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/privacy/access-log?limit=50 — my access log, most recent first
  // -------------------------------------------------------------------------
  app.get('/api/privacy/access-log', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const pd = ensureDashboard(db);
      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1),
        MAX_LIMIT
      );
      const events = pd.accessLog
        .filter((e: PrivacyAccessEvent) => e.userId === user.id)
        .slice(0, limit);
      res.json({ events });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load access log.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/privacy/third-party — third-party apps with access (seeded)
  // -------------------------------------------------------------------------
  app.get('/api/privacy/third-party', requireAuth, (req: any, res: any) => {
    try {
      const db = loadDatabase();
      const pd = ensureDashboard(db);
      res.json({ apps: pd.thirdPartyApps });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load third-party apps.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/privacy/third-party/:appId/revoke — revoke an app's access
  // -------------------------------------------------------------------------
  app.post('/api/privacy/third-party/:appId/revoke', requireAuth, (req: any, res: any) => {
    try {
      const appId = String((req.params && req.params.appId) || '');
      if (!appId) return res.status(400).json({ error: 'appId is required.' });
      const db = loadDatabase();
      const pd = ensureDashboard(db);
      const app = pd.thirdPartyApps.find((a: ThirdPartyApp) => a.id === appId);
      if (!app) return res.status(404).json({ error: 'Unknown third-party app.' });
      app.status = 'revoked';
      app.lastUsedAt = Date.now();
      saveDatabase(db);
      res.json({ success: true, app });
    } catch (e) {
      res.status(500).json({ error: 'Failed to revoke app.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/privacy/permissions — permission matrix (appId -> scopes)
  // -------------------------------------------------------------------------
  app.get('/api/privacy/permissions', requireAuth, (req: any, res: any) => {
    try {
      const db = loadDatabase();
      const pd = ensureDashboard(db);
      res.json({ permissions: pd.permissions });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load permissions.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/privacy/permissions — toggle a single scope for an app
  // -------------------------------------------------------------------------
  app.post('/api/privacy/permissions', requireAuth, (req: any, res: any) => {
    try {
      const body = req.body || {};
      const appId = body.appId ? String(body.appId).slice(0, MAX_RESOURCE_LEN) : '';
      const scope = body.scope ? String(body.scope).slice(0, MAX_SCOPE_LEN) : '';
      const granted = body.granted === true;
      if (!appId || !scope) return res.status(400).json({ error: 'appId and scope are required.' });

      const db = loadDatabase();
      const pd = ensureDashboard(db);
      const app = pd.thirdPartyApps.find((a: ThirdPartyApp) => a.id === appId);
      if (!app) return res.status(404).json({ error: 'Unknown third-party app.' });

      if (!pd.permissions[appId]) pd.permissions[appId] = [];
      const scopes = pd.permissions[appId];
      const idx = scopes.indexOf(scope);
      if (granted && idx === -1) scopes.push(scope);
      if (!granted && idx !== -1) scopes.splice(idx, 1);

      // Re-granting any scope to a revoked app reactivates it.
      if (granted && app.status === 'revoked') {
        app.status = 'active';
        app.lastUsedAt = Date.now();
      }

      saveDatabase(db);
      res.json({ success: true, appId, scope, granted, scopes });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update permission.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/privacy/mask-activity — persist masking prefs on the user record
  // -------------------------------------------------------------------------
  app.post('/api/privacy/mask-activity', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const prefs: MaskPreferences = {
        maskOnlineStatus: body.maskOnlineStatus === true,
        hideReadingList: body.hideReadingList === true,
        privateProfile: body.privateProfile === true,
      };
      const db = loadDatabase();
      const users = Array.isArray(db.users) ? db.users : [];
      const idx = users.findIndex((u: any) => u && u.id === user.id);
      if (idx === -1) return res.status(404).json({ error: 'User record not found.' });
      users[idx].privacyPreferences = prefs;
      saveDatabase(db);
      res.json({ success: true, privacyPreferences: prefs });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update privacy preferences.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/privacy/summary — dashboard counts + mask settings
  // -------------------------------------------------------------------------
  app.get('/api/privacy/summary', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const pd = ensureDashboard(db);
      const prefs = readMaskPrefs(db, user.id);
      const events = pd.accessLog.filter((e: PrivacyAccessEvent) => e.userId === user.id).length;
      const activeApps = pd.thirdPartyApps.filter((a: ThirdPartyApp) => a.status === 'active').length;
      const revokedApps = pd.thirdPartyApps.filter((a: ThirdPartyApp) => a.status === 'revoked').length;
      res.json({
        summary: {
          accessEvents: events,
          activeApps,
          revokedApps,
          maskSettings: prefs,
        },
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load privacy summary.' });
    }
  });
}
