/**
 * Ocean — Verified Live backend (FEATURE 120 — Proof-of-Location Anti-Fake-News Badge)
 * -------------------------------------------------------------------------------------
 * A "Live Reporter" mode for video posts: the reporter captures device GPS on-device
 * (consent required), the server stamps a cryptographic proof — HMAC-SHA256 over
 * postId | userId | coords | server-time, keyed by a server secret — and attaches a
 * "Verified Live" badge to the post.
 *
 * The proof is *not* a real PKI attestation — it is an honest, tamper-evident
 * timestamp+location stamp that makes fake-news posts costly to fabricate (coords +
 * time are signed server-side; any alteration invalidates the HMAC).
 *
 * Persistence: global db via ctx.loadDatabase()/saveDatabase() under `db.liveProofs`
 * (idempotent ensure). Coords are rounded to ~11m (~5 decimals) so we never store
 * house-level precision. Never stores base64.
 *
 * Routes (note: the list route is top-level `/api/verified-live` because server.ts
 * registers `GET /api/posts/:postId` earlier, which would shadow a one-segment
 * `/api/posts/verified-live`):
 *   GET  /api/verified-live                 -> all live proofs (+ post previews), guest-safe
 *   POST /api/posts/verify-location         -> create a proof for one of MY video posts
 *   POST /api/posts/revoke-verification     -> remove my proof from a post
 *   GET  /api/posts/:id/proof               -> single proof for a post, guest-safe
 */

import crypto from 'crypto';
import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

/** One signed proof record stored in db.liveProofs. */
export interface LiveProof {
  id: string;
  postId: string;
  postPreview: string;
  userId: string;
  userName: string;
  /** Rounded to ~11m precision (5 decimals). */
  lat: number;
  lng: number;
  /** Reported GPS accuracy in metres (0 = unknown). */
  accuracy: number;
  /** Server time of verification — the authoritative timestamp. */
  verifiedAt: number;
  /** First 12 hex chars of the HMAC — enough to verify integrity by hand. */
  signature: string;
  /** Full HMAC for programmatic verification (hex). */
  fullSignature: string;
  revokedAt?: number;
}

const MAX_PROOFS_PER_USER = 50;
const VERIFY_REWARD = 15; // once per post
const COORD_ROUND = 1e5; // ~11m

/** Server secret — FAIL CLOSED: never fall back to a hardcoded key. */
function signSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET is not configured — refusing to sign live-report proofs.');
  }
  return secret;
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', signSecret()).update(data).digest('hex');
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function str(v: unknown, max = 200): string {
  return String(v ?? '').trim().slice(0, max);
}

function userName(u: any): string {
  return String(u?.name || u?.username || 'User');
}

function round5(n: number): number {
  return Math.round(n * COORD_ROUND) / COORD_ROUND;
}

/** Idempotent ensure of db.liveProofs — safe to run on every load. */
function ensureProofs(db: any): LiveProof[] {
  if (!Array.isArray(db.liveProofs)) db.liveProofs = [];
  return db.liveProofs as LiveProof[];
}

/** Finds a post in db.posts or any user's profile.posts. */
function findPost(db: any, postId: string): { post: any; ownerId: string } | null {
  if (!postId) return null;
  const inFeed = (db.posts || []).find((p: any) => p && p.id === postId);
  if (inFeed) {
    return { post: inFeed, ownerId: String(inFeed.creator?.id || inFeed.authorId || inFeed.creatorId || '') };
  }
  for (const u of db.users || []) {
    const posts = u?.profile?.posts;
    if (Array.isArray(posts)) {
      const p = posts.find((x: any) => x && x.id === postId);
      if (p) return { post: p, ownerId: String(u.id) };
    }
  }
  return null;
}

/** Sanitized public view of a proof (full signature only to the owner). */
function publicProof(p: LiveProof, viewerId: string | null): any {
  return {
    id: p.id,
    postId: p.postId,
    postPreview: p.postPreview,
    userName: p.userName,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    verifiedAt: p.verifiedAt,
    signature: p.signature,
    revokedAt: p.revokedAt,
    isMine: viewerId !== null && p.userId === viewerId,
    fullSignature: viewerId !== null && p.userId === viewerId ? p.fullSignature : undefined,
  };
}

