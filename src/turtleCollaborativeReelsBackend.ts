/**
 * Ocean — Collaborative Reels backend
 * ------------------------------------
 * Multiple co-creators build ONE reel together. A collab reel is owned by the
 * user who created it and edited by any co-creator (invited via code or by
 * joining directly with the collabId). Each collab reel carries a stack of
 * elements (clips / sounds / captions / effects) that any co-creator may append.
 *
 * Published collabs surface in a guest-safe mini feed scored by views over
 * recency. Views are attributed through a SEPARATE route (POST view) so the feed
 * read never inflates counters; each attributed view rewards EVERY co-creator
 * with 1 coin from the community.json wallet.
 *
 * Routes (all under /api/reels/*):
 *   POST /api/reels/collab                 create a collab (owner = caller)
 *   GET  /api/reels/collab                 list collabs I create/edit
 *   GET  /api/reels/collab/:id             one collab (+ creatorsResolved)
 *   POST /api/reels/collab/:id/element     append an element (any co-creator)
 *   POST /api/reels/collab/:id/publish     set status=published (any co-creator)
 *   POST /api/reels/collab/:id/view        attribute a view + reward every creator
 *   POST /api/reels/join                   join by collabId or inviteCode
 *   POST /api/reels/invite                 generate an invite code (must be creator)
 *   GET  /api/reels/feed                   guest-safe published mini-feed
 *
 * State lives in the global db under db.collabReels (idempotent ensure).
 * Coins are awarded via turtleCommunityBackend.addBalance on loadCommunity().
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

export type CollabElementKind = 'clip' | 'sound' | 'caption' | 'effect';

export interface CollabElement {
  id: string;
  kind: CollabElementKind;
  by: string;
  byName?: string;
  addedAt: number;
  data: Record<string, unknown>;
}

export interface CollabInviteToken {
  code: string;
  role: string;
  expiresAt: number;
}

export interface CollabReel {
  id: string;
  reelId?: string; // link to an existing reel/post if any
  title: string;
  description?: string;
  creatorIds: string[];
  ownerId: string;
  inviteTokens: CollabInviteToken[];
  elements: CollabElement[];
  status: 'draft' | 'published';
  createdAt: number;
  updatedAt: number;
  viewCount: number;
  likeCount: number;
  publishedAt?: number;
}

export interface CreatorRef {
  id: string;
  name: string;
  avatar: string;
}

const ELEMENT_KINDS: CollabElementKind[] = ['clip', 'sound', 'caption', 'effect'];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ELEMENTS = 500;
const MAX_INVITE_TOKENS = 20;
const FEED_LIMIT = 50;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function makeInviteCode(): string {
  return `CR-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
}

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollection(db: any): void {
  if (!Array.isArray(db.collabReels)) db.collabReels = [];
}

/** Sanitize per-kind element data — keeps only known fields, caps string length. */
function sanitizeElementData(kind: CollabElementKind, raw: unknown): Record<string, unknown> {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 1000): string => (typeof v === 'string' ? v.slice(0, max) : '');
  const out: Record<string, unknown> = {};
  if (kind === 'clip') {
    out.url = str(rec.url, 500);
    out.title = str(rec.title, 200);
    out.thumbnail = str(rec.thumbnail, 500);
  } else if (kind === 'sound') {
    out.name = str(rec.name, 200);
    out.url = str(rec.url, 500);
  } else if (kind === 'caption') {
    out.text = str(rec.text, 500);
  } else if (kind === 'effect') {
    out.name = str(rec.name, 200);
    if (typeof rec.intensity === 'number') {
      out.intensity = Math.min(Math.max(rec.intensity, 0), 100);
    }
  }
  return out;
}

/** Resolve creatorIds into { id, name, avatar } refs from db.users (defensive). */
function resolveCreators(db: any, ids: string[]): CreatorRef[] {
  const users = Array.isArray(db.users) ? db.users : [];
  return ids.map((id) => {
    const u = users.find((x: any) => x && x.id === id);
    return {
      id,
      name: u?.name || u?.username || 'Creator',
      avatar: u?.profile?.avatarUrl || '',
    };
  });
}

function withCreators(db: any, reel: CollabReel): CollabReel & { creatorsResolved: CreatorRef[] } {
  return { ...reel, creatorsResolved: resolveCreators(db, reel.creatorIds) };
}

