/**
 * Ocean — Time-Locked Smart Wallet Escrow (Feature 171)
 * -----------------------------------------------------
 * Hold coins in escrow with a release condition (payee, deadline, or manual
 * release). Coins are pulled from the payer's REAL wallet on creation, held in
 * the escrow record, and moved to the payee on release or back to the payer on
 * refund — exactly the Bounty escrow pattern.
 *
 * Model (global db, idempotent ensure):
 *   db.escrows — array of { id, title, amount, payerId, payeeId, status,
 *                  'held'|'released'|'refunded', expiresAt, createdAt }
 *
 * Routes:
 *   POST /api/escrow            (auth) { title, amount, payeeId?, expiresInHours? }
 *   POST /api/escrow/:id/release (auth, payee) -> pay out
 *   POST /api/escrow/:id/refund  (auth, payer) -> return to payer
 *   GET  /api/escrow             (auth) my escrows (as payer or payee)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export type EscrowStatus = 'held' | 'released' | 'refunded';

export interface Escrow {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  payeeId: string | null;
  status: EscrowStatus;
  expiresAt: number;
  releasedAt: number | null;
  createdAt: number;
}

function uid(): string {
  return `esc-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.escrows)) db.escrows = [];
}

export function registerEscrowRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  // POST /api/escrow — create escrow (funds pulled immediately)
  app.post('/api/escrow', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const amt = Math.floor(Number(body.amount) || 0);
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    if (amt <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
    if (amt > 1_000_000) return res.status(400).json({ error: 'Amount too large.' });

    const payeeId = typeof body.payeeId === 'string' && body.payeeId.trim() && body.payeeId.trim() !== user.id ? body.payeeId.trim() : null;
    const hours = Math.max(1, Math.min(24 * 365, Math.floor(Number(body.expiresInHours) || 720)));

    const db = loadDatabase();
    ensureCollection(db);
    const state = loadCommunity();
    if (!spendBalance(state, user.id, amt)) {
      return res.status(402).json({ error: `Insufficient balance. You need ${amt} BDT but have ${state.balances[user.id] || 0}.`, balance: state.balances[user.id] || 0 });
    }
    saveCommunity(state);

    const escrow: Escrow = {
      id: uid(),
      title: title.slice(0, 160),
      amount: amt,
      payerId: user.id,
      payeeId,
      status: 'held',
      expiresAt: Date.now() + hours * 3600_000,
      releasedAt: null,
      createdAt: Date.now(),
    };
    (db.escrows as Escrow[]).unshift(escrow);
    saveDatabase(db);
    res.json({ escrow, balance: state.balances[user.id] || 0 });
  });

  // POST /api/escrow/:id/release — payee (or any party with payeeId) claims
  app.post('/api/escrow/:id/release', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const escrow = (db.escrows as Escrow[]).find((e) => e.id === req.params.id);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found.' });
    if (escrow.status !== 'held') return res.status(400).json({ error: 'Escrow is already closed.' });
    if (escrow.payeeId && escrow.payeeId !== user.id) {
      return res.status(403).json({ error: 'Only the designated payee can release this escrow.' });
    }
    if (!escrow.payeeId && escrow.payerId !== user.id) {
      return res.status(403).json({ error: 'This escrow has no payee — only the payer can close it (release or refund).' });
    }
    const state = loadCommunity();
    addBalance(state, escrow.payeeId || escrow.payerId, escrow.amount);
    saveCommunity(state);
    escrow.status = 'released';
    escrow.releasedAt = Date.now();
    saveDatabase(db);
    res.json({ escrow, paidTo: escrow.payeeId || escrow.payerId, balance: state.balances[escrow.payeeId || escrow.payerId] || 0 });
  });

  // POST /api/escrow/:id/refund — payer claws back before release
  app.post('/api/escrow/:id/refund', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const escrow = (db.escrows as Escrow[]).find((e) => e.id === req.params.id);
    if (!escrow) return res.status(404).json({ error: 'Escrow not found.' });
    if (escrow.payerId !== user.id) return res.status(403).json({ error: 'Only the payer can refund.' });
    if (escrow.status !== 'held') return res.status(400).json({ error: 'Escrow is already closed.' });
    const state = loadCommunity();
    addBalance(state, escrow.payerId, escrow.amount);
    saveCommunity(state);
    escrow.status = 'refunded';
    escrow.releasedAt = Date.now();
    saveDatabase(db);
    res.json({ escrow, refunded: escrow.amount, balance: state.balances[escrow.payerId] || 0 });
  });

  // GET /api/escrow — mine
  app.get('/api/escrow', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.escrows as Escrow[])
      .filter((e) => e.payerId === user.id || e.payeeId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ escrows: mine });
  });
}
