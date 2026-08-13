/**
 * Ocean — Snap Map backend (feature #258)
 * ----------------------------------------
 * Snapchat-style location layer on top of Stories 2.0 (#249):
 *   POST /api/map/me/location          share / hide my location (opt-in, explicit)
 *   GET  /api/map/me/location          my shared location + visibility
 *   GET  /api/map/stories              nearby public stories w/ distance (heatmap data)
 *   GET  /api/map/heat                 [{ lat, lng, intensity }] for the map overlay
 *   POST /api/stories/private          create a private story visible only to recipients
 *   GET  /api/map/best-friends         computed from story views/reactions + post likes
 * State lives in snapmap.json; stories live in stories.json (shared store).
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';
import { getStoriesStore, type Story } from './turtleStoriesBackend';

interface MapState {
  locations: { userId: string; lat: number; lng: number; label: string; at: number }[];
  interactions: { a: string; b: string; weight: number }[];
}

const store = makeJsonStore<MapState>('snapmap.json', () => ({ locations: [], interactions: [] }));

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function registerSnapMapRoutes(app: express.Express) {
  const { requireAuth, loadDatabase } = getCtx();

  // --- Share / hide location (opt-in) ---------------------------------------------
  app.post('/api/map/me/location', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (req.body?.visible === false || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      s.locations = s.locations.filter((l) => l.userId !== me.id);
      store.persist();
      return res.json({ visible: false, note: 'Location hidden.' });
    }
    const label = String(req.body?.label || me.name || me.username || 'Me').slice(0, 40);
    const existing = s.locations.find((l) => l.userId === me.id);
    if (existing) { existing.lat = lat; existing.lng = lng; existing.label = label; existing.at = Date.now(); }
    else s.locations.push({ userId: me.id, lat, lng, label, at: Date.now() });
    store.persist();
    res.json({ visible: true, location: s.locations.find((l) => l.userId === me.id) });
  });

  app.get('/api/map/me/location', requireAuth, (req, res) => {
    const me = (req as any).user;
    const location = store.load().locations.find((l) => l.userId === me.id) || null;
    res.json({ location, visible: !!location });
  });

  // --- Nearby public stories -------------------------------------------------------------
  app.get('/api/map/stories', requireAuth, (req, res) => {
    const me = (req as any).user;
    const stories = getStoriesStore().load().stories;
    const now = Date.now();
    const myLoc = store.load().locations.find((l) => l.userId === me.id);
    const radius = Math.min(500, Math.max(1, Number(req.query.radius) || 100));
    const near = stories
      .filter((st: Story) => st.expiresAt > now && !st.private && st.location && !st.closeFriends)
      .map((st: Story) => {
        const d = myLoc ? distKm(myLoc.lat, myLoc.lng, st.location!.lat, st.location!.lng) : null;
        return { id: st.id, userId: st.userId, userName: st.userName, mediaUrl: st.mediaUrl, kind: st.kind, lat: st.location!.lat, lng: st.location!.lng, label: st.location!.label || '', distanceKm: d, at: st.createdAt, viewed: st.viewers.some((v) => v.userId === me.id) };
      })
      .filter((s: { distanceKm: number | null }) => s.distanceKm === null || s.distanceKm <= radius)
      .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
      .slice(0, 100);
    res.json({ stories: near, myLocation: myLoc, radius });
  });

  // --- Heatmap --------------------------------------------------------------------------------
  app.get('/api/map/heat', requireAuth, (_req, res) => {
    const stories = getStoriesStore().load().stories;
    const now = Date.now();
    const heat = stories
      .filter((st: Story) => st.expiresAt > now && st.location && !st.private)
      .map((st: Story) => ({ lat: st.location!.lat, lng: st.location!.lng, intensity: Math.min(1, st.viewers.length / 50), storyId: st.id }));
    res.json({ heat });
  });

  // --- Private story (recipients only) ------------------------------------------------------------
  app.post('/api/stories/private', requireAuth, (req, res) => {
    const me = (req as any).user;
    const { mediaUrl, kind, caption } = req.body || {};
    const recipientIds = Array.isArray(req.body?.recipientIds) ? req.body.recipientIds.slice(0, 20).map(String) : [];
    if (!mediaUrl || typeof mediaUrl !== 'string' || !mediaUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'A story requires a mediaUrl from /api/upload.' });
    }
    if (recipientIds.length === 0) return res.status(400).json({ error: 'Pick at least one recipient.' });
    const db = loadDatabase();
    const story: Story = {
      id: uid('story'),
      userId: me.id,
      userName: me.name || me.username || 'User',
      mediaUrl,
      kind: kind === 'video' ? 'video' : 'image',
      caption: String(caption || '').slice(0, 200),
      closeFriends: false,
      private: true,
      recipientIds,
      viewers: [],
      reactions: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    getStoriesStore().load().stories.unshift(story);
    getStoriesStore().persist();
    res.json({ story, note: `Sent privately to ${recipientIds.length} recipient(s) — only they (and you) can see it.` });
  });

  // --- Best friends graph -------------------------------------------------------------------------
  app.get('/api/map/best-friends', requireAuth, (req, res) => {
    const me = (req as any).user;
    const db = loadDatabase();
    const weights = new Map<string, number>();

    const bump = (uid2: string, w: number) => {
      if (!uid2 || uid2 === me.id) return;
      weights.set(uid2, (weights.get(uid2) || 0) + w);
    };

    // story views + reactions (stories.json)
    const stories = getStoriesStore().load().stories;
    for (const st of stories) {
      if (st.userId === me.id) {
        st.viewers.forEach((v) => bump(v.userId, 3));
        st.reactions.forEach((r) => bump(r.userId, 4));
      } else if (st.viewers.some((v) => v.userId === me.id)) {
        bump(st.userId, 2);
      }
    }
    // post likes (database.json)
    for (const p of db?.posts || []) {
      if (p.userId === me.id) (p.likedBy || []).forEach((u: string) => bump(u, 2));
      else if ((p.likedBy || []).includes(me.id)) bump(p.userId, 1);
    }
    // explicit tags
    for (const it of store.load().interactions) {
      if (it.a === me.id) bump(it.b, 5);
      if (it.b === me.id) bump(it.a, 5);
    }
    // mutual friends get a base weight
    const meRec = (db?.users || []).find((u: any) => u.id === me.id);
    for (const f of meRec?.friends || []) {
      const other = (db?.users || []).find((u: any) => u.id === f);
      if (other?.friends?.includes(me.id)) bump(f, 2);
    }

    const list = [...weights.entries()]
      .map(([id, weight]) => {
        const u = (db?.users || []).find((x: any) => x.id === id);
        return { userId: id, name: u?.name || u?.username || 'User', weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);
    res.json({ bestFriends: list });
  });

  // --- Explicit interaction tag (bump) ------------------------------------------------------------
  app.post('/api/map/interaction', requireAuth, (req, res) => {
    const me = (req as any).user;
    const other = String(req.body?.userId || '');
    if (!other || other === me.id) return res.status(400).json({ error: 'Invalid user.' });
    const s = store.load();
    const row = s.interactions.find((i) => i.a === me.id && i.b === other);
    if (row) row.weight += 1;
    else s.interactions.push({ a: me.id, b: other, weight: 1 });
    if (s.interactions.length > 500) s.interactions = s.interactions.slice(-500);
    store.persist();
    res.json({ ok: true });
  });
}
