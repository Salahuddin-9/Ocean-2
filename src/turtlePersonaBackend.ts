/**
 * Ocean — Contextual Personas (Feature 244)
 * --------------------------------------------
 * One account, multiple curated identities: a work persona, a family persona,
 * a hobby persona. Each has its own display name, avatar color, interests and
 * visibility scopes; posts/comments can be authored under a persona.
 *
 * Model (global db): db.personas — array of
 *   { id, userId, name, tagline, color, interests: string[], active, createdAt }
 *
 * Routes:
 *   GET  /api/personas          (auth) my personas
 *   POST /api/personas          (auth) create { name, tagline, color, interests }
 *   POST /api/personas/:id/activate  (auth) set active persona
 *   DELETE /api/personas/:id    (auth) remove a persona
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface Persona {
  id: string;
  userId: string;
  name: string;
  tagline: string;
  color: string;
  interests: string[];
  active: boolean;
  createdAt: number;
}

function uid(): string {
  return `per-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.personas)) db.personas = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const COLORS = ['#3a342a', '#b45309', '#0e7490', '#7c3aed', '#be123c', '#15803d', '#1d4ed8'];

export function registerPersonaRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/personas', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    res.json({ personas: (db.personas as Persona[]).filter((p) => p.userId === user.id) });
  });

  app.post('/api/personas', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const name = s(b.name, 60);
    if (!name) return res.status(400).json({ error: 'Persona name is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.personas as Persona[]).filter((p) => p.userId === user.id);
    if (mine.length >= 8) return res.status(409).json({ error: 'Maximum 8 personas per account.' });
    const interests = Array.isArray(b.interests)
      ? b.interests.slice(0, 12).map((i: unknown) => s(i, 40)).filter(Boolean)
      : [];
    const persona: Persona = {
      id: uid(),
      userId: user.id,
      name,
      tagline: s(b.tagline, 140),
      color: COLORS[mine.length % COLORS.length],
      interests,
      active: mine.length === 0, // first persona becomes active automatically
      createdAt: Date.now(),
    };
    (db.personas as Persona[]).push(persona);
    saveDatabase(db);
    res.json({ persona });
  });

  app.post('/api/personas/:id/activate', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    let found = false;
    (db.personas as Persona[]).forEach((p) => {
      if (p.userId !== user.id) return;
      if (p.id === req.params.id) {
        p.active = true;
        found = true;
      } else {
        p.active = false;
      }
    });
    if (!found) return res.status(404).json({ error: 'Persona not found.' });
    saveDatabase(db);
    const active = (db.personas as Persona[]).find((p) => p.id === req.params.id);
    res.json({ active });
  });

  app.delete('/api/personas/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const target = (db.personas as Persona[]).find((p) => p.id === req.params.id && p.userId === user.id);
    if (!target) return res.status(404).json({ error: 'Persona not found.' });
    const wasActive = target.active;
    (db.personas as Persona[]) = (db.personas as Persona[]).filter((p) => !(p.id === req.params.id && p.userId === user.id));
    const mine = (db.personas as Persona[]).filter((p) => p.userId === user.id);
    if (wasActive && mine.length > 0 && !mine.some((p) => p.active)) {
      mine[0].active = true;
    }
    saveDatabase(db);
    res.json({ success: true });
  });
}
