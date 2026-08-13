/**
 * Ocean — Irrigation Scheduler (Feature 187)
 * ------------------------------------------
 * Plans watering based on crop water needs and (simulated) rainfall. A
 * deterministic 5-day weather forecast is derived from the day-of-year so the
 * app works offline without an API key; a real deployment swaps
 * simulatedForecast() for a weather API. Each field records lastRainMm and
 * lastWateredAt; the scheduler computes the next watering day.
 *
 * Model (global db, idempotent ensure):
 *   db.irrigationFields — array of { id, name, crop, areaAcres, lastRainMm,
 *                           lastWateredAt, waterNeedMmPerDay, createdAt }
 *
 * Routes:
 *   POST /api/agri/irrigation           (auth) { name, crop, areaAcres?, waterNeedMmPerDay? }
 *   GET  /api/agri/irrigation           (auth) my fields + next watering dates
 *   POST /api/agri/irrigation/:id/water (auth, owner) mark watered today
 *   GET  /api/agri/weather              (guest) ?days=5 deterministic forecast
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface IrrigationField {
  id: string;
  ownerId: string;
  name: string;
  crop: string;
  areaAcres: number;
  lastRainMm: number;
  lastWateredAt: number | null;
  waterNeedMmPerDay: number;
  createdAt: number;
}

function uid(): string {
  return `ir-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.irrigationFields)) db.irrigationFields = [];
}

/** Deterministic pseudo-weather: seeded by day-of-year so it's stable per day. */
export function simulatedForecast(days = 5): { date: string; rainMm: number; tempC: number; condition: string }[] {
  const out: { date: string; rainMm: number; tempC: number; condition: string }[] = [];
  const base = new Date();
  for (let i = 0; i < Math.min(7, Math.max(1, days)); i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const seed = d.getFullYear() * 1000 + d.getMonth() * 31 + d.getDate();
    const h = (Math.sin(seed * 12.9898) * 43758.5453) % 1;
    const rain = h > 0.72 ? Math.round((h - 0.72) * 40) : 0;
    const tempC = Math.round(22 + (h * 12 - 3));
    out.push({
      date: d.toISOString().slice(0, 10),
      rainMm: rain,
      tempC,
      condition: rain > 8 ? 'Rainy' : rain > 0 ? 'Drizzle' : 'Dry',
    });
  }
  return out;
}

export function registerIrrigationRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/agri/irrigation', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const crop = String(body.crop || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Field name is required.' });
    if (crop.length < 2) return res.status(400).json({ error: 'Crop is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const field: IrrigationField = {
      id: uid(),
      ownerId: user.id,
      name: name.slice(0, 80),
      crop: crop.slice(0, 40),
      areaAcres: Math.max(0.1, Math.min(5000, Number(body.areaAcres) || 1)),
      lastRainMm: 0,
      lastWateredAt: null,
      waterNeedMmPerDay: Math.max(1, Math.min(20, Number(body.waterNeedMmPerDay) || 5)),
      createdAt: Date.now(),
    };
    (db.irrigationFields as IrrigationField[]).unshift(field);
    saveDatabase(db);
    res.json({ field });
  });

  app.get('/api/agri/irrigation', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const forecast = simulatedForecast(5);
    const fields = (db.irrigationFields as IrrigationField[])
      .filter((f) => f.ownerId === user.id)
      .map((f) => {
        // Rain expected in the next 5 days (mm).
        const expectedRain = forecast.reduce((s, d) => s + d.rainMm, 0);
        const daysSinceWatered = f.lastWateredAt ? Math.floor((Date.now() - f.lastWateredAt) / 86400_000) : 3;
        // Water need accumulates minus expected rain.
        const dryDays = Math.max(0, daysSinceWatered - Math.floor(expectedRain / Math.max(1, f.waterNeedMmPerDay)));
        const daysUntilRaw = f.waterNeedMmPerDay > 0 ? Math.ceil((10 - dryDays * f.waterNeedMmPerDay) / f.waterNeedMmPerDay) : 1;
        const overdue = daysUntilRaw < 1;
        const daysUntilWater = Math.max(1, daysUntilRaw);
        const nextWatering = overdue ? 'Overdue' : new Date(Date.now() + daysUntilWater * 86400_000).toISOString().slice(0, 10);
        return { ...f, expectedRain, daysSinceWatered, daysUntilWater, nextWatering, overdue, dueSoon: overdue || daysUntilWater <= 2 };
      });
    res.json({ fields, forecast });
  });

  app.post('/api/agri/irrigation/:id/water', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const field = (db.irrigationFields as IrrigationField[]).find((f) => f.id === req.params.id);
    if (!field) return res.status(404).json({ error: 'Field not found.' });
    if (field.ownerId !== user.id) return res.status(403).json({ error: 'Only the field owner can log watering.' });
    field.lastWateredAt = Date.now();
    field.lastRainMm = 0;
    saveDatabase(db);
    res.json({ field, note: 'Watering logged for today.' });
  });

  app.get('/api/agri/weather', (req, res) => {
    const days = Number(req.query.days) || 5;
    res.json({ forecast: simulatedForecast(days), source: 'simulated (swap for a weather API in production)' });
  });
}
