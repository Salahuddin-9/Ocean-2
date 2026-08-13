/**
 * Ocean — Civic Issue Escalation Ladder (215) + Tender Tracker (216) +
 * Community Land Trust (217)
 * -------------------------------------------------------------------
 * 215: issues start at 'reported' and escalate automatically (pothole → ward →
 * municipality → ombudsman) based on age & upvotes.
 * 216: tenders listed with bid data; an anomaly detector flags bids that are
 *      suspiciously close to each other (bid-rigging signal).
 * 217: simplified land-trust ownership: parcels, member approvals (votes).
 *
 * Routes:
 *   /api/civic/issues|:id/escalate|:id/upvote
 *   /api/tenders|/api/tenders/:id/bids|/api/tenders/scan-anomalies
 *   /api/clt|/api/clt/:id/approve
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface CivicIssue {
  id: string;
  userId: string;
  userName: string;
  category: string;
  title: string;
  desc: string;
  location: string;
  level: 1 | 2 | 3 | 4;
  upvotes: string[];
  status: 'open' | 'resolved';
  createdAt: number;
}

export interface Tender {
  id: string;
  title: string;
  dept: string;
  budget: string;
  deadline: number;
  bids: { id: string; bidder: string; amount: number; at: number }[];
  status: 'open' | 'closed';
  createdAt: number;
}

export interface CltParcel {
  id: string;
  name: string;
  location: string;
  purpose: string;
  createdBy: string;
  members: string[];
  approvals: string[];
  status: 'pending' | 'approved';
  createdAt: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.civicIssues)) db.civicIssues = [];
  if (!Array.isArray(db.tenders)) db.tenders = [];
  if (!Array.isArray(db.cltParcels)) db.cltParcels = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerCivicRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // ================= 215 Civic Escalation =================
  app.get('/api/civic/issues', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const now = Date.now();
    // auto-escalate: level 1 -> 2 after 3 days OR 20 upvotes; 2 -> 3 after 7 days; 3 -> 4 after 14 days
    (db.civicIssues as CivicIssue[]).forEach((iss) => {
      if (iss.status !== 'open') return;
      const age = now - iss.createdAt;
      const votes = iss.upvotes.length;
      const next =
        iss.level === 1 && (age > 3 * 86400000 || votes >= 20) ? 2 :
        iss.level === 2 && age > 7 * 86400000 ? 3 :
        iss.level === 3 && age > 14 * 86400000 ? 4 : iss.level;
      if (next !== iss.level) iss.level = next as 1 | 2 | 3 | 4;
    });
    const issues = (db.civicIssues as CivicIssue[]).slice().sort((a, b) => b.level - a.level || b.upvotes.length - a.upvotes.length);
    res.json({ issues });
  });

  app.post('/api/civic/issues', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = s(b.title, 120);
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const issue: CivicIssue = {
      id: uid('civ'),
      userId: user.id,
      userName: user.name || user.username || 'User',
      category: s(b.category, 60) || 'General',
      title,
      desc: s(b.desc, 800),
      location: s(b.location, 100),
      level: 1,
      upvotes: [user.id],
      status: 'open',
      createdAt: Date.now(),
    };
    (db.civicIssues as CivicIssue[]).unshift(issue);
    saveDatabase(db);
    res.json({ issue });
  });

  app.post('/api/civic/issues/:id/upvote', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const issue = (db.civicIssues as CivicIssue[]).find((i) => i.id === req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found.' });
    const idx = issue.upvotes.indexOf(user.id);
    if (idx >= 0) issue.upvotes.splice(idx, 1);
    else issue.upvotes.push(user.id);
    saveDatabase(db);
    res.json({ upvotes: issue.upvotes.length });
  });

  // ================= 216 Tenders =================
  app.get('/api/tenders', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const now = Date.now();
    (db.tenders as Tender[]).forEach((t) => { if (t.deadline > 0 && now > t.deadline) t.status = 'closed'; });
    res.json({ tenders: (db.tenders as Tender[]).sort((a, b) => b.createdAt - a.createdAt) });
  });

  app.post('/api/tenders', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = s(b.title, 140);
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const tender: Tender = {
      id: uid('tnd'),
      title,
      dept: s(b.dept, 100),
      budget: s(b.budget, 80),
      deadline: Number.isFinite(Number(b.deadline)) ? Number(b.deadline) : 0,
      bids: [],
      status: 'open',
      createdAt: Date.now(),
    };
    (db.tenders as Tender[]).unshift(tender);
    saveDatabase(db);
    res.json({ tender });
  });

  app.post('/api/tenders/:id/bids', requireAuth, (req, res) => {
    const user = (req as any).user;
    const amount = Number((req.body || {}).amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'A positive bid amount is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const tender = (db.tenders as Tender[]).find((t) => t.id === req.params.id);
    if (!tender) return res.status(404).json({ error: 'Tender not found.' });
    if (tender.status !== 'open') return res.status(400).json({ error: 'Tender closed.' });
    tender.bids.push({ id: uid('bid'), bidder: user.name || user.username || 'User', amount: Math.round(amount * 100) / 100, at: Date.now() });
    saveDatabase(db);
    res.json({ bids: tender.bids });
  });

  app.get('/api/tenders/scan-anomalies', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const anomalies: { tenderId: string; title: string; pairs: { a: string; b: string; diffPct: number }[] }[] = [];
    (db.tenders as Tender[]).forEach((t) => {
      if (t.bids.length < 2) return;
      const pairs: { a: string; b: string; diffPct: number }[] = [];
      for (let i = 0; i < t.bids.length; i++) {
        for (let j = i + 1; j < t.bids.length; j++) {
          const diffPct = (Math.abs(t.bids[i].amount - t.bids[j].amount) / Math.max(1, Math.max(t.bids[i].amount, t.bids[j].amount))) * 100;
          if (diffPct < 2) pairs.push({ a: t.bids[i].bidder, b: t.bids[j].bidder, diffPct: Math.round(diffPct * 100) / 100 });
        }
      }
      if (pairs.length > 0) anomalies.push({ tenderId: t.id, title: t.title, pairs });
    });
    res.json({ anomalies });
  });

  // ================= 217 Community Land Trust =================
  app.get('/api/clt', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ parcels: (db.cltParcels as CltParcel[]).sort((a, b) => b.createdAt - a.createdAt) });
  });

  app.post('/api/clt', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const name = s(b.name, 120);
    if (!name) return res.status(400).json({ error: 'Parcel name is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const parcel: CltParcel = {
      id: uid('clt'),
      name,
      location: s(b.location, 120),
      purpose: s(b.purpose, 400),
      createdBy: user.id,
      members: [user.id],
      approvals: [user.id],
      status: 'pending',
      createdAt: Date.now(),
    };
    (db.cltParcels as CltParcel[]).push(parcel);
    saveDatabase(db);
    res.json({ parcel });
  });

  app.post('/api/clt/:id/approve', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const parcel = (db.cltParcels as CltParcel[]).find((p) => p.id === req.params.id);
    if (!parcel) return res.status(404).json({ error: 'Parcel not found.' });
    if (!parcel.members.includes(user.id)) {
      parcel.members.push(user.id);
      parcel.approvals.push(user.id);
    } else if (!parcel.approvals.includes(user.id)) {
      parcel.approvals.push(user.id);
    } else {
      return res.status(400).json({ error: 'Already approved.' });
    }
    // majority (or >=3 members) approves the trust
    if (parcel.approvals.length >= Math.max(3, Math.ceil(parcel.members.length / 2))) parcel.status = 'approved';
    saveDatabase(db);
    res.json({ parcel });
  });
}
