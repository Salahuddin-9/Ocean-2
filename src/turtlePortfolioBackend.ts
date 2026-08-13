/**
 * Ocean — Verified Freelancer Portfolio (Feature 193)
 * ----------------------------------------------------
 * A public portfolio sub-page per user: bio, skills, hourly rate and a list of
 * portfolio items. A profile becomes "verified" once it has ≥3 items, a bio and
 * an hourly rate — the badge is computed server-side, never client-claimable.
 *
 * Model (global db, idempotent ensure): db.portfolios — array of
 *   { id, userId, name, headline, bio, skills: string[], hourlyRate,
 *     items: { id, title, desc, link, imageUrl, createdAt }[], createdAt, updatedAt }
 *
 * Routes:
 *   GET  /api/portfolio               (public) all portfolios (light shape)
 *   GET  /api/portfolio/:userId       (public) one portfolio + verified flag
 *   POST /api/portfolio               (auth) upsert MY portfolio
 *   POST /api/portfolio/items         (auth) add a portfolio item
 *   DELETE /api/portfolio/items/:id   (auth) remove MY item
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface PortfolioItem {
  id: string;
  title: string;
  desc: string;
  link?: string;
  imageUrl?: string;
  createdAt: number;
}

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  headline?: string;
  bio?: string;
  skills: string[];
  hourlyRate?: number;
  items: PortfolioItem[];
  createdAt: number;
  updatedAt: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.portfolios)) db.portfolios = [];
}

function findMine(db: any, userId: string): Portfolio | undefined {
  return (db.portfolios as Portfolio[]).find((p) => p && p.userId === userId);
}

function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function publicShape(p: Portfolio) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    headline: p.headline,
    bio: p.bio,
    skills: p.skills,
    hourlyRate: p.hourlyRate,
    items: p.items,
    verified: isVerified(p),
  };
}

export function isVerified(p: Portfolio): boolean {
  return Boolean(p.bio && p.hourlyRate && p.hourlyRate > 0 && p.items.length >= 3);
}

export function registerPortfolioRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/portfolio', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const all = (db.portfolios as Portfolio[])
      .filter((p) => p && p.items.length > 0)
      .map(publicShape);
    res.json({ portfolios: all });
  });

  app.get('/api/portfolio/:userId', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const p = findMine(db, req.params.userId);
    if (!p) return res.status(404).json({ error: 'No portfolio yet.' });
    res.json({ portfolio: publicShape(p) });
  });

  app.post('/api/portfolio', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const db = loadDatabase();
    ensureCollection(db);
    let p = findMine(db, user.id);
    const now = Date.now();
    if (!p) {
      p = {
        id: uid('pf'),
        userId: user.id,
        name: clampStr(b.name || user.name || 'Freelancer', 80),
        headline: clampStr(b.headline, 120),
        bio: clampStr(b.bio, 600),
        skills: Array.isArray(b.skills) ? b.skills.map((s: any) => clampStr(s, 40)).filter(Boolean).slice(0, 12) : [],
        hourlyRate: typeof b.hourlyRate === 'number' && b.hourlyRate > 0 ? Math.round(b.hourlyRate * 100) / 100 : undefined,
        items: [],
        createdAt: now,
        updatedAt: now,
      };
      (db.portfolios as Portfolio[]).push(p);
    } else {
      if (typeof b.name === 'string' && b.name.trim()) p.name = clampStr(b.name, 80);
      if (typeof b.headline === 'string') p.headline = clampStr(b.headline, 120);
      if (typeof b.bio === 'string') p.bio = clampStr(b.bio, 600);
      if (Array.isArray(b.skills)) p.skills = b.skills.map((s: any) => clampStr(s, 40)).filter(Boolean).slice(0, 12);
      if (typeof b.hourlyRate === 'number' && b.hourlyRate >= 0) p.hourlyRate = Math.round(b.hourlyRate * 100) / 100;
      p.updatedAt = now;
    }
    saveDatabase(db);
    res.json({ portfolio: publicShape(p) });
  });

  app.post('/api/portfolio/items', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = clampStr(b.title, 100);
    if (!title) return res.status(400).json({ error: 'Item title is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const p = findMine(db, user.id);
    if (!p) return res.status(400).json({ error: 'Create your portfolio first.' });
    p.items.unshift({
      id: uid('pfi'),
      title,
      desc: clampStr(b.desc, 600),
      link: clampStr(b.link, 300),
      imageUrl: clampStr(b.imageUrl, 500),
      createdAt: Date.now(),
    });
    p.updatedAt = Date.now();
    saveDatabase(db);
    res.json({ portfolio: publicShape(p), verified: isVerified(p) });
  });

  app.delete('/api/portfolio/items/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const p = findMine(db, user.id);
    if (!p) return res.status(404).json({ error: 'Portfolio not found.' });
    const before = p.items.length;
    p.items = p.items.filter((i) => i.id !== req.params.id);
    if (p.items.length === before) return res.status(404).json({ error: 'Item not found.' });
    p.updatedAt = Date.now();
    saveDatabase(db);
    res.json({ portfolio: publicShape(p) });
  });
}
