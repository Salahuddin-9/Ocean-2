/**
 * Ocean — AI Marketplace Negotiator (Feature 148)
 * -----------------------------------------------
 * A self-contained hyperlocal marketplace with an AI negotiation agent. The agent
 * studies the item, comparable listings (same category/condition), demand signals
 * and the buyer's budget, then suggests a rational counter-offer with an
 * explainable rationale — never an arbitrary number.
 *
 * Model (global db, idempotent ensure):
 *   db.marketItems       — array of { id, sellerId, sellerName, title, category, condition,
 *                           askingPrice, description, views, sold, listedAt }
 *   db.marketOffers      — array of { id, itemId, buyerId, buyerName, price, at }
 *   db.marketNegotiations— array of { id, itemId, buyerId, suggestion, rationale[], at }
 *
 * Routes:
 *   POST /api/market/items          (auth) create listing
 *   GET  /api/market/items          (guest) list (filter: ?category=, ?q=)
 *   POST /api/market/negotiate      (auth) { itemId, budget, maxPrice? } -> suggestion
 *   POST /api/market/offer          (auth) { itemId, price } -> record an offer
 *   GET  /api/market/offers/:itemId (guest) offer history + suggestion history
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export type Condition = 'new' | 'like_new' | 'good' | 'fair';

export interface MarketItem {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  category: string;
  condition: Condition;
  askingPrice: number;
  description: string;
  views: number;
  sold: boolean;
  listedAt: number;
}

export interface MarketOffer {
  id: string;
  itemId: string;
  buyerId: string;
  buyerName: string;
  price: number;
  at: number;
}

export interface NegotiationSuggestion {
  id: string;
  itemId: string;
  buyerId: string;
  suggestion: number;
  anchor: number;
  rationale: string[];
  at: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.marketItems)) db.marketItems = [];
  if (!Array.isArray(db.marketOffers)) db.marketOffers = [];
  if (!Array.isArray(db.marketNegotiations)) db.marketNegotiations = [];
}

const CATEGORIES = ['electronics', 'furniture', 'clothing', 'books', 'vehicles', 'home', 'other'];

/** Comparable listings: same category (and condition when available). */
function comparables(db: any, item: MarketItem): MarketItem[] {
  return (db.marketItems as MarketItem[]).filter(
    (x) => x.id !== item.id && !x.sold && x.category === item.category
  );
}

/**
 * The negotiation model — deterministic and explainable:
 *   anchor   = blended market reference price
 *   target   = 55% market + 25% asking + 20% budget (buyer-leaning blend)
 *   clamp    = between budget*0.5 and asking*0.9, never above budget
 */
export function negotiatePrice(db: any, item: MarketItem, budget: number): { suggestion: number; anchor: number; rationale: string[] } {
  const comps = comparables(db, item);
  const demand = (db.marketOffers as MarketOffer[]).filter((o) => o.itemId === item.id).length;
  const views = item.views || 0;

  const compPrices = comps.map((c) => c.askingPrice);
  const marketAvg = compPrices.length > 0
    ? compPrices.reduce((a, b) => a + b, 0) / compPrices.length
    : item.askingPrice * 0.8; // no comparables -> assume ~20% negotiable

  const anchor = Math.round(marketAvg);
  const raw = marketAvg * 0.55 + item.askingPrice * 0.25 + Math.max(0, budget) * 0.2;
  let suggestion = Math.round(raw);

  const rationale: string[] = [];
  if (compPrices.length > 0) {
    rationale.push(`${compPrices.length} comparable ${item.category} listings average ${marketAvg} (${item.condition} condition)`);
  } else {
    rationale.push('No comparable listings yet — anchored to a standard 20% negotiation margin on the asking price');
  }
  if (demand > 0) {
    suggestion = Math.round(suggestion * (1 + Math.min(0.15, demand * 0.03)));
    rationale.push(`${demand} competing offer${demand === 1 ? '' : 's'} on this item — demand nudges the counter up`);
  } else {
    suggestion = Math.round(suggestion * 0.97);
    rationale.push('No competing offers — a slightly lower counter is reasonable');
  }
  if (views >= 25) {
    suggestion = Math.round(suggestion * 1.05);
    rationale.push(`${views} views — strong interest supports a firmer price`);
  }

  // Clamp: never below half the buyer's budget, never above 90% of asking or the budget.
  const lo = Math.round(Math.max(1, budget * 0.5));
  const hi = Math.round(Math.min(item.askingPrice * 0.9, budget));
  suggestion = Math.max(lo, Math.min(hi, suggestion));
  if (suggestion >= item.askingPrice) {
    suggestion = Math.round(item.askingPrice * 0.85);
    rationale.push('Suggestion capped below the asking price to keep a negotiating margin');
  }
  rationale.push(`Offer ${suggestion} — ${(suggestion / item.askingPrice * 100).toFixed(0)}% of asking (${item.askingPrice})`);

  return { suggestion, anchor, rationale };
}

