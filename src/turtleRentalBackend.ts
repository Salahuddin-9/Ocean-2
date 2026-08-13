/**
 * Ocean — P2P Asset Renting (Feature 172)
 * --------------------------------------
 * Rent out items (tools, cameras, appliances) by the hour. Renting pays the
 * hourly fee from the renter's wallet and holds a deposit; returning releases
 * the deposit back and credits the owner the fee.
 *
 * Model (global db, idempotent ensure):
 *   db.rentals — array of { id, item, description, ownerId, ownerName, hourlyRate,
 *                  deposit, status: 'available'|'rented', rentedBy, rentedUntil, createdAt }
 *
 * Routes:
 *   POST /api/rentals             (auth) list an item
 *   GET  /api/rentals             (guest) available items
 *   POST /api/rentals/:id/rent    (auth) { hours } -> pay fee, hold deposit
 *   POST /api/rentals/:id/return  (auth, renter) -> release deposit, credit owner
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface Rental {
  id: string;
  item: string;
  description: string;
  ownerId: string;
  ownerName: string;
  hourlyRate: number;
  deposit: number;
  status: 'available' | 'rented';
  rentedBy: string | null;
  rentedUntil: number | null;
  createdAt: number;
}

function uid(): string {
  return `rent-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.rentals)) db.rentals = [];
}

export function registerRentalRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  // POST /api/rentals — list an item
  app.post('/api/rentals', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const item = String(body.item || '').trim();
    const hourlyRate = Math.floor(Number(body.hourlyRate) || 0);
    const deposit = Math.max(0, Math.floor(Number(body.deposit) || 0));
    if (item.length < 2) return res.status(400).json({ error: 'Item name is required.' });
    if (hourlyRate <= 0) return res.status(400).json({ error: 'Hourly rate must be positive.' });

    const db = loadDatabase();
    ensureCollection(db);
    const rental: Rental = {
      id: uid(),
      item: item.slice(0, 120),
      description: String(body.description || '').trim().slice(0, 1000),
      ownerId: user.id,
      ownerName: user.name || user.username || 'User',
      hourlyRate,
      deposit,
      status: 'available',
      rentedBy: null,
      rentedUntil: null,
      createdAt: Date.now(),
    };
    (db.rentals as Rental[]).unshift(rental);
    saveDatabase(db);
    res.json({ rental });
  });

  // GET /api/rentals — available + my rentals
  app.get('/api/rentals', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const available = (db.rentals as Rental[]).filter((r) => r.status === 'available').sort((a, b) => b.createdAt - a.createdAt);
    res.json({ rentals: available });
  });

  // POST /api/rentals/:id/rent — pay fee, hold deposit
  app.post('/api/rentals/:id/rent', requireAuth, (req, res) => {
    const user = (req as any).user;
    const hours = Math.max(1, Math.min(720, Math.floor(Number((req.body || {}).hours) || 1)));
    const db = loadDatabase();
    ensureCollection(db);
    const rental = (db.rentals as Rental[]).find((r) => r.id === req.params.id);
    if (!rental) return res.status(404).json({ error: 'Item not found.' });
    if (rental.ownerId === user.id) return res.status(400).json({ error: 'You cannot rent your own item.' });
    if (rental.status !== 'available') return res.status(400).json({ error: 'Item is already rented.' });

    const fee = rental.hourlyRate * hours;
    const state = loadCommunity();
    if (!spendBalance(state, user.id, fee + rental.deposit)) {
      return res.status(402).json({ error: `Insufficient balance. Need ${fee + rental.deposit} BDT (${fee} fee + ${rental.deposit} deposit), have ${state.balances[user.id] || 0}.`, balance: state.balances[user.id] || 0 });
    }
    saveCommunity(state);

    // Owner gets the fee now; deposit is refundable.
    addBalance(state, rental.ownerId, fee);
    saveCommunity(state);

    rental.status = 'rented';
    rental.rentedBy = user.id;
    rental.rentedUntil = Date.now() + hours * 3600_000;
    saveDatabase(db);
    res.json({ rental, fee, depositHeld: rental.deposit, balance: state.balances[user.id] || 0 });
  });

  // POST /api/rentals/:id/return — release deposit back
  app.post('/api/rentals/:id/return', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const rental = (db.rentals as Rental[]).find((r) => r.id === req.params.id);
    if (!rental) return res.status(404).json({ error: 'Item not found.' });
    if (rental.status !== 'rented' || rental.rentedBy !== user.id) {
      return res.status(400).json({ error: 'Only the active renter can return this item.' });
    }
    const state = loadCommunity();
    addBalance(state, user.id, rental.deposit);
    saveCommunity(state);
    rental.status = 'available';
    rental.rentedBy = null;
    rental.rentedUntil = null;
    saveDatabase(db);
    res.json({ rental, depositRefunded: rental.deposit, balance: state.balances[user.id] || 0 });
  });
}
