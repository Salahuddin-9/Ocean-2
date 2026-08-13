/**
 * Ocean — Shared Farming Equipment Pool (Feature 188)
 * ---------------------------------------------------
 * A community tool shed: farmers list idle equipment for daily rent; renters
 * pay the daily rate + refundable deposit from the real wallet. Returns refund
 * the deposit; the owner keeps the rental fee. Same pattern as P2P Renting
 * (172) but tuned for farm gear (per-day instead of per-hour).
 *
 * Model (global db, idempotent ensure):
 *   db.farmTools — array of { id, tool, description, ownerId, ownerName,
 *                    ratePerDay, deposit, status: 'available'|'rented',
 *                    rentedBy, rentedUntil, createdAt }
 *
 * Routes:
 *   POST /api/agri/tools             (auth) list a tool
 *   GET  /api/agri/tools             (guest) available tools
 *   POST /api/agri/tools/:id/rent    (auth) { days } -> pay fee, hold deposit
 *   POST /api/agri/tools/:id/return  (auth, renter) -> refund deposit
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface FarmTool {
  id: string;
  tool: string;
  description: string;
  ownerId: string;
  ownerName: string;
  ratePerDay: number;
  deposit: number;
  status: 'available' | 'rented';
  rentedBy: string | null;
  rentedUntil: number | null;
  createdAt: number;
}

function uid(): string {
  return `ft-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.farmTools)) db.farmTools = [];
}

export function registerFarmToolsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  app.post('/api/agri/tools', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const tool = String(body.tool || '').trim();
    const ratePerDay = Math.floor(Number(body.ratePerDay) || 0);
    if (tool.length < 2) return res.status(400).json({ error: 'Tool name is required.' });
    if (ratePerDay <= 0) return res.status(400).json({ error: 'Daily rate must be positive.' });
    const db = loadDatabase();
    ensureCollection(db);
    const t: FarmTool = {
      id: uid(),
      tool: tool.slice(0, 100),
      description: String(body.description || '').trim().slice(0, 600),
      ownerId: user.id,
      ownerName: user.name || user.username || 'User',
      ratePerDay,
      deposit: Math.max(0, Math.floor(Number(body.deposit) || 0)),
      status: 'available',
      rentedBy: null,
      rentedUntil: null,
      createdAt: Date.now(),
    };
    (db.farmTools as FarmTool[]).unshift(t);
    saveDatabase(db);
    res.json({ tool: t });
  });

  app.get('/api/agri/tools', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const tools = (db.farmTools as FarmTool[]).filter((t) => t.status === 'available').sort((a, b) => b.createdAt - a.createdAt);
    res.json({ tools });
  });

  app.post('/api/agri/tools/:id/rent', requireAuth, (req, res) => {
    const user = (req as any).user;
    const days = Math.max(1, Math.min(30, Math.floor(Number((req.body || {}).days) || 1)));
    const db = loadDatabase();
    ensureCollection(db);
    const t = (db.farmTools as FarmTool[]).find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Tool not found.' });
    if (t.ownerId === user.id) return res.status(400).json({ error: 'You cannot rent your own tool.' });
    if (t.status !== 'available') return res.status(400).json({ error: 'Tool is already rented.' });

    const fee = t.ratePerDay * days;
    // One load-modify-save cycle: debit renter (fee + deposit), credit owner (fee).
    const state = loadCommunity();
    if (!spendBalance(state, user.id, fee + t.deposit)) {
      return res.status(402).json({ error: `Insufficient balance. Need ${fee + t.deposit} BDT (${fee} fee + ${t.deposit} deposit), have ${state.balances[user.id] || 0}.`, balance: state.balances[user.id] || 0 });
    }
    addBalance(state, t.ownerId, fee);
    saveCommunity(state);

    t.status = 'rented';
    t.rentedBy = user.id;
    t.rentedUntil = Date.now() + days * 86400_000;
    saveDatabase(db);
    res.json({ tool: t, fee, depositHeld: t.deposit, balance: state.balances[user.id] || 0 });
  });

  app.post('/api/agri/tools/:id/return', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const t = (db.farmTools as FarmTool[]).find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Tool not found.' });
    if (t.status !== 'rented' || t.rentedBy !== user.id) {
      return res.status(400).json({ error: 'Only the active renter can return this tool.' });
    }
    const state = loadCommunity();
    addBalance(state, user.id, t.deposit);
    saveCommunity(state);
    t.status = 'available';
    t.rentedBy = null;
    t.rentedUntil = null;
    saveDatabase(db);
    res.json({ tool: t, depositRefunded: t.deposit, balance: state.balances[user.id] || 0 });
  });
}
