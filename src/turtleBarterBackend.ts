/**
 * Ocean — Skill & Item Barter Exchange (Feature 173)
 * --------------------------------------------------
 * Trade without coins: users post what they offer and what they want; anyone
 * can express interest, and the poster can match one interested user.
 *
 * Model (global db, idempotent ensure):
 *   db.barters — array of { id, offerText, wantText, offeredById, offeredByName,
 *                  status: 'open'|'matched', matchedWith, interest: [{userId,note,at}], createdAt }
 *
 * Routes:
 *   POST /api/barter            (auth) { offer, want } -> create
 *   GET  /api/barter            (guest) open offers
 *   POST /api/barter/:id/interest (auth) { note } -> express interest
 *   POST /api/barter/:id/match  (auth, poster) { userId } -> close the match
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface BarterInterest {
  userId: string;
  note: string;
  at: number;
}

export interface Barter {
  id: string;
  offerText: string;
  wantText: string;
  offeredById: string;
  offeredByName: string;
  status: 'open' | 'matched';
  matchedWith: string | null;
  interest: BarterInterest[];
  createdAt: number;
}

function uid(): string {
  return `bar-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.barters)) db.barters = [];
}

export function registerBarterRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/barter', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const offer = String(body.offer || '').trim();
    const want = String(body.want || '').trim();
    if (offer.length < 2) return res.status(400).json({ error: 'Tell us what you offer.' });
    if (want.length < 2) return res.status(400).json({ error: 'Tell us what you want.' });
    const db = loadDatabase();
    ensureCollection(db);
    const barter: Barter = {
      id: uid(),
      offerText: offer.slice(0, 500),
      wantText: want.slice(0, 500),
      offeredById: user.id,
      offeredByName: user.name || user.username || 'User',
      status: 'open',
      matchedWith: null,
      interest: [],
      createdAt: Date.now(),
    };
    (db.barters as Barter[]).unshift(barter);
    saveDatabase(db);
    res.json({ barter });
  });

  app.get('/api/barter', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const open = (db.barters as Barter[]).filter((b) => b.status === 'open').sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    res.json({ barters: open });
  });

  app.post('/api/barter/:id/interest', requireAuth, (req, res) => {
    const user = (req as any).user;
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    const db = loadDatabase();
    ensureCollection(db);
    const barter = (db.barters as Barter[]).find((b) => b.id === req.params.id);
    if (!barter) return res.status(404).json({ error: 'Offer not found.' });
    if (barter.status !== 'open') return res.status(400).json({ error: 'This offer is already matched.' });
    if (barter.offeredById === user.id) return res.status(400).json({ error: 'You cannot be interested in your own offer.' });
    if (!barter.interest.some((i) => i.userId === user.id)) {
      barter.interest.push({ userId: user.id, note, at: Date.now() });
      saveDatabase(db);
    }
    res.json({ barter, interested: barter.interest.length });
  });

  app.post('/api/barter/:id/match', requireAuth, (req, res) => {
    const user = (req as any).user;
    const userId = String((req.body || {}).userId || '');
    const db = loadDatabase();
    ensureCollection(db);
    const barter = (db.barters as Barter[]).find((b) => b.id === req.params.id);
    if (!barter) return res.status(404).json({ error: 'Offer not found.' });
    if (barter.offeredById !== user.id) return res.status(403).json({ error: 'Only the poster can close the match.' });
    if (barter.status !== 'open') return res.status(400).json({ error: 'Already matched.' });
    if (!barter.interest.some((i) => i.userId === userId)) return res.status(400).json({ error: 'That user never expressed interest.' });
    barter.status = 'matched';
    barter.matchedWith = userId;
    saveDatabase(db);
    res.json({ barter, note: 'Match closed — contact each other in chat to swap!' });
  });
}
