/**
 * Ocean — Ward-Level Participatory Budgeting + Digital Ward Sabha (213–214)
 * --------------------------------------------------------------------------
 * Residents propose ward projects, vote on them, and join online town-hall
 * meetings (Jitsi) for their ward. Votes are one per user per project.
 *
 * Model (global db):
 *   db.wardProjects — { id, ward, title, desc, cost, proposedBy, proposedByName,
 *     votes: { userId, at }[], status: 'proposed'|'funded'|'completed', createdAt }
 *   db.wardMeetings — { id, ward, title, agenda, meetUrl, hostName, hostId, at, createdAt }
 *
 * Routes:
 *   GET  /api/ward/projects          (public) filter ?ward=
 *   POST /api/ward/projects          (auth) propose a project
 *   POST /api/ward/projects/:id/vote (auth) vote / unvote
 *   GET  /api/ward/meetings          (public) upcoming meetings
 *   POST /api/ward/meetings          (auth) schedule a meeting (Jitsi url auto-built)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface WardProject {
  id: string;
  ward: string;
  title: string;
  desc: string;
  cost: string;
  proposedBy: string;
  proposedByName: string;
  votes: { userId: string; at: number }[];
  status: 'proposed' | 'funded' | 'completed';
  createdAt: number;
}

export interface WardMeeting {
  id: string;
  ward: string;
  title: string;
  agenda: string;
  meetUrl: string;
  hostName: string;
  hostId: string;
  at: number;
  createdAt: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.wardProjects)) db.wardProjects = [];
  if (!Array.isArray(db.wardMeetings)) db.wardMeetings = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerWardRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // ---- Projects ----
  app.get('/api/ward/projects', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const ward = s((req.query as any).ward, 40);
    const me = (req as any).user?.id;
    const projects = (db.wardProjects as WardProject[])
      .filter((p) => (ward ? p.ward === ward : true))
      .sort((a, b) => b.votes.length - a.votes.length)
      .map((p) => ({ ...p, voted: me ? p.votes.some((v) => v.userId === me) : false }));
    res.json({ projects });
  });

  app.post('/api/ward/projects', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const ward = s(b.ward, 40);
    const title = s(b.title, 120);
    if (!ward || !title) return res.status(400).json({ error: 'ward and title are required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const project: WardProject = {
      id: uid('wp'),
      ward,
      title,
      desc: s(b.desc, 600),
      cost: s(b.cost, 60),
      proposedBy: user.id,
      proposedByName: user.name || user.username || 'User',
      votes: [{ userId: user.id, at: Date.now() }],
      status: 'proposed',
      createdAt: Date.now(),
    };
    (db.wardProjects as WardProject[]).push(project);
    saveDatabase(db);
    res.json({ project });
  });

  app.post('/api/ward/projects/:id/vote', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const project = (db.wardProjects as WardProject[]).find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const idx = project.votes.findIndex((v) => v.userId === user.id);
    if (idx >= 0) project.votes.splice(idx, 1);
    else project.votes.push({ userId: user.id, at: Date.now() });
    saveDatabase(db);
    res.json({ votes: project.votes.length, voted: idx < 0 });
  });

  // ---- Meetings ----
  app.get('/api/ward/meetings', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const ward = s((req.query as any).ward, 40);
    const now = Date.now();
    const meetings = (db.wardMeetings as WardMeeting[])
      .filter((m) => (ward ? m.ward === ward : true))
      .sort((a, b) => a.at - b.at)
      .map((m) => ({ ...m, live: m.at <= now, upcoming: m.at > now }));
    res.json({ meetings });
  });

  app.post('/api/ward/meetings', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const ward = s(b.ward, 40);
    const title = s(b.title, 120);
    if (!ward || !title) return res.status(400).json({ error: 'ward and title are required.' });
    const at = Number.isFinite(Number(b.at)) ? Number(b.at) : Date.now();
    const db = loadDatabase();
    ensureCollection(db);
    const room = `ocean-ward-${ward.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now().toString(36)}`;
    const meeting: WardMeeting = {
      id: uid('wm'),
      ward,
      title,
      agenda: s(b.agenda, 500),
      meetUrl: b.meetUrl ? s(b.meetUrl, 300) : `https://meet.jit.si/${room}`,
      hostName: user.name || user.username || 'User',
      hostId: user.id,
      at,
      createdAt: Date.now(),
    };
    (db.wardMeetings as WardMeeting[]).push(meeting);
    saveDatabase(db);
    res.json({ meeting });
  });
}
