/**
 * Ocean — Plastic Waste-to-Wealth (Feature 191)
 * ---------------------------------------------
 * Turn collected plastic into wallet coins: users report a collection (kg) at a
 * collection point; a pickup verification (self/pickup-partner) confirms it and
 * pays 5 BDT per kg from the community reward pool.
 *
 * Model (global db, idempotent ensure):
 *   db.plasticPoints     — array of { id, name, location, accepts } (seedable)
 *   db.plasticCollections — array of { id, userId, userName, pointId, kg,
 *                            status: 'pending'|'verified', earned, at, verifiedAt }
 *
 * Routes:
 *   POST /api/agri/plastic            (auth) { pointId?, kg, location? }
 *   GET  /api/agri/plastic            (guest) points + my collections (auth)
 *   POST /api/agri/plastic/:id/verify (auth, owner) -> pays kg * 5 BDT
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

export interface PlasticPoint {
  id: string;
  name: string;
  location: string;
  accepts: string;
}

export interface PlasticCollection {
  id: string;
  userId: string;
  userName: string;
  pointId: string | null;
  kg: number;
  status: 'pending' | 'verified';
  earned: number;
  at: number;
  verifiedAt: number | null;
}

const RATE_PER_KG = 5; // BDT per verified kg

const SEED_POINTS: PlasticPoint[] = [
  { id: 'pp-1', name: 'Dhaka North Recycling Hub', location: 'Mohakhali', accepts: 'PET bottles, bags, packaging' },
  { id: 'pp-2', name: 'Chattogram Coastal Cleanup Point', location: 'Patenga', accepts: 'PET bottles, fishing nets' },
  { id: 'pp-3', name: 'Sylhet Tea Garden Collection', location: 'Sreemangal', accepts: 'Film plastic, bottles' },
];

function uid(): string {
  return `pc-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.plasticPoints)) db.plasticPoints = SEED_POINTS.map((p) => ({ ...p }));
  if (!Array.isArray(db.plasticCollections)) db.plasticCollections = [];
}

export function registerPlasticWealthRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = getCtx();

  app.post('/api/agri/plastic', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const rawKg = Number(body.kg);
    if (!Number.isFinite(rawKg) || rawKg <= 0) return res.status(400).json({ error: 'A positive kg amount is required.' });
    const kg = Math.max(0.1, Math.min(10000, rawKg));
    const db = loadDatabase();
    ensureCollections(db);
    const pointId = typeof body.pointId === 'string' && body.pointId ? body.pointId : null;
    if (pointId && !(db.plasticPoints as PlasticPoint[]).some((p) => p.id === pointId)) {
      return res.status(400).json({ error: 'Unknown collection point.' });
    }
    const coll: PlasticCollection = {
      id: uid(),
      userId: user.id,
      userName: user.name || user.username || 'User',
      pointId,
      kg,
      status: 'pending',
      earned: Math.round(kg * RATE_PER_KG),
      at: Date.now(),
      verifiedAt: null,
    };
    (db.plasticCollections as PlasticCollection[]).unshift(coll);
    saveDatabase(db);
    res.json({ collection: coll, note: `Drop verified by pickup partner → you earn ${coll.earned} BDT (${RATE_PER_KG} BDT/kg).` });
  });

  app.get('/api/agri/plastic', (req, res) => {
    const me = getRequestUser(req);
    const db = loadDatabase();
    ensureCollections(db);
    const points = db.plasticPoints as PlasticPoint[];
    const mine = me ? (db.plasticCollections as PlasticCollection[]).filter((c) => c.userId === me.id) : [];
    const stats = {
      verifiedKg: (db.plasticCollections as PlasticCollection[]).filter((c) => c.status === 'verified').reduce((s, c) => s + c.kg, 0),
      totalEarned: (db.plasticCollections as PlasticCollection[]).filter((c) => c.status === 'verified').reduce((s, c) => s + c.earned, 0),
    };
    res.json({ points, mine, stats });
  });

  app.post('/api/agri/plastic/:id/verify', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const coll = (db.plasticCollections as PlasticCollection[]).find((c) => c.id === req.params.id);
    if (!coll) return res.status(404).json({ error: 'Collection not found.' });
    if (coll.userId !== user.id) return res.status(403).json({ error: 'Only the collector can verify their drop.' });
    if (coll.status === 'verified') return res.status(400).json({ error: 'Already verified and paid.' });
    // Soft daily cap so self-verification cannot be a coin-minting faucet.
    const dayAgo = Date.now() - 86400_000;
    const earnedToday = (db.plasticCollections as PlasticCollection[])
      .filter((c) => c.userId === user.id && c.status === 'verified' && (c.verifiedAt || 0) >= dayAgo)
      .reduce((s, c) => s + c.earned, 0);
    const DAILY_CAP = 500;
    if (earnedToday + coll.earned > DAILY_CAP) {
      return res.status(400).json({ error: `Daily verification cap reached (${DAILY_CAP} BDT/day) — try again tomorrow.` });
    }
    coll.status = 'verified';
    coll.verifiedAt = Date.now();
    const state = loadCommunity();
    addBalance(state, user.id, coll.earned);
    saveCommunity(state);
    saveDatabase(db);
    res.json({ collection: coll, earned: coll.earned, balance: state.balances[user.id] || 0, note: 'Pickup confirmed — coins added to your wallet.' });
  });
}