/** Feed score: views weighted down by how long ago the collab was published. */
function liveFeedScore(reel: CollabReel): number {
  const base = reel.publishedAt || reel.createdAt;
  const ageHours = Math.max(0, (Date.now() - base) / 3600000);
  return reel.viewCount / Math.pow(ageHours + 2, 1.5);
}

/** Defensive normalization — reads every optional field with a safe default. */
function normalizeReel(raw: any): CollabReel | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : '',
    reelId: typeof raw.reelId === 'string' && raw.reelId ? raw.reelId : undefined,
    title: typeof raw.title === 'string' && raw.title ? raw.title : 'Untitled collab',
    description: typeof raw.description === 'string' && raw.description ? raw.description : undefined,
    creatorIds: Array.isArray(raw.creatorIds) ? raw.creatorIds.filter((x: any) => typeof x === 'string') : [],
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : '',
    inviteTokens: Array.isArray(raw.inviteTokens)
      ? raw.inviteTokens.filter((t: any) => t && typeof t.code === 'string')
      : [],
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    status: raw.status === 'published' ? 'published' : 'draft',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    viewCount: typeof raw.viewCount === 'number' ? raw.viewCount : 0,
    likeCount: typeof raw.likeCount === 'number' ? raw.likeCount : 0,
    publishedAt: typeof raw.publishedAt === 'number' ? raw.publishedAt : undefined,
  };
}

