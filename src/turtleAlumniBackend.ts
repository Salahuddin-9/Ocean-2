/**
 * Ocean — Alumni Network Bridge (Feature 248)
 * ----------------------------------------------
 * Alumni directory grouped by institution: register your alma mater, browse
 * alumni in the same institution, connect / request mentorship.
 *
 * Model (global db): db.alumni — array of
 *   { id, userId, name, institution, batch, field, bio, at }
 *
 * Routes:
 *   GET  /api/alumni              (auth) all alumni (grouped by institution)
 *   POST /api/alumni              (auth) register { institution, batch, field, bio }
 *   GET  /api/alumni/:institution (auth) alumni of one institution
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface Alumni {
  id: string;
  userId: string;
  name: string;
  institution: string;
  batch: string;
  field: string;
  bio: string;
  at: number;
}

function uid(): string {
  return `al-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.alumni)) db.alumni = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerAlumniRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/alumni', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const list = (db.alumni as Alumni[]).sort((a, b) => b.at - a.at);
    const groups = new Map<string, Alumni[]>();
    for (const a of list) {
      const key = a.institution || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    res.json({
      alumni: list,
      groups: [...groups.entries()].map(([institution, members]) => ({ institution, count: members.length, members })),
    });
  });

  app.post('/api/alumni', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const institution = s(b.institution, 120);
    if (!institution) return res.status(400).json({ error: 'Institution is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    // one record per user per institution (re-register replaces)
    (db.alumni as Alumni[]) = (db.alumni as Alumni[]).filter((x) => !(x.userId === user.id && x.institution === institution));
    const entry: Alumni = {
      id: uid(),
      userId: user.id,
      name: (user.name || user.username || 'User').slice(0, 60),
      institution,
      batch: s(b.batch, 20),
      field: s(b.field, 60),
      bio: s(b.bio, 300),
      at: Date.now(),
    };
    (db.alumni as Alumni[]).push(entry);
    saveDatabase(db);
    res.json({ alumni: entry });
  });

  app.get('/api/alumni/:institution', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const institution = s(req.params.institution, 120);
    const members = (db.alumni as Alumni[])
      .filter((a) => a.institution === institution)
      .sort((a, b) => b.at - a.at);
    res.json({ institution, count: members.length, members });
  });
}
