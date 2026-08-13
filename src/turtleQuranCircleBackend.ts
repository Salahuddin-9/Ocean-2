/**
 * Ocean — Quran/Hadith Circle Voice Rooms (Feature 226)
 * --------------------------------------------------------
 * Voice rooms for Quran/Hadith study circles with a moderator. Rooms get a
 * Jitsi voice link, a topic, and a moderated discussion log. Moderators can
 * mute/unmute a participant (simulated gate the client enforces).
 *
 * Model (global db): db.quranCircles — array of
 *   { id, name, topic, moderatorId, moderatorName, members: {id,name}[],
 *     muted: string[], meetUrl, log: { by, text, at }[], createdAt }
 *
 * Routes:
 *   GET  /api/quran-circles        (public) circles
 *   POST /api/quran-circles        (auth) create a circle
 *   POST /api/quran-circles/:id/join (auth) join/leave
 *   POST /api/quran-circles/:id/note (auth) add a discussion note
 *   POST /api/quran-circles/:id/mute (auth: moderator) toggle mute
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface QuranCircle {
  id: string;
  name: string;
  topic: string;
  moderatorId: string;
  moderatorName: string;
  members: { id: string; name: string }[];
  muted: string[];
  meetUrl: string;
  log: { by: string; text: string; at: number }[];
  createdAt: number;
}

function uid(): string {
  return `qc-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.quranCircles)) db.quranCircles = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerQuranCircleRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/quran-circles', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const me = (req as any).user?.id;
    const circles = (db.quranCircles as QuranCircle[])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({ ...c, joined: me ? c.members.some((m) => m.id === me) : false, mutedByMod: me ? c.muted.includes(me) : false }));
    res.json({ circles });
  });

  app.post('/api/quran-circles', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const name = s(b.name, 100);
    if (!name) return res.status(400).json({ error: 'Circle name is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const circle: QuranCircle = {
      id: uid(),
      name,
      topic: s(b.topic, 200),
      moderatorId: user.id,
      moderatorName: user.name || user.username || 'User',
      members: [{ id: user.id, name: user.name || user.username || 'User' }],
      muted: [],
      meetUrl: b.meetUrl ? s(b.meetUrl, 300) : `https://meet.jit.si/ocean-quran-${Date.now().toString(36)}`,
      log: [{ by: 'system', text: `Circle started by ${user.name || user.username || 'User'}.`, at: Date.now() }],
      createdAt: Date.now(),
    };
    (db.quranCircles as QuranCircle[]).push(circle);
    saveDatabase(db);
    res.json({ circle });
  });

  app.post('/api/quran-circles/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.quranCircles as QuranCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    const idx = circle.members.findIndex((m) => m.id === user.id);
    let joined: boolean;
    if (idx >= 0) {
      circle.members.splice(idx, 1);
      joined = false;
    } else {
      circle.members.push({ id: user.id, name: user.name || user.username || 'User' });
      joined = true;
    }
    saveDatabase(db);
    res.json({ success: true, joined });
  });

  app.post('/api/quran-circles/:id/note', requireAuth, (req, res) => {
    const user = (req as any).user;
    const text = s((req.body || {}).text, 600);
    if (!text) return res.status(400).json({ error: 'Note is empty.' });
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.quranCircles as QuranCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    if (circle.muted.includes(user.id)) return res.status(403).json({ error: 'You are muted by the moderator.' });
    circle.log.push({ by: user.name || user.username || 'User', text, at: Date.now() });
    if (circle.log.length > 200) circle.log.shift();
    saveDatabase(db);
    res.json({ log: circle.log });
  });

  app.post('/api/quran-circles/:id/mute', requireAuth, (req, res) => {
    const user = (req as any).user;
    const targetId = s((req.body || {}).memberId, 100);
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.quranCircles as QuranCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    if (circle.moderatorId !== user.id) return res.status(403).json({ error: 'Only the moderator can mute.' });
    if (!targetId) return res.status(400).json({ error: 'memberId is required.' });
    const idx = circle.muted.indexOf(targetId);
    if (idx >= 0) circle.muted.splice(idx, 1);
    else circle.muted.push(targetId);
    saveDatabase(db);
    res.json({ muted: circle.muted });
  });
}
