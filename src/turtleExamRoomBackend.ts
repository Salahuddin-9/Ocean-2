/**
 * Ocean — Exam War Room (Feature 200)
 * ------------------------------------
 * Study rooms for exam preparation: shared past papers, notes and a countdown
 * to the exam date. Any member can add papers and notes.
 *
 * Model (global db): db.examRooms — array of
 *   { id, name, subject, examDate (epoch ms), createdBy, createdByName,
 *     members: { id, name }[], papers: { id, title, year, url, addedBy }[],
 *     notes: { id, userId, userName, text, at }[], createdAt }
 *
 * Routes:
 *   GET  /api/exam-rooms             (public) rooms + joined flags
 *   POST /api/exam-rooms             (auth) create a room
 *   POST /api/exam-rooms/:id/join    (auth) join/leave toggle
 *   POST /api/exam-rooms/:id/papers  (auth) add a past paper
 *   POST /api/exam-rooms/:id/notes   (auth) add a note
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ExamRoom {
  id: string;
  name: string;
  subject: string;
  examDate: number;
  createdBy: string;
  createdByName: string;
  members: { id: string; name: string }[];
  papers: { id: string; title: string; year: string; url: string; addedBy: string }[];
  notes: { id: string; userId: string; userName: string; text: string; at: number }[];
  createdAt: number;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.examRooms)) db.examRooms = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerExamRoomRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.get('/api/exam-rooms', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const me = (req as any).user?.id;
    const rooms = (db.examRooms as ExamRoom[])
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ ...r, joined: me ? r.members.some((m) => m.id === me) : false }));
    res.json({ rooms });
  });

  app.post('/api/exam-rooms', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const name = s(b.name, 100);
    if (!name) return res.status(400).json({ error: 'Room name is required.' });
    const examDate = Number.isFinite(Number(b.examDate)) ? Number(b.examDate) : 0;
    const db = loadDatabase();
    ensureCollection(db);
    const room: ExamRoom = {
      id: uid('exam'),
      name,
      subject: s(b.subject, 80),
      examDate,
      createdBy: user.id,
      createdByName: user.name || user.username || 'User',
      members: [{ id: user.id, name: user.name || user.username || 'User' }],
      papers: [],
      notes: [],
      createdAt: Date.now(),
    };
    (db.examRooms as ExamRoom[]).unshift(room);
    saveDatabase(db);
    res.json({ room });
  });

  app.post('/api/exam-rooms/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const room = (db.examRooms as ExamRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    const idx = room.members.findIndex((m) => m.id === user.id);
    let joined: boolean;
    if (idx >= 0) {
      room.members.splice(idx, 1);
      joined = false;
    } else {
      room.members.push({ id: user.id, name: user.name || user.username || 'User' });
      joined = true;
    }
    saveDatabase(db);
    res.json({ success: true, joined });
  });

  app.post('/api/exam-rooms/:id/papers', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    const title = s(b.title, 120);
    if (!title) return res.status(400).json({ error: 'Paper title is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const room = (db.examRooms as ExamRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    room.papers.unshift({ id: uid('paper'), title, year: s(b.year, 20), url: s(b.url, 400), addedBy: user.id });
    saveDatabase(db);
    res.json({ success: true, papers: room.papers });
  });

  app.post('/api/exam-rooms/:id/notes', requireAuth, (req, res) => {
    const user = (req as any).user;
    const text = s((req.body || {}).text, 1000);
    if (!text) return res.status(400).json({ error: 'Note is empty.' });
    const db = loadDatabase();
    ensureCollection(db);
    const room = (db.examRooms as ExamRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    room.notes.push({ id: uid('note'), userId: user.id, userName: user.name || user.username || 'User', text, at: Date.now() });
    saveDatabase(db);
    res.json({ success: true, notes: room.notes });
  });
}