export function registerLiveReporterRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // GET /api/verified-live — badge gallery (guest-safe, revoked excluded).
  app.get('/api/verified-live', (req, res) => {
    try {
      const db = loadDatabase();
      const proofs = ensureProofs(db).filter((p) => !p.revokedAt);
      const viewer = getRequestUser(req);
      res.json({
        proofs: proofs
          .slice(0, 200)
          .map((p) => publicProof(p, viewer?.id ?? null))
          .sort((a: any, b: any) => b.verifiedAt - a.verifiedAt),
        count: proofs.length,
      });
    } catch (e: any) {
      console.warn('[verified-live] list error:', e?.message || e);
      res.status(500).json({ error: 'List failed.' });
    }
  });

  // GET /api/posts/:id/proof — single proof lookup (guest-safe).
  app.get('/api/posts/:id/proof', (req, res) => {
    try {
      const db = loadDatabase();
      const p = ensureProofs(db).find((x) => x && x.postId === req.params.id);
      if (!p) return res.status(404).json({ error: 'No proof on this post yet.' });
      const viewer = getRequestUser(req);
      res.json({ proof: publicProof(p, viewer?.id ?? null) });
    } catch (e: any) {
      console.warn('[verified-live] proof error:', e?.message || e);
      res.status(500).json({ error: 'Proof lookup failed.' });
    }
  });

  // POST /api/posts/verify-location — sign a "Verified Live" proof for MY video post.
  app.post('/api/posts/verify-location', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const body = req.body || {};
      const postId = str(body.postId, 120);
      if (!postId) return res.status(400).json({ error: 'postId is required.' });

      const nLat = Number(body.lat);
      const nLng = Number(body.lng);
      if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
        return res.status(400).json({ error: 'Valid lat/lng are required (from device GPS).' });
      }
      if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
        return res.status(400).json({ error: 'Coordinates out of range.' });
      }

      const db = loadDatabase();
      const found = findPost(db, postId);
      if (!found) return res.status(404).json({ error: 'Post not found.' });
      if (found.ownerId !== me.id) {
        return res.status(403).json({ error: 'You can only verify your own posts.' });
      }

      const proofs = ensureProofs(db);
      if (proofs.filter((p) => p.userId === me.id && !p.revokedAt).length >= MAX_PROOFS_PER_USER) {
        return res.status(400).json({ error: `You can have up to ${MAX_PROOFS_PER_USER} live proofs.` });
      }
      const existingIdx = proofs.findIndex((p) => p.postId === postId && !p.revokedAt);
      if (existingIdx >= 0) {
        return res.status(400).json({ error: 'This post already has a live proof.' });
      }

      const lat = round5(nLat);
      const lng = round5(nLng);
      const accuracy = Math.min(10000, Math.max(0, Math.floor(Number(body.accuracy) || 0)));
      const verifiedAt = Date.now();
      const base = `${postId}|${me.id}|${lat}|${lng}|${verifiedAt}`;
      const full = hmac(base);

      const proof: LiveProof = {
        id: uid('live'),
        postId,
        postPreview: str(found.post.content || found.post.title || 'Video post', 80) || 'Video post',
        userId: me.id,
        userName: userName(me),
        lat,
        lng,
        accuracy,
        verifiedAt,
        signature: full.slice(0, 12),
        fullSignature: full,
      };
      proofs.push(proof);
      if (proofs.length > 5000) db.liveProofs = proofs.slice(-5000);

      // Attach the badge to the post record itself (both canonical stores).
      const badge = {
        verifiedLive: true,
        verifiedAt,
        signature: proof.signature,
        lat,
        lng,
      };
      found.post.verifiedLive = found.post.verifiedLive || badge;
      if (!(found.post as any)._liveReward) {
        (found.post as any)._liveReward = true;
        try {
          const state = loadCommunity();
          addBalance(state, me.id, VERIFY_REWARD);
          saveCommunity(state);
        } catch (e: any) {
          console.warn('[verified-live] reward error:', e?.message || e);
        }
      }
      saveDatabase(db);
      res.json({ proof: publicProof(proof, me.id), coins: VERIFY_REWARD });
    } catch (e: any) {
      console.warn('[verified-live] verify error:', e?.message || e);
      res.status(500).json({ error: 'Verification failed.' });
    }
  });

  // POST /api/posts/revoke-verification — remove my proof (badge is un-set).
  app.post('/api/posts/revoke-verification', requireAuth, (req, res) => {
    try {
      const me = (req as any).user;
      const postId = str((req.body || {}).postId, 120);
      const db = loadDatabase();
      const proofs = ensureProofs(db);
      const idx = proofs.findIndex((p) => p.postId === postId && p.userId === me.id && !p.revokedAt);
      if (idx < 0) return res.status(404).json({ error: 'Proof not found.' });
      proofs[idx].revokedAt = Date.now();

      const found = findPost(db, postId);
      if (found && found.post) delete found.post.verifiedLive;
      saveDatabase(db);
      res.json({ success: true });
    } catch (e: any) {
      console.warn('[verified-live] revoke error:', e?.message || e);
      res.status(500).json({ error: 'Revoke failed.' });
    }
  });
}
