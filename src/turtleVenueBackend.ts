/**
 * Ocean — Religious Venue Live Status (Feature 225)
 * ---------------------------------------------------
 * Community-reported live status of venues (mosques, temples, churches,
 * mandirs): open/closed, prayer time crowds, special programs. Status entries
 * are recent-first and expire after 12 hours.
 *
 * Model (global db): db.venueStatuses — array of
 *   { id, venue, type, status: 'open'|'busy'|'closed'|'event', note,
 *     reportedBy, reportedByName, at }
 *
 * Routes:
 *   GET  /api/venues            (public) recent statuses, filter ?type=
 *   POST /api/venues            (auth) report a status
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface VenueStatus {
  id: string;
  venue: string;
  type: string;
  status: 'open' | 'busy' | 'closed' | 'event';
  note: string;
  reportedBy: string;
  reportedByName: string;
  at: number;
}

const TYPES = ['Mosque', 'Temple', 'Church', 'Mandir', 'Community hall'];

function uid(): string {
  return `ven-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.venueStatuses)) db.venueStatuses = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerVenueRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/venues', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const type = s((req.query as any).type, 40);
    const cutoff = Date.now() - 12 * 3600 * 1000;
    // drop stale
    const before = (db.venueStatuses as VenueStatus[]).length;
    db.venueStatuses = (db.venueStatuses as VenueStatus[]).filter((v) => v.at >= cutoff);
    if ((db.venueStatuses as VenueStatus[]).length !== before) saveDatabase(db);
    const statuses = (db.venueStatuses as VenueStatus[])
      .filter((v) => (type ? v.type === type : true))
      .sort((a, b) => b.at - a.at);
    res.json({ statuses, types: TYPES });
  });

  app.post('/api/venues', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const venue = s(b.venue, 120);
    const status = b.status;
    if (!venue) return res.status(400).json({ error: 'venue is required.' });
    if (!['open', 'busy', 'closed', 'event'].includes(status)) {
      return res.status(400).json({ error: 'status must be open, busy, closed or event.' });
    }
    const db = loadDatabase();
    ensureCollection(db);
    const entry: VenueStatus = {
      id: uid(),
      venue,
      type: TYPES.includes(b.type) ? b.type : 'Mosque',
      status,
      note: s(b.note, 300),
      reportedBy: user.id,
      reportedByName: user.name || user.username || 'User',
      at: Date.now(),
    };
    (db.venueStatuses as VenueStatus[]).unshift(entry);
    if (db.venueStatuses.length > 500) db.venueStatuses.length = 500;
    saveDatabase(db);
    res.json({ status: entry });
  });
}
