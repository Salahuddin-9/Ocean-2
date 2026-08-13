/**
 * Ocean — Shared Workspace Whiteboard backend
 * --------------------------------------------
 * Collaborative canvas for video calls (and standalone use). A "session" is a
 * named whiteboard owned by the user who created it; its persisted `elements`
 * array is the canonical snapshot used for late join + reload. Real-time relay
 * happens over the existing /ws/chat channel (whiteboard_subscribe /
 * whiteboard_event / whiteboard_state) — wired by the chat server, not here.
 *
 * Routes (all under /api/whiteboard/*):
 *   POST /api/whiteboard/session                 -> create a session
 *   GET  /api/whiteboard/session?mine=1|&callId= -> list sessions
 *   GET  /api/whiteboard/session/:id             -> one session (+ elements)
 *   POST /api/whiteboard/session/:id/elements    -> replace canonical snapshot (creator only)
 *   POST /api/whiteboard/session/:id/close       -> delete session (creator only)
 *
 * State lives in the global db under `db.whiteboards` (idempotent ensure).
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

/** A single drawing primitive persisted on the whiteboard. */
export interface WBElement {
  id: string;
  tool: 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'text' | 'clear';
  color: string;
  width: number;
  points?: [number, number][];
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  text?: string;
  createdAt: number;
  by: string;
  byName?: string;
}

/** A whiteboard session record stored in db.whiteboards. */
export interface WhiteboardSession {
  id: string;
  title: string;
  callId?: string;
  createdById: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
  elements: WBElement[];
  width: number;
  height: number;
  closedAt?: number;
}

const MAX_ELEMENTS = 5000;
const MAX_POINTS_PER_ELEMENT = 4000;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function isTool(v: unknown): v is WBElement['tool'] {
  return (
    v === 'pen' || v === 'eraser' || v === 'line' || v === 'rect' ||
    v === 'ellipse' || v === 'text' || v === 'clear'
  );
}

/** Defensive element sanitizer — drops junk, clamps sizes, keeps only known fields. */
function sanitizeElements(raw: unknown): WBElement[] {
  if (!Array.isArray(raw)) return [];
  const out: WBElement[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object') continue;
    const rec = el as Record<string, unknown>;
    if (!isTool(rec.tool)) continue;
    const e: WBElement = {
      id: typeof rec.id === 'string' && rec.id ? rec.id : uid('wb'),
      tool: rec.tool,
      color: typeof rec.color === 'string' ? rec.color : '#111111',
      width: typeof rec.width === 'number' && rec.width > 0 ? Math.min(rec.width, 200) : 3,
      createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
      by: typeof rec.by === 'string' ? rec.by : '',
    };
    if (typeof rec.byName === 'string') e.byName = rec.byName.slice(0, 100);
    if (Array.isArray(rec.points)) {
      e.points = (rec.points as unknown[])
        .slice(0, MAX_POINTS_PER_ELEMENT)
        .filter((p): p is [number, number] =>
          Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number')
        .map(p => [Number(p[0]), Number(p[1])]);
    }
    if (typeof rec.x === 'number') e.x = rec.x;
    if (typeof rec.y === 'number') e.y = rec.y;
    if (typeof rec.x2 === 'number') e.x2 = rec.x2;
    if (typeof rec.y2 === 'number') e.y2 = rec.y2;
    if (typeof rec.w === 'number') e.w = rec.w;
    if (typeof rec.h === 'number') e.h = rec.h;
    if (typeof rec.text === 'string') e.text = rec.text.slice(0, 500);
    out.push(e);
  }
  return out.slice(0, MAX_ELEMENTS);
}

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollection(db: any): void {
  if (!Array.isArray(db.whiteboards)) db.whiteboards = [];
}

export function registerWhiteboardRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // List sessions: ?mine=1 (only mine) or ?callId=<id> (find by call).
  // Must be registered before the :id route (Express matches in order).
  app.get('/api/whiteboard/session', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    const callId = typeof req.query.callId === 'string' ? req.query.callId : '';
    let sessions = (db.whiteboards as WhiteboardSession[]) || [];
    if (callId) {
      sessions = sessions.filter(s => s.callId === callId);
    } else if (mine) {
      sessions = sessions.filter(s => s.createdById === user.id);
    } else {
      sessions = sessions.filter(s => !s.closedAt);
    }
    res.json({ sessions: sessions.slice(0, 200) });
  });

  // Get one session (the canonical snapshot lives in session.elements).
  app.get('/api/whiteboard/session/:id', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.whiteboards as WhiteboardSession[]).find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Whiteboard not found.' });
    res.json({ session });
  });

  // Create a session.
  app.post('/api/whiteboard/session', requireAuth, (req, res) => {
    const user = (req as any).user;
    const { title, callId } = (req.body || {}) as { title?: unknown; callId?: unknown };
    const session: WhiteboardSession = {
      id: uid('wb'),
      title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : 'Shared Whiteboard',
      callId: typeof callId === 'string' && callId ? callId : undefined,
      createdById: user.id,
      createdByName: user.name || user.username || 'User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      elements: [],
      width: 1600,
      height: 900,
    };
    const db = loadDatabase();
    ensureCollection(db);
    (db.whiteboards as WhiteboardSession[]).push(session);
    saveDatabase(db);
    res.json({ session });
  });

  // Replace the persisted elements (canonical snapshot for late join + persistence).
  // Only the creator may save.
  app.post('/api/whiteboard/session/:id/elements', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const session = (db.whiteboards as WhiteboardSession[]).find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Whiteboard not found.' });
    if (session.createdById !== user.id) {
      return res.status(403).json({ error: 'Only the whiteboard creator can save.' });
    }
    const width = Number((req.body as any)?.width) || 1600;
    const height = Number((req.body as any)?.height) || 900;
    session.elements = sanitizeElements((req.body as any)?.elements);
    session.width = Math.min(Math.max(640, width), 4096);
    session.height = Math.min(Math.max(360, height), 4096);
    session.updatedAt = Date.now();
    saveDatabase(db);
    res.json({ success: true, count: session.elements.length });
  });

  // Close a session (creator only) — removes it from db.whiteboards.
  app.post('/api/whiteboard/session/:id/close', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.whiteboards as WhiteboardSession[];
    const idx = list.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Whiteboard not found.' });
    if (list[idx].createdById !== user.id) {
      return res.status(403).json({ error: 'Only the whiteboard creator can close it.' });
    }
    list.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });
}

export { sanitizeElements };
