/**
 * Ocean — Digital FIR / GD Lodge (Feature 212)
 * ----------------------------------------------
 * Simulated police reporting: users lodge a General Diary (GD) entry or FIR
 * draft, which gets a record number and status tracking. A real deployment
 * would push these to the police e-services API; here the flow is fully
 * functional end-to-end with the same record shape.
 *
 * Model (global db): db.firRecords — array of
 *   { id, recordNo, kind: 'gd'|'fir', userId, userName, station, category,
 *     description, status: 'lodged'|'acknowledged'|'under-review'|'closed',
 *     lodgedAt, closedAt?, createdAt }
 *
 * Routes:
 *   GET  /api/fir            (auth) my records
 *   POST /api/fir            (auth) lodge GD / FIR draft
 *   POST /api/fir/:id/status (auth) update status (owner)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface FirRecord {
  id: string;
  recordNo: string;
  kind: 'gd' | 'fir';
  userId: string;
  userName: string;
  station: string;
  category: string;
  description: string;
  status: string;
  lodgedAt: number;
  closedAt?: number;
  createdAt: number;
}

function uid(): string {
  return `fir-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function recordNo(): string {
  return `${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.firRecords)) db.firRecords = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerFIRRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/fir', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ records: (db.firRecords as FirRecord[]).filter((r) => r.userId === user.id) });
  });

  app.post('/api/fir', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    if (b.kind !== 'gd' && b.kind !== 'fir') return res.status(400).json({ error: 'kind must be gd or fir.' });
    const description = s(b.description, 2000);
    if (!description) return res.status(400).json({ error: 'description is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const record: FirRecord = {
      id: uid(),
      recordNo: recordNo(),
      kind: b.kind,
      userId: user.id,
      userName: user.name || user.username || 'User',
      station: s(b.station, 120) || 'Your local station',
      category: s(b.category, 80) || 'General',
      description,
      status: 'lodged',
      lodgedAt: Date.now(),
      createdAt: Date.now(),
    };
    (db.firRecords as FirRecord[]).unshift(record);
    saveDatabase(db);
    res.json({ record });
  });

  app.post('/api/fir/:id/status', requireAuth, (req, res) => {
    const user = (req as any).user;
    const status = s((req.body || {}).status, 40);
    const db = loadDatabase();
    ensureCollection(db);
    const record = (db.firRecords as FirRecord[]).find((r) => r.id === req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found.' });
    if (record.userId !== user.id && !user.isAdmin) return res.status(403).json({ error: 'Not yours.' });
    if (status) {
      record.status = status;
      if (status === 'closed') record.closedAt = Date.now();
    }
    saveDatabase(db);
    res.json({ record });
  });
}
