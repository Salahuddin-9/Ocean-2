/**
 * Ocean — Parking Space Sharing (234) + Traffic Violation Witness (235)
 * -----------------------------------------------------------------------
 * 234: rent out or find parking spots by area with hourly rate + availability.
 * 235: report traffic violations with vehicle number, category & photo URL;
 *      repeated reports on the same vehicle are flagged.
 *
 * Routes:
 *   /api/parking|/api/parking/:id/book
 *   /api/traffic|/api/traffic/:id/confirm
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ParkingSpot {
  id: string;
  area: string;
  address: string;
  hourlyRate: number;
  userId: string;
  userName: string;
  available: boolean;
  bookedBy?: string;
  note: string;
  createdAt: number;
}

export interface TrafficReport {
  id: string;
  vehicleNo: string;
  category: string;
  location: string;
  desc: string;
  photoUrl?: string;
  userId: string;
  userName: string;
  confirms: string[];
  at: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.parkingSpots)) db.parkingSpots = [];
  if (!Array.isArray(db.trafficReports)) db.trafficReports = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerParkingRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // ============ 234 Parking ============
  app.get('/api/parking', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const area = s((req.query as any).area, 60).toLowerCase();
    const spots = (db.parkingSpots as ParkingSpot[])
      .filter((p) => p.available)
      .filter((p) => (area ? p.area.toLowerCase().includes(area) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ spots });
  });

  app.post('/api/parking', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const address = s(b.address, 160);
    const hourlyRate = Number(b.hourlyRate);
    if (!address) return res.status(400).json({ error: 'address is required.' });
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return res.status(400).json({ error: 'A positive hourly rate is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const spot: ParkingSpot = {
      id: uid('prk'),
      area: s(b.area, 80),
      address,
      hourlyRate: Math.round(hourlyRate * 100) / 100,
      userId: user.id,
      userName: user.name || user.username || 'User',
      available: true,
      note: s(b.note, 200),
      createdAt: Date.now(),
    };
    (db.parkingSpots as ParkingSpot[]).unshift(spot);
    saveDatabase(db);
    res.json({ spot });
  });

  app.post('/api/parking/:id/book', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const spot = (db.parkingSpots as ParkingSpot[]).find((p) => p.id === req.params.id);
    if (!spot) return res.status(404).json({ error: 'Spot not found.' });
    if (spot.userId === user.id) return res.status(400).json({ error: 'This is your own spot.' });
    if (!spot.available) return res.status(400).json({ error: 'Already booked.' });
    spot.available = false;
    spot.bookedBy = user.id;
    saveDatabase(db);
    res.json({ success: true, spot });
  });

  // ============ 235 Traffic witness ============
  app.get('/api/traffic', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const reports = (db.trafficReports as TrafficReport[]).slice().sort((a, b) => b.at - a.at);
    res.json({ reports });
  });

  app.post('/api/traffic', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const vehicleNo = s(b.vehicleNo, 30).toUpperCase();
    if (!vehicleNo) return res.status(400).json({ error: 'vehicle number is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const report: TrafficReport = {
      id: uid('trf'),
      vehicleNo,
      category: s(b.category, 40) || 'Other',
      location: s(b.location, 120),
      desc: s(b.desc, 400),
      photoUrl: s(b.photoUrl, 500),
      userId: user.id,
      userName: user.name || user.username || 'User',
      confirms: [],
      at: Date.now(),
    };
    (db.trafficReports as TrafficReport[]).unshift(report);
    saveDatabase(db);
    res.json({ report });
  });

  app.post('/api/traffic/:id/confirm', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const report = (db.trafficReports as TrafficReport[]).find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (!report.confirms.includes(user.id)) report.confirms.push(user.id);
    saveDatabase(db);
    res.json({ confirms: report.confirms.length });
  });
}
