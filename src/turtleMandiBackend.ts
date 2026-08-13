/**
 * Ocean — Mandi Price Predictor (Feature 184)
 * -------------------------------------------
 * Record daily wholesale (mandi) prices per crop and market; predict the next
 * week's price with a deterministic model: 7-day moving average + linear trend
 * (last 3 points). No external ML needed — explainable and offline.
 *
 * Model (global db, idempotent ensure):
 *   db.mandiPrices — array of { id, crop, market, pricePerKg, date (YYYY-MM-DD), recordedAt }
 *
 * Routes:
 *   POST /api/agri/mandi          (auth) { crop, market?, pricePerKg } -> record today's price
 *   GET  /api/agri/mandi          (guest) recent prices ?crop=&market=&days=30
 *   GET  /api/agri/predict-price  (guest) ?crop=&market= -> forecast + confidence
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface MandiPrice {
  id: string;
  crop: string;
  market: string;
  pricePerKg: number;
  date: string; // YYYY-MM-DD
  recordedAt: number;
}

function uid(): string {
  return `mp-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.mandiPrices)) db.mandiPrices = [];
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PriceForecast {
  crop: string;
  market: string;
  current: number;
  predicted: number;
  trend: 'up' | 'down' | 'flat';
  changePct: number;
  confidence: number;
  points: number;
  sampleDays: number;
}

export function predictPrice(db: any, crop: string, market: string): PriceForecast | null {
  ensureCollection(db);
  const series = (db.mandiPrices as MandiPrice[])
    .filter((p) => p.crop === crop && p.market === market)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (series.length === 0) return null;

  const recent = series.slice(-14);
  const current = recent[recent.length - 1].pricePerKg;
  const avg = recent.reduce((s, p) => s + p.pricePerKg, 0) / recent.length;

  // Linear trend from the last 3 points (slope per day).
  const last3 = recent.slice(-3);
  let slope = 0;
  if (last3.length >= 2) {
    const x = [0, 1, 2].slice(0, last3.length);
    const y = last3.map((p) => p.pricePerKg);
    const n = last3.length;
    const sx = x.reduce((a, b) => a + b, 0);
    const sy = y.reduce((a, b) => a + b, 0);
    const sxy = x.reduce((a, b, i) => a + b * y[i], 0);
    const sxx = x.reduce((a, b) => a + b * b, 0);
    slope = (n * sxy - sx * sy) / Math.max(1e-9, n * sxx - sx * sx);
  }

  const predicted = Math.max(0, Math.round((avg + slope * 7) * 100) / 100);
  const changePct = current > 0 ? Math.round(((predicted - current) / current) * 1000) / 10 : 0;
  const trend: 'up' | 'down' | 'flat' = changePct > 3 ? 'up' : changePct < -3 ? 'down' : 'flat';
  const sampleDays = series.length;
  const confidence = Math.min(95, Math.round(30 + sampleDays * 4 + recent.length * 2));

  return { crop, market, current, predicted, trend, changePct, confidence, points: series.length, sampleDays };
}

export function registerMandiRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/agri/mandi', requireAuth, (req, res) => {
  const body = req.body || {};
  const crop = String(body.crop || '').trim().toLowerCase();
  const pricePerKg = Number(body.pricePerKg);
  if (crop.length < 2) return res.status(400).json({ error: 'Crop name is required.' });
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) return res.status(400).json({ error: 'A positive price per kg is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const market = String(body.market || 'local').trim().slice(0, 60);
    const today = dayKey();
    // Upsert today's price for (crop, market) to avoid duplicate rows.
    const list = db.mandiPrices as MandiPrice[];
    const existing = list.find((p) => p.crop === crop && p.market === market && p.date === today);
    if (existing) existing.pricePerKg = pricePerKg;
    else list.push({ id: uid(), crop, market, pricePerKg, date: today, recordedAt: Date.now() });
    saveDatabase(db);
    const forecast = predictPrice(db, crop, market);
    res.json({ recorded: { crop, market, pricePerKg, date: today }, forecast });
  });

  app.get('/api/agri/mandi', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const crop = String(req.query.crop || '').trim().toLowerCase();
    const market = String(req.query.market || '').trim();
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const cutoff = Date.now() - days * 86400_000;
    let list = (db.mandiPrices as MandiPrice[]).filter((p) => p.recordedAt >= cutoff);
    if (crop) list = list.filter((p) => p.crop === crop);
    if (market) list = list.filter((p) => p.market === market);
    list = list.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-100);
    res.json({ prices: list, crops: Array.from(new Set((db.mandiPrices as MandiPrice[]).map((p) => p.crop))).sort() });
  });

  app.get('/api/agri/predict-price', (req, res) => {
    const crop = String(req.query.crop || '').trim().toLowerCase();
    const market = String(req.query.market || 'local').trim();
    if (!crop) return res.status(400).json({ error: 'crop query param is required.' });
    const db = loadDatabase();
    const forecast = predictPrice(db, crop, market);
    if (!forecast) return res.status(404).json({ error: 'No price history for this crop yet — record a few mandi prices first.' });
    res.json({ forecast });
  });
}
