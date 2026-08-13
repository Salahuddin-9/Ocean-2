/**
 * Ocean — AI Debate Moderator (Feature 150)
 * -----------------------------------------
 * Structured debate rooms where every comment is auto-moderated (toxicity check
 * via the shared Smart Community signal engine), participation is balanced, and
 * the moderator suggests who should speak next — the "debate version" of the
 * comment moderation in Feature 143.
 *
 * Model (global db, idempotent ensure):
 *   db.debateSessions  — array of { id, topic, createdBy, createdByName, status, createdAt }
 *   db.debateComments  — array of { id, sessionId, authorId, authorName, text, toxicity,
 *                          hidden, createdAt }
 *
 * Routes:
 *   POST /api/debate/session              (auth) create a debate room
 *   GET  /api/debate/session/:id          (guest) comments + moderation summary
 *   POST /api/debate/session/:id/comment  (auth) add a comment (auto-moderated)
 *   POST /api/debate/session/:id/balance  (auth) participation analysis + next speaker
 *   GET  /api/debate/sessions             (guest) open rooms
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { analyzeText } from './turtleSmartCommunityBackend';

export interface DebateSession {
  id: string;
  topic: string;
  createdBy: string;
  createdByName: string;
  status: 'open' | 'closed';
  createdAt: number;
}

export interface DebateComment {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  text: string;
  toxicity: number;
  hidden: boolean;
  createdAt: number;
}

export interface DebateBalance {
  sessionId: string;
  participants: { id: string; name: string; count: number; share: number }[];
  flagged: number;
  hidden: number;
  nextSpeaker: string;
  suggestion: string;
  verdict: 'healthy' | 'one_sided' | 'heated';
}

const HIDE_TOXICITY = 70;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.debateSessions)) db.debateSessions = [];
  if (!Array.isArray(db.debateComments)) db.debateComments = [];
}

export function registerDebateModeratorRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = getCtx();

  // POST /api/debate/session — create
  app.post('/api/debate/session', requireAuth, (req, res) => {
    const user = (req as any).user;
    const topic = String((req.body || {}).topic || '').trim();
    if (topic.length < 5) return res.status(400).json({ error: 'Topic must be at least 5 characters.' });

    const db = loadDatabase();
    ensureCollections(db);
    const session: DebateSession = {
      id: uid('debate'),
      topic: topic.slice(0, 200),
      createdBy: user.id,
      createdByName: user.name || user.username || 'User',
      status: 'open',
      createdAt: Date.now(),
    };
    (db.debateSessions as DebateSession[]).unshift(session);
    saveDatabase(db);
    res.json({ session });
  });

  // GET /api/debate/sessions — open rooms
  app.get('/api/debate/sessions', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const sessions = (db.debateSessions as DebateSession[])
      .filter((s) => s.status === 'open')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
    const withCounts = sessions.map((s) => ({
      ...s,
      commentCount: (db.debateComments as DebateComment[]).filter((c) => c.sessionId === s.id && !c.hidden).length,
    }));
    res.json({ sessions: withCounts });
  });

  // POST /api/debate/session/:id/comment — add + auto-moderate
  app.post('/api/debate/session/:id/comment', requireAuth, (req, res) => {
    const user = (req as any).user;
    const text = String((req.body || {}).text || '').trim();
    if (text.length < 2) return res.status(400).json({ error: 'Comment is too short.' });

    const db = loadDatabase();
    ensureCollections(db);
    const session = (db.debateSessions as DebateSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Debate session not found.' });
    if (session.status !== 'open') return res.status(400).json({ error: 'This debate is closed.' });

    const signals = analyzeText(text);
    const toxicity = Math.min(100, signals.reduce((a, s) => a + s.weight, 0));
    const hidden = toxicity >= HIDE_TOXICITY;
    const comment: DebateComment = {
      id: uid('dc'),
      sessionId: session.id,
      authorId: user.id,
      authorName: user.name || user.username || 'User',
      text: text.slice(0, 2000),
      toxicity,
      hidden,
      createdAt: Date.now(),
    };
    (db.debateComments as DebateComment[]).unshift(comment);
    saveDatabase(db);
    res.json({ comment, hidden, signals: signals.slice(0, 5).map((s) => s.label) });
  });

  // POST /api/debate/session/:id/balance — participation analysis + next speaker
  app.post('/api/debate/session/:id/balance', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const session = (db.debateSessions as DebateSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Debate session not found.' });

    const comments = (db.debateComments as DebateComment[]).filter((c) => c.sessionId === session.id);
    const visible = comments.filter((c) => !c.hidden);
    const map = new Map<string, { id: string; name: string; count: number }>();
    visible.forEach((c) => {
      if (!map.has(c.authorId)) map.set(c.authorId, { id: c.authorId, name: c.authorName, count: 0 });
      map.get(c.authorId)!.count += 1;
    });
    const participants = Array.from(map.values())
      .map((p) => ({ ...p, share: visible.length > 0 ? Math.round((p.count / visible.length) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);

    const flagged = comments.filter((c) => c.toxicity >= 40).length;
    const hiddenCount = comments.filter((c) => c.hidden).length;

    // Balance heuristics.
    let verdict: DebateBalance['verdict'] = 'healthy';
    if (hiddenCount > 0 || flagged >= 3) verdict = 'heated';
    else if (participants.length >= 2 && participants[0].share >= 70) verdict = 'one_sided';

    let nextSpeaker = '';
    let suggestion = '';
    if (participants.length < 2) {
      suggestion = 'Only one voice so far — invite more participants to join the debate.';
    } else if (verdict === 'one_sided') {
      nextSpeaker = participants[participants.length - 1].name;
      suggestion = `${nextSpeaker} has spoken least (${participants[participants.length - 1].share}%) — hand them the floor to balance the debate.`;
    } else if (verdict === 'heated') {
      suggestion = 'Tone is getting heated. Remind everyone to argue ideas, not people, and pause before responding.';
    } else {
      nextSpeaker = participants[0].name;
      suggestion = `The debate is balanced (top speaker at ${participants[0].share}%). Keep the rotation going — ${nextSpeaker} may continue.`;
    }

    res.json({ balance: { sessionId: session.id, participants, flagged, hidden: hiddenCount, nextSpeaker, suggestion, verdict } });
  });

  // GET /api/debate/session/:id — full view (guest-safe)
  app.get('/api/debate/session/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const session = (db.debateSessions as DebateSession[]).find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Debate session not found.' });
    const comments = (db.debateComments as DebateComment[])
      .filter((c) => c.sessionId === session.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    const me = getRequestUser(req);
    res.json({
      session,
      comments: comments.map((c) => (c.hidden ? { ...c, text: '[Auto-hidden by moderator — toxic content]' } : c)),
      moderation: {
        total: comments.length,
        visible: comments.filter((c) => !c.hidden).length,
        hidden: comments.filter((c) => c.hidden).length,
        viewerIsCreator: !!me && me.id === session.createdBy,
      },
    });
  });
}
