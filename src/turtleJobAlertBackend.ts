/**
 * Ocean — Government Job Alert & Circular Tracker (Feature 197)
 * --------------------------------------------------------------
 * A manual-feed tracker for government job circulars (scraper-ready: the
 * ingest endpoint accepts the same shape a scraper would push). Circulars
 * auto-expire once their deadline passes (checked on read), and users can
 * bookmark circulars they are tracking.
 *
 * Model (global db): db.jobAlerts — array of
 *   { id, title, org, circularNo, category, deadline (epoch ms), salary,
 *     education, url, source: 'manual'|'scraper', postedBy, savedBy: string[],
 *     createdAt, status: 'active'|'expired' }
 *
 * Routes:
 *   GET  /api/jobs/alerts             (public) active circulars, filter ?category=&q=
 *   POST /api/jobs/alerts             (auth) submit / ingest a circular
 *   POST /api/jobs/alerts/:id/save    (auth) toggle bookmark
 *   GET  /api/jobs/alerts/saved       (auth) my bookmarked circulars
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface JobAlert {
  id: string;
  title: string;
  org: string;
  circularNo: string;
  category: string;
  deadline: number;
  salary: string;
  education: string;
  url: string;
  source: 'manual' | 'scraper';
  postedBy: string;
  savedBy: string[];
  createdAt: number;
  status: 'active' | 'expired';
}

function uid(): string {
  return `job-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.jobAlerts)) db.jobAlerts = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const CATEGORIES = ['BCS', 'Bank', 'Teacher', 'Police', 'Health', 'Engineer', 'Other'];

export function registerJobAlertRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // refresh statuses (expired when deadline passed) and return active ones
  function refreshStatuses(db: any): boolean {
    let changed = false;
    const now = Date.now();
    (db.jobAlerts as JobAlert[]).forEach((j) => {
      const expired = j.deadline > 0 && now > j.deadline;
      const want = expired ? 'expired' : 'active';
      if (j.status !== want) {
        j.status = want;
        changed = true;
      }
    });
    return changed;
  }

  app.get('/api/jobs/alerts', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const changed = refreshStatuses(db);
    if (changed) saveDatabase(db);
    const q = s((req.query as any).q, 60).toLowerCase();
    const cat = s((req.query as any).category, 40);
    const list = (db.jobAlerts as JobAlert[])
      .filter((j) => j.status === 'active')
      .filter((j) => (cat ? j.category === cat : true))
      .filter((j) => (q ? `${j.title} ${j.org} ${j.circularNo}`.toLowerCase().includes(q) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ alerts: list, categories: CATEGORIES });
  });

  app.post('/api/jobs/alerts', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = s(b.title, 140);
    const org = s(b.org, 100);
    if (!title || !org) return res.status(400).json({ error: 'title and org are required.' });
    const deadlineRaw = Number(b.deadline);
    const deadline = Number.isFinite(deadlineRaw) && deadlineRaw > 0 ? deadlineRaw : 0;
    const category = CATEGORIES.includes(b.category) ? b.category : 'Other';
    const db = loadDatabase();
    ensureCollection(db);
    const alert: JobAlert = {
      id: uid(),
      title,
      org,
      circularNo: s(b.circularNo, 60),
      category,
      deadline,
      salary: s(b.salary, 80),
      education: s(b.education, 200),
      url: s(b.url, 400),
      source: b.source === 'scraper' ? 'scraper' : 'manual',
      postedBy: user.id,
      savedBy: [],
      createdAt: Date.now(),
      status: deadline > 0 && Date.now() > deadline ? 'expired' : 'active',
    };
    (db.jobAlerts as JobAlert[]).unshift(alert);
    saveDatabase(db);
    res.json({ alert });
  });

  app.post('/api/jobs/alerts/:id/save', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const alert = (db.jobAlerts as JobAlert[]).find((j) => j.id === req.params.id);
    if (!alert) return res.status(404).json({ error: 'Circular not found.' });
    const idx = alert.savedBy.indexOf(user.id);
    if (idx >= 0) alert.savedBy.splice(idx, 1);
    else alert.savedBy.push(user.id);
    saveDatabase(db);
    res.json({ success: true, saved: idx < 0 });
  });

  app.get('/api/jobs/alerts/saved', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const changed = refreshStatuses(db);
    if (changed) saveDatabase(db);
    const list = (db.jobAlerts as JobAlert[]).filter((j) => j.savedBy.includes(user.id));
    res.json({ alerts: list });
  });
}
