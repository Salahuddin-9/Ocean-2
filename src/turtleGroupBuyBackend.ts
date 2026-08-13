/**
 * Ocean — Group Buying Power (Feature 175)
 * ----------------------------------------
 * Pool demand to unlock a bulk price: someone starts a group buy with a target
 * quantity and unit price; participants commit quantities and pay into the pool
 * with real wallet coins. When the target is reached the buy locks as "active"
 * (fulfillment would be offline/partner-side).
 *
 * Model (global db, idempotent ensure):
 *   db.groupBuys — array of { id, title, unitPrice, targetQty, raisedQty,
 *                  status: 'open'|'active'|'done', organizerId, organizerName,
 *                  participants: [{userId, qty, paid}], createdAt }
 *
 * Routes:
 *   POST /api/groupbuy            (auth) { title, unitPrice, targetQty }
 *   GET  /api/groupbuy            (guest) open group buys
 *   POST /api/groupbuy/:id/join   (auth) { qty } -> pay qty*unitPrice
 *   POST /api/groupbuy/:id/done   (auth, organizer) -> close
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface GroupBuyParticipant {
  userId: string;
  qty: number;
  paid: number;
}

export interface GroupBuy {
  id: string;
  title: string;
  unitPrice: number;
  targetQty: number;
  raisedQty: number;
  status: 'open' | 'active' | 'done';
  organizerId: string;
  organizerName: string;
  participants: GroupBuyParticipant[];
  createdAt: number;
}

function uid(): string {
  return `gb-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.groupBuys)) db.groupBuys = [];
}

export function registerGroupBuyRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  app.post('/api/groupbuy', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const unitPrice = Math.floor(Number(body.unitPrice) || 0);
    const targetQty = Math.max(2, Math.floor(Number(body.targetQty) || 10));
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    if (unitPrice <= 0) return res.status(400).json({ error: 'Unit price must be positive.' });
    const db = loadDatabase();
    ensureCollection(db);
    const gb: GroupBuy = {
      id: uid(),
      title: title.slice(0, 160),
      unitPrice,
      targetQty,
      raisedQty: 0,
      status: 'open',
      organizerId: user.id,
      organizerName: user.name || user.username || 'User',
      participants: [],
      createdAt: Date.now(),
    };
    (db.groupBuys as GroupBuy[]).unshift(gb);
    saveDatabase(db);
    res.json({ groupBuy: gb });
  });

  app.get('/api/groupbuy', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const list = (db.groupBuys as GroupBuy[]).filter((g) => g.status !== 'done').sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    res.json({ groupBuys: list });
  });

  app.post('/api/groupbuy/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const qty = Math.max(1, Math.min(1000, Math.floor(Number((req.body || {}).qty) || 1)));
    const db = loadDatabase();
    ensureCollection(db);
    const gb = (db.groupBuys as GroupBuy[]).find((g) => g.id === req.params.id);
    if (!gb) return res.status(404).json({ error: 'Group buy not found.' });
    if (gb.status !== 'open') return res.status(400).json({ error: 'This group buy is not open.' });
    const existing = gb.participants.find((p) => p.userId === user.id);
    const cost = qty * gb.unitPrice;

    const state = loadCommunity();
    if (!spendBalance(state, user.id, cost)) {
      return res.status(402).json({ error: `Insufficient balance. Need ${cost} BDT, have ${state.balances[user.id] || 0}.`, balance: state.balances[user.id] || 0 });
    }
    saveCommunity(state);

    if (existing) {
      existing.qty += qty;
      existing.paid += cost;
    } else {
      gb.participants.push({ userId: user.id, qty, paid: cost });
    }
    gb.raisedQty += qty;
    if (gb.raisedQty >= gb.targetQty) gb.status = 'active';
    saveDatabase(db);
    res.json({ groupBuy: gb, paid: cost, balance: state.balances[user.id] || 0 });
  });

  app.post('/api/groupbuy/:id/done', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const gb = (db.groupBuys as GroupBuy[]).find((g) => g.id === req.params.id);
    if (!gb) return res.status(404).json({ error: 'Group buy not found.' });
    if (gb.organizerId !== user.id) return res.status(403).json({ error: 'Only the organizer can close it.' });
    gb.status = 'done';
    saveDatabase(db);
    res.json({ groupBuy: gb });
  });
}
