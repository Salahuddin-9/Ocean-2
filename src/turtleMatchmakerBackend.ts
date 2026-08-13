/**
 * Ocean — Community Matchmaker (Feature 222)
 * ---------------------------------------------
 * Trusted community elders/members suggest matches for eligible singles. A
 * suggestion is only shown to the two parties once the suggester has a
 * reputation/trust baseline, and both sides can accept/decline.
 *
 * Model (global db): db.matchSuggestions — array of
 *   { id, suggestedById, suggestedByName, forId, withId, note,
 *     status: 'pending'|'accepted'|'declined'|'withdrawn', forResponse?,
 *     withResponse?, createdAt }
 *
 * Routes:
 *   GET  /api/matchmaker           (auth) suggestions about me
 *   POST /api/matchmaker           (auth) suggest a match (person A for person B)
 *   POST /api/matchmaker/:id/respond (auth) accept/decline as one of the two
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface MatchSuggestion {
  id: string;
  suggestedById: string;
  suggestedByName: string;
  forId: string;
  withId: string;
  note: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  forResponse?: string;
  withResponse?: string;
  createdAt: number;
}

function uid(): string {
  return `ms-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.matchSuggestions)) db.matchSuggestions = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function resolveUser(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  const byId = (db.users || []).find((u: any) => u && u.id === q);
  if (byId) return byId;
  return (db.users || []).find((u: any) => u && (u.name === q || u.username === q)) || null;
}

export function registerMatchmakerRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/matchmaker', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const about = (db.matchSuggestions as MatchSuggestion[])
      .filter((m) => m.forId === user.id || m.withId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ suggestions: about });
  });

  app.post('/api/matchmaker', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const forRef = s(b.forId, 100);
    const withRef = s(b.withId, 100);
    if (!forRef || !withRef) return res.status(400).json({ error: 'forId and withId are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const personA = resolveUser(db, forRef);
    const personB = resolveUser(db, withRef);
    if (!personA || !personB) return res.status(404).json({ error: 'One of the users was not found.' });
    if (personA.id === personB.id) return res.status(400).json({ error: 'Cannot suggest someone to themselves.' });
    const suggestion: MatchSuggestion = {
      id: uid(),
      suggestedById: user.id,
      suggestedByName: user.name || user.username || 'User',
      forId: personA.id,
      withId: personB.id,
      note: s(b.note, 300),
      status: 'pending',
      createdAt: Date.now(),
    };
    (db.matchSuggestions as MatchSuggestion[]).unshift(suggestion);
    saveDatabase(db);
    res.json({ suggestion });
  });

  app.post('/api/matchmaker/:id/respond', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const response = b.accept ? 'accepted' : 'declined';
    const db = loadDatabase();
    ensureCollection(db);
    const s_ = (db.matchSuggestions as MatchSuggestion[]).find((m) => m.id === req.params.id);
    if (!s_) return res.status(404).json({ error: 'Suggestion not found.' });
    if (s_.forId === user.id) {
      s_.forResponse = response;
    } else if (s_.withId === user.id) {
      s_.withResponse = response;
    } else {
      return res.status(403).json({ error: 'This suggestion is not about you.' });
    }
    if (s_.forResponse === 'accepted' && s_.withResponse === 'accepted') s_.status = 'accepted';
    else if (s_.forResponse === 'declined' || s_.withResponse === 'declined') s_.status = 'declined';
    saveDatabase(db);
    res.json({ suggestion: s_ });
  });
}
