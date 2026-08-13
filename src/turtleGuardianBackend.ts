/**
 * Ocean — Trusted Guardian for Minors (Feature 205)
 * ---------------------------------------------------
 * A guardian approval workflow: a user requests a guardian (by user id), the
 * guardian approves/rejects, and the pairing is stored. Guardians get a badge
 * on their profile and can see a minimal safety dashboard (no message content).
 *
 * Model (global db): db.guardianApprovals — array of
 *   { id, minorId, minorName, guardianId, guardianName, status: 'pending'|'approved'|'rejected',
 *     requestedAt, respondedAt }
 *
 * Routes:
 *   GET  /api/guardian                 (auth) my pairs (as minor and as guardian)
 *   POST /api/guardian/request          (auth) { guardianId } — ask someone to be my guardian
 *   POST /api/guardian/:id/respond      (auth) { status } — approve/reject (guardian only)
 *   POST /api/guardian/:id/remove       (auth) either party removes the pairing
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface GuardianApproval {
  id: string;
  minorId: string;
  minorName: string;
  guardianId: string;
  guardianName: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: number;
  respondedAt?: number;
}

function uid(): string {
  return `gd-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.guardianApprovals)) db.guardianApprovals = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function resolveUser(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  const byId = (db.users || []).find((u: any) => u && u.id === q);
  if (byId) return byId;
  return (db.users || []).find((u: any) => u && (u.name === q || u.username === q)) || null;
}

export function registerGuardianRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/guardian', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const asMinor = (db.guardianApprovals as GuardianApproval[]).filter((g) => g.minorId === user.id);
    const asGuardian = (db.guardianApprovals as GuardianApproval[]).filter((g) => g.guardianId === user.id);
    res.json({ asMinor, asGuardian });
  });

  app.post('/api/guardian/request', requireAuth, (req, res) => {
    const user = (req as any).user;
    const guardianRef = s((req.body || {}).guardianId, 100);
    if (!guardianRef) return res.status(400).json({ error: 'guardianId is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const guardian = resolveUser(db, guardianRef);
    if (!guardian) return res.status(404).json({ error: 'Guardian user not found.' });
    if (guardian.id === user.id) return res.status(400).json({ error: 'You cannot be your own guardian.' });
    const existing = (db.guardianApprovals as GuardianApproval[]).find(
      (g) => (g.minorId === user.id && g.guardianId === guardian.id) && g.status !== 'rejected'
    );
    if (existing) return res.status(400).json({ error: 'A request is already pending or approved.' });
    const approval: GuardianApproval = {
      id: uid(),
      minorId: user.id,
      minorName: user.name || user.username || 'User',
      guardianId: guardian.id,
      guardianName: guardian.name || guardian.username || 'User',
      status: 'pending',
      requestedAt: Date.now(),
    };
    (db.guardianApprovals as GuardianApproval[]).push(approval);
    saveDatabase(db);
    res.json({ approval });
  });

  app.post('/api/guardian/:id/respond', requireAuth, (req, res) => {
    const user = (req as any).user;
    const status = (req.body || {}).status;
    if (status !== 'approved' && status !== 'rejected') return res.status(400).json({ error: 'status must be approved or rejected.' });
    const db = loadDatabase();
    ensureCollection(db);
    const approval = (db.guardianApprovals as GuardianApproval[]).find((g) => g.id === req.params.id);
    if (!approval) return res.status(404).json({ error: 'Request not found.' });
    if (approval.guardianId !== user.id) return res.status(403).json({ error: 'Only the requested guardian can respond.' });
    approval.status = status;
    approval.respondedAt = Date.now();
    saveDatabase(db);
    res.json({ approval });
  });

  app.post('/api/guardian/:id/remove', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const approval = (db.guardianApprovals as GuardianApproval[]).find((g) => g.id === req.params.id);
    if (!approval) return res.status(404).json({ error: 'Pairing not found.' });
    if (approval.minorId !== user.id && approval.guardianId !== user.id) {
      return res.status(403).json({ error: 'Not part of this pairing.' });
    }
    approval.status = 'rejected';
    approval.respondedAt = Date.now();
    saveDatabase(db);
    res.json({ success: true });
  });
}
