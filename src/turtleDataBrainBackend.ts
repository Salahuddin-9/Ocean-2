/**
 * Ocean — Data + AI Brain backend (feature #260)
 * -----------------------------------------------
 * Recommendation observability + Creator Analytics 2.0 + data-warehouse export:
 *   POST /api/data/brain/events            log a ranking/interaction event
 *   GET  /api/data/brain/events            my recent events (?type=, ?limit=)
 *   GET  /api/data/brain/stats             totals by type + daily sparkline + top items
 *   DELETE /api/data/brain/events          clear my events
 *   GET  /api/analytics/creators?userId=   deep creator analytics (posts, likes, comments,
 *                                          story views, gifts, tips, engagement rate)
 *   POST /api/data/export                  write a JSON export of my data → download
 *   GET  /api/data/warehouse               list my previous exports
 * Events live in databrain.json; exported files land in exports/.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';
import { getStoriesStore, type Story } from './turtleStoriesBackend';

export interface BrainEvent {
  id: number;
  type: string;
  itemId?: string;
  itemType?: string;
  userId: string;
  meta?: Record<string, unknown>;
  at: number;
}

interface BrainStore { events: BrainEvent[]; exports: { id: string; userId: string; file: string; size: number; at: number }[] }

const store = makeJsonStore<BrainStore>('databrain.json', () => ({ events: [], exports: [] }));

const VALID_TYPES = ['view', 'reaction', 'impression', 'click', 'share', 'gift', 'story_view', 'follow', 'search'];

export function registerDataBrainRoutes(app: express.Express) {
  const { requireAuth, loadDatabase, loadCommunity } = getCtx();

  const EXPORT_DIR = path.join(process.cwd(), 'exports');

  // --- Log events ---------------------------------------------------------------------
  app.post('/api/data/brain/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const type = String(req.body?.type || 'view');
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` });
    const s = store.load();
    const ev: BrainEvent = {
      id: s.events.length ? s.events[s.events.length - 1].id + 1 : 1,
      type,
      itemId: req.body?.itemId ? String(req.body.itemId).slice(0, 80) : undefined,
      itemType: ['post', 'reel', 'story'].includes(req.body?.itemType) ? req.body.itemType : 'post',
      userId: me.id,
      meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : undefined,
      at: Date.now(),
    };
    s.events.push(ev);
    if (s.events.length > 5000) s.events.splice(0, s.events.length - 5000);
    store.persist();
    res.json({ event: ev });
  });

  app.get('/api/data/brain/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const type = (req.query.type as string) || '';
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    let events = store.load().events.filter((e) => e.userId === me.id);
    if (type) events = events.filter((e) => e.type === type);
    events = events.slice(-limit).reverse();
    res.json({ events });
  });

  app.get('/api/data/brain/stats', requireAuth, (req, res) => {
    const me = (req as any).user;
    const events = store.load().events.filter((e) => e.userId === me.id);
    const byType: Record<string, number> = {};
    for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1;
    // daily sparkline (last 7 days)
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const dayStart = new Date(d.setHours(0, 0, 0, 0)).getTime();
      const dayEnd = dayStart + 86400000;
      days.push({ day: key, count: events.filter((e) => e.at >= dayStart && e.at < dayEnd).length });
    }
    const topItems = new Map<string, number>();
    for (const e of events) {
      if (e.itemId) {
        const k = `${e.itemType}:${e.itemId}`;
        topItems.set(k, (topItems.get(k) || 0) + 1);
      }
    }
    res.json({
      total: events.length,
      byType,
      days,
      topItems: [...topItems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([item, count]) => ({ item, count })),
    });
  });

  app.delete('/api/data/brain/events', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    s.events = s.events.filter((e) => e.userId !== me.id);
    store.persist();
    res.json({ cleared: true });
  });

  // --- Creator Analytics 2.0 ---------------------------------------------------------------
  app.get('/api/analytics/creators', requireAuth, (req, res) => {
    const me = (req as any).user;
    const creatorId = (req.query.userId as string) || me.id;
    const db = loadDatabase();
    const community = loadCommunity();

    const posts = (db?.posts || []).filter((p: any) => p.userId === creatorId);
    const totalLikes = posts.reduce((a: number, p: any) => a + (Array.isArray(p.likedBy) ? p.likedBy.length : 0) + (Number(p.likes) || 0), 0);
    const totalComments = posts.reduce((a: number, p: any) => a + (Array.isArray(p.comments) ? p.comments.length : 0), 0);

    const stories = getStoriesStore().load().stories.filter((s: Story) => s.userId === creatorId);
    const storyViews = stories.reduce((a: number, s: Story) => a + s.viewers.length, 0);
    const storyReactions = stories.reduce((a: number, s: Story) => a + s.reactions.length, 0);

    const tips = (community.tips || []).filter((t: any) => t.to === creatorId);
    const tipTotal = tips.reduce((a: number, t: any) => a + (t.amount || 0), 0);

    let giftTotal = 0;
    try {
      const livePath = path.join(process.cwd(), 'liveeco.json');
      if (fs.existsSync(livePath)) {
        const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));
        giftTotal = (live.gifts || []).filter((g: any) => g.to === creatorId).reduce((a: number, g: any) => a + (g.cost || 0), 0);
      }
    } catch { /* noop */ }

    const engagement = posts.length ? Math.round(((totalLikes + totalComments) / posts.length) * 10) / 10 : 0;

    res.json({
      creatorId,
      posts: posts.length,
      totalLikes,
      totalComments,
      storyViews,
      storyReactions,
      tips: tipTotal,
      gifts: giftTotal,
      engagementPerPost: engagement,
      walletBalance: community.balances[creatorId] || 0,
      perPost: posts.slice(0, 10).map((p: any) => ({
        id: p.id,
        content: String(p.content || '').slice(0, 60),
        likes: Array.isArray(p.likedBy) ? p.likedBy.length : 0,
        comments: Array.isArray(p.comments) ? p.comments.length : 0,
      })),
    });
  });

  // --- Metabase embedding (features #255 / #260) --------------------------------------------------
  // Mints an HS256-signed embed token (standard Metabase JWT embedding) when
  // METABASE_SITE_URL + METABASE_SECRET_KEY are configured.
  app.get('/api/metabase/token', requireAuth, (req, res) => {
    const siteUrl = process.env.METABASE_SITE_URL;
    const secret = process.env.METABASE_SECRET_KEY;
    if (!siteUrl || !secret) {
      return res.json({ configured: false, note: 'Set METABASE_SITE_URL + METABASE_SECRET_KEY (Metabase → Admin → Embedding → JWT).' });
    }
    const dashboard = Math.max(1, Math.floor(Number(req.query.dashboard) || 1));
    const token = jwt.sign(
      { resource: { dashboard }, params: {}, exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
      { algorithm: 'HS256' }
    );
    res.json({
      configured: true,
      embedUrl: `${siteUrl.replace(/\/$/, '')}/embed/dashboard/${token}#bordered=false&titled=false&locale=en`,
      expiresIn: 3600,
      dashboardId: dashboard,
    });
  });

  // --- Data warehouse export ------------------------------------------------------------------
  app.post('/api/data/export', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const community = loadCommunity();
    const myEvents = store.load().events.filter((e) => e.userId === me.id);
    const meRec = (db?.users || []).find((u: any) => u.id === me.id);

    const payload = {
      exportedAt: new Date().toISOString(),
      user: { id: me.id, name: meRec?.name || me.name, username: meRec?.username || me.username },
      wallet: { balance: community.balances[me.id] || 0, tipsSent: (community.tips || []).filter((t: any) => t.from === me.id).length },
      events: myEvents,
      posts: (db?.posts || []).filter((p: any) => p.userId === me.id).map((p: any) => ({ id: p.id, content: p.content, likes: Array.isArray(p.likedBy) ? p.likedBy.length : 0 })),
      stories: getStoriesStore().load().stories.filter((s: Story) => s.userId === me.id),
    };

    if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const file = `export-${me.id}-${Date.now()}.json`;
    const filePath = path.join(EXPORT_DIR, file);
    const raw = JSON.stringify(payload, null, 2);
    fs.writeFileSync(filePath, raw, 'utf8');

    store.load().exports.unshift({ id: `x-${Date.now()}`, userId: me.id, file, size: raw.length, at: Date.now() });
    store.persist();

    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.type('application/json');
    res.send(raw);
  });

  app.get('/api/data/warehouse', requireAuth, (req, res) => {
    const me = (req as any).user;
    const exports = store.load().exports.filter((e) => e.userId === me.id);
    res.json({ exports });
  });
}
