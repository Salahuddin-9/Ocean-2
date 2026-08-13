/**
 * Ocean — Open-Source Bounties via Reels (Feature 115)
 * ------------------------------------------------------
 * Attach a coin bounty to a post/reel. Solvers drop solution comments on the
 * post; the bounty owner accepts a comment as THE solution, which transfers the
 * escrowed coins to the commenter's wallet.
 *
 * Escrow / wallet (REAL coin wallet — never a separate coin store):
 *   POST /api/bounty                    -> spendBalance(owner, amount) ESCROWS
 *   POST /api/bounty/:id/accept-comment -> addBalance(commenter, amount) PAYS OUT
 *   POST /api/bounty/:id/expire         -> addBalance(owner, amount) REFUNDS
 *
 * Bounties persist in the global db under `db.bounties` (idempotent ensure);
 * coins always move through community.json via turtleCommunityBackend's
 * spendBalance / addBalance (state = loadCommunity(), then saveCommunity(state)).
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export type BountyStatus = 'open' | 'resolved' | 'expired';

export interface Bounty {
  id: string;
  postId: string;
  reelId?: string;
  title: string;
  description: string;
  amount: number;
  currency: 'BDT';
  ownerId: string;
  ownerName?: string;
  status: BountyStatus;
  acceptedCommentId: string | null;
  acceptedBy: string | null;
  acceptedByName?: string | null;
  acceptedAt: number | null;
  createdAt: number;
  expiresAt: number;
  solution?: string;
  candidateCommentId?: string | null;
  candidateCommenterId?: string | null;
  refundedAt?: number | null;
}

const DEFAULT_EXPIRY_HOURS = 24 * 7; // 7 days
const MAX_AMOUNT = 1_000_000;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollection(db: any): void {
  if (!Array.isArray(db.bounties)) db.bounties = [];
}

/** Find a post anywhere (user.profile.posts canonical store, fallback db.posts). */
function findPost(db: any, postId: string): { post: any; owner: any } | null {
  for (const u of db.users || []) {
    const p = (u.profile?.posts || []).find((x: any) => x && x.id === postId);
    if (p) return { post: p, owner: u };
  }
  const p = (db.posts || []).find((x: any) => x && x.id === postId);
  return p ? { post: p, owner: null } : null;
}

/** Mirror server.ts's comment resolution (resolve senderName/avatarUrl from db.users). */
function resolvedComments(db: any, post: any): any[] {
  const users = db.users || [];
  return (post.comments || []).map((c: any) => {
    let senderName = c.senderName;
    let senderAvatarUrl = '';
    if (c.senderId) {
      const cu = users.find((u: any) => u.id === c.senderId);
      if (cu) {
        senderName = cu.name || cu.profile?.username || senderName;
        senderAvatarUrl = cu.profile?.avatarUrl || '';
      }
    }
    return { ...c, senderName, senderAvatarUrl };
  });
}

