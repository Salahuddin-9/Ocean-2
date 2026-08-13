/**
 * Ocean — Garage Sale Map (Feature 177)
 * -------------------------------------
 * Neighborhood garage sales as dated events with coordinates. The frontend
 * renders them on a lightweight local map grid (no external map SDK needed);
 * coordinates are normalized 0..1 within the app's local area.
 *
 * Model (global db, idempotent ensure):
 *   db.garageSales — array of { id, title, description, lat, lng, address,
 *                  date, postedById, postedByName, createdAt }
 *
 * Routes:
 *   POST /api/garagesales   (auth) { title, description?, lat?, lng?, address?, date? }
 *   GET  /api/garagesales   (guest) upcoming + recent, sorted by date
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface GarageSale {
  id: string;
  title: string;
  description: string;
  lat: number; // 0..1 normalized (local map)
  lng: number; // 0..1 normalized
  address: string;
  date: number; // sale day (ms)
  postedById: string;
  postedByName: string;
  createdAt: number;
}

function uid(): string {
  return `gs-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.garageSales)) db.garageSales = [];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return Math.random();
  return Math.max(0.02, Math.min(0.98, n));
}

export function registerGarageSaleRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/garagesales', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    const db = loadDatabase();
    ensureCollection(db);
    const sale: GarageSale = {
      id: uid(),
      title: title.slice(0, 140),
      description: String(body.description || '').trim().slice(0, 800),
      lat: clamp01(Number(body.lat)),
      lng: clamp01(Number(body.lng)),
      address: String(body.address || 'Local area').trim().slice(0, 120),
      date: Math.max(Date.now(), Math.floor(Number(body.date) || Date.now() + 86400_000)),
      postedById: user.id,
      postedByName: user.name || user.username || 'User',
      createdAt: Date.now(),
    };
    (db.garageSales as GarageSale[]).unshift(sale);
    saveDatabase(db);
    res.json({ sale });
  });

  app.get('/api/garagesales', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const now = Date.now();
    const list = (db.garageSales as GarageSale[])
      .filter((s) => s.date >= now - 86400_000)
      .sort((a, b) => a.date - b.date)
      .slice(0, 100);
    res.json({ sales: list });
  });
}
