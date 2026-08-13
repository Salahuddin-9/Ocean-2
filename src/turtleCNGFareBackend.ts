/**
 * Ocean — Real-Time CNG Fare Negotiator (Feature 233)
 * -------------------------------------------------------
 * Distance-based CNG fare calculator (Dhaka: flag ৳50 + ৳16/km) with a
 * community fare-report feed so riders can compare what others actually paid
 * on the same route.
 *
 * Routes:
 *   POST /api/cng/fare        (public) { km } -> estimated fare range
 *   GET  /api/cng/reports     (public) recent fare reports
 *   POST /api/cng/reports     (auth) report what you paid
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface CngFareReport {
  id: string;
  from: string;
  to: string;
  km: number;
  paid: number;
  userName: string;
  note: string;
  at: number;
}

export const CNG_FLAG = 50;
export const CNG_PER_KM = 16;

function uid(): string {
  return `cng-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.cngFareReports)) db.cngFareReports = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function calculateFare(km: number): { km: number; low: number; high: number; perKm: number; flag: number } {
  const k = Math.max(0.1, km);
  const base = CNG_FLAG + k * CNG_PER_KM;
  // negotiation range: -10% .. +20%
  return { km: Math.round(k * 10) / 10, low: Math.round(base * 0.9), high: Math.round(base * 1.2), perKm: CNG_PER_KM, flag: CNG_FLAG };
}

export function registerCNGFareRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/cng/fare', (req, res) => {
    const km = Number((req.body || {}).km);
    if (!Number.isFinite(km) || km <= 0) return res.status(400).json({ error: 'A positive distance in km is required.' });
    res.json({ fare: calculateFare(km) });
  });

  app.get('/api/cng/reports', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const reports = (db.cngFareReports as CngFareReport[]).slice().sort((a, b) => b.at - a.at).slice(0, 50);
    res.json({ reports });
  });

  app.post('/api/cng/reports', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const km = Number(b.km);
    const paid = Number(b.paid);
    if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(paid) || paid <= 0) {
      return res.status(400).json({ error: 'km and paid amount are required.' });
    }
    const db = loadDatabase();
    ensureCollection(db);
    const report: CngFareReport = {
      id: uid(),
      from: s(b.from, 80),
      to: s(b.to, 80),
      km,
      paid: Math.round(paid),
      userName: user.name || user.username || 'User',
      note: s(b.note, 200),
      at: Date.now(),
    };
    (db.cngFareReports as CngFareReport[]).unshift(report);
    if (db.cngFareReports.length > 200) db.cngFareReports.length = 200;
    saveDatabase(db);
    res.json({ report });
  });
}
