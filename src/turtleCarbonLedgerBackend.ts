/**
 * Ocean — Personal Carbon Ledger (Feature 189)
 * --------------------------------------------
 * Log daily activities; each converts to CO₂ via a fixed factor table. The
 * ledger shows weekly/monthly footprint and an offset suggestion (trees
 * needed). Deterministic and explainable — every gram is traceable.
 *
 * Model (global db, idempotent ensure):
 *   db.carbonLogs — array of { id, userId, category, amount, co2Kg, note, date (YYYY-MM-DD), at }
 *
 * Factors (kg CO₂ per unit):
 *   car_km 0.21 · bus_km 0.08 · bike_km 0 · flight_km 0.25 · electricity_kwh 0.65 ·
 *   meat_meal 2.5 · veg_meal 0.5 · plastic_kg 1.4 · tree_planted −21 (offset)
 *
 * Routes:
 *   POST /api/carbon/log   (auth) { category, amount, note? } -> record + co2
 *   GET  /api/carbon       (auth) my logs + totals + offset suggestion
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface CarbonLog {
  id: string;
  userId: string;
  category: string;
  amount: number;
  co2Kg: number;
  note: string;
  date: string;
  at: number;
}

export const CARBON_FACTORS: Record<string, { factor: number; unit: string; label: string }> = {
  car_km: { factor: 0.21, unit: 'km', label: '🚗 Car travel' },
  bus_km: { factor: 0.08, unit: 'km', label: '🚌 Bus travel' },
  bike_km: { factor: 0, unit: 'km', label: '🚲 Cycling (0!)' },
  flight_km: { factor: 0.25, unit: 'km', label: '✈️ Flight' },
  electricity_kwh: { factor: 0.65, unit: 'kWh', label: '💡 Electricity' },
  meat_meal: { factor: 2.5, unit: 'meal', label: '🍖 Meat meal' },
  veg_meal: { factor: 0.5, unit: 'meal', label: '🥗 Veg meal' },
  plastic_kg: { factor: 1.4, unit: 'kg', label: '🧴 Plastic used' },
  tree_planted: { factor: -21, unit: 'tree', label: '🌳 Tree planted (offset)' },
};

function uid(): string {
  return `co2-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.carbonLogs)) db.carbonLogs = [];
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerCarbonRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/carbon/log', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const category = String(body.category || '');
    const amount = Math.max(0, Number(body.amount) || 0);
    const def = CARBON_FACTORS[category];
    if (!def) return res.status(400).json({ error: `category must be one of: ${Object.keys(CARBON_FACTORS).join(', ')}.` });
    if (amount <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
    const co2Kg = Math.round(amount * def.factor * 100) / 100;
    const db = loadDatabase();
    ensureCollection(db);
    const log: CarbonLog = {
      id: uid(),
      userId: user.id,
      category,
      amount,
      co2Kg,
      note: String(body.note || '').trim().slice(0, 200),
      date: dayKey(),
      at: Date.now(),
    };
    (db.carbonLogs as CarbonLog[]).unshift(log);
    saveDatabase(db);
    res.json({ log, def: { label: def.label, unit: def.unit }, co2Kg });
  });

  app.get('/api/carbon', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.carbonLogs as CarbonLog[]).filter((l) => l.userId === user.id);
    const weekAgo = Date.now() - 7 * 86400_000;
    const week = mine.filter((l) => l.at >= weekAgo).reduce((s, l) => s + l.co2Kg, 0);
    const monthAgo = Date.now() - 30 * 86400_000;
    const month = mine.filter((l) => l.at >= monthAgo).reduce((s, l) => s + l.co2Kg, 0);
    // Offset: ~21kg per mature tree per year; suggest trees to neutralise the month.
    const treesNeeded = Math.max(0, Math.ceil(month / 21));
    res.json({
      logs: mine.slice(0, 60),
      weekKg: Math.round(week * 100) / 100,
      monthKg: Math.round(month * 100) / 100,
      totalKg: Math.round(mine.reduce((s, l) => s + l.co2Kg, 0) * 100) / 100,
      treesNeeded,
      factors: CARBON_FACTORS,
    });
  });
}
