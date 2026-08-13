/**
 * Ocean — Micro-Afforestation Verification (Feature 190)
 * ------------------------------------------------------
 * Register tree plantings with GPS; after a 30-day growth cooldown the planting
 * becomes eligible for verification ("satellite check" — in production a real
 * NDVI/satellite pass; here a deterministic eligibility + self-verify flow).
 * Verified plantings earn the planter coins (2 BDT/tree) from the reward pool.
 *
 * Model (global db, idempotent ensure):
 *   db.treePlantings — array of { id, userId, userName, species, count, lat, lng,
 *                     status: 'pending'|'verified', plantedAt, verifiedAt }
 *
 * Routes:
 *   POST /api/agri/plantings           (auth) { species, count, lat?, lng? }
 *   GET  /api/agri/plantings           (guest) verified + pending counts
 *   POST /api/agri/plantings/:id/verify (auth, owner) -> requires 30-day cooldown, rewards coins
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

export interface TreePlanting {
  id: string;
  userId: string;
  userName: string;
  species: string;
  count: number;
  lat: number;
  lng: number;
  status: 'pending' | 'verified';
  plantedAt: number;
  verifiedAt: number | null;
}

const GROWTH_COOLDOWN_MS = 30 * 86400_000; // 30 days — "satellite pass" window
const REWARD_PER_TREE = 2; // BDT per verified tree

function uid(): string {
  return `tp-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.treePlantings)) db.treePlantings = [];
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0.02, Math.min(0.98, n)) : 0.5;
}

export function registerAfforestationRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  app.post('/api/agri/plantings', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const species = String(body.species || '').trim();
    const count = Math.max(1, Math.min(10000, Math.floor(Number(body.count) || 1)));
    if (species.length < 2) return res.status(400).json({ error: 'Species is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const planting: TreePlanting = {
      id: uid(),
      userId: user.id,
      userName: user.name || user.username || 'User',
      species: species.slice(0, 80),
      count,
      lat: clamp01(Number(body.lat)),
      lng: clamp01(Number(body.lng)),
      status: 'pending',
      plantedAt: Date.now(),
      verifiedAt: null,
    };
    (db.treePlantings as TreePlanting[]).unshift(planting);
    saveDatabase(db);
    res.json({ planting, note: `Registered — verification unlocks in 30 days and rewards ${count * REWARD_PER_TREE} BDT.` });
  });

  app.get('/api/agri/plantings', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const now = Date.now();
    const list = (db.treePlantings as TreePlanting[])
      .sort((a, b) => b.plantedAt - a.plantedAt)
      .slice(0, 100)
      .map((p) => ({
        ...p,
        eligible: p.status === 'pending' && now - p.plantedAt >= GROWTH_COOLDOWN_MS,
        daysLeft: Math.max(0, Math.ceil((GROWTH_COOLDOWN_MS - (now - p.plantedAt)) / 86400_000)),
      }));
    const verified = (db.treePlantings as TreePlanting[]).filter((p) => p.status === 'verified').reduce((s, p) => s + p.count, 0);
    res.json({ plantings: list, verifiedTrees: verified });
  });

  app.post('/api/agri/plantings/:id/verify', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const planting = (db.treePlantings as TreePlanting[]).find((p) => p.id === req.params.id);
    if (!planting) return res.status(404).json({ error: 'Planting not found.' });
    if (planting.userId !== user.id) return res.status(403).json({ error: 'Only the planter can verify their planting.' });
    if (planting.status === 'verified') return res.status(400).json({ error: 'Already verified.' });
    const elapsed = Date.now() - planting.plantedAt;
    if (elapsed < GROWTH_COOLDOWN_MS) {
      const daysLeft = Math.ceil((GROWTH_COOLDOWN_MS - elapsed) / 86400_000);
      return res.status(400).json({ error: `Growth window still open — satellite verification available in ${daysLeft} day(s).` });
    }
    // Soft daily cap so self-verification cannot be a coin-minting faucet.
    const dayAgo = Date.now() - 86400_000;
    const earnedToday = (db.treePlantings as TreePlanting[])
      .filter((p) => p.userId === user.id && p.status === 'verified' && (p.verifiedAt || 0) >= dayAgo)
      .reduce((s, p) => s + p.count * REWARD_PER_TREE, 0);
    const reward = planting.count * REWARD_PER_TREE;
    const DAILY_CAP = 500;
    if (earnedToday + reward > DAILY_CAP) {
      return res.status(400).json({ error: `Daily verification cap reached (${DAILY_CAP} BDT/day) — try again tomorrow.` });
    }
    planting.status = 'verified';
    planting.verifiedAt = Date.now();
    const state = loadCommunity();
    addBalance(state, user.id, reward);
    saveCommunity(state);
    saveDatabase(db);
    res.json({ planting, reward, balance: state.balances[user.id] || 0, note: 'Growth confirmed — reward paid to your wallet.' });
  });
}
