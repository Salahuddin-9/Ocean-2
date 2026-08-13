/**
 * Ocean — Communities Pro backend (feature #254)
 * ----------------------------------------------
 * Discord-level community channels layered on top of existing groups:
 *   voice rooms (persistent WebRTC rooms — audio itself uses the app's P2P call layer),
 *   stage channels (speaker / listener roles),
 *   thread channels (nested conversations),
 *   server templates (one-click channel scaffolding),
 *   scheduled events (streams/meetups with RSVPs).
 *
 * Routes (communityId = existing group id, e.g. 'ocean'):
 *   POST /api/communities/:id/voice              create voice room
 *   GET  /api/communities/:id/voice              list voice rooms (+ members)
 *   POST /api/communities/:id/voice/:vid/join    join / leave (body.leave=true)
 *   POST /api/communities/:id/stages             create stage channel
 *   GET  /api/communities/:id/stages             list stages
 *   POST /api/communities/:id/stages/:sid/speaker  toggle speaker (body.userId, body.on) — host only
 *   POST /api/communities/:id/threads            create thread (body.channelId?, title, text)
 *   GET  /api/communities/:id/threads            list threads
 *   POST /api/communities/:id/threads/:tid/reply add reply
 *   POST /api/communities/:id/templates          create a template (body.name, channels[])
 *   GET  /api/communities/:id/templates          list templates
 *   POST /api/communities/:id/templates/:tid/apply  apply template → creates channels
 *   POST /api/communities/:id/events               schedule an event (startsAt epoch ms)
 *   GET  /api/communities/:id/events               list upcoming + past events
 *   POST /api/communities/:id/events/:eid/rsvp     RSVP yes/maybe/no
 * State lives in communitiespro.json.
 */
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';

export interface VoiceRoom { id: string; communityId: string; name: string; hostId: string; hostName: string; members: string[]; createdAt: number }
export interface StageChannel { id: string; communityId: string; name: string; hostId: string; hostName: string; speakers: string[]; listeners: string[]; createdAt: number }
export interface ThreadReply { id: string; text: string; by: string; byName: string; at: number }
export interface ThreadChannel { id: string; communityId: string; channelId?: string; title: string; text: string; authorId: string; authorName: string; replies: ThreadReply[]; createdAt: number }
export interface CommunityTemplate { id: string; name: string; channels: { type: 'voice' | 'stage' | 'text' | 'thread'; name: string }[]; createdBy: string; createdAt: number }
export interface ScheduledEvent {
  id: string; communityId: string; title: string; description?: string;
  startsAt: number; endsAt: number; hostId: string; hostName: string;
  rsvps: { userId: string; status: 'yes' | 'maybe' | 'no'; at: number }[];
  createdAt: number;
}

interface ProStore { voice: VoiceRoom[]; stages: StageChannel[]; threads: ThreadChannel[]; templates: CommunityTemplate[]; events: ScheduledEvent[] }

export const TEMPLATE_LIBRARY: CommunityTemplate[] = [
  {
    id: 'tpl-starter', name: 'Starter', createdBy: 'system', createdAt: 0,
    channels: [{ type: 'voice', name: 'General Voice' }, { type: 'text', name: 'general' }, { type: 'stage', name: 'Town Hall' }],
  },
  {
    id: 'tpl-gaming', name: 'Gaming HQ', createdBy: 'system', createdAt: 0,
    channels: [{ type: 'voice', name: 'Game Night' }, { type: 'voice', name: 'AFK' }, { type: 'stage', name: 'Tournament Stage' }, { type: 'text', name: 'strategy' }],
  },
  {
    id: 'tpl-creator', name: 'Creator Studio', createdBy: 'system', createdAt: 0,
    channels: [{ type: 'voice', name: 'Live Collab' }, { type: 'stage', name: 'Premiere Stage' }, { type: 'text', name: 'ideas' }, { type: 'text', name: 'fan-notes' }],
  },
  {
    id: 'tpl-study', name: 'Study Hall', createdBy: 'system', createdAt: 0,
    channels: [{ type: 'voice', name: 'Focus Room' }, { type: 'thread', name: 'math-help' }, { type: 'text', name: 'notes' }],
  },
];

