/**
 * Ocean — Hyperlocal Marketplace (Feature 9)
 * --------------------------------------------
 * A nearby-first marketplace tab: listings of kind sell / free / service with an
 * optional location (auto-geocoded label + coordinates). The feed sorts by
 * distance when the viewer shares a location, otherwise by newest. A "Chat with
 * seller" button opens a real DM conversation.
 *
 * Model (global db): db.marketplaceListings — array of
 *   { id, sellerId, sellerName, kind: 'sell'|'free'|'service', title, description,
 *     price, condition, location: { label, lat, lng }|null, images: string[],
 *     status: 'active'|'sold'|'removed', createdAt, views }
 *
 * Routes:
 *   POST   /api/marketplace/listings            (auth) create
 *   GET    /api/marketplace/listings            (guest) ?kind&q&lat&lng&maxDistanceKm
 *   GET    /api/marketplace/listings/:id        (guest) detail
 *   POST   /api/marketplace/listings/:id/contact (auth) open DM with seller -> conversationId
 *   POST   /api/marketplace/listings/:id/sold   (auth: seller) mark sold
 *   DELETE /api/marketplace/listings/:id        (auth: seller) remove
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { haversineKm } from './turtleCoinTransfer';

export type ListingKind = 'sell' | 'free' | 'service';

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  sellerName: string;
  kind: ListingKind;
  title: string;
  description: string;
  price: number;
  condition: string;
  location: { label: string; lat: number | null; lng: number | null } | null;
  images: string[];
  status: 'active' | 'sold' | 'removed';
  createdAt: number;
  views: number;
}

const KINDS: ListingKind[] = ['sell', 'free', 'service'];
const CONDITIONS = ['new', 'like_new', 'good', 'fair'];
const CATEGORY_LABELS: Record<ListingKind, string> = {
  sell: 'Buy / Sell',
  free: 'Free',
  service: 'Services',
};

function uid(): string {
  return `listing-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function num(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.marketplaceListings)) db.marketplaceListings = [];
}

function withDistance(listing: MarketplaceListing, lat: number | null, lng: number | null): any {
  let distanceKm: number | null = null;
  if (lat != null && lng != null && listing.location && listing.location.lat != null && listing.location.lng != null) {
    distanceKm = Math.round(haversineKm(lat, lng, listing.location.lat, listing.location.lng) * 10) / 10;
  }
  return { ...listing, distanceKm };
}

export function registerMarketplaceRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/marketplace/listings — create (auth)
  app.post('/api/marketplace/listings', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const kind: ListingKind = KINDS.includes(body.kind) ? body.kind : 'sell';
    const title = s(body.title, 120);
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    const price = kind === 'free' ? 0 : num(body.price);
    const images = Array.isArray(body.images) ? body.images.filter((x: any) => typeof x === 'string').slice(0, 4) : [];
    const rawLoc = body.location || {};
    const location =
      rawLoc && (String(rawLoc.label || '').trim() || rawLoc.lat != null)
        ? {
            label: s(rawLoc.label, 120) || 'Nearby',
            lat: Number.isFinite(Number(rawLoc.lat)) ? Number(rawLoc.lat) : null,
            lng: Number.isFinite(Number(rawLoc.lng)) ? Number(rawLoc.lng) : null,
          }
        : null;

    const db = loadDatabase();
    ensureCollection(db);
    const listing: MarketplaceListing = {
      id: uid(),
      sellerId: user.id,
      sellerName: user.name || user.username || 'User',
      kind,
      title,
      description: s(body.description, 1000),
      price,
      condition: CONDITIONS.includes(body.condition) ? body.condition : 'good',
      location,
      images,
      status: 'active',
      createdAt: Date.now(),
      views: 0,
    };
    (db.marketplaceListings as MarketplaceListing[]).unshift(listing);
    saveDatabase(db);
    res.json({ listing: withDistance(listing, location?.lat, location?.lng) });
  });

  // GET /api/marketplace/listings — browse, sorted by distance when coords given
  app.get('/api/marketplace/listings', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
    const lat = Number.isFinite(Number(req.query.lat)) ? Number(req.query.lat) : null;
    const lng = Number.isFinite(Number(req.query.lng)) ? Number(req.query.lng) : null;
    const maxDistanceKm = Number.isFinite(Number(req.query.maxDistanceKm)) ? Number(req.query.maxDistanceKm) : 0;

    let list = (db.marketplaceListings as MarketplaceListing[]).filter((l) => l.status === 'active');
    if (kind && KINDS.includes(kind as ListingKind)) list = list.filter((l) => l.kind === kind);
    if (q) {
      list = list.filter(
        (l) => l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
      );
    }
    const withDist = list.map((l) => withDistance(l, lat, lng));
    if (lat != null && lng != null) {
      if (maxDistanceKm > 0) {
        const filtered = withDist.filter((l) => l.distanceKm === null || l.distanceKm <= maxDistanceKm);
        return res.json({
          listings: filtered.sort((a: any, b: any) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 100),
          distanceFilter: maxDistanceKm,
        });
      }
      return res.json({ listings: withDist.sort((a: any, b: any) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)).slice(0, 100) });
    }
    res.json({ listings: withDist.sort((a, b) => b.createdAt - a.createdAt).slice(0, 100) });
  });

  // GET /api/marketplace/listings/:id — detail
  app.get('/api/marketplace/listings/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const listing = (db.marketplaceListings as MarketplaceListing[]).find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    listing.views += 1;
    saveDatabase(db);
    res.json({ listing });
  });

  // POST /api/marketplace/listings/:id/contact — open a DM with the seller (auth)
  app.post('/api/marketplace/listings/:id/contact', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const listing = (db.marketplaceListings as MarketplaceListing[]).find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    if (listing.sellerId === user.id) return res.status(400).json({ error: 'This is your own listing.' });

    const pair = [user.id, listing.sellerId].sort();
    let conv = (db.conversations || []).find(
      (c: any) =>
        c &&
        Array.isArray(c.participants) &&
        c.participants.length === 2 &&
        c.participants.includes(pair[0]) &&
        c.participants.includes(pair[1])
    );
    if (!conv) {
      const id = `conv-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      const seller = (db.users || []).find((u: any) => u && u.id === listing.sellerId);
      conv = {
        id,
        type: 'dm',
        name: seller ? seller.name || seller.username || 'Seller' : listing.sellerName,
        participants: pair,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      if (!Array.isArray(db.conversations)) db.conversations = [];
      (db.conversations as any[]).push(conv);
    }
    saveDatabase(db);
    res.json({ conversationId: conv.id, message: `Chat opened with ${listing.sellerName}.` });
  });

  // POST /api/marketplace/listings/:id/sold — seller marks sold
  app.post('/api/marketplace/listings/:id/sold', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const listing = (db.marketplaceListings as MarketplaceListing[]).find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    if (listing.sellerId !== user.id) return res.status(403).json({ error: 'Only the seller can mark this sold.' });
    listing.status = 'sold';
    saveDatabase(db);
    res.json({ success: true, listing });
  });

  // DELETE /api/marketplace/listings/:id — seller removes
  app.delete('/api/marketplace/listings/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const listing = (db.marketplaceListings as MarketplaceListing[]).find((l) => l.id === req.params.id);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });
    if (listing.sellerId !== user.id) return res.status(403).json({ error: 'Only the seller can remove this listing.' });
    listing.status = 'removed';
    saveDatabase(db);
    res.json({ success: true });
  });

  // GET /api/marketplace/categories — kind metadata for the UI
  app.get('/api/marketplace/categories', (req, res) => {
    res.json({
      kinds: KINDS.map((k) => ({ id: k, label: CATEGORY_LABELS[k], isFree: k === 'free' })),
      conditions: CONDITIONS,
    });
  });
}
