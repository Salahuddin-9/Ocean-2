/**
 * Ocean — Offline Emergency Relay (Feature 239)
 * ---------------------------------------------------------
 * When a device is offline (no internet), emergency messages are queued on the
 * device (IndexedDB via public/sw.js — see src/lib/satQueue.ts) and delivered
 * through this relay once connectivity returns. The client pattern is:
 * queue locally → POST /api/sat/relay on reconnect (the service worker does
 * this automatically). A real satellite/IoT uplink would plug into this same
 * relay contract; no satellite is contacted today.
 *
 * Model (global db): db.satRelays — array of
 *   { id, fromId, fromName, toId, payload, status: 'queued'|'delivered', at }
 *
 * Routes:
 *   POST /api/sat/relay      (auth) { toId, payload } queue a satellite relay
 *   GET  /api/sat/relays     (auth) relays involving me (incoming outbox)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface SatRelay {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  payload: string;
  status: 'queued' | 'delivered';
  at: number;
}

function uid(): string {
  return `sat-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.satRelays)) db.satRelays = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerSatelliteRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/sat/relay', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const toId = s(b.toId, 100);
    const payload = s(b.payload, 2000);
    if (!toId || !payload) return res.status(400).json({ error: 'toId and payload are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const relay: SatRelay = {
      id: uid(),
      fromId: user.id,
      fromName: user.name || user.username || 'User',
      toId,
      payload,
      status: 'queued',
      at: Date.now(),
    };
    (db.satRelays as SatRelay[]).unshift(relay);
    saveDatabase(db);
    res.json({ relay, note: 'Queued for the satellite/IoT channel — will be delivered on next link. (Placeholder channel: wire to a real sat-com API in production.)' });
  });

  app.get('/api/sat/relays', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const relays = (db.satRelays as SatRelay[])
      .filter((r) => r.fromId === user.id || r.toId === user.id)
      .sort((a, b) => b.at - a.at);
    res.json({ relays });
  });
}