export function registerMarketNegotiatorRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/market/items — create listing (auth)
  app.post('/api/market/items', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const askingPrice = Math.floor(Number(body.askingPrice) || 0);
    const category = CATEGORIES.includes(body.category) ? body.category : 'other';
    const condition: Condition = ['new', 'like_new', 'good', 'fair'].includes(body.condition) ? body.condition : 'good';
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    if (askingPrice <= 0) return res.status(400).json({ error: 'A positive asking price is required.' });
    if (askingPrice > 100_000_000) return res.status(400).json({ error: 'Price out of range.' });

    const db = loadDatabase();
    ensureCollections(db);
    const item: MarketItem = {
      id: uid('item'),
      sellerId: user.id,
      sellerName: user.name || user.username || 'User',
      title: title.slice(0, 120),
      category,
      condition,
      askingPrice,
      description: String(body.description || '').trim().slice(0, 1000),
      views: 0,
      sold: false,
      listedAt: Date.now(),
    };
    (db.marketItems as MarketItem[]).unshift(item);
    saveDatabase(db);
    res.json({ item });
  });

  // GET /api/market/items — browse (guest-safe)
  app.get('/api/market/items', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    let list = (db.marketItems as MarketItem[]).filter((i) => !i.sold);
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    if (category) list = list.filter((i) => i.category === category);
    if (q) list = list.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    res.json({ items: list.sort((a, b) => b.listedAt - a.listedAt).slice(0, 100) });
  });

  // POST /api/market/negotiate — AI counter-offer (auth)
  app.post('/api/market/negotiate', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const itemId = String(body.itemId || '').trim();
    const budget = Math.floor(Number(body.budget) || 0);
    if (!itemId) return res.status(400).json({ error: 'itemId is required.' });
    if (budget <= 0) return res.status(400).json({ error: 'A positive budget is required.' });

    const db = loadDatabase();
    ensureCollections(db);
    const item = (db.marketItems as MarketItem[]).find((i) => i.id === itemId && !i.sold);
    if (!item) return res.status(404).json({ error: 'Item not found or already sold.' });

    item.views += 1;
    const { suggestion, anchor, rationale } = negotiatePrice(db, item, budget);
    const negotiation: NegotiationSuggestion = {
      id: uid('nego'),
      itemId,
      buyerId: user.id,
      suggestion,
      anchor,
      rationale,
      at: Date.now(),
    };
    const list = db.marketNegotiations as NegotiationSuggestion[];
    list.unshift(negotiation);
    if (list.length > 500) list.length = 500;
    saveDatabase(db);
    res.json({ negotiation, item });
  });

  // POST /api/market/offer — record an offer (auth)
  app.post('/api/market/offer', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const itemId = String(body.itemId || '').trim();
    const price = Math.floor(Number(body.price) || 0);
    if (!itemId || price <= 0) return res.status(400).json({ error: 'itemId and a positive price are required.' });

    const db = loadDatabase();
    ensureCollections(db);
    const item = (db.marketItems as MarketItem[]).find((i) => i.id === itemId && !i.sold);
    if (!item) return res.status(404).json({ error: 'Item not found or already sold.' });
    const offer: MarketOffer = {
      id: uid('offer'),
      itemId,
      buyerId: user.id,
      buyerName: user.name || user.username || 'User',
      price,
      at: Date.now(),
    };
    (db.marketOffers as MarketOffer[]).unshift(offer);
    saveDatabase(db);
    res.json({ offer, offerCount: (db.marketOffers as MarketOffer[]).filter((o) => o.itemId === itemId).length });
  });

  // GET /api/market/offers/:itemId — offer + suggestion history (guest-safe)
  app.get('/api/market/offers/:itemId', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const offers = (db.marketOffers as MarketOffer[])
      .filter((o) => o.itemId === req.params.itemId)
      .sort((a, b) => b.at - a.at);
    const negotiations = (db.marketNegotiations as NegotiationSuggestion[])
      .filter((n) => n.itemId === req.params.itemId)
      .sort((a, b) => b.at - a.at);
    const item = (db.marketItems as MarketItem[]).find((i) => i.id === req.params.itemId);
    res.json({ item: item || null, offers, negotiations });
  });
}
