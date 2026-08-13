/**
 * Ocean — Data Sovereignty & Account Portability backend
 * -------------------------------------------------------
 * PRIVACY & SOVEREIGNTY feature (Batch B5 — feature 134 "Data Sovereignty").
 * Gives a user full ownership of their data: a data inventory, a portable
 * sanitized export bundle, an export-history log, and a self-service
 * "right to be forgotten" account-erasure flow with a 48h cool-down + one-time
 * confirmation token. Frontend: src/components/DataSovereigntyView.tsx.
 *
 * Privacy / security model:
 *  - Every route is requireAuth-guarded and every read is scoped to the
 *    authenticated user. Raw IP addresses are never persisted (sessions report
 *    ip:"masked"); nothing sensitive is ever logged.
 *  - The export is SANITIZED: recursive redaction strips password hashes,
 *    salts, DEK/words ciphertext wrappers, OTP/TOTP secrets, recovery phrases
 *    and token-bearing fields, and omits oversized base64 media blobs. The
 *    server stores no secrets to begin with — only hashes and ciphertext.
 *  - Account deletion is token-gated: POST /api/sovereignty/delete/request
 *    generates a one-time confirmation token (node:crypto randomBytes). Only a
 *    SHA-256 hash of that token is persisted (db.deletionRequests.tokenHash) —
 *    the raw token is returned exactly once and is never stored or logged.
 *    Confirmation is blocked until a 48h cool-down elapses (accidental-deletion
 *    protection); cancellation is allowed any time before confirmation; the
 *    request expires after 7 days.
 *  - Deletion purges the user record, their sessions, their posts and their
 *    comments/reactions; chat messages they sent are ANONYMIZED (text replaced,
 *    name -> "Deleted User") so other participants keep a readable history but
 *    the departing user's identity is erased.
 *
 * Persistence: db.sovereigntyExports = [ExportLogItem] and
 * db.deletionRequests = Record<userId, DeletionRequest> — idempotently ensured
 * + read defensively on every route.
 */

import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { getCtx } from './turtleServerContext';

// --- Tunables ----------------------------------------------------------------

const DELETION_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48h cool-down before confirm
const DELETION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // request expires after 7 days
const MAX_EXPORTS_LOG = 50; // per-user export history cap
const MAX_EXPORT_POSTS = 500;
const MAX_EXPORT_MESSAGES = 500;
const MAX_EXPORT_COMMENTS = 500;
const MAX_REASON_LEN = 240;
const MAX_OMITTED_MEDIA_LEN = 5000; // base64 blobs longer than this are omitted

// --- Types -------------------------------------------------------------------

export interface ExportLogItem {
  id: string;
  userId: string;
  requestedAt: number;
  status: 'generated';
}

export type DeletionStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';

export interface DeletionRequest {
  userId: string;
  tokenHash: string; // SHA-256 of the one-time confirmation token (never raw)
  reason?: string;
  requestedAt: number;
  status: DeletionStatus;
  confirmAfter: number; // requestedAt + cooldown
  expiresAt: number; // requestedAt + max age
  deletedAt?: number;
}

export interface DataSovereigntyState {
  exports: ExportLogItem[];
  deletionRequests: Record<string, DeletionRequest>;
}

// --- Helpers -----------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function sha256(s: string): string {
  return createHash('sha256').update(String(s)).digest('hex');
}

function truncate(s: unknown, max: number): string {
  const str = String(s ?? '');
  return str.length > max ? str.slice(0, max) : str;
}

/** Idempotent ensure of db.sovereigntyExports + db.deletionRequests. */
function ensureState(db: any): DataSovereigntyState {
  if (!Array.isArray(db.sovereigntyExports)) db.sovereigntyExports = [];
  if (!db.deletionRequests || typeof db.deletionRequests !== 'object' || Array.isArray(db.deletionRequests)) {
    db.deletionRequests = {};
  }
  return {
    exports: db.sovereigntyExports,
    deletionRequests: db.deletionRequests,
  };
}

/**
 * Recursively redact anything that looks like a credential or key-wrapping
 * secret, and omit oversized base64 media blobs. Never descends more than 8
 * levels; preserves structure everywhere else so the export stays readable.
 */
const SECRET_KEYS = new Set([
  'passwordhash', 'password', 'pass', 'salt', 'encrypteddek', 'encrypteddekiv',
  'encrypteddekmaster', 'encrypteddekmasteriv', 'encryptedwords', 'encryptedwordsiv',
  'otpsecret', 'totpsecret', 'totpsecretencrypted', 'recoveryphrase', 'seedphrase',
  'mnemonic', 'privatekey', 'privatekeypem', 'secretkey', 'sessiontoken',
  'refreshtoken', 'accesstoken', 'masterkey', 'dek', 'dekiv', 'jwt',
]);

