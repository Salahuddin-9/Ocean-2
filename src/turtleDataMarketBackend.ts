/**
 * Ocean — Personal Data Marketplace (Feature 182)
 * -----------------------------------------------
 * Opt-in only, privacy-first: users opt specific datatypes into an anonymized
 * pool (no raw PII is ever stored — only counts). Researchers buy aggregated
 * dataset snapshots with wallet coins, which reward the opted-in contributors
 * proportionally.
 *
 * Model (global db, idempotent ensure):
 *   db.dataOptIns  — array of { userId, datatype, optedAt }
 *   db.dataMarket  — array of { id, title, description, datatype, price,
 *                     status: 'active'|'purchased', soldTo, purchasedAt, createdAt }
 *
 * Routes:
 *   POST /api/datamarket/optin   (auth) { datatype, enabled } -> toggle
 *   GET  /api/datamarket/optins  (auth) my opt-ins
 *   POST /api/datamarket         (auth) { title, description?, datatype, price } -> list dataset
 *   GET  /api/datamarket         (guest) active datasets + anonymized pool counts
 *   POST /api/datamarket/:id/buy (auth) -> pay price; reward contributors
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface DataOptIn {
  userId: string;
  datatype: string;
  optedAt: number;
}

export interface DataListing {
  id: string;
  title: string;
  description: string;
  datatype: string;
  price: number;
  listedById: string;
  status: 'active' | 'purchased';
  soldTo: string | null;
  purchasedAt: number | null;
  createdAt: number;
}

const DATATYPES = ['interests', 'location_aggregate', 'usage_patterns', 'community_activity'];

function uid(): string {
  return `dm-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.dataOptIns)) db.dataOptIns = [];
  if (!Array.isArray(db.dataMarket)) db.dataMarket = [];
}

export function registerDataMarketRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  app.post('/api/datamarket/optin', requireAuth, (req, res) => {
    const user = (req as any).user;
    const datatype = String((req.body || {}).datatype || '');
    const enabled = (req.body || {}).enabled !== false;
    if (!DATATYPES.includes(datatype)) return res.status(400).json({ error: `datatype must be one of: ${DATATYPES.join(', ')}.` });
    const db = loadDatabase();
    ensureCollections(db);
    const list = db.dataOptIns as DataOptIn[];
    const existing = list.find((o) => o.userId === user.id && o.datatype === datatype);
    if (enabled && !existing) list.push({ userId: user.id, datatype, optedAt: Date.now() });
    if (!enabled && existing) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].userId === user.id && list[i].datatype === datatype) list.splice(i, 1);
    }
    saveDatabase(db);
    const enabledTypes = list.filter((o) => o.userId === user.id).map((o) => o.datatype);
    res.json({ datatype, enabled, enabledTypes });
  });

  app.get('/api/datamarket/optins', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const mine = (db.dataOptIns as DataOptIn[]).filter((o) => o.userId === user.id).map((o) => o.datatype);
    res.json({ optIns: mine });
  });

  app.post('/api/datamarket', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const datatype = String(body.datatype || '');
    const price = Math.floor(Number(body.price) || 0);
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    if (!DATATYPES.includes(datatype)) return res.status(400).json({ error: `datatype must be one of: ${DATATYPES.join(', ')}.` });
    if (price <= 0) return res.status(400).json({ error: 'Price must be positive.' });
    const db = loadDatabase();
    ensureCollections(db);
    const listing: DataListing = {
      id: uid(),
      title: title.slice(0, 140),
      description: String(body.description || '').trim().slice(0, 800),
      datatype,
      price,
      listedById: user.id,
      status: 'active',
      soldTo: null,
      purchasedAt: null,
      createdAt: Date.now(),
    };
    (db.dataMarket as DataListing[]).unshift(listing);
    saveDatabase(db);
    res.json({ listing });
  });

  app.get('/api/datamarket', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const listings = (db.dataMarket as DataListing[]).filter((l) => l.status === 'active').sort((a, b) => b.createdAt - a.createdAt);
    // Anonymized pool: count of opted-in users per datatype (never raw data).
    const counts: Record<string, number> = {};
    (db.dataOptIns as DataOptIn[]).forEach((o) => { counts[o.datatype] = (counts[o.datatype] || 0) + 1; });
    res.json({ listings, pool: counts, totalOptIns: (db.dataOptIns as DataOptIn[]).length });
  });

  app.post('/api/datamarket/:id/buy', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const listing = (db.dataMarket as DataListing[]).find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'Dataset not found.' });
    if (listing.status !== 'active') return res.status(400).json({ error: 'Already purchased.' });

    const contributors = (db.dataOptIns as DataOptIn[]).filter((o) => o.datatype === listing.datatype);
    if (contributors.length === 0) return res.status(400).json({ error: 'No opted-in contributors for this datatype yet.' });

    const state = loadCommunity();
    if (!spendBalance(state, user.id, listing.price)) {
      return res.status(402).json({ error: `Insufficient balance. Need ${listing.price} BDT, have ${state.balances[user.id] || 0}.`, balance: state.balances[user.id] || 0 });
    }
    // Reward contributors proportionally (minus a 10% marketplace fee to the lister).
    const listerShare = Math.floor(listing.price * 0.1);
    const contributorPool = listing.price - listerShare;
    const perUser = Math.floor(contributorPool / contributors.length);
    contributors.forEach((c) => addBalance(state, c.userId, perUser));
    addBalance(state, listing.listedById, listerShare);
    saveCommunity(state);

    listing.status = 'purchased';
    listing.soldTo = user.id;
    listing.purchasedAt = Date.now();
    saveDatabase(db);
    res.json({
      success: true,
      price: listing.price,
      contributorReward: perUser,
      contributorsRewarded: contributors.length,
      listerShare,
      balance: state.balances[user.id] || 0,
    });
  });
}
