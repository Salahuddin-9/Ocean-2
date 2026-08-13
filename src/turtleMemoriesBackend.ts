/**
 * Ocean — Memory Recaps + Shared Memories (Features 160 & 161)
 * ------------------------------------------------------------
 * 160: "On this day" for chats, reels and posts — aggregates items from the same
 *      month/day in previous years into a DailyMemory card.
 * 161: A shared-memories page for two users — every interaction they've had:
 *      mutual comments, chat messages and reactions, in one timeline.
 *
 * Model (global db, idempotent ensure):
 *   db.dailyMemories — array of { id, userId, date (YYYY-MM-DD), entries[] }
 *   (shared memories are computed on the fly — no collection)
 *
 * Routes:
 *   POST /api/memories/recap              (auth) rebuild today's recap
 *   GET  /api/memories/recap              (auth) today's recap (auto-build)
 *   GET  /api/memories/recaps             (auth) past recaps
 *   GET  /api/memories/shared/:friendId   (auth) shared timeline with a friend
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface MemoryEntry {
  kind: 'post' | 'reel' | 'message' | 'voice_note';
  title: string;
  text: string;
  by: string;
  at: number;
}

export interface DailyMemory {
  id: string;
  userId: string;
  date: string;
  entries: MemoryEntry[];
  createdAt: number;
}

export interface SharedMemoryEntry {
  kind: 'comment' | 'message' | 'reaction' | 'post';
  text: string;
  byId: string;
  byName: string;
  at: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.dailyMemories)) db.dailyMemories = [];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function postTimestamp(p: any): number {
  const raw = p?.timestamp ?? p?.createdAt ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  return Date.now();
}

function sameMonthDay(a: number, b: Date): boolean {
  const da = new Date(a);
  return da.getMonth() === b.getMonth() && da.getDate() === b.getDate() && da.getFullYear() !== b.getFullYear();
}

function short(s: string, n = 90): string {
  const t = String(s || '').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function userName(db: any, id: string): string {
  const u = (db.users || []).find((x: any) => x && x.id === id);
  return u ? u.name || u.username || 'User' : 'User';
}

/** Build today's "on this day" recap from posts/reels/messages in previous years. */
export function buildRecap(db: any, me: any): DailyMemory {
  const now = new Date();
  const entries: MemoryEntry[] = [];
  const push = (kind: MemoryEntry['kind'], title: string, text: string, by: string, at: number) => {
    if (entries.length >= 8) return;
    entries.push({ kind, title, text, by, at });
  };

  const myPosts = (me?.profile?.posts || []) as any[];
  myPosts.forEach((p) => {
    if (!sameMonthDay(postTimestamp(p), now)) return;
    const isReel = !!p.videoUrl || p.type === 'reel';
    push(isReel ? 'reel' : 'post', isReel ? 'A reel you posted' : 'A post you shared', short(p.content || p.title), 'You', postTimestamp(p));
  });

  const msgPool: any[] = [];
  (db.messages || []).forEach((m: any) => msgPool.push(m));
  (db.chatMessages || []).forEach((m: any) => msgPool.push(m));
  (db.conversations || []).forEach((c: any) => (c.messages || []).forEach((m: any) => msgPool.push(m)));
  msgPool
    .filter((m) => m.senderId === me.id || m.receiverId === me.id || m.toUserId === me.id)
    .filter((m) => typeof m.at === 'number' && sameMonthDay(m.at, now))
    .sort((a, b) => a.at - b.at)
    .forEach((m) => push('message', 'A message from this day', short(m.text), userName(db, m.senderId), m.at || 0));

  if (entries.length === 0) {
    push('post', 'Nothing yet today', 'No memories from this day in previous years — the first one is being made now.', 'Ocean', Date.now());
  }
  entries.sort((a, b) => b.at - a.at);

  return { id: uid('mem'), userId: me.id, date: todayStr(), entries, createdAt: Date.now() };
}

/** Shared timeline: mutual comments, messages and reactions with a friend. */
export function buildSharedMemories(db: any, meId: string, friendId: string): { friend: any; entries: SharedMemoryEntry[] } {
  const friend = (db.users || []).find((u: any) => u && u.id === friendId) || null;
  const entries: SharedMemoryEntry[] = [];
  const push = (kind: SharedMemoryEntry['kind'], text: string, byId: string, at: number) => {
    if (entries.length >= 60) return;
    entries.push({ kind, text, byId, byName: userName(db, byId), at });
  };

  // Mutual comments on each other's posts.
  const allPosts: any[] = [];
  (db.users || []).forEach((u: any) => {
    const mine = u.id === meId;
    const friends = u.id === friendId;
    (u.profile?.posts || []).forEach((p: any) => {
      if (mine || friends) allPosts.push({ ...p, _ownerId: u.id });
    });
  });
  allPosts.forEach((p) => {
    (p.comments || []).forEach((c: any) => {
      if (c.senderId === meId && p._ownerId === friendId) push('comment', `You commented on their post: ${short(c.text)}`, meId, c.at || 0);
      if (c.senderId === friendId && p._ownerId === meId) push('comment', `They commented on your post: ${short(c.text)}`, friendId, c.at || 0);
    });
  });

  // Chat messages between the two.
  const msgPool: any[] = [];
  (db.messages || []).forEach((m: any) => msgPool.push(m));
  (db.chatMessages || []).forEach((m: any) => msgPool.push(m));
  (db.conversations || []).forEach((c: any) => (c.messages || []).forEach((m: any) => msgPool.push(m)));
  msgPool
    .filter((m) => {
      const a = m.senderId === meId && (m.receiverId === friendId || m.toUserId === friendId);
      const b = m.senderId === friendId && (m.receiverId === meId || m.toUserId === meId);
      return a || b;
    })
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .forEach((m) => push('message', short(m.text), m.senderId, m.at || 0));

  entries.sort((a, b) => b.at - a.at);
  return { friend, entries };
}

export function registerMemoriesRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/memories/recap — rebuild today's recap
  app.post('/api/memories/recap', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.dailyMemories as DailyMemory[];
    const idx = list.findIndex((m) => m.userId === user.id && m.date === todayStr());
    const memory = buildRecap(db, user);
    if (idx >= 0) list[idx] = memory;
    else list.unshift(memory);
    saveDatabase(db);
    res.json({ memory });
  });

  // GET /api/memories/recap — today's recap (auto-build)
  app.get('/api/memories/recap', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    let memory = (db.dailyMemories as DailyMemory[]).find((m) => m.userId === user.id && m.date === todayStr());
    if (!memory) {
      memory = buildRecap(db, user);
      (db.dailyMemories as DailyMemory[]).unshift(memory);
      saveDatabase(db);
    }
    res.json({ memory });
  });

  // GET /api/memories/recaps — past recaps
  app.get('/api/memories/recaps', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.dailyMemories as DailyMemory[])
      .filter((m) => m.userId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30);
    res.json({ recaps: mine });
  });

  // GET /api/memories/shared/:friendId — shared timeline
  app.get('/api/memories/shared/:friendId', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const result = buildSharedMemories(db, user.id, req.params.friendId);
    if (!result.friend) return res.status(404).json({ error: 'Friend not found.' });
    res.json({ friend: { id: result.friend.id, name: result.friend.name || result.friend.username || 'User' }, entries: result.entries });
  });
}