function redactForExport(value: any, depth = 0): any {
  if (depth > 8) return undefined;
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') {
    // Omit oversized base64 media blobs (data: URIs and huge base64 strings).
    if (typeof value === 'string' && value.length > MAX_OMITTED_MEDIA_LEN) {
      return '[omitted-large-media]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactForExport(v, depth + 1));
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEYS.has(String(k).toLowerCase())) {
      out[k] = '[redacted]';
      continue;
    }
    if (typeof v === 'string' && v.length > MAX_OMITTED_MEDIA_LEN && /^data:/i.test(v)) {
      out[k] = '[omitted-base64-media]';
      continue;
    }
    out[k] = redactForExport(v, depth + 1);
  }
  return out;
}

function postSnippet(p: any): string {
  const s = String(p?.content || p?.title || '').trim();
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}

function userNameById(db: any, userId: string): string {
  const users = Array.isArray(db.users) ? db.users : [];
  const u = users.find((x: any) => x && x.id === userId);
  if (!u) return 'Unknown';
  return u.name || u.username || 'Unknown';
}

function myConversationIds(db: any, userId: string): Set<string> {
  const ids = new Set<string>();
  for (const c of Array.isArray(db.conversations) ? db.conversations : []) {
    if (c && Array.isArray(c.participants) && c.participants.includes(userId)) ids.add(c.id);
  }
  return ids;
}

function sessionCountFor(db: any, userId: string): number {
  let n = 0;
  if (db.sessions && typeof db.sessions === 'object') {
    for (const k of Object.keys(db.sessions)) {
      if (db.sessions[k] && db.sessions[k].userId === userId) n++;
    }
  }
  return n;
}

/**
 * Erase a user from the global db: remove their record, sessions and posts;
 * strip their comments, reactions, friendships/follows; anonymize their chat
 * messages so other participants keep a readable (de-identified) history.
 */
function performDeletion(db: any, userId: string): void {
  const users = Array.isArray(db.users) ? db.users : [];

  // 1. Remove the user record + scrub references on remaining users.
  db.users = users.filter((u: any) => u && u.id !== userId);
  for (const u of db.users) {
    for (const f of ['friends', 'following', 'friendRequestsReceived', 'friendRequestsSent'] as const) {
      if (Array.isArray(u[f])) u[f] = u[f].filter((id: any) => id !== userId);
    }
  }

  // 2. Remove their sessions.
  if (db.sessions && typeof db.sessions === 'object') {
    for (const k of Object.keys(db.sessions)) {
      if (db.sessions[k] && db.sessions[k].userId === userId) delete db.sessions[k];
    }
  }

  // 3. Remove their posts; strip their comments + reactions from every post.
  //    NOTE: the canonical post store is user.profile.posts[] — saveDatabase()
  //    re-merges it into db.posts via syncGlobalPostsFromUsers(), so edits must
  //    be applied to profile.posts (per author) AND to db.posts (globally-created
  //    posts that exist only there).
  const stripPost = (p: any) => {
    if (!p || typeof p !== 'object') return;
    if (p.userId === userId) return; // owned posts are dropped below
    if (Array.isArray(p.comments)) {
      p.comments = p.comments.filter((c: any) => c && c.senderId !== userId);
    }
    if (Array.isArray(p.likedBy)) {
      p.likedBy = p.likedBy.filter((id: any) => id !== userId);
    }
  };
  for (const u of db.users) {
    if (u && u.profile && Array.isArray(u.profile.posts)) {
      u.profile.posts = u.profile.posts.filter((p: any) => p && p.userId !== userId);
      u.profile.posts.forEach(stripPost);
    }
  }
  if (Array.isArray(db.posts)) {
    db.posts = db.posts.filter((p: any) => p && p.userId !== userId);
    db.posts.forEach(stripPost);
  }

  // 4. Anonymize their chat messages; drop them from readBy/likedBy arrays.
  for (const coll of ['chatMessages', 'messages'] as const) {
    const arr = db[coll];
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      if (!m || typeof m !== 'object') continue;
      if (m.senderId === userId) {
        m.text = '[Account deleted]';
        m.mediaUrl = null;
        m.mediaName = null;
        m.senderName = 'Deleted User';
        m.senderAvatar = null;
      }
      for (const f of ['readBy', 'likedBy', 'reactedBy'] as const) {
        if (Array.isArray(m[f])) m[f] = m[f].filter((id: any) => id !== userId);
      }
    }
  }

  // 5. Remove them from conversation participant lists.
  for (const c of Array.isArray(db.conversations) ? db.conversations : []) {
    if (c && Array.isArray(c.participants)) {
      c.participants = c.participants.filter((id: any) => id !== userId);
    }
  }
}

