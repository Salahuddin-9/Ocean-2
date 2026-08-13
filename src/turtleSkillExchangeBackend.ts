/**
 * Ocean — Skill Exchange Network (Feature 247)
 * ----------------------------------------------
 * Swap skills instead of money: offer a skill (teach X) in exchange for
 * another (learn Y). The matcher pairs complementary offers.
 *
 * Model (global db): db.skillOffers — array of
 *   { id, userId, name, offers: string[], wants: string[], bio, at }
 *
 * Routes:
 *   GET  /api/skills            (auth) all offers
 *   POST /api/skills            (auth) create offer { offers, wants, bio }
 *   GET  /api/skills/match      (auth) find complementary offers for me
 *   DELETE /api/skills/:id      (auth) remove my offer
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface SkillOffer {
  id: string;
  userId: string;
  name: string;
  offers: string[];
  wants: string[];
  bio: string;
  at: number;
}

function uid(): string {
  return `sk-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.skillOffers)) db.skillOffers = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerSkillExchangeRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/skills', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ offers: (db.skillOffers as SkillOffer[]).sort((a, b) => b.at - a.at) });
  });

  app.post('/api/skills', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const offers = Array.isArray(b.offers) ? b.offers.slice(0, 8).map((t: unknown) => s(t, 60)).filter(Boolean) : [];
    const wants = Array.isArray(b.wants) ? b.wants.slice(0, 8).map((t: unknown) => s(t, 60)).filter(Boolean) : [];
    if (offers.length === 0 && wants.length === 0) {
      return res.status(400).json({ error: 'List at least one skill you offer or want.' });
    }
    const db = loadDatabase();
    ensureCollection(db);
    // one offer per user (renew = replace)
    (db.skillOffers as SkillOffer[]) = (db.skillOffers as SkillOffer[]).filter((x) => x.userId !== user.id);
    const offer: SkillOffer = {
      id: uid(),
      userId: user.id,
      name: (user.name || user.username || 'User').slice(0, 60),
      offers,
      wants,
      bio: s(b.bio, 300),
      at: Date.now(),
    };
    (db.skillOffers as SkillOffer[]).push(offer);
    saveDatabase(db);
    res.json({ offer });
  });

  app.get('/api/skills/match', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.skillOffers as SkillOffer[]).find((x) => x.userId === user.id);
    const others = (db.skillOffers as SkillOffer[]).filter((x) => x.userId !== user.id);
    const scored = others.map((o) => {
      let score = 0;
      // their wants ⊂ my offers → they need what I give
      const iGive = new Set(mine ? mine.offers.map((x) => x.toLowerCase()) : []);
      const iWant = new Set(mine ? mine.wants.map((x) => x.toLowerCase()) : []);
      const theyGive = new Set(o.offers.map((x) => x.toLowerCase()));
      const theyWant = new Set(o.wants.map((x) => x.toLowerCase()));
      for (const w of theyWant) if (iGive.has(w)) score += 2;
      for (const g of theyGive) if (iWant.has(g)) score += 2;
      for (const g of theyGive) if (iGive.has(g)) score += 1; // same interests
      return { offer: o, score };
    });
    scored.sort((a, b) => b.score - a.score);
    res.json({ matches: scored.filter((x) => x.score > 0).map((x) => x.offer), scored });
  });

  app.delete('/api/skills/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const before = (db.skillOffers as SkillOffer[]).length;
    db.skillOffers = (db.skillOffers as SkillOffer[]).filter((x) => !(x.id === req.params.id && x.userId === user.id));
    if ((db.skillOffers as SkillOffer[]).length === before) return res.status(404).json({ error: 'Offer not found.' });
    saveDatabase(db);
    res.json({ success: true });
  });
}
