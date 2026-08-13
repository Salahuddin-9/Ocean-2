/**
 * Ocean — Internship Board (Feature 196)
 * ---------------------------------------
 * Postings and applications for internships. Anyone can post a role; any user
 * can apply with a short note. Posters can mark applications accepted.
 *
 * Model (global db): db.internships — array of
 *   { id, company, role, location, type: 'remote'|'onsite'|'hybrid',
 *     stipend, duration, description, postedBy, postedByName, applications:
 *     { id, userId, userName, note, status: 'pending'|'accepted'|'rejected', at }[],
 *     createdAt }
 *
 * Routes:
 *   GET  /api/internships              (public) all, with applied-by-me flags
 *   POST /api/internships              (auth) post an internship
 *   POST /api/internships/:id/apply    (auth) apply (one per user)
 *   POST /api/internships/:id/applications/:appId/respond  (auth: poster)
 *   GET  /api/internships/mine         (auth) my postings + my applications
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface InternshipApp {
  id: string;
  userId: string;
  userName: string;
  note: string;
  status: 'pending' | 'accepted' | 'rejected';
  at: number;
}

export interface Internship {
  id: string;
  company: string;
  role: string;
  location: string;
  type: 'remote' | 'onsite' | 'hybrid';
  stipend: string;
  duration: string;
  description: string;
  postedBy: string;
  postedByName: string;
  applications: InternshipApp[];
  createdAt: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.internships)) db.internships = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function publicShape(i: Internship, me?: string) {
  const mine = me && i.postedBy === me;
  return {
    ...i,
    applications: mine ? i.applications : i.applications.length,
    appliedByMe: me ? i.applications.some((a) => a.userId === me) : false,
  };
}

export function registerInternshipRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/internships', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const me = (req as any).user?.id;
    const list = (db.internships as Internship[])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((i) => publicShape(i, me));
    res.json({ internships: list });
  });

  app.post('/api/internships', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const company = s(b.company, 80);
    const role = s(b.role, 100);
    if (!company || !role) return res.status(400).json({ error: 'company and role are required.' });
    const type = ['remote', 'onsite', 'hybrid'].includes(b.type) ? b.type : 'remote';
    const db = loadDatabase();
    ensureCollection(db);
    const item: Internship = {
      id: uid('int'),
      company,
      role,
      location: s(b.location, 100),
      type,
      stipend: s(b.stipend, 80),
      duration: s(b.duration, 60),
      description: s(b.description, 1200),
      postedBy: user.id,
      postedByName: user.name || user.username || 'User',
      applications: [],
      createdAt: Date.now(),
    };
    (db.internships as Internship[]).unshift(item);
    saveDatabase(db);
    res.json({ internship: publicShape(item, user.id) });
  });

  app.post('/api/internships/:id/apply', requireAuth, (req, res) => {
    const user = (req as any).user;
    const note = s((req.body || {}).note, 600);
    const db = loadDatabase();
    ensureCollection(db);
    const item = (db.internships as Internship[]).find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Internship not found.' });
    if (item.postedBy === user.id) return res.status(400).json({ error: 'You cannot apply to your own posting.' });
    if (item.applications.some((a) => a.userId === user.id)) {
      return res.status(400).json({ error: 'Already applied.' });
    }
    item.applications.push({
      id: uid('app'),
      userId: user.id,
      userName: user.name || user.username || 'User',
      note,
      status: 'pending',
      at: Date.now(),
    });
    saveDatabase(db);
    res.json({ success: true, appliedByMe: true });
  });

  app.post('/api/internships/:id/applications/:appId/respond', requireAuth, (req, res) => {
    const user = (req as any).user;
    const status = (req.body || {}).status;
    if (status !== 'accepted' && status !== 'rejected') return res.status(400).json({ error: 'status must be accepted or rejected.' });
    const db = loadDatabase();
    ensureCollection(db);
    const item = (db.internships as Internship[]).find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Internship not found.' });
    if (item.postedBy !== user.id) return res.status(403).json({ error: 'Only the poster can respond.' });
    const app = item.applications.find((a) => a.id === req.params.appId);
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    app.status = status;
    saveDatabase(db);
    res.json({ success: true, application: app });
  });

  app.get('/api/internships/mine', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const posted = (db.internships as Internship[]).filter((i) => i.postedBy === user.id);
    const applied = (db.internships as Internship[])
      .filter((i) => i.applications.some((a) => a.userId === user.id))
      .map((i) => ({ ...i, myApp: i.applications.find((a) => a.userId === user.id) }));
    res.json({ posted, applied });
  });
}