// --- Routes ------------------------------------------------------------------

export function registerDataSovereigntyRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = ctx;

  // ---------------------------------------------------------------------------
  // GET /api/sovereignty/inventory — what Ocean stores about me (counts only)
  // ---------------------------------------------------------------------------
  app.get('/api/sovereignty/inventory', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const state = ensureState(db);
      const users = Array.isArray(db.users) ? db.users : [];
      const me = users.find((u: any) => u && u.id === user.id);

      const posts = Array.isArray(db.posts) ? db.posts : [];
      const chatMessages = Array.isArray(db.chatMessages) ? db.chatMessages : [];
      const conversations = Array.isArray(db.conversations) ? db.conversations : [];
      const myConvIds = myConversationIds(db, user.id);

      let commentsAuthored = 0;
      let postsLiked = 0;
      for (const p of posts) {
        if (Array.isArray(p.comments)) {
          commentsAuthored += p.comments.filter((c: any) => c && c.senderId === user.id).length;
        }
        if (Array.isArray(p.likedBy) && p.likedBy.includes(user.id)) postsLiked++;
      }

      const inventory = {
        posts: Array.isArray(me?.profile?.posts) ? me.profile.posts.length : 0,
        comments: commentsAuthored,
        reactions: postsLiked,
        conversations: conversations.filter((c: any) => c && Array.isArray(c.participants) && c.participants.includes(user.id)).length,
        messagesSent: chatMessages.filter((m: any) => m && m.senderId === user.id).length,
        messagesInConversations: chatMessages.filter((m: any) => m && myConvIds.has(m.conversationId)).length,
        following: Array.isArray(me?.following) ? me.following.length : 0,
        friends: Array.isArray(me?.friends) ? me.friends.length : 0,
        followers: Number(me?.profile?.followersCount) || 0,
        savedPosts: Array.isArray(me?.profile?.savedPostIds) ? me.profile.savedPostIds.length : 0,
        notifications: Array.isArray(me?.notifications) ? me.notifications.length : 0,
        sessions: sessionCountFor(db, user.id),
        exports: state.exports.filter((e: ExportLogItem) => e.userId === user.id).length,
      };

      const deletion = state.deletionRequests[user.id] || null;

      res.json({
        inventory,
        user: {
          id: user.id,
          name: user.name || '',
          username: user.username || '',
          email: user.email || '',
          countryCode: user.countryCode || null,
        },
        deletion: deletion
          ? {
              status: deletion.status,
              requestedAt: deletion.requestedAt,
              confirmAfter: deletion.confirmAfter,
              expiresAt: deletion.expiresAt,
            }
          : null,
        generatedAt: Date.now(),
      });
    } catch (e: any) {
      console.warn('[sovereignty] inventory error:', e?.message || e);
      res.status(500).json({ error: 'Failed to build data inventory.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/sovereignty/export — portable, sanitized bundle of MY data
  // ---------------------------------------------------------------------------
  app.get('/api/sovereignty/export', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const state = ensureState(db);
      const users = Array.isArray(db.users) ? db.users : [];
      const me = users.find((u: any) => u && u.id === user.id);
      const posts = Array.isArray(db.posts) ? db.posts : [];
      const chatMessages = Array.isArray(db.chatMessages) ? db.chatMessages : [];
      const conversations = Array.isArray(db.conversations) ? db.conversations : [];
      const myConvIds = myConversationIds(db, user.id);

      // Own posts (from the canonical author store).
      const ownPosts = Array.isArray(me?.profile?.posts) ? me.profile.posts.slice(0, MAX_EXPORT_POSTS) : [];

      // Comments I authored across all posts (with the post they are on).
      const commentsAuthored: any[] = [];
      for (const p of posts) {
        if (!Array.isArray(p.comments)) continue;
        for (const c of p.comments) {
          if (c && c.senderId === user.id) {
            commentsAuthored.push({
              id: c.id,
              postId: p.id,
              postSnippet: postSnippet(p),
              text: c.text,
              timestamp: c.timestamp,
              createdAt: c.createdAt,
              parentId: c.parentId || null,
            });
          }
          if (commentsAuthored.length >= MAX_EXPORT_COMMENTS) break;
        }
        if (commentsAuthored.length >= MAX_EXPORT_COMMENTS) break;
      }

      // Reactions I gave (posts I liked).
      const reactionsGiven: any[] = [];
      for (const p of posts) {
        if (Array.isArray(p.likedBy) && p.likedBy.includes(user.id)) {
          reactionsGiven.push({ postId: p.id, postSnippet: postSnippet(p) });
        }
      }

      // My conversations (participants resolved to names, no other plaintext).
      const myConversations = conversations
        .filter((c: any) => c && Array.isArray(c.participants) && c.participants.includes(user.id))
        .map((c: any) => ({
          id: c.id,
          name: c.name || null,
          isGroup: c.isGroup === true,
          createdTime: c.createdTime || null,
          participants: Array.isArray(c.participants)
            ? c.participants.map((pid: any) => ({ id: pid, name: userNameById(db, pid) }))
            : [],
        }));

      // Messages in my conversations (capped).
      const messages = chatMessages
        .filter((m: any) => m && myConvIds.has(m.conversationId))
        .slice(0, MAX_EXPORT_MESSAGES)
        .map((m: any) => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          senderName: m.senderName || userNameById(db, m.senderId),
          text: m.text || '',
          mediaUrl: m.mediaUrl || null,
          mediaName: m.mediaName || null,
          timestamp: m.timestamp || null,
          createdAt: m.createdAt || null,
        }));

      // Saved posts.
      const savedPostIds = Array.isArray(me?.profile?.savedPostIds) ? me.profile.savedPostIds : [];
      const savedPosts = posts
        .filter((p: any) => p && savedPostIds.includes(p.id))
        .map((p: any) => ({ id: p.id, postSnippet: postSnippet(p), createdAt: p.createdAt || null }));

      // Sessions — metadata only, tokens never exported, ip always masked.
      const sessionsInfo: any[] = [];
      if (db.sessions && typeof db.sessions === 'object') {
        for (const k of Object.keys(db.sessions)) {
          const s = db.sessions[k];
          if (s && s.userId === user.id) {
            sessionsInfo.push({
              createdAt: s.createdAt || null,
              lastSeenAt: s.lastSeenAt || null,
              userAgent: s.userAgent ? String(s.userAgent).slice(0, 200) : null,
              ip: 'masked',
            });
          }
        }
      }

      const exportBundle = {
        metadata: {
          app: 'Ocean',
          feature: 'Data Sovereignty',
          exportedAt: Date.now(),
          version: 1,
          redacted: true,
          redactionNote: 'Passwords, salts, DEK/word wrappers, OTP secrets, recovery phrases and session tokens are redacted; IPs are masked; oversized base64 media is omitted.',
        },
        account: redactForExport(me || { id: user.id }),
        profile: redactForExport(me?.profile || {}),
        posts: ownPosts.map((p: any) => redactForExport(p)),
        commentsAuthored,
        reactionsGiven,
        conversations: myConversations,
        messages,
        savedPosts,
        notifications: redactForExport(me?.notifications || []),
        sessionsInfo,
      };

      state.exports.unshift({
        id: genId('sovx'),
        userId: user.id,
        requestedAt: Date.now(),
        status: 'generated',
      });
      if (state.exports.length > MAX_EXPORTS_LOG) state.exports.length = MAX_EXPORTS_LOG;
      saveDatabase(db);

      res.json({ success: true, exportId: state.exports[0].id, export: exportBundle });
    } catch (e: any) {
      console.warn('[sovereignty] export error:', e?.message || e);
      res.status(500).json({ error: 'Failed to build data export.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/sovereignty/exports — my export-history log (metadata only)
  // ---------------------------------------------------------------------------
  app.get('/api/sovereignty/exports', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const state = ensureState(db);
      const items = state.exports
        .filter((e: ExportLogItem) => e.userId === user.id)
        .map((e: ExportLogItem) => ({ id: e.id, requestedAt: e.requestedAt, status: e.status }))
        .slice(0, MAX_EXPORTS_LOG);
      res.json({ exports: items });
    } catch (e: any) {
      console.warn('[sovereignty] exports log error:', e?.message || e);
      res.status(500).json({ error: 'Failed to load export history.' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/sovereignty/delete/request — begin right-to-be-forgotten flow
  // ---------------------------------------------------------------------------
  app.post('/api/sovereignty/delete/request', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const reason = truncate(body.reason, MAX_REASON_LEN);
      const db = loadDatabase();
      const state = ensureState(db);

      const existing = state.deletionRequests[user.id];
      if (existing && existing.status === 'pending') {
        return res.status(409).json({
          error: 'A deletion request is already pending.',
          confirmAfter: existing.confirmAfter,
          expiresAt: existing.expiresAt,
        });
      }

      const token = randomBytes(12).toString('hex'); // returned once, never stored raw
      const now = Date.now();
      state.deletionRequests[user.id] = {
        userId: user.id,
        tokenHash: sha256(token),
        reason: reason || undefined,
        requestedAt: now,
        status: 'pending',
        confirmAfter: now + DELETION_COOLDOWN_MS,
        expiresAt: now + DELETION_MAX_AGE_MS,
      };
      saveDatabase(db);

      res.json({
        success: true,
        token,
        requestedAt: now,
        cooldownMs: DELETION_COOLDOWN_MS,
        confirmAfter: now + DELETION_COOLDOWN_MS,
        expiresAt: now + DELETION_MAX_AGE_MS,
        note: 'Keep this token — it is shown only once. Confirmation is possible after the 48h cool-down; the request expires after 7 days.',
      });
    } catch (e: any) {
      console.warn('[sovereignty] delete request error:', e?.message || e);
      res.status(500).json({ error: 'Failed to request account deletion.' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/sovereignty/delete/status — current deletion-request state
  // ---------------------------------------------------------------------------
  app.get('/api/sovereignty/delete/status', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const db = loadDatabase();
      const state = ensureState(db);
      const request = state.deletionRequests[user.id] || null;
      if (!request) return res.json({ request: null });

      // Expire stale requests lazily.
      let changed = false;
      if (request.status === 'pending' && Date.now() > request.expiresAt) {
        request.status = 'expired';
        changed = true;
      }
      if (changed) saveDatabase(db);

      res.json({
        request: {
          status: request.status,
          requestedAt: request.requestedAt,
          confirmAfter: request.confirmAfter,
          expiresAt: request.expiresAt,
          deletedAt: request.deletedAt || null,
        },
      });
    } catch (e: any) {
      console.warn('[sovereignty] delete status error:', e?.message || e);
      res.status(500).json({ error: 'Failed to load deletion status.' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/sovereignty/delete/cancel — cancel a pending deletion request
  // ---------------------------------------------------------------------------
  app.post('/api/sovereignty/delete/cancel', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const token = body.token ? String(body.token).trim() : '';
      if (!token) return res.status(400).json({ error: 'Confirmation token is required.' });

      const db = loadDatabase();
      const state = ensureState(db);
      const request = state.deletionRequests[user.id];
      if (!request) return res.status(404).json({ error: 'No deletion request found.' });
      if (request.status !== 'pending') {
        return res.status(400).json({ error: `Request is already ${request.status}.` });
      }
      if (sha256(token) !== request.tokenHash) {
        return res.status(400).json({ error: 'Invalid confirmation token.' });
      }

      delete state.deletionRequests[user.id];
      saveDatabase(db);
      res.json({ success: true, cancelled: true });
    } catch (e: any) {
      console.warn('[sovereignty] delete cancel error:', e?.message || e);
      res.status(500).json({ error: 'Failed to cancel deletion request.' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/sovereignty/delete/confirm — erase my account (after cool-down)
  // ---------------------------------------------------------------------------
  app.post('/api/sovereignty/delete/confirm', requireAuth, (req: any, res: any) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const token = body.token ? String(body.token).trim() : '';
      if (!token) return res.status(400).json({ error: 'Confirmation token is required.' });

      const db = loadDatabase();
      const state = ensureState(db);
      const request = state.deletionRequests[user.id];
      if (!request) return res.status(404).json({ error: 'No deletion request found.' });
      if (request.status !== 'pending') {
        return res.status(400).json({ error: `Request is already ${request.status}.` });
      }
      if (sha256(token) !== request.tokenHash) {
        return res.status(400).json({ error: 'Invalid confirmation token.' });
      }

      const now = Date.now();
      if (now < request.confirmAfter) {
        return res.status(400).json({
          error: 'Cool-down still active. You can cancel within 48h.',
          remainingMs: request.confirmAfter - now,
          confirmAfter: request.confirmAfter,
        });
      }
      if (now > request.expiresAt) {
        request.status = 'expired';
        saveDatabase(db);
        return res.status(400).json({ error: 'Deletion request expired. Request a new one.' });
      }

      performDeletion(db, user.id);
      request.status = 'confirmed';
      request.deletedAt = now;
      saveDatabase(db);

      res.json({
        success: true,
        deletedUserId: user.id,
        deletedAt: now,
        note: 'Your account, posts, comments and reactions have been erased. Your chat messages were anonymized. Please log out and clear your stored token.',
      });
    } catch (e: any) {
      console.warn('[sovereignty] delete confirm error:', e?.message || e);
      res.status(500).json({ error: 'Failed to confirm account deletion.' });
    }
  });
}