const store = makeJsonStore<ProStore>('communitiespro.json', () => ({ voice: [], stages: [], threads: [], templates: [], events: [] }));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function registerCommunitiesProRoutes(app: express.Express) {
  const { requireAuth, loadDatabase } = getCtx();

  const userName = (id: string) => {
    const db = loadDatabase();
    const u = (db?.users || []).find((x: any) => x.id === id);
    return u ? u.name || u.username || 'User' : 'User';
  };

  // --- Voice rooms --------------------------------------------------------------------------
  app.get('/api/communities/:id/voice', requireAuth, (req, res) => {
    const voice = store.load().voice.filter((v) => v.communityId === req.params.id);
    res.json({ voice: voice.map((v) => ({ ...v, memberCount: v.members.length })) });
  });

  app.post('/api/communities/:id/voice', requireAuth, (req, res) => {
    const me = (req as any).user;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Voice room name is required.' });
    const room: VoiceRoom = {
      id: uid('voice'), communityId: req.params.id, name,
      hostId: me.id, hostName: me.name || me.username || 'User', members: [me.id], createdAt: Date.now(),
    };
    store.load().voice.push(room);
    store.persist();
    res.json({ voice: room });
  });

  app.post('/api/communities/:id/voice/:vid/join', requireAuth, (req, res) => {
    const me = (req as any).user;
    const room = store.load().voice.find((v) => v.id === req.params.vid && v.communityId === req.params.id);
    if (!room) return res.status(404).json({ error: 'Voice room not found.' });
    if (req.body?.leave) room.members = room.members.filter((m) => m !== me.id);
    else if (!room.members.includes(me.id)) room.members.push(me.id);
    store.persist();
    res.json({ voice: room, memberCount: room.members.length, rtcHint: 'Use Ocean 1:1/group call for the actual WebRTC audio (Jitsi/P2P layer).' });
  });

  // --- LiveKit real-time voice (feature #254) -------------------------------------------------------
  // Mints a scoped LiveKit access token for a community voice room. Returns
  // { configured:false } when LIVEKIT_API_KEY/SECRET are unset so the client can
  // degrade to the app's P2P call layer.
  app.get('/api/livekit/token', requireAuth, async (req, res) => {
    const me = (req as any).user;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.json({
        configured: false,
        note: 'Set LIVEKIT_API_KEY + LIVEKIT_API_SECRET (server) and VITE_LIVEKIT_URL (client) to enable LiveKit audio.',
      });
    }
    const room = String(req.query.room || 'ocean').slice(0, 60);
    const identity = `user-${me.id}`.slice(0, 60);
    const at = new AccessToken(apiKey, apiSecret, { identity, ttl: '4h' });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    try {
      const token = await at.toJwt();
      res.json({ configured: true, token, room, identity });
    } catch (e: any) {
      res.status(500).json({ error: `Token minting failed: ${e?.message || e}` });
    }
  });

  // --- Stage channels -----------------------------------------------------------------------------
  app.get('/api/communities/:id/stages', requireAuth, (req, res) => {
    const stages = store.load().stages.filter((s) => s.communityId === req.params.id);
    res.json({ stages: stages.map((s) => ({ ...s, listenerCount: s.listeners.length })) });
  });

  app.post('/api/communities/:id/stages', requireAuth, (req, res) => {
    const me = (req as any).user;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Stage name is required.' });
    const stage: StageChannel = {
      id: uid('stage'), communityId: req.params.id, name,
      hostId: me.id, hostName: me.name || me.username || 'User', speakers: [me.id], listeners: [], createdAt: Date.now(),
    };
    store.load().stages.push(stage);
    store.persist();
    res.json({ stage });
  });

  app.post('/api/communities/:id/stages/:sid/join', requireAuth, (req, res) => {
    const me = (req as any).user;
    const stage = store.load().stages.find((s) => s.id === req.params.sid && s.communityId === req.params.id);
    if (!stage) return res.status(404).json({ error: 'Stage not found.' });
    if (req.body?.leave) { stage.listeners = stage.listeners.filter((m) => m !== me.id); stage.speakers = stage.speakers.filter((m) => m !== me.id); }
    else if (!stage.listeners.includes(me.id) && !stage.speakers.includes(me.id)) stage.listeners.push(me.id);
    store.persist();
    res.json({ stage });
  });

  app.post('/api/communities/:id/stages/:sid/speaker', requireAuth, (req, res) => {
    const me = (req as any).user;
    const stage = store.load().stages.find((s) => s.id === req.params.sid && s.communityId === req.params.id);
    if (!stage) return res.status(404).json({ error: 'Stage not found.' });
    if (stage.hostId !== me.id) return res.status(403).json({ error: 'Only the stage host can manage speakers.' });
    const userId = String(req.body?.userId || '');
    const turnOn = req.body?.on !== false;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    stage.listeners = stage.listeners.filter((m) => m !== userId);
    if (turnOn && !stage.speakers.includes(userId)) stage.speakers.push(userId);
    if (!turnOn) stage.speakers = stage.speakers.filter((m) => m !== userId);
    store.persist();
    res.json({ stage });
  });

  // --- Thread channels ----------------------------------------------------------------------------
  app.get('/api/communities/:id/threads', requireAuth, (req, res) => {
    const threads = store.load().threads.filter((t) => t.communityId === req.params.id).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ threads });
  });

  app.post('/api/communities/:id/threads', requireAuth, (req, res) => {
    const me = (req as any).user;
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const text = String(req.body?.text || '').trim().slice(0, 1000);
    if (!title) return res.status(400).json({ error: 'Thread title is required.' });
    const thread: ThreadChannel = {
      id: uid('thread'), communityId: req.params.id, channelId: req.body?.channelId ? String(req.body.channelId) : undefined,
      title, text, authorId: me.id, authorName: me.name || me.username || 'User', replies: [], createdAt: Date.now(),
    };
    store.load().threads.unshift(thread);
    store.persist();
    res.json({ thread });
  });

  app.post('/api/communities/:id/threads/:tid/reply', requireAuth, (req, res) => {
    const me = (req as any).user;
    const thread = store.load().threads.find((t) => t.id === req.params.tid && t.communityId === req.params.id);
    if (!thread) return res.status(404).json({ error: 'Thread not found.' });
    const text = String(req.body?.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: 'Reply text is required.' });
    thread.replies.push({ id: uid('reply'), text, by: me.id, byName: me.name || me.username || 'User', at: Date.now() });
    store.persist();
    res.json({ thread });
  });

  // --- Templates ---------------------------------------------------------------------------------------
  app.get('/api/communities/:id/templates', requireAuth, (_req, res) => {
    const mine = store.load().templates;
    res.json({ templates: [...TEMPLATE_LIBRARY, ...mine] });
  });

  app.post('/api/communities/:id/templates', requireAuth, (req, res) => {
    const me = (req as any).user;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const channels = Array.isArray(req.body?.channels) ? req.body.channels.slice(0, 12) : [];
    if (!name || channels.length === 0) return res.status(400).json({ error: 'Template name and channels are required.' });
    const tpl: CommunityTemplate = {
      id: uid('tpl'), name,
      channels: channels.map((c: any) => ({ type: ['voice', 'stage', 'text', 'thread'].includes(c?.type) ? c.type : 'text', name: String(c?.name || '').slice(0, 40) })).filter((c: any) => c.name),
      createdBy: me.id, createdAt: Date.now(),
    };
    store.load().templates.unshift(tpl);
    store.persist();
    res.json({ template: tpl });
  });

  app.post('/api/communities/:id/templates/:tid/apply', requireAuth, (req, res) => {
    const me = (req as any).user;
    const all = [...TEMPLATE_LIBRARY, ...store.load().templates];
    const tpl = all.find((t) => t.id === req.params.tid);
    if (!tpl) return res.status(404).json({ error: 'Template not found.' });
    const cid = req.params.id;
    const created: string[] = [];
    for (const ch of tpl.channels) {
      if (ch.type === 'voice') {
        const room: VoiceRoom = { id: uid('voice'), communityId: cid, name: ch.name, hostId: me.id, hostName: me.name || 'User', members: [me.id], createdAt: Date.now() };
        store.load().voice.push(room);
        created.push(`🔊 ${ch.name}`);
      } else if (ch.type === 'stage') {
        const stage: StageChannel = { id: uid('stage'), communityId: cid, name: ch.name, hostId: me.id, hostName: me.name || 'User', speakers: [me.id], listeners: [], createdAt: Date.now() };
        store.load().stages.push(stage);
        created.push(`🎤 ${ch.name}`);
      } else if (ch.type === 'thread') {
        const thread: ThreadChannel = { id: uid('thread'), communityId: cid, title: ch.name, text: 'Welcome to the thread channel!', authorId: me.id, authorName: me.name || 'User', replies: [], createdAt: Date.now() };
        store.load().threads.unshift(thread);
        created.push(`🧵 ${ch.name}`);
      } else {
        // text channels are cosmetic in this JSON model — record them as created
        created.push(`💬 ${ch.name}`);
      }
    }
    store.persist();
    res.json({ created, count: created.length, templateName: tpl.name });
  });

  // --- Scheduled events (feature #254) -------------------------------------------------------------
  // Communities can schedule events (streams, meetups, stage nights) with RSVPs.
  // `s.events` may be missing in stores created before this field existed — normalize lazily.
  app.get('/api/communities/:id/events', requireAuth, (req, res) => {
    const s = store.load();
    s.events = s.events || [];
    const now = Date.now();
    const mine = s.events.filter((e) => e.communityId === req.params.id);
    res.json({
      upcoming: mine.filter((e) => e.startsAt >= now).sort((a, b) => a.startsAt - b.startsAt),
      past: mine.filter((e) => e.startsAt < now).sort((a, b) => b.startsAt - a.startsAt).slice(0, 20),
    });
  });

  app.post('/api/communities/:id/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const startsAt = Number(req.body?.startsAt) || 0;
    if (!title) return res.status(400).json({ error: 'Event title is required.' });
    if (!startsAt || startsAt < Date.now() - 60000) return res.status(400).json({ error: 'Pick a future start time.' });
    const durationMin = Math.max(5, Math.min(Number(req.body?.durationMin) || 60, 1440));
    const ev: ScheduledEvent = {
      id: uid('event'), communityId: req.params.id, title,
      description: req.body?.description ? String(req.body.description).trim().slice(0, 400) : undefined,
      startsAt, endsAt: startsAt + durationMin * 60000,
      hostId: me.id, hostName: me.name || me.username || 'User',
      rsvps: [{ userId: me.id, status: 'yes', at: Date.now() }], createdAt: Date.now(),
    };
    const s = store.load();
    s.events = s.events || [];
    s.events.push(ev);
    store.persist();
    res.json({ event: ev });
  });

  app.post('/api/communities/:id/events/:eid/rsvp', requireAuth, (req, res) => {
    const me = (req as any).user;
    const status = ['yes', 'maybe', 'no'].includes(req.body?.status) ? req.body.status : 'yes';
    const s = store.load();
    s.events = s.events || [];
    const ev = s.events.find((e) => e.id === req.params.eid && e.communityId === req.params.id);
    if (!ev) return res.status(404).json({ error: 'Event not found.' });
    ev.rsvps = ev.rsvps.filter((r) => r.userId !== me.id);
    ev.rsvps.push({ userId: me.id, status, at: Date.now() });
    store.persist();
    res.json({ event: ev, yesCount: ev.rsvps.filter((r) => r.status === 'yes').length });
  });

  // --- User stats -------------------------------------------------------------------------------
  app.get('/api/communities/:id/stats', requireAuth, (req, res) => {
    const s = store.load();
    s.events = s.events || [];
    const now = Date.now();
    res.json({
      voiceRooms: s.voice.filter((v) => v.communityId === req.params.id).length,
      stages: s.stages.filter((x) => x.communityId === req.params.id).length,
      threads: s.threads.filter((x) => x.communityId === req.params.id).length,
      events: s.events.filter((x) => x.communityId === req.params.id && x.startsAt >= now).length,
    });
  });
}
