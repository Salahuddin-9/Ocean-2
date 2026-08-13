/**
 * Ocean — Study / Focus Rooms (Feature 6)
 * ----------------------------------------
 * Persistent public focus rooms (SSC 2026, HSC 2027, …) with live presence and a
 * built-in Pomodoro timer. No chat — just a "who is studying right now" grid and
 * per-user focus/break cycles. Presence is heartbeat-based (HTTP) so it survives
 * reloads and works without the WebSocket layer.
 *
 * Models (global db):
 *   db.studyRooms     — { id, name, category, description, createdBy, createdByName, createdAt, members: string[] }
 *   db.studyPresence  — Record<roomId, Record<userId, { studying: boolean, at }>>
 *   db.studyPomodoros — Record<roomId, Record<userId, { phase, startedAt, focusMin, breakMin }>>
 *   db.studyStats     — Record<roomId, Record<userId, { sessions, totalFocusMs }>>
 *
 * Routes:
 *   GET  /api/rooms              (guest) public rooms + live "studying now" counts
 *   POST /api/rooms              (auth)  create a room
 *   GET  /api/rooms/:id          (auth)  detail: presence grid + pomodoro states
 *   POST /api/rooms/:id/join     (auth)
 *   POST /api/rooms/:id/leave    (auth)
 *   POST /api/rooms/:id/presence (auth)  { studying } heartbeat
 *   POST /api/rooms/:id/pomodoro (auth)  { action: start|stop, phase?: focus|break }
 */
import express from 'express';
import { getCtx } from './turtleServerContext';

export interface StudyRoom {
  id: string;
  name: string;
  category: string;
  description: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  members: string[];
}

const PRESENCE_TTL_MS = 45_000;
const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;

const SEED_ROOMS = [
  { name: 'SSC 2026', category: 'Exam Prep', description: 'Quiet focus room for SSC 2026 candidates. 25/5 Pomodoro rhythm.' },
  { name: 'HSC 2027', category: 'Exam Prep', description: 'HSC 2027 study hall — come study in silence, stay for the streak.' },
  { name: 'Programming Focus', category: 'Coding', description: 'Deep-work room for coders. No chat, only focus.' },
  { name: 'University Entrance Prep', category: 'Admission', description: 'Admission test prep room with timed practice sessions.' },
  { name: 'Late Night Library', category: 'General', description: 'Open all night. Bring your own headphones.' },
];

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function ensureDefaults(db: any): void {
  if (!Array.isArray(db.studyRooms)) db.studyRooms = [];
  for (const seed of SEED_ROOMS) {
    if (!(db.studyRooms as StudyRoom[]).some((r) => r.name === seed.name)) {
      (db.studyRooms as StudyRoom[]).push({
        id: uid('room'),
        name: seed.name,
        category: seed.category,
        description: seed.description,
        createdBy: 'system',
        createdByName: 'Ocean',
        createdAt: Date.now(),
        members: [],
      });
    }
  }
  if (!db.studyPresence) db.studyPresence = {};
  if (!db.studyPomodoros) db.studyPomodoros = {};
  if (!db.studyStats) db.studyStats = {};
}

function freshPresence(db: any, roomId: string): Array<{ userId: string; name: string; studying: boolean; at: number }> {
  const map = (db.studyPresence || {})[roomId] || {};
  const now = Date.now();
  return Object.entries(map)
    .filter(([, p]: any) => now - p.at < PRESENCE_TTL_MS)
    .map(([userId, p]: any) => {
      const u = (db.users || []).find((x: any) => x && x.id === userId);
      return { userId, name: u ? u.name || u.username || 'User' : 'User', studying: !!p.studying, at: p.at };
    });
}

function studyingNow(db: any, roomId: string): number {
  return freshPresence(db, roomId).filter((p) => p.studying).length;
}

/** Advance an expired pomodoro (focus→break, break→idle) and credit stats. */
function syncPomodoro(db: any, roomId: string, userId: string): any {
  const rooms = (db.studyPomodoros || {})[roomId] || {};
  const rec = rooms[userId];
  if (!rec) return null;
  const now = Date.now();
  const focusMs = (rec.focusMin || DEFAULT_FOCUS_MIN) * 60_000;
  const breakMs = (rec.breakMin || DEFAULT_BREAK_MIN) * 60_000;
  const elapsed = now - rec.startedAt;

  if (rec.phase === 'focus' && elapsed >= focusMs) {
    const stats = ((db.studyStats || {})[roomId] || {})[userId] || { sessions: 0, totalFocusMs: 0 };
    stats.sessions += 1;
    stats.totalFocusMs += focusMs;
    if (!db.studyStats[roomId]) db.studyStats[roomId] = {};
    db.studyStats[roomId][userId] = stats;
    rec.phase = 'break';
    rec.startedAt = now;
    return { ...rec, remainingSec: Math.ceil(breakMs / 1000) };
  }
  if (rec.phase === 'break' && elapsed >= breakMs) {
    rec.phase = 'idle';
    return { ...rec, remainingSec: 0 };
  }
  const totalMs = rec.phase === 'focus' ? focusMs : breakMs;
  return { ...rec, remainingSec: Math.max(0, Math.ceil((totalMs - elapsed) / 1000)) };
}

