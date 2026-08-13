/**
 * Ocean — Religious Event Coordination (Feature 227)
 * -----------------------------------------------------
 * Events tagged with a religious/cultural category: organizers publish
 * details, attendees RSVP, and the organizer can announce updates.
 *
 * Model (global db): db.religiousEvents — array of
 *   { id, title, category, venue, at, desc, organizerId, organizerName,
 *     rsvps: { userId, name, at }[], updates: { text, at }[], createdAt }
 *
 * Routes:
 *   GET  /api/events            (public) upcoming events, filter ?category=
 *   POST /api/events            (auth) publish an event
 *   POST /api/events/:id/rsvp   (auth) toggle RSVP
 *   POST /api/events/:id/update (auth: organizer) post an update
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ReligiousEvent {
  id: string;
  title: string;
  category: string;
  venue: string;
  at: number;
  desc: string;
  organizerId: string;
  organizerName: string;
  rsvps: { userId: string; name: string; at: number }[];
  updates: { text: string; at: number }[];
  createdAt: number;
}

const CATEGORIES = ['Eid', 'Milad', 'Quran', 'Hadith', 'Puja', 'Christmas', 'Community Iftar', 'Other'];

function uid(): string {
  return `ev-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.religiousEvents)) db.religiousEvents = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerReligiousEventsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/events', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const category = s((req.query as any).category, 40);
    const me = (req as any).user?.id;
    const now = Date.now();
    const events = (db.religiousEvents as ReligiousEvent[])
      .filter((e) => e.at >= now - 6 * 3600 * 1000)
      .filter((e) => (category ? e.category === category : true))
      .sort((a, b) => a.at - b.at)
      .map((e) => ({ ...e, rsvped: me ? e.rsvps.some((r) => r.userId === me) : false }));
    res.json({ events, categories: CATEGORIES });
  });

  app.post('/api/events', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = s(b.title, 120);
    const at = Number(b.at);
    if (!title) return res.status(400).json({ error: 'title is required.' });
    if (!Number.isFinite(at) || at <= 0) return res.status(400).json({ error: 'A valid event time is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const event: ReligiousEvent = {
      id: uid(),
      title,
      category: CATEGORIES.includes(b.category) ? b.category : 'Other',
      venue: s(b.venue, 120),
      at,
      desc: s(b.desc, 800),
      organizerId: user.id,
      organizerName: user.name || user.username || 'User',
      rsvps: [{ userId: user.id, name: user.name || user.username || 'User', at: Date.now() }],
      updates: [],
      createdAt: Date.now(),
    };
    (db.religiousEvents as ReligiousEvent[]).push(event);
    saveDatabase(db);
    res.json({ event });
  });

  app.post('/api/events/:id/rsvp', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const event = (db.religiousEvents as ReligiousEvent[]).find((e) => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    const idx = event.rsvps.findIndex((r) => r.userId === user.id);
    if (idx >= 0) event.rsvps.splice(idx, 1);
    else event.rsvps.push({ userId: user.id, name: user.name || user.username || 'User', at: Date.now() });
    saveDatabase(db);
    res.json({ rsvps: event.rsvps.length, rsvped: idx < 0 });
  });

  app.post('/api/events/:id/update', requireAuth, (req, res) => {
    const user = (req as any).user;
    const text = s((req.body || {}).text, 500);
    if (!text) return res.status(400).json({ error: 'Update text is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const event = (db.religiousEvents as ReligiousEvent[]).find((e) => e.id === req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (event.organizerId !== user.id) return res.status(403).json({ error: 'Only the organizer can post updates.' });
    event.updates.push({ text, at: Date.now() });
    saveDatabase(db);
    res.json({ updates: event.updates });
  });
}