export function registerCollaborativeReelsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = getCtx();

  // Create a collaborative reel (owner = caller).
  app.post('/api/reels/collab', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as any;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const now = Date.now();
    const reel: CollabReel = {
      id: uid('collab'),
      reelId: typeof body.reelId === 'string' && body.reelId ? body.reelId : undefined,
      title: title.slice(0, 120),
      description:
        typeof body.description === 'string' && body.description.trim()
          ? body.description.trim().slice(0, 1000)
          : undefined,
      creatorIds: [user.id],
      ownerId: user.id,
      inviteTokens: [],
      elements: [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      viewCount: 0,
      likeCount: 0,
    };
    const db = loadDatabase();
    ensureCollection(db);
    db.collabReels.push(reel);
    saveDatabase(db);
    res.json({ collab: withCreators(db, reel) });
  });

  // List collabs the caller creates or edits (each with creatorsResolved).
  app.get('/api/reels/collab', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.collabReels as any[])
      .map(normalizeReel)
      .filter((r: CollabReel | null): r is CollabReel => !!r && r.creatorIds.includes(user.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 200);
    res.json({ collabs: mine.map((r) => withCreators(db, r)) });
  });

  // One collab with creatorsResolved (any authenticated user may read it).
  app.get('/api/reels/collab/:id', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const reel = normalizeReel((db.collabReels as any[]).find((r: any) => r && r.id === req.params.id));
    if (!reel) return res.status(404).json({ error: 'Collab not found.' });
    res.json({ collab: withCreators(db, reel) });
  });

  // Append an element (any co-creator may edit).
  app.post('/api/reels/collab/:id/element', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as any;
    const kind: CollabElementKind = body.kind;
    if (!ELEMENT_KINDS.includes(kind)) {
      return res.status(400).json({ error: 'kind must be one of: clip, sound, caption, effect.' });
    }
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.collabReels as any[];
    const idx = list.findIndex((r: any) => r && r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Collab not found.' });
    const reel = normalizeReel(list[idx]);
    if (!reel.creatorIds.includes(user.id)) {
      return res.status(403).json({ error: 'Only co-creators can edit this collab.' });
    }
    if (reel.elements.length >= MAX_ELEMENTS) {
      return res.status(400).json({ error: 'This collab already has the max number of elements.' });
    }
    const element: CollabElement = {
      id: uid('el'),
      kind,
      by: user.id,
      byName: user.name || user.username || 'Creator',
      addedAt: Date.now(),
      data: sanitizeElementData(kind, body.data),
    };
    reel.elements.push(element);
    reel.updatedAt = element.addedAt;
    list[idx] = reel;
    saveDatabase(db);
    res.json({ element, collab: withCreators(db, reel) });
  });

  // Publish a collab (any co-creator).
  app.post('/api/reels/collab/:id/publish', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.collabReels as any[];
    const idx = list.findIndex((r: any) => r && r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Collab not found.' });
    const reel = normalizeReel(list[idx]);
    if (!reel.creatorIds.includes(user.id)) {
      return res.status(403).json({ error: 'Only co-creators can publish this collab.' });
    }
    reel.status = 'published';
    reel.publishedAt = reel.publishedAt || Date.now();
    reel.updatedAt = Date.now();
    list[idx] = reel;
    saveDatabase(db);
    res.json({ collab: withCreators(db, reel) });
  });

  // Attribute a view: increment viewCount AND reward every co-creator with 1 coin.
  app.post('/api/reels/collab/:id/view', requireAuth, (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.collabReels as any[];
    const idx = list.findIndex((r: any) => r && r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Collab not found.' });
    const reel = normalizeReel(list[idx]);
    reel.viewCount += 1;
    reel.updatedAt = Date.now();
    list[idx] = reel;
    saveDatabase(db);

    const state = loadCommunity();
    const users = Array.isArray(db.users) ? db.users : [];
    const rewards: { userId: string; name: string; balance: number }[] = [];
    reel.creatorIds.forEach((cid) => {
      const balance = addBalance(state, cid, 1);
      const u = users.find((x: any) => x && x.id === cid);
      rewards.push({ userId: cid, name: u?.name || u?.username || 'Creator', balance });
    });
    saveCommunity(state);

    res.json({ viewCount: reel.viewCount, rewards, totalRewarded: rewards.length });
  });

  // Join a collab — by collabId directly, or by a valid invite code.
  app.post('/api/reels/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as any;
    const collabId = typeof body.collabId === 'string' ? body.collabId : '';
    const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
    if (!collabId && !inviteCode) {
      return res.status(400).json({ error: 'Provide collabId or inviteCode.' });
    }
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.collabReels as any[];
    const idx = list.findIndex((r: any) => {
      if (!r) return false;
      if (collabId && r.id === collabId) return true;
      if (inviteCode && Array.isArray(r.inviteTokens)) {
        return r.inviteTokens.some(
          (t: any) => t && t.code === inviteCode && (typeof t.expiresAt === 'number' ? t.expiresAt : Infinity) > Date.now()
        );
      }
      return false;
    });
    if (idx === -1) {
      return inviteCode
        ? res.status(404).json({ error: 'Invite code invalid or expired.' })
        : res.status(404).json({ error: 'Collab not found.' });
    }
    const reel = normalizeReel(list[idx]);
    if (!reel.creatorIds.includes(user.id)) {
      reel.creatorIds.push(user.id);
    }
    reel.updatedAt = Date.now();
    list[idx] = reel;
    saveDatabase(db);
    res.json({ collab: withCreators(db, reel) });
  });

  // Generate an invite code (caller must already be a creator of the collab).
  app.post('/api/reels/invite', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = (req.body || {}) as any;
    const collabId = typeof body.collabId === 'string' ? body.collabId : '';
    if (!collabId) return res.status(400).json({ error: 'collabId is required.' });
    const role = typeof body.role === 'string' && body.role ? body.role.slice(0, 40) : 'editor';
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.collabReels as any[];
    const idx = list.findIndex((r: any) => r && r.id === collabId);
    if (idx === -1) return res.status(404).json({ error: 'Collab not found.' });
    const reel = normalizeReel(list[idx]);
    if (!reel.creatorIds.includes(user.id)) {
      return res.status(403).json({ error: 'Only co-creators can invite others.' });
    }
    // Drop expired codes and cap the token list.
    reel.inviteTokens = reel.inviteTokens.filter((t) => t.expiresAt > Date.now()).slice(-MAX_INVITE_TOKENS);
    const token: CollabInviteToken = {
      code: makeInviteCode(),
      role,
      expiresAt: Date.now() + INVITE_TTL_MS,
    };
    reel.inviteTokens.push(token);
    reel.updatedAt = Date.now();
    list[idx] = reel;
    saveDatabase(db);
    const host = req.get('host') || 'localhost:3000';
    res.json({ inviteCode: token.code, link: `${req.protocol}://${host}/reels/join/${token.code}` });
  });

  // Guest-safe published mini-feed, scored by views over recency.
  // Read-only: viewCount is NEVER mutated here — attribution happens via POST .../view.
  app.get('/api/reels/feed', (req, res) => {
    getRequestUser(req); // guest-safe: resolves a bearer token if present, never required
    const db = loadDatabase();
    ensureCollection(db);
    const published = (db.collabReels as any[])
      .map(normalizeReel)
      .filter((r: CollabReel | null): r is CollabReel => !!r && r.status === 'published')
      .sort((a, b) => liveFeedScore(b) - liveFeedScore(a))
      .slice(0, FEED_LIMIT);
    res.json({ collabs: published.map((r) => withCreators(db, r)) });
  });
}

export { sanitizeElementData };
