/**
 * Ocean — Scholarship Aggregator (Feature 201)
 * ---------------------------------------------
 * A community-maintained tracker of scholarships: name, org, amount, eligibility,
 * deadline and link. Users can bookmark scholarships they are chasing; overdue
 * ones are marked expired on read.
 *
 * Model (global db): db.scholarships — array of
 *   { id, name, org, amount, eligibility, deadline, link, postedBy, savedBy[],
 *     createdAt, status: 'open'|'expired' }
 *
 * Routes:
 *   GET  /api/scholarships            (public) open scholarships, filter ?q=
 *   POST /api/scholarships            (auth) add a scholarship
 *   POST /api/scholarships/:id/save   (auth) toggle bookmark
 *   GET  /api/scholarships/saved      (auth) my bookmarks
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface Scholarship {
  id: string;
  name: string;
  org: string;
  amount: string;
  eligibility: string;
  deadline: number;
  link: string;
  postedBy: string;
  savedBy: string[];
  createdAt: number;
  status: 'open' | 'expired';
}

function uid(): string {
  return `sch-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.scholarships)) db.scholarships = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerScholarshipRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function refreshStatuses(db: any): boolean {
    let changed = false;
    const now = Date.now();
    (db.scholarships as Scholarship[]).forEach((sc) => {
      const expired = sc.deadline > 0 && now > sc.deadline;
      const want = expired ? 'expired' : 'open';
      if (sc.status !== want) {
        sc.status = want;
        changed = true;
      }
    });
    return changed;
  }

  app.get('/api/scholarships', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const changed = refreshStatuses(db);
    if (changed) saveDatabase(db);
    const me = (req as any).user?.id;
    const q = s((req.query as any).q, 60).toLowerCase();
    const list = (db.scholarships as Scholarship[])
      .filter((sc) => sc.status === 'open')
      .filter((sc) => (q ? `${sc.name} ${sc.org} ${sc.eligibility}`.toLowerCase().includes(q) : true))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((sc) => ({ ...sc, savedByMe: me ? sc.savedBy.includes(me) : false }));
    res.json({ scholarships: list });
  });

  app.post('/api/scholarships', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const name = s(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Scholarship name is required.' });
    const deadline = Number.isFinite(Number(b.deadline)) ? Number(b.deadline) : 0;
    const db = loadDatabase();
    ensureCollection(db);
    const sc: Scholarship = {
      id: uid(),
      name,
      org: s(b.org, 100),
      amount: s(b.amount, 80),
      eligibility: s(b.eligibility, 400),
      deadline,
      link: s(b.link, 400),
      postedBy: user.id,
      savedBy: [],
      createdAt: Date.now(),
      status: deadline > 0 && Date.now() > deadline ? 'expired' : 'open',
    };
    (db.scholarships as Scholarship[]).unshift(sc);
    saveDatabase(db);
    res.json({ scholarship: sc });
  });

  app.post('/api/scholarships/:id/save', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const sc = (db.scholarships as Scholarship[]).find((x) => x.id === req.params.id);
    if (!sc) return res.status(404).json({ error: 'Scholarship not found.' });
    const idx = sc.savedBy.indexOf(user.id);
    if (idx >= 0) sc.savedBy.splice(idx, 1);
    else sc.savedBy.push(user.id);
    saveDatabase(db);
    res.json({ success: true, saved: idx < 0 });
  });

  app.get('/api/scholarships/saved', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const now = Date.now();
    // Everything in this list is saved by the caller, so savedByMe must be true
    // (the Saved tab renders filled bookmark icons from this flag).
    const list = (db.scholarships as Scholarship[])
      .filter((sc) => sc.savedBy.includes(user.id))
      .map((sc) => ({ ...sc, savedByMe: true, status: sc.deadline > 0 && now > sc.deadline ? 'expired' as const : sc.status }));
    res.json({ scholarships: list });
  });
}
