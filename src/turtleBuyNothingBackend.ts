/**
 * Ocean — Local "Buy Nothing" Group (Feature 176)
 * ----------------------------------------------
 * The zero-cost corner of the local economy: give things away or ask for
 * things, nothing is sold. Claiming marks an item taken.
 *
 * Model (global db, idempotent ensure):
 *   db.buyNothing — array of { id, kind: 'give'|'want', title, details,
 *                  area, postedById, postedByName, claimedById,
 *                  status: 'open'|'claimed', createdAt }
 *
 * Routes:
 *   POST /api/buynothing           (auth) { kind, title, details, area? }
 *   GET  /api/buynothing           (guest) ?kind=give open items
 *   POST /api/buynothing/:id/claim (auth) -> mark claimed
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface BuyNothingItem {
  id: string;
  kind: 'give' | 'want';
  title: string;
  details: string;
  area: string;
  postedById: string;
  postedByName: string;
  claimedById: string | null;
  status: 'open' | 'claimed';
  createdAt: number;
}

function uid(): string {
  return `bn-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.buyNothing)) db.buyNothing = [];
}

export function registerBuyNothingRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/buynothing', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const kind = body.kind === 'want' ? 'want' : 'give';
    const title = String(body.title || '').trim();
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    const db = loadDatabase();
    ensureCollection(db);
    const item: BuyNothingItem = {
      id: uid(),
      kind,
      title: title.slice(0, 140),
      details: String(body.details || '').trim().slice(0, 800),
      area: String(body.area || 'Nearby').trim().slice(0, 80),
      postedById: user.id,
      postedByName: user.name || user.username || 'User',
      claimedById: null,
      status: 'open',
      createdAt: Date.now(),
    };
    (db.buyNothing as BuyNothingItem[]).unshift(item);
    saveDatabase(db);
    res.json({ item });
  });

  app.get('/api/buynothing', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const kind = req.query.kind === 'want' ? 'want' : undefined;
    const list = (db.buyNothing as BuyNothingItem[])
      .filter((i) => i.status === 'open' && (!kind || i.kind === kind))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);
    res.json({ items: list });
  });

  app.post('/api/buynothing/:id/claim', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const item = (db.buyNothing as BuyNothingItem[]).find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (item.status !== 'open') return res.status(400).json({ error: 'Already claimed.' });
    if (item.postedById === user.id) return res.status(400).json({ error: 'You cannot claim your own post.' });
    item.status = 'claimed';
    item.claimedById = user.id;
    saveDatabase(db);
    res.json({ item, note: 'Claimed — arrange pickup in chat.' });
  });
}
