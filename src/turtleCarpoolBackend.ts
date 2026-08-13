/**
 * Ocean — Office Carpooling Lane (231) + Bike Pooling for Students (232)
 * ------------------------------------------------------------------------
 * Car/bike pooling: post a ride (with seats, route, time) and join others'
 * rides. Filter by area. 232 is the same model scoped to two-wheelers.
 *
 * Routes:
 *   GET  /api/carpool  (public) all rides, filter ?area=&kind=
 *   POST /api/carpool  (auth) post a ride
 *   POST /api/carpool/:id/join (auth) take a seat
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface PoolRide {
  id: string;
  kind: 'car' | 'bike';
  area: string;
  route: string;
  time: string;
  seats: number;
  userId: string;
  userName: string;
  riders: { id: string; name: string }[];
  note: string;
  createdAt: number;
}

function uid(): string {
  return `pool-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.poolRides)) db.poolRides = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerCarpoolRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/carpool', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const area = s((req.query as any).area, 60).toLowerCase();
    const kind = (req.query as any).kind;
    const rides = (db.poolRides as PoolRide[])
      .filter((r) => (kind === 'car' || kind === 'bike' ? r.kind === kind : true))
      .filter((r) => (area ? `${r.area} ${r.route}`.toLowerCase().includes(area) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ rides });
  });

  app.post('/api/carpool', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    if (b.kind !== 'car' && b.kind !== 'bike') return res.status(400).json({ error: 'kind must be car or bike.' });
    const route = s(b.route, 200);
    if (!route) return res.status(400).json({ error: 'route is required.' });
    const seats = Math.max(1, Math.min(6, Math.floor(Number(b.seats) || 1)));
    const db = loadDatabase();
    ensureCollection(db);
    const ride: PoolRide = {
      id: uid(),
      kind: b.kind,
      area: s(b.area, 80),
      route,
      time: s(b.time, 60),
      seats,
      userId: user.id,
      userName: user.name || user.username || 'User',
      riders: [],
      note: s(b.note, 300),
      createdAt: Date.now(),
    };
    (db.poolRides as PoolRide[]).unshift(ride);
    saveDatabase(db);
    res.json({ ride });
  });

  app.post('/api/carpool/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const ride = (db.poolRides as PoolRide[]).find((r) => r.id === req.params.id);
    if (!ride) return res.status(404).json({ error: 'Ride not found.' });
    if (ride.userId === user.id) return res.status(400).json({ error: 'This is your own ride.' });
    if (ride.riders.some((r) => r.id === user.id)) return res.status(400).json({ error: 'Already joined.' });
    if (ride.riders.length >= ride.seats) return res.status(400).json({ error: 'Ride is full.' });
    ride.riders.push({ id: user.id, name: user.name || user.username || 'User' });
    saveDatabase(db);
    res.json({ success: true, riders: ride.riders });
  });
}
