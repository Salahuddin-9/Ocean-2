/**
 * Ocean — Live Gifts + Live Ecosystem backend (feature #252)
 * -----------------------------------------------------------
 * Monetization layer for live streams, wired into the community coin wallet:   * POST /api/live/gifts/send          deduct coins from sender, credit streamer (+ WS broadcast)
 *   GET  /api/live/gifts               gift catalog + my balance
 *   POST /api/live/goals               set a stream goal (streamer)
 *   GET  /api/live/goals               my goal + live progress
 *   POST /api/live/clips               save a clip from a stream timestamp
 *   GET  /api/live/clips               list clips (mine or ?streamerId=)
 *   GET  /api/live/leaderboard         top streamers by gifts + top gifters
 *   POST /api/live/rooms               start a live room (streamer)
 *   GET  /api/live/rooms               list live rooms
 *   POST /api/live/rooms/:id/join|leave|end
 *   POST /api/live/rooms/:id/kick|ban  moderator tools (owner only)
 * State lives in liveeco.json; coins live in community.json via ctx.
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';
import { addBalance, spendBalance } from './turtleCommunityBackend';
import { broadcastMessageToUsers } from '../chatServer.js';

export interface GiftDef { id: string; name: string; emoji: string; cost: number; animated: string }
export interface GiftRecord { id: string; from: string; fromName: string; to: string; toName: string; giftId: string; giftName: string; emoji: string; cost: number; at: number }
export interface StreamGoal { id: string; streamerId: string; title: string; target: number; raised: number; createdAt: number; expiresAt: number }
export interface Clip { id: string; streamerId: string; title: string; url?: string; duration: number; at: number; views: number }
export interface LiveRoom {
  id: string; hostId: string; hostName: string; title: string; category: string;
  viewers: string[]; banned: string[]; kicked: string[]; createdAt: number;
}

interface LiveStore { gifts: GiftRecord[]; goals: StreamGoal[]; clips: Clip[]; rooms: LiveRoom[] }

export const GIFT_CATALOG: GiftDef[] = [
  { id: 'g1', name: 'Heart', emoji: '❤️', cost: 5, animated: 'heart' },
  { id: 'g2', name: 'Fish', emoji: '🐟', cost: 10, animated: 'fish' },
  { id: 'g3', name: 'Shell', emoji: '🐚', cost: 15, animated: 'shell' },
  { id: 'g4', name: 'Turtle', emoji: '🐢', cost: 25, animated: 'turtle' },
  { id: 'g5', name: 'Wave', emoji: '🌊', cost: 50, animated: 'wave' },
  { id: 'g6', name: 'Boat', emoji: '⛵', cost: 100, animated: 'boat' },
  { id: 'g7', name: 'Dolphin', emoji: '🐬', cost: 150, animated: 'dolphin' },
  { id: 'g8', name: 'Lighthouse', emoji: '🗼', cost: 250, animated: 'lighthouse' },
  { id: 'g9', name: 'Island', emoji: '🏝️', cost: 500, animated: 'island' },
  { id: 'g10', name: 'Ocean King', emoji: '👑', cost: 1000, animated: 'crown' },
];

const store = makeJsonStore<LiveStore>('liveeco.json', () => ({ gifts: [], goals: [], clips: [], rooms: [] }));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function registerLiveEcosystemRoutes(app: express.Express) {
  const { requireAuth, loadCommunity, saveCommunity, loadDatabase } = getCtx();

  // --- Gift catalog + my balance --------------------------------------------------
  app.get('/api/live/gifts', requireAuth, (req, res) => {
    const me = (req as any).user;
    const community = loadCommunity();
    res.json({ catalog: GIFT_CATALOG, balance: community.balances[me.id] || 0 });
  });

  // --- Send a gift ----------------------------------------------------------------
  app.post('/api/live/gifts/send', requireAuth, (req, res) => {
    const me = (req as any).user;
    const { toUserId, giftId } = req.body || {};
    if (!toUserId || !giftId) return res.status(400).json({ error: 'toUserId and giftId are required.' });
    const gift = GIFT_CATALOG.find((g) => g.id === giftId);
    if (!gift) return res.status(400).json({ error: 'Unknown gift.' });
    const db = loadDatabase();
    const target = (db?.users || []).find((u: any) => u.id === toUserId);
    if (!target) return res.status(404).json({ error: 'Streamer not found.' });

    const community = loadCommunity();
    if (!spendBalance(community, me.id, gift.cost)) {
      saveCommunity(community);
      return res.status(402).json({ error: `You need ${gift.cost} coins for this gift (balance ${community.balances[me.id] || 0}).` });
    }
    addBalance(community, toUserId, gift.cost);
    saveCommunity(community);

    const rec: GiftRecord = {
      id: uid('gift'),
      from: me.id, fromName: me.name || me.username || 'User',
      to: toUserId, toName: target.name || target.username || 'Streamer',
      giftId: gift.id, giftName: gift.name, emoji: gift.emoji, cost: gift.cost, at: Date.now(),
    };
    store.load().gifts.push(rec);
    // roll into today's goal if the streamer has one
    const goal = store.load().goals.find((g) => g.streamerId === toUserId && g.expiresAt > Date.now());
    if (goal) {
      goal.raised = Math.min(goal.target || Infinity, goal.raised + gift.cost);
      if (goal.raised >= goal.target) goal.expiresAt = Math.min(goal.expiresAt, Date.now() + 24 * 3600000);
    }
    store.persist();
    // Real-time push over the existing /ws/chat WebSocket channel — the sender's and
    // streamer's Live Ecosystem UIs update instantly (fly animation + live gift feed).
    try {
      broadcastMessageToUsers([me.id, toUserId], { type: 'live_gift', gift: rec });
    } catch { /* ws not ready — clients fall back to polling */ }
    res.json({ gift: rec, balance: community.balances[me.id] || 0, streamerEarnings: community.balances[toUserId] || 0, goal });
  });

  // --- Recent gifts (realtime-ish feed for the live ticker) -------------------------
  app.get('/api/live/gifts/recent', requireAuth, (_req, res) => {
    const recent = store.load().gifts.slice(-15).reverse();
    res.json({ recent });
  });

  // --- Goals ----------------------------------------------------------------------
  app.get('/api/live/goals', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    const active = s.goals.find((g) => g.streamerId === me.id && g.expiresAt > Date.now()) || null;
    res.json({ goal: active, totalRaisedToday: s.goals.filter((g) => g.streamerId === me.id).reduce((a, g) => a + g.raised, 0) });
  });

  app.post('/api/live/goals', requireAuth, (req, res) => {
    const me = (req as any).user;
    const title = String(req.body?.title || '').trim().slice(0, 80);
    const target = Math.max(10, Math.min(Number(req.body?.target) || 0, 1000000));
    if (!title || !target) return res.status(400).json({ error: 'Goal title and target are required.' });
    const s = store.load();
    s.goals = s.goals.filter((g) => !(g.streamerId === me.id && g.expiresAt > Date.now()));
    const goal: StreamGoal = {
      id: uid('goal'), streamerId: me.id, title, target, raised: 0, createdAt: Date.now(), expiresAt: Date.now() + 7 * 86400000,
    };
    s.goals.unshift(goal);
    store.persist();
    res.json({ goal });
  });

  // --- Clips -----------------------------------------------------------------------
  app.post('/api/live/clips', requireAuth, (req, res) => {
    const me = (req as any).user;
    const title = String(req.body?.title || 'Highlight').slice(0, 80);
    const url = req.body?.url ? String(req.body.url) : undefined;
    const duration = Math.max(1, Math.min(Number(req.body?.duration) || 30, 300));
    const clip: Clip = { id: uid('clip'), streamerId: me.id, title, url, duration, at: Date.now(), views: 0 };
    store.load().clips.unshift(clip);
    store.persist();
    res.json({ clip });
  });

  app.get('/api/live/clips', requireAuth, (req, res) => {
    const me = (req as any).user;
    const streamerId = (req.query.streamerId as string) || me.id;
    const clips = store.load().clips.filter((c) => c.streamerId === streamerId);
    res.json({ clips });
  });

  // --- Leaderboard -------------------------------------------------------------------
  app.get('/api/live/leaderboard', requireAuth, (_req, res) => {
    const s = store.load();
    const byStreamer = new Map<string, { id: string; name: string; total: number; count: number }>();
    const byGifter = new Map<string, { id: string; name: string; total: number; count: number }>();
    for (const g of s.gifts) {
      const st = byStreamer.get(g.to) || { id: g.to, name: g.toName, total: 0, count: 0 };
      st.total += g.cost; st.count += 1; byStreamer.set(g.to, st);
      const gf = byGifter.get(g.from) || { id: g.from, name: g.fromName, total: 0, count: 0 };
      gf.total += g.cost; gf.count += 1; byGifter.set(g.from, gf);
    }
    res.json({
      streamers: [...byStreamer.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      gifters: [...byGifter.values()].sort((a, b) => b.total - a.total).slice(0, 10),
      giftCount: s.gifts.length,
    });
  });

  // --- Live rooms ------------------------------------------------------------------------
  app.post('/api/live/rooms', requireAuth, (req, res) => {
    const me = (req as any).user;
    const title = String(req.body?.title || '').trim().slice(0, 100);
    const category = String(req.body?.category || 'chat').slice(0, 30);
    if (!title) return res.status(400).json({ error: 'Room title is required.' });
    const s = store.load();
    const existing = s.rooms.find((r) => r.hostId === me.id);
    if (existing) return res.json({ room: existing, note: 'You already have a live room.' });
    const room: LiveRoom = {
      id: uid('room'), hostId: me.id, hostName: me.name || me.username || 'User',
      title, category, viewers: [me.id], banned: [], kicked: [], createdAt: Date.now(),
    };
    s.rooms.unshift(room);
    store.persist();
    res.json({ room });
  });

  app.get('/api/live/rooms', requireAuth, (_req, res) => {
    const s = store.load();
    const rooms = s.rooms.map((r) => ({ ...r, viewerCount: r.viewers.length }));
    res.json({ rooms });
  });

  app.post('/api/live/rooms/:id/join', requireAuth, (req, res) => {
    const me = (req as any).user;
    const room = store.load().rooms.find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.banned.includes(me.id)) return res.status(403).json({ error: 'You are banned from this room.' });
    if (!room.viewers.includes(me.id)) room.viewers.push(me.id);
    store.persist();
    res.json({ viewerCount: room.viewers.length });
  });

  app.post('/api/live/rooms/:id/leave', requireAuth, (req, res) => {
    const me = (req as any).user;
    const room = store.load().rooms.find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    room.viewers = room.viewers.filter((v) => v !== me.id);
    store.persist();
    res.json({ viewerCount: room.viewers.length });
  });

  app.post('/api/live/rooms/:id/end', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    const idx = s.rooms.findIndex((r) => r.id === req.params.id && r.hostId === me.id);
    if (idx === -1) return res.status(404).json({ error: 'Room not found or not yours.' });
    s.rooms.splice(idx, 1);
    store.persist();
    res.json({ ok: true });
  });

  // --- Moderator tools (kick / ban, owner only) --------------------------------------------
  app.post('/api/live/rooms/:id/kick', requireAuth, (req, res) => {
    const me = (req as any).user;
    const room = store.load().rooms.find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.hostId !== me.id) return res.status(403).json({ error: 'Only the host can kick viewers.' });
    const userId = String(req.body?.userId || '');
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    room.viewers = room.viewers.filter((v) => v !== userId);
    if (!room.kicked.includes(userId)) room.kicked.push(userId);
    store.persist();
    res.json({ kicked: room.kicked });
  });

  app.post('/api/live/rooms/:id/ban', requireAuth, (req, res) => {
    const me = (req as any).user;
    const room = store.load().rooms.find((r) => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found.' });
    if (room.hostId !== me.id) return res.status(403).json({ error: 'Only the host can ban viewers.' });
    const userId = String(req.body?.userId || '');
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    room.viewers = room.viewers.filter((v) => v !== userId);
    if (!room.banned.includes(userId)) room.banned.push(userId);
    store.persist();
    res.json({ banned: room.banned });
  });
}
