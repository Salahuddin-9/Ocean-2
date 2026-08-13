/**
 * Ocean — Farmer-to-Consumer Direct Bridge (Feature 185)
 * ------------------------------------------------------
 * Farmers go live from the field and sell directly: a farm stream shows the
 * crop, location and price; viewers "join" the live (simulated broadcast) and
 * can place orders by kg. Orders settle offline (cash on pickup) — the bridge
 * removes the middleman, not the wallet.
 *
 * Model (global db, idempotent ensure):
 *   db.farmStreams — array of { id, farmerId, farmerName, title, crop, location,
 *                     pricePerKg, status: 'live'|'ended', viewers: string[], createdAt }
 *   db.farmOrders  — array of { id, streamId, buyerId, buyerName, qtyKg, total, status: 'placed', at }
 *
 * Routes:
 *   POST /api/agri/farm-streams          (auth) { title, crop, location?, pricePerKg }
 *   GET  /api/agri/farm-streams          (guest) live streams
 *   POST /api/agri/farm-streams/:id/join (auth) -> count as viewer
 *   POST /api/agri/farm-streams/:id/order (auth) { qtyKg }
 *   POST /api/agri/farm-streams/:id/end  (auth, farmer)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface FarmStream {
  id: string;
  farmerId: string;
  farmerName: string;
  title: string;
  crop: string;
  location: string;
  pricePerKg: number;
  status: 'live' | 'ended';
  viewers: string[];
  createdAt: number;
}

export interface FarmOrder {
  id: string;
  streamId: string;
  buyerId: string;
  buyerName: string;
  qtyKg: number;
  total: number;
  status: 'placed';
  at: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.farmStreams)) db.farmStreams = [];
  if (!Array.isArray(db.farmOrders)) db.farmOrders = [];
}

export function registerFarmLiveRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/agri/farm-streams', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const crop = String(body.crop || '').trim();
    const pricePerKg = Number(body.pricePerKg);
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    if (crop.length < 2) return res.status(400).json({ error: 'Crop is required.' });
    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) return res.status(400).json({ error: 'A positive price per kg is required.' });
    const db = loadDatabase();
    ensureCollections(db);
    const stream: FarmStream = {
      id: uid('fs'),
      farmerId: user.id,
      farmerName: user.name || user.username || 'User',
      title: title.slice(0, 140),
      crop: crop.slice(0, 60),
      location: String(body.location || 'Local farm').trim().slice(0, 80),
      pricePerKg,
      status: 'live',
      viewers: [],
      createdAt: Date.now(),
    };
    (db.farmStreams as FarmStream[]).unshift(stream);
    saveDatabase(db);
    res.json({ stream });
  });

  app.get('/api/agri/farm-streams', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const live = (db.farmStreams as FarmStream[]).filter((s) => s.status === 'live').sort((a, b) => b.createdAt - a.createdAt);
    res.json({ streams: live.map((s) => ({ ...s, viewerCount: s.viewers.length })) });
  });

  app.post('/api/agri/farm-streams/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const stream = (db.farmStreams as FarmStream[]).find((s) => s.id === req.params.id);
    if (!stream) return res.status(404).json({ error: 'Stream not found.' });
    if (stream.status !== 'live') return res.status(400).json({ error: 'This stream has ended.' });
    if (!stream.viewers.includes(user.id)) stream.viewers.push(user.id);
    saveDatabase(db);
    res.json({ stream, viewerCount: stream.viewers.length });
  });

  app.post('/api/agri/farm-streams/:id/order', requireAuth, (req, res) => {
    const user = (req as any).user;
    const qtyKg = Math.max(0.5, Math.min(5000, Number((req.body || {}).qtyKg) || 0));
    const db = loadDatabase();
    ensureCollections(db);
    const stream = (db.farmStreams as FarmStream[]).find((s) => s.id === req.params.id);
    if (!stream) return res.status(404).json({ error: 'Stream not found.' });
    if (stream.status !== 'live') return res.status(400).json({ error: 'This stream has ended.' });
    if (stream.farmerId === user.id) return res.status(400).json({ error: 'You cannot order from your own stream.' });
    const order: FarmOrder = {
      id: uid('fo'),
      streamId: stream.id,
      buyerId: user.id,
      buyerName: user.name || user.username || 'User',
      qtyKg,
      total: Math.round(qtyKg * stream.pricePerKg * 100) / 100,
      status: 'placed',
      at: Date.now(),
    };
    (db.farmOrders as FarmOrder[]).unshift(order);
    saveDatabase(db);
    res.json({ order, note: 'Order placed — pay the farmer on pickup (cash or wallet).' });
  });

  app.post('/api/agri/farm-streams/:id/end', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const stream = (db.farmStreams as FarmStream[]).find((s) => s.id === req.params.id);
    if (!stream) return res.status(404).json({ error: 'Stream not found.' });
    if (stream.farmerId !== user.id) return res.status(403).json({ error: 'Only the farmer can end the stream.' });
    stream.status = 'ended';
    saveDatabase(db);
    res.json({ stream, orders: (db.farmOrders as FarmOrder[]).filter((o) => o.streamId === stream.id) });
  });
}
