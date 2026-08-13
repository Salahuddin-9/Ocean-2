/**
 * Ocean — Digital Legacy & Memorial Page (Feature 20)
 * -----------------------------------------------------
 * Let users designate a legacy contact and an inactivity threshold (default 12
 * months). The legacy contact verifies their role; a daily scan (admin endpoint,
 * callable from the UI) memorializes accounts inactive beyond the threshold —
 * the profile gets a memorial badge and becomes read-only.
 *
 * User fields: legacyContactId, legacyInactiveMonths, legacyVerifiedBy,
 * legacyVerifiedAt, memorialized, memorializedAt, lastActiveAt.
 *
 * Routes:
 *   GET  /api/account/legacy              (auth) my legacy settings
 *   POST /api/account/legacy              (auth) { legacyContactId, inactiveMonths }
 *   GET  /api/account/legacy/requests     (auth) pending requests where I am the contact
 *   POST /api/account/legacy/contact/verify (auth) { ownerUserId } confirm the role
 *   POST /api/account/legacy/contact/decline (auth) { ownerUserId } decline
 *   POST /api/admin/legacy/scan           (admin) memorialize due accounts
 *   POST /api/admin/legacy/memorialize/:userId (admin) manual trigger
 */
import express from 'express';
import { getCtx } from './turtleServerContext';

const DEFAULT_THRESHOLD_MONTHS = 12;
const MIN_THRESHOLD_MONTHS = 3;
const MAX_THRESHOLD_MONTHS = 60;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function lastActiveOf(u: any): number {
  const raw = u?.lastActiveAt ?? u?.lastLoginAt ?? u?.lastSeenAt ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function userSummary(db: any, u: any) {
  return {
    id: u.id,
    name: u.name || u.username || 'User',
    memorialized: !!u.memorialized,
  };
}

export function registerDigitalLegacyRoutes(app: express.Express): void {
  const { requireAuth, requireAdmin, loadDatabase, saveDatabase } = getCtx();

  // GET /api/account/legacy — my settings (auth)
  app.get('/api/account/legacy', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const contact = user.legacyContactId
      ? (db.users || []).find((u: any) => u && u.id === user.legacyContactId)
      : null;
    const monthsInactive = lastActiveOf(user)
      ? Math.floor((Date.now() - lastActiveOf(user)) / MONTH_MS)
      : null;
    res.json({
      legacy: {
        legacyContactId: user.legacyContactId || null,
        legacyContactName: contact ? contact.name || contact.username || 'User' : null,
        legacyContactVerified: !!user.legacyVerifiedBy,
        inactiveMonths: user.legacyInactiveMonths || DEFAULT_THRESHOLD_MONTHS,
        memorialized: !!user.memorialized,
        memorializedAt: user.memorializedAt || null,
        monthsInactive,
      },
      defaultInactiveMonths: DEFAULT_THRESHOLD_MONTHS,
    });
  });

  // POST /api/account/legacy — set my legacy preferences (auth)
  app.post('/api/account/legacy', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    const contactId = String(body.legacyContactId || '');
    if (contactId) {
      if (contactId === user.id) return res.status(400).json({ error: 'You cannot be your own legacy contact.' });
      const contact = (db.users || []).find((u: any) => u && u.id === contactId);
      if (!contact) return res.status(404).json({ error: 'Legacy contact user not found.' });
      user.legacyContactId = contactId;
      // Changing the contact resets verification.
      user.legacyVerifiedBy = null;
      user.legacyVerifiedAt = null;
    } else {
      delete user.legacyContactId;
      user.legacyVerifiedBy = null;
      user.legacyVerifiedAt = null;
    }
    const months = Math.floor(Number(body.inactiveMonths) || DEFAULT_THRESHOLD_MONTHS);
    user.legacyInactiveMonths = Math.min(MAX_THRESHOLD_MONTHS, Math.max(MIN_THRESHOLD_MONTHS, months));
    saveDatabase(db);
    res.json({
      legacy: {
        legacyContactId: user.legacyContactId || null,
        legacyContactVerified: !!user.legacyVerifiedBy,
        inactiveMonths: user.legacyInactiveMonths,
        memorialized: !!user.memorialized,
      },
    });
  });

  // GET /api/account/legacy/requests — pending confirmations where I am the contact (auth)
  app.get('/api/account/legacy/requests', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const pending = (db.users || [])
      .filter((u: any) => u && u.legacyContactId === user.id && !u.legacyVerifiedBy && !u.memorialized)
      .map((u: any) => userSummary(db, u));
    const verified = (db.users || [])
      .filter((u: any) => u && u.legacyContactId === user.id && u.legacyVerifiedBy === user.id)
      .map((u: any) => userSummary(db, u));
    res.json({ pending, verified });
  });

  // POST /api/account/legacy/contact/verify — I confirm my role (auth)
  app.post('/api/account/legacy/contact/verify', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const ownerUserId = String((req.body || {}).ownerUserId || '');
    const owner = (db.users || []).find((u: any) => u && u.id === ownerUserId);
    if (!owner) return res.status(404).json({ error: 'Account not found.' });
    if (owner.legacyContactId !== user.id) {
      return res.status(403).json({ error: 'You are not the designated legacy contact for this account.' });
    }
    owner.legacyVerifiedBy = user.id;
    owner.legacyVerifiedAt = Date.now();
    saveDatabase(db);
    res.json({ success: true, message: `You are now the verified legacy contact for ${owner.name || owner.username || 'this account'}.` });
  });

  // POST /api/account/legacy/contact/decline
  app.post('/api/account/legacy/contact/decline', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const ownerUserId = String((req.body || {}).ownerUserId || '');
    const owner = (db.users || []).find((u: any) => u && u.id === ownerUserId);
    if (!owner) return res.status(404).json({ error: 'Account not found.' });
    if (owner.legacyContactId !== user.id) return res.status(403).json({ error: 'Not the designated contact.' });
    owner.legacyContactId = null;
    owner.legacyVerifiedBy = null;
    owner.legacyVerifiedAt = null;
    saveDatabase(db);
    res.json({ success: true, message: 'Request declined.' });
  });

  // POST /api/admin/legacy/scan — memorialize due accounts (admin; daily cron)
  app.post('/api/admin/legacy/scan', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const now = Date.now();
    let memorialized = 0;
    for (const u of db.users || []) {
      if (!u || u.memorialized) continue;
      if (!u.legacyContactId || !u.legacyVerifiedBy) continue;
      const last = lastActiveOf(u);
      const thresholdMs = (u.legacyInactiveMonths || DEFAULT_THRESHOLD_MONTHS) * MONTH_MS;
      if (last > 0 && now - last >= thresholdMs) {
        u.memorialized = true;
        u.memorializedAt = now;
        memorialized += 1;
      }
    }
    saveDatabase(db);
    res.json({ scanned: (db.users || []).length, memorialized });
  });

  // POST /api/admin/legacy/memorialize/:userId — manual trigger (admin)
  app.post('/api/admin/legacy/memorialize/:userId', requireAuth, requireAdmin, (req, res) => {
    const db = loadDatabase();
    const u = (db.users || []).find((x: any) => x && x.id === req.params.userId);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    u.memorialized = true;
    u.memorializedAt = Date.now();
    saveDatabase(db);
    res.json({ success: true, user: userSummary(db, u) });
  });
}