export function registerStudyRoomsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/rooms — public list with live studying counts (guest-safe)
  app.get('/api/rooms', (req, res) => {
    const db = loadDatabase();
    ensureDefaults(db);
    const rooms = (db.studyRooms as StudyRoom[]).map((r) => ({
      ...r,
      memberCount: r.members.length,
      studyingNow: studyingNow(db, r.id),
    }));
    res.json({ rooms });
  });

  // POST /api/rooms — create a room (auth)
  app.post('/api/rooms', requireAuth, (req, res) => {
    const user = (req as any).user;
    const name = s((req.body || {}).name, 60);
    if (!name) return res.status(400).json({ error: 'Room name is required.' });
    const db = loadDatabase();
    ensureDefaults(db);
    if ((db.studyRooms as StudyRoom[]).some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'A room with that name already exists.' });
    }
    const room: StudyRoom = {
      id: uid('room'),
      name,
      category: s((req.body || {}).category, 40) || 'General',
      description: s((req.body || {}).description, 200),
      createdBy: user.id,
      createdByName: user.name || user.username || 'User',
      createdAt: Date.now(),
      members: [user.id],
    };
    (db.studyRooms as StudyRoom[]).unshift(room);
    saveDatabase(db);
    res.json({ room });
  });

  // GET /api/rooms/:id — detail (auth)
  app.get('/api/rooms/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureDefaults(db);
    const room = (db.studyRooms as StudyRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    const presence = freshPresence(db, room.id);
    const pomodoros = ((db.studyPomodoros || {})[room.id] || {});
    // Persist any pomodoro auto-advance (focus→break, session credit) that the
    // read-side sync just applied, so stats survive reloads.
    const beforePomo = JSON.stringify(pomodoros[user.id] || null);
    const myPomodoro = syncPomodoro(db, room.id, user.id);
    if (JSON.stringify(pomodoros[user.id] || null) !== beforePomo) saveDatabase(db);
    const stats = ((db.studyStats || {})[room.id] || {})[user.id] || { sessions: 0, totalFocusMs: 0 };
    const members = room.members
      .map((id) => {
        const u = (db.users || []).find((x: any) => x && x.id === id);
        return { userId: id, name: u ? u.name || u.username || 'User' : 'User' };
      })
      .filter((m) => m.name !== 'User' || m.userId === user.id);
    res.json({
      room,
      members,
      presence,
      studyingNow: presence.filter((p) => p.studying).length,
      myPomodoro,
      myStats: stats,
      pomodoroCount: Object.keys(pomodoros).length,
    });
  });

  // POST /api/rooms/:id/join
  app.post('/api/rooms/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureDefaults(db);
    const room = (db.studyRooms as StudyRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!room.members.includes(user.id)) room.members.push(user.id);
    saveDatabase(db);
    res.json({ success: true, memberCount: room.members.length });
  });

  // POST /api/rooms/:id/leave
  app.post('/api/rooms/:id/leave', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureDefaults(db);
    const room = (db.studyRooms as StudyRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    room.members = room.members.filter((m) => m !== user.id);
    if ((db.studyPresence || {})[room.id]) delete (db.studyPresence as any)[room.id][user.id];
    saveDatabase(db);
    res.json({ success: true });
  });

  // POST /api/rooms/:id/presence — heartbeat
  app.post('/api/rooms/:id/presence', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureDefaults(db);
    const room = (db.studyRooms as StudyRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!room.members.includes(user.id)) return res.status(403).json({ error: 'Join the room first.' });
    const studying = (req.body || {}).studying !== false;
    if (!db.studyPresence[room.id]) db.studyPresence[room.id] = {};
    db.studyPresence[room.id][user.id] = { studying, at: Date.now() };
    saveDatabase(db);
    res.json({ success: true, studyingNow: studyingNow(db, room.id) });
  });

  // POST /api/rooms/:id/pomodoro — start/stop focus or break timer
  app.post('/api/rooms/:id/pomodoro', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureDefaults(db);
    const room = (db.studyRooms as StudyRoom[]).find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!room.members.includes(user.id)) return res.status(403).json({ error: 'Join the room first.' });

    const action = String((req.body || {}).action || 'start');
    const phase = (req.body || {}).phase === 'break' ? 'break' : 'focus';
    const focusMin = Math.min(120, Math.max(5, Math.floor(Number((req.body || {}).focusMin) || DEFAULT_FOCUS_MIN)));
    const breakMin = Math.min(60, Math.max(1, Math.floor(Number((req.body || {}).breakMin) || DEFAULT_BREAK_MIN)));

    if (!db.studyPomodoros[room.id]) db.studyPomodoros[room.id] = {};
    const recs = db.studyPomodoros[room.id];
    const existing = syncPomodoro(db, room.id, user.id);

    if (action === 'stop') {
      // Credit a partial-but-finished focus session if the focus phase was active.
      if (existing && existing.phase === 'focus' && existing.remainingSec > 0) {
        const stats = ((db.studyStats || {})[room.id] || {})[user.id] || { sessions: 0, totalFocusMs: 0 };
        stats.sessions += 1;
        stats.totalFocusMs += (existing.focusMin || DEFAULT_FOCUS_MIN) * 60_000;
        if (!db.studyStats[room.id]) db.studyStats[room.id] = {};
        db.studyStats[room.id][user.id] = stats;
      }
      delete recs[user.id];
      saveDatabase(db);
      return res.json({ phase: 'idle', remainingSec: 0, sessions: ((db.studyStats || {})[room.id] || {})[user.id]?.sessions || 0 });
    }

    recs[user.id] = { phase, startedAt: Date.now(), focusMin, breakMin };
    const totalMs = phase === 'focus' ? focusMin * 60_000 : breakMin * 60_000;
    saveDatabase(db);
    res.json({
      phase,
      startedAt: recs[user.id].startedAt,
      remainingSec: Math.ceil(totalMs / 1000),
      focusMin,
      breakMin,
    });
  });
}
