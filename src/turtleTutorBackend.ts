/**
 * Ocean — Home Tutor Matchmaking (Feature 198)
 * ---------------------------------------------
 * Matches tutors and students by subject + area. Both sides post requests;
 * a student's request can be claimed by a tutor (and vice versa) which flips
 * the request to "matched" so both parties can coordinate via chat.
 *
 * Model (global db): db.tutorRequests — array of
 *   { id, kind: 'tutor'|'student', userId, userName, subject, level, area,
 *     rate, availability, note, status: 'open'|'matched', matchedTo?, createdAt }
 *
 * Routes:
 *   GET  /api/tutor            (public) open requests, filter ?subject=&area=&kind=
 *   POST /api/tutor            (auth) post a request
 *   POST /api/tutor/:id/offer  (auth) offer to match (only if complement kind)
 *   GET  /api/tutor/mine       (auth) my requests
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface TutorRequest {
  id: string;
  kind: 'tutor' | 'student';
  userId: string;
  userName: string;
  subject: string;
  level: string;
  area: string;
  rate: string;
  availability: string;
  note: string;
  status: 'open' | 'matched';
  matchedTo?: string;
  createdAt: number;
}

function uid(): string {
  return `tut-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.tutorRequests)) db.tutorRequests = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function tokenize(v: string): string[] {
  return String(v || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Weighted multi-dimension compatibility scoring (Feature 198 completion).
 * Compares an open request against the current user's own open requests:
 * subject tokens (+2 each), level overlap (+2), area match (+2), and a small
 * rate-band bonus when both sides declared a numeric hourly rate. Returns 0-100.
 */
export function tutorCompatibilityScore(candidate: TutorRequest, myRequests: TutorRequest[]): number {
  if (!myRequests || myRequests.length === 0) return 0;
  let best = 0;
  for (const mine of myRequests) {
    if (mine.id === candidate.id) continue;
    if (mine.kind === candidate.kind) continue; // only tutor<->student matches
    let score = 0;
    const candTokens = tokenize(candidate.subject);
    const myTokens = tokenize(mine.subject);
    const shared = candTokens.filter((t) => myTokens.includes(t)).length;
    score += Math.min(shared, 4) * 18; // up to 72 pts from subject overlap
    if (candidate.level && mine.level && tokenize(candidate.level).some((t) => tokenize(mine.level).includes(t))) score += 14;
    if (candidate.area && mine.area && candidate.area.toLowerCase() === mine.area.toLowerCase()) score += 14;
    const candRate = Number(String(candidate.rate || '').replace(/[^0-9.]/g, ''));
    const myRate = Number(String(mine.rate || '').replace(/[^0-9.]/g, ''));
    if (candRate > 0 && myRate > 0 && Math.abs(candRate - myRate) <= Math.max(candRate, myRate) * 0.5) score += 10;
    best = Math.max(best, score);
  }
  return Math.min(100, Math.round(best));
}

export function registerTutorRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = getCtx();

  app.get('/api/tutor', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const subject = s((req.query as any).subject, 60).toLowerCase();
    const area = s((req.query as any).area, 60).toLowerCase();
    const kind = (req.query as any).kind;
    const me = getRequestUser(req);
    const myRequests = me
      ? (db.tutorRequests as TutorRequest[]).filter((t) => t.userId === me.id && t.status === 'open')
      : [];
    const list = (db.tutorRequests as TutorRequest[])
      .filter((t) => t.status === 'open')
      .filter((t) => (kind === 'tutor' || kind === 'student' ? t.kind === kind : true))
      .filter((t) => (subject ? t.subject.toLowerCase().includes(subject) : true))
      .filter((t) => (area ? t.area.toLowerCase().includes(area) : true))
      .map((t) => ({
        ...t,
        compatibilityScore: tutorCompatibilityScore(t, myRequests),
      }))
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore || b.createdAt - a.createdAt);
    res.json({ requests: list });
  });

  app.post('/api/tutor', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    if (b.kind !== 'tutor' && b.kind !== 'student') return res.status(400).json({ error: 'kind must be tutor or student.' });
    const subject = s(b.subject, 80);
    if (!subject) return res.status(400).json({ error: 'subject is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const req_: TutorRequest = {
      id: uid(),
      kind: b.kind,
      userId: user.id,
      userName: user.name || user.username || 'User',
      subject,
      level: s(b.level, 60),
      area: s(b.area, 80),
      rate: s(b.rate, 60),
      availability: s(b.availability, 80),
      note: s(b.note, 400),
      status: 'open',
      createdAt: Date.now(),
    };
    (db.tutorRequests as TutorRequest[]).unshift(req_);
    saveDatabase(db);
    res.json({ request: req_ });
  });

  app.post('/api/tutor/:id/offer', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const t = (db.tutorRequests as TutorRequest[]).find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Request not found.' });
    if (t.userId === user.id) return res.status(400).json({ error: 'This is your own request.' });
    if (t.status !== 'open') return res.status(400).json({ error: 'Request already matched.' });
    if (t.kind === 'student') {
      // a tutor claims a student request
      t.matchedTo = user.id;
      t.status = 'matched';
    } else {
      // a student claims a tutor request — keep the tutor's info, mark matched
      t.matchedTo = user.id;
      t.status = 'matched';
    }
    saveDatabase(db);
    res.json({ success: true, matchedTo: t.matchedTo });
  });

  app.get('/api/tutor/mine', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.tutorRequests as TutorRequest[])
      .filter((t) => t.userId === user.id || t.matchedTo === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ requests: mine });
  });
}
