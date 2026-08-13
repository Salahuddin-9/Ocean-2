/**
 * Ocean — Pro-Bono Lawyer Matchmaking (Feature 208)
 * ---------------------------------------------------
 * Lawyers register with practice areas + pro-bono availability; users file
 * cases and get matched to lawyers by category. Lawyers can accept cases.
 *
 * Model (global db):
 *   db.lawyers — { id, userId, name, areas: string[], proBono: boolean, bio }
 *   db.legalCases — { id, userId, userName, category, description,
 *     urgency: 'normal'|'urgent', status: 'open'|'matched'|'closed',
 *     matchedTo?, createdAt }
 *
 * Routes:
 *   GET  /api/lawyers            (public) list lawyers (optionally ?area=)
 *   POST /api/lawyers            (auth) register/update MY lawyer profile
 *   GET  /api/cases              (auth) cases I filed or am matched to
 *   POST /api/cases              (auth) file a case
 *   POST /api/cases/:id/accept   (auth: lawyer) accept an open case
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface Lawyer {
  id: string;
  userId: string;
  name: string;
  areas: string[];
  proBono: boolean;
  bio: string;
}

export interface LegalCase {
  id: string;
  userId: string;
  userName: string;
  category: string;
  description: string;
  urgency: 'normal' | 'urgent';
  status: 'open' | 'matched' | 'closed';
  matchedTo?: string;
  createdAt: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.lawyers)) db.lawyers = [];
  if (!Array.isArray(db.legalCases)) db.legalCases = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerLawyerRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/lawyers', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const area = s((req.query as any).area, 60).toLowerCase();
    const list = (db.lawyers as Lawyer[])
      .filter((l) => (area ? l.areas.some((a) => a.toLowerCase().includes(area)) : true))
      .sort((a, b) => (b.proBono === a.proBono ? 0 : b.proBono ? 1 : -1));
    res.json({ lawyers: list });
  });

  app.post('/api/lawyers', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const areas = Array.isArray(b.areas) ? b.areas.map((a: any) => s(a, 60)).filter(Boolean).slice(0, 8) : [];
    if (areas.length === 0) return res.status(400).json({ error: 'At least one practice area is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const existing = (db.lawyers as Lawyer[]).find((l) => l.userId === user.id);
    if (existing) {
      existing.areas = areas;
      existing.proBono = Boolean(b.proBono);
      existing.bio = s(b.bio, 400);
    } else {
      (db.lawyers as Lawyer[]).push({
        id: uid('law'),
        userId: user.id,
        name: user.name || user.username || 'User',
        areas,
        proBono: Boolean(b.proBono),
        bio: s(b.bio, 400),
      });
    }
    saveDatabase(db);
    res.json({ lawyer: (db.lawyers as Lawyer[]).find((l) => l.userId === user.id) });
  });

  app.get('/api/cases', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.legalCases as LegalCase[]).filter((c) => c.userId === user.id || c.matchedTo === user.id);
    res.json({ cases: mine });
  });

  app.post('/api/cases', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const category = s(b.category, 60);
    const description = s(b.description, 1200);
    if (!category || !description) return res.status(400).json({ error: 'category and description are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const legalCase: LegalCase = {
      id: uid('case'),
      userId: user.id,
      userName: user.name || user.username || 'User',
      category,
      description,
      urgency: b.urgency === 'urgent' ? 'urgent' : 'normal',
      status: 'open',
      createdAt: Date.now(),
    };
    (db.legalCases as LegalCase[]).unshift(legalCase);
    saveDatabase(db);
    res.json({ case: legalCase });
  });

  app.post('/api/cases/:id/accept', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const lawyer = (db.lawyers as Lawyer[]).find((l) => l.userId === user.id);
    if (!lawyer) return res.status(403).json({ error: 'Register as a lawyer first.' });
    const legalCase = (db.legalCases as LegalCase[]).find((c) => c.id === req.params.id);
    if (!legalCase) return res.status(404).json({ error: 'Case not found.' });
    if (legalCase.userId === user.id) return res.status(400).json({ error: 'You cannot accept your own case.' });
    if (legalCase.status !== 'open') return res.status(400).json({ error: 'Case already matched.' });
    legalCase.status = 'matched';
    legalCase.matchedTo = user.id;
    saveDatabase(db);
    res.json({ success: true, case: legalCase });
  });
}
