/**
 * Ocean — Hyperlocal Gig Radar (Feature 174)
 * ------------------------------------------
 * Quick jobs in your area. Gigs carry an approximate location + radius; the
 * radar filters by max distance. Interested users apply; the poster picks an
 * applicant to close the gig.
 *
 * Model (global db, idempotent ensure):
 *   db.gigs — array of { id, title, pay, location, radiusKm, postedById,
 *              postedByName, status: 'open'|'filled', applicants: [{userId,note,at}], createdAt }
 *
 * Routes:
 *   POST /api/gigs             (auth) { title, pay, location, radiusKm? } -> create
 *   GET  /api/gigs             (guest) ?maxDistance=km open gigs
 *   POST /api/gigs/:id/apply   (auth) { note }
 *   POST /api/gigs/:id/fill    (auth, poster) { userId }
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface GigApplicant {
  userId: string;
  note: string;
  at: number;
}

export interface Gig {
  id: string;
  title: string;
  pay: number;
  location: string;
  radiusKm: number;
  postedById: string;
  postedByName: string;
  status: 'open' | 'filled';
  applicants: GigApplicant[];
  createdAt: number;
}

function uid(): string {
  return `gig-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.gigs)) db.gigs = [];
}

export function registerGigRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/gigs', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const pay = Math.floor(Number(body.pay) || 0);
    if (title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    if (pay < 0) return res.status(400).json({ error: 'Pay cannot be negative.' });
    const db = loadDatabase();
    ensureCollection(db);
    const gig: Gig = {
      id: uid(),
      title: title.slice(0, 160),
      pay,
      location: String(body.location || 'Nearby').trim().slice(0, 120),
      radiusKm: Math.max(1, Math.min(100, Math.floor(Number(body.radiusKm) || 10))),
      postedById: user.id,
      postedByName: user.name || user.username || 'User',
      status: 'open',
      applicants: [],
      createdAt: Date.now(),
    };
    (db.gigs as Gig[]).unshift(gig);
    saveDatabase(db);
    res.json({ gig });
  });

  app.get('/api/gigs', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const maxDistance = Number(req.query.maxDistance) || 50;
    const list = (db.gigs as Gig[])
      .filter((g) => g.status === 'open' && g.radiusKm <= maxDistance)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);
    res.json({ gigs: list });
  });

  app.post('/api/gigs/:id/apply', requireAuth, (req, res) => {
    const user = (req as any).user;
    const note = String((req.body || {}).note || '').trim().slice(0, 300);
    const db = loadDatabase();
    ensureCollection(db);
    const gig = (db.gigs as Gig[]).find((g) => g.id === req.params.id);
    if (!gig) return res.status(404).json({ error: 'Gig not found.' });
    if (gig.status !== 'open') return res.status(400).json({ error: 'This gig is already filled.' });
    if (gig.postedById === user.id) return res.status(400).json({ error: 'You cannot apply to your own gig.' });
    if (!gig.applicants.some((a) => a.userId === user.id)) {
      gig.applicants.push({ userId: user.id, note, at: Date.now() });
      saveDatabase(db);
    }
    res.json({ gig, applicants: gig.applicants.length });
  });

  app.post('/api/gigs/:id/fill', requireAuth, (req, res) => {
    const user = (req as any).user;
    const userId = String((req.body || {}).userId || '');
    const db = loadDatabase();
    ensureCollection(db);
    const gig = (db.gigs as Gig[]).find((g) => g.id === req.params.id);
    if (!gig) return res.status(404).json({ error: 'Gig not found.' });
    if (gig.postedById !== user.id) return res.status(403).json({ error: 'Only the poster can fill the gig.' });
    if (gig.status !== 'open') return res.status(400).json({ error: 'Already filled.' });
    if (!gig.applicants.some((a) => a.userId === userId)) return res.status(400).json({ error: 'That user never applied.' });
    gig.status = 'filled';
    saveDatabase(db);
    res.json({ gig, note: 'Gig filled — message the applicant in chat.' });
  });
}
