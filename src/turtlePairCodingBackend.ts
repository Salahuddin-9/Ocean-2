/**
 * Ocean — Coding Pair-Sessions with Shared Terminal (Feature 195)
 * -----------------------------------------------------------------
 * A shared "terminal" room for two (or more) developers. The server relays
 * commands + a LIVE shared input buffer with a lightweight polling model (no
 * chatServer edit required), so both developers can type into the same buffer
 * simultaneously and see the shared transcript in near real-time.
 *
 * The shell is deterministic (help / whoami / ls / cat / node / echo / clear /
 * exit); a real PTY (node-pty) can be attached to the command relay later —
 * the route shape is identical.
 *
 * Model (global db): db.pairRooms — array of
 *   { id, code, title, createdBy, members: string[], log: { by, cmd, out, at }[],
 *     buffer: { text, byName, at } | null, cursor: string, createdAt }
 * buffer: the shared live input line — the last writer's keystrokes are
 * visible to every member until someone runs a command or clears it.
 *
 * Routes:
 *   POST /api/pair/rooms                (auth) create room -> code (6 chars)
 *   GET  /api/pair/rooms/:code          (auth) join/read room state (incl. buffer)
 *   POST /api/pair/rooms/:code/buffer   (auth) sync the live shared buffer
 *   POST /api/pair/rooms/:code/command  (auth) relay a command into the log
 *   POST /api/pair/rooms/:code/leave    (auth) remove me from members
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface PairLogEntry {
  by: string;
  byName: string;
  cmd: string;
  out: string;
  at: number;
}

export interface PairRoom {
  id: string;
  code: string;
  title: string;
  createdBy: string;
  members: string[];
  log: PairLogEntry[];
  buffer: { text: string; byName: string; byId: string; at: number } | null;
  cursor: string;
  createdAt: number;
}

function uid(): string {
  return `pr-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function roomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.pairRooms)) db.pairRooms = [];
}

function findRoom(db: any, code: string): PairRoom | undefined {
  return (db.pairRooms as PairRoom[]).find((r) => r && r.code === String(code).toUpperCase());
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const BANNER = 'Ocean Shared Terminal v1.0 — type "help" to begin.\nCollaborative session; every command is broadcast to all members.';

export function runShell(cmdLine: string, who: string): string {
  const [cmd, ...rest] = cmdLine.trim().split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd.toLowerCase()) {
    case 'help':
      return 'Commands: help · whoami · ls · cat <file> · node <expr> · echo <text> · clear · exit';
    case 'whoami':
      return who;
    case 'ls':
      return 'pair-code/  src/  package.json  README.md  .env.example';
    case 'cat':
      return arg
        ? `# ${arg}\nconst ocean = { mode: 'pair', status: 'online' };\nexport default ocean;`
        : 'usage: cat <file>';
    case 'node': {
      const expr = arg || '1 + 1';
      try {
        // eslint-disable-next-line no-eval
        const out = Function(`"use strict"; return (${expr});`)();
        return `> ${typeof out === 'object' ? JSON.stringify(out) : String(out)}`;
      } catch {
        return 'Error: syntax error in expression.';
      }
    }
    case 'echo':
      return arg;
    case 'clear':
    case 'exit':
      return '__CLEAR__';
    default:
      return `bash: ${cmd}: command not found`;
  }
}

export function registerPairCodingRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/pair/rooms', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const code = roomCode();
    // avoid collisions
    for (let i = 0; i < 6 && findRoom(db, code); i++) code + String(i);
    const room: PairRoom = {
      id: uid(),
      code,
      title: s((req.body || {}).title, 80) || 'Pair session',
      createdBy: user.id,
      members: [user.id],
      log: [{ by: 'system', byName: 'system', cmd: '', out: BANNER, at: Date.now() }],
      buffer: null,
      cursor: '~',
      createdAt: Date.now(),
    };
    (db.pairRooms as PairRoom[]).push(room);
    saveDatabase(db);
    res.json({ room, code });
  });

  app.get('/api/pair/rooms/:code', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const room = findRoom(db, req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!room.members.includes(user.id)) {
      room.members.push(user.id);
      room.log.push({ by: 'system', byName: 'system', cmd: '', out: `— ${user.name || 'peer'} joined the session —`, at: Date.now() });
      saveDatabase(db);
    }
    res.json({ room });
  });

  app.post('/api/pair/rooms/:code/buffer', requireAuth, (req, res) => {
    const user = (req as any).user;
    const text = s((req.body || {}).text, 1000);
    const db = loadDatabase();
    ensureCollection(db);
    const room = findRoom(db, req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!room.members.includes(user.id)) {
      return res.status(403).json({ error: 'Join the room first.' });
    }
    // Empty text clears the shared buffer (e.g. after a command runs).
    room.buffer = text
      ? { text, byName: user.name || user.username || 'peer', byId: user.id, at: Date.now() }
      : null;
    saveDatabase(db);
    res.json({ buffer: room.buffer });
  });

  app.post('/api/pair/rooms/:code/command', requireAuth, (req, res) => {
    const user = (req as any).user;
    const cmd = s((req.body || {}).command, 500);
    if (!cmd) return res.status(400).json({ error: 'command is required.' });
    const db = loadDatabase();
    ensureCollection(db);
    const room = findRoom(db, req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (!room.members.includes(user.id)) {
      return res.status(403).json({ error: 'Join the room first.' });
    }
    const out = runShell(cmd, user.name || user.username || 'peer');
    room.log.push({ by: user.id, byName: user.name || user.username || 'peer', cmd, out, at: Date.now() });
    room.cursor = '~';
    room.buffer = null; // a command consumes the shared buffer
    saveDatabase(db);
    res.json({ entry: room.log[room.log.length - 1], out });
  });

  app.post('/api/pair/rooms/:code/leave', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const room = findRoom(db, req.params.code);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    room.members = room.members.filter((m) => m !== user.id);
    room.log.push({ by: 'system', byName: 'system', cmd: '', out: `— ${user.name || 'peer'} left —`, at: Date.now() });
    saveDatabase(db);
    res.json({ success: true });
  });
}
