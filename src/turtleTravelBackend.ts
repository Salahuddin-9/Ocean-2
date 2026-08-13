/**
 * Ocean — Travel Buddy Matching (228) + Hidden Gem Drops (229) +
 * Trip Planner with Group Budget (230)
 * -----------------------------------------------------------------
 * 228: trip plans matched by route & dates — join a plan to become buddies.
 * 229: community pins of scenic spots with GPS + tags.
 * 230: collaborative itineraries with a shared budget ledger.
 *
 * Routes:
 *   /api/travel/plans|:id/join|:id/mine
 *   /api/gems|/api/gems/:id/upvote
 *   /api/trips|/api/trips/:id/join|:id/budget
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface TravelPlan {
  id: string;
  from: string;
  to: string;
  date: number;
  userId: string;
  userName: string;
  mode: string;
  members: { id: string; name: string }[];
  note: string;
  createdAt: number;
}

export interface HiddenGem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: string[];
  desc: string;
  userId: string;
  userName: string;
  upvotes: string[];
  createdAt: number;
}

export interface GroupTrip {
  id: string;
  name: string;
  destination: string;
  startDate: number;
  budget: number;
  expenses: { id: string; label: string; amount: number; by: string; byName: string; at: number }[];
  members: { id: string; name: string }[];
  createdBy: string;
  createdAt: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.travelPlans)) db.travelPlans = [];
  if (!Array.isArray(db.hiddenGems)) db.hiddenGems = [];
  if (!Array.isArray(db.groupTrips)) db.groupTrips = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerTravelRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // ============ 228 Travel buddies ============
  app.get('/api/travel/plans', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const to = s((req.query as any).to, 60).toLowerCase();
    const list = (db.travelPlans as TravelPlan[])
      .filter((p) => (to ? p.to.toLowerCase().includes(to) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ plans: list });
  });

  app.post('/api/travel/plans', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const from = s(b.from, 80);
    const to = s(b.to, 80);
    if (!from || !to) return res.status(400).json({ error: 'from and to are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const plan: TravelPlan = {
      id: uid('trp'),
      from,
      to,
      date: Number.isFinite(Number(b.date)) ? Number(b.date) : 0,
      userId: user.id,
      userName: user.name || user.username || 'User',
      mode: s(b.mode, 40) || 'Any',
      members: [{ id: user.id, name: user.name || user.username || 'User' }],
      note: s(b.note, 300),
      createdAt: Date.now(),
    };
    (db.travelPlans as TravelPlan[]).unshift(plan);
    saveDatabase(db);
    res.json({ plan });
  });

  app.post('/api/travel/plans/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const plan = (db.travelPlans as TravelPlan[]).find((p) => p.id === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });
    if (plan.members.some((m) => m.id === user.id)) return res.status(400).json({ error: 'Already joined.' });
    plan.members.push({ id: user.id, name: user.name || user.username || 'User' });
    saveDatabase(db);
    res.json({ success: true, members: plan.members });
  });

  app.get('/api/travel/plans/mine', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ plans: (db.travelPlans as TravelPlan[]).filter((p) => p.userId === user.id || p.members.some((m) => m.id === user.id)) });
  });

  // ============ 229 Hidden gems ============
  app.get('/api/gems', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const tag = s((req.query as any).tag, 40).toLowerCase();
    const gems = (db.hiddenGems as HiddenGem[])
      .filter((g) => (tag ? g.tags.some((t) => t.toLowerCase().includes(tag)) : true))
      .sort((a, b) => b.upvotes.length - a.upvotes.length);
    res.json({ gems });
  });

  app.post('/api/gems', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const name = s(b.name, 100);
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!name) return res.status(400).json({ error: 'name is required.' });
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Valid lat/lng are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const gem: HiddenGem = {
      id: uid('gem'),
      name,
      lat, lng,
      tags: Array.isArray(b.tags) ? b.tags.map((t: any) => s(t, 40)).filter(Boolean).slice(0, 8) : [],
      desc: s(b.desc, 400),
      userId: user.id,
      userName: user.name || user.username || 'User',
      upvotes: [user.id],
      createdAt: Date.now(),
    };
    (db.hiddenGems as HiddenGem[]).unshift(gem);
    saveDatabase(db);
    res.json({ gem });
  });

  app.post('/api/gems/:id/upvote', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const gem = (db.hiddenGems as HiddenGem[]).find((g) => g.id === req.params.id);
    if (!gem) return res.status(404).json({ error: 'Gem not found.' });
    const idx = gem.upvotes.indexOf(user.id);
    if (idx >= 0) gem.upvotes.splice(idx, 1);
    else gem.upvotes.push(user.id);
    saveDatabase(db);
    res.json({ upvotes: gem.upvotes.length });
  });

  // ============ 230 Group trips ============
  app.get('/api/trips', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const me = (req as any).user?.id;
    res.json({ trips: (db.groupTrips as GroupTrip[]).map((t) => ({ ...t, joined: me ? t.members.some((m) => m.id === me) : false })) });
  });

  app.post('/api/trips', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const name = s(b.name, 100);
    if (!name) return res.status(400).json({ error: 'Trip name is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const trip: GroupTrip = {
      id: uid('trp2'),
      name,
      destination: s(b.destination, 100),
      startDate: Number.isFinite(Number(b.startDate)) ? Number(b.startDate) : 0,
      budget: Math.max(0, Math.floor(Number(b.budget) || 0)),
      expenses: [],
      members: [{ id: user.id, name: user.name || user.username || 'User' }],
      createdBy: user.id,
      createdAt: Date.now(),
    };
    (db.groupTrips as GroupTrip[]).push(trip);
    saveDatabase(db);
    res.json({ trip });
  });

  app.post('/api/trips/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const trip = (db.groupTrips as GroupTrip[]).find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found.' });
    if (trip.members.some((m) => m.id === user.id)) return res.status(400).json({ error: 'Already joined.' });
    trip.members.push({ id: user.id, name: user.name || user.username || 'User' });
    saveDatabase(db);
    res.json({ success: true, members: trip.members });
  });

  app.post('/api/trips/:id/budget', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const label = s(b.label, 80);
    const amount = Number(b.amount);
    if (!label || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'label and a positive amount are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const trip = (db.groupTrips as GroupTrip[]).find((t) => t.id === req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found.' });
    trip.expenses.push({ id: uid('exp'), label, amount: Math.round(amount * 100) / 100, by: user.id, byName: user.name || user.username || 'User', at: Date.now() });
    saveDatabase(db);
    res.json({ expenses: trip.expenses, budget: trip.budget, spent: trip.expenses.reduce((a, e) => a + e.amount, 0) });
  });
}