export function registerBountyRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity, getRequestUser } = getCtx();

  // List bounties (guest-safe). ?postId=<id> scopes to one post; ?mine=1 scopes to the caller.
  app.get('/api/bounty', (req, res) => {
    const me = getRequestUser(req);
    const db = loadDatabase();
    ensureCollection(db);
    const postId = typeof req.query.postId === 'string' ? req.query.postId : '';
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    let list = (db.bounties as Bounty[]) || [];
    if (postId) list = list.filter((b) => b.postId === postId);
    else if (mine) list = me ? list.filter((b) => b.ownerId === me.id) : [];
    else list = list.filter((b) => b.status === 'open' || b.status === 'resolved');
    list = list.slice().sort((a, b) => b.createdAt - a.createdAt);
    res.json({ bounties: list.slice(0, 200) });
  });

  // Create a bounty (auth) — ESCROW `amount` out of the owner's real wallet.
  app.post('/api/bounty', requireAuth, (req, res) => {
    const user = (req as any).user;
    const { postId, reelId, title, description, amount, expiresInHours } = req.body || {};
    if (!postId || typeof postId !== 'string') {
      return res.status(400).json({ error: 'postId is required.' });
    }
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ error: 'Title must be at least 3 characters.' });
    }
    const amt = Math.floor(Number(amount) || 0);
    if (amt <= 0) return res.status(400).json({ error: 'A positive bounty amount is required.' });
    if (amt > MAX_AMOUNT) return res.status(400).json({ error: `Bounty amount cannot exceed ${MAX_AMOUNT}.` });

    const db = loadDatabase();
    ensureCollection(db);
    if (!findPost(db, postId)) {
      return res.status(404).json({ error: 'Post not found — bounty must attach to an existing post or reel.' });
    }

    // ESCROW: pull the coins out of the owner's wallet via the real spendBalance.
    const state = loadCommunity();
    if (!spendBalance(state, user.id, amt)) {
      return res.status(402).json({
        error: `Insufficient balance. You need ${amt} BDT but your wallet has ${state.balances[user.id] || 0}.`,
        balance: state.balances[user.id] || 0,
      });
    }
    saveCommunity(state);

    const hours = Math.max(1, Math.min(Number(expiresInHours) || DEFAULT_EXPIRY_HOURS, 24 * 365));
    const now = Date.now();
    const bounty: Bounty = {
      id: uid('bounty'),
      postId,
      reelId: typeof reelId === 'string' && reelId ? reelId : undefined,
      title: String(title).trim().slice(0, 200),
      description: String(description || '').trim().slice(0, 2000),
      amount: amt,
      currency: 'BDT',
      ownerId: user.id,
      ownerName: user.name || user.username || 'User',
      status: 'open',
      acceptedCommentId: null,
      acceptedBy: null,
      acceptedByName: null,
      acceptedAt: null,
      createdAt: now,
      expiresAt: now + hours * 3600 * 1000,
      candidateCommentId: null,
      candidateCommenterId: null,
    };
    (db.bounties as Bounty[]).push(bounty);
    saveDatabase(db);
    res.json({ bounty, balance: state.balances[user.id] || 0 });
  });

  // Bounty detail (guest-safe) — returns the attached post's comments.
  app.get('/api/bounty/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const bounty = (db.bounties as Bounty[]).find((b) => b.id === req.params.id);
    if (!bounty) return res.status(404).json({ error: 'Bounty not found.' });
    const found = findPost(db, bounty.postId);
    const comments = found ? resolvedComments(db, found.post) : [];
    res.json({
      bounty,
      comments,
      post: found
        ? {
            id: found.post.id,
            title: found.post.title || null,
            videoUrl: found.post.videoUrl || null,
            text: found.post.text || '',
          }
        : null,
    });
  });

  // Record a candidate solution comment (auth) — lets the UI highlight a proposal.
  app.post('/api/bounty/:id/comment', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const bounty = (db.bounties as Bounty[]).find((b) => b.id === req.params.id);
    if (!bounty) return res.status(404).json({ error: 'Bounty not found.' });
    if (bounty.status !== 'open') return res.status(400).json({ error: 'This bounty is already closed.' });
    const commentId = String((req.body as any)?.commentId || '');
    const commenterId = String((req.body as any)?.commenterId || '');
    if (!commentId) return res.status(400).json({ error: 'commentId is required.' });
    // Only the comment's author (or the bounty owner) may nominate a candidate.
    if (commenterId && commenterId !== user.id && bounty.ownerId !== user.id) {
      return res.status(403).json({ error: 'You can only nominate your own comment (or, as the owner, any comment).' });
    }
    bounty.candidateCommentId = commentId;
    bounty.candidateCommenterId = commenterId || user.id;
    saveDatabase(db);
    res.json({ success: true, bounty });
  });

  // Accept a comment as the solution (owner only) — TRANSFER the escrowed coins.
  app.post('/api/bounty/:id/accept-comment', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const bounty = (db.bounties as Bounty[]).find((b) => b.id === req.params.id);
    if (!bounty) return res.status(404).json({ error: 'Bounty not found.' });
    if (bounty.ownerId !== user.id) {
      return res.status(403).json({ error: 'Only the bounty owner can accept a solution.' });
    }
    if (bounty.status !== 'open') {
      return res.status(400).json({ error: 'This bounty is not open for acceptance.' });
    }
    const { commentId, commenterId } = (req.body || {}) as { commentId?: string; commenterId?: string };
    if (!commentId) return res.status(400).json({ error: 'commentId is required.' });

    // Resolve the comment + its true author from the attached post.
    const found = findPost(db, bounty.postId);
    const comment = found?.post?.comments?.find((c: any) => c && c.id === commentId);
    if (!found || !comment) return res.status(404).json({ error: 'Comment not found on the attached post.' });
    const recipientId = String(comment.senderId || commenterId || '');
    if (!recipientId) return res.status(400).json({ error: 'Could not determine the comment author.' });

    // PAY OUT the escrow to the accepted commenter's real wallet.
    const state = loadCommunity();
    addBalance(state, recipientId, bounty.amount);
    saveCommunity(state);

    bounty.status = 'resolved';
    bounty.acceptedCommentId = commentId;
    bounty.acceptedBy = recipientId;
    bounty.acceptedByName = comment.senderName || undefined;
    bounty.acceptedAt = Date.now();
    bounty.solution = typeof comment.text === 'string' ? comment.text.slice(0, 2000) : undefined;
    bounty.candidateCommentId = commentId;
    bounty.candidateCommenterId = recipientId;
    saveDatabase(db);

    res.json({
      success: true,
      transferred: bounty.amount,
      currency: 'BDT',
      to: recipientId,
      balance: state.balances[recipientId] || 0,
      bounty,
    });
  });

  // Expire a bounty (owner only) — REFUND the escrow to the owner's wallet.
  app.post('/api/bounty/:id/expire', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const bounty = (db.bounties as Bounty[]).find((b) => b.id === req.params.id);
    if (!bounty) return res.status(404).json({ error: 'Bounty not found.' });
    if (bounty.ownerId !== user.id) {
      return res.status(403).json({ error: 'Only the bounty owner can expire it.' });
    }
    if (bounty.status !== 'open') {
      return res.status(400).json({ error: 'Only an open bounty can be expired.' });
    }
    // REFUND the escrow back to the owner.
    const state = loadCommunity();
    addBalance(state, bounty.ownerId, bounty.amount);
    saveCommunity(state);

    bounty.status = 'expired';
    bounty.refundedAt = Date.now();
    saveDatabase(db);
    res.json({ success: true, refunded: bounty.amount, balance: state.balances[bounty.ownerId] || 0, bounty });
  });
}
