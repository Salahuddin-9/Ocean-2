/**
 * Ocean — Assignment Help Exchange (Feature 199)
 * -----------------------------------------------
 * Skill-exchange posts for homework/assignment help. Two kinds: "ask" (I need
 * help, optional reward coins) and "offer" (I can help). An ask is claimed by a
 * helper; when the poster marks it complete, the reward coins transfer from the
 * poster's wallet to the helper via the community coin system.
 *
 * Model (global db): db.assignmentHelp — array of
 *   { id, kind: 'ask'|'offer', userId, userName, subject, title, description,
 *     rewardCoins, status: 'open'|'claimed'|'done', claimedBy?, createdAt }
 *
 * Routes:
 *   GET  /api/assignment-help                  (public) list, filter ?subject=
 *   POST /api/assignment-help                  (auth) post ask/offer
 *   POST /api/assignment-help/:id/claim        (auth) claim an ask
 *   POST /api/assignment-help/:id/complete     (auth: poster) pay reward + mark done
 *   GET  /api/assignment-help/mine             (auth) my posts + claims
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface AssignmentHelp {
  id: string;
  kind: 'ask' | 'offer';
  userId: string;
  userName: string;
  subject: string;
  title: string;
  description: string;
  rewardCoins: number;
  status: 'open' | 'claimed' | 'done';
  claimedBy?: string;
  claimedByName?: string;
  createdAt: number;
}

function uid(): string {
  return `ah-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.assignmentHelp)) db.assignmentHelp = [];
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerAssignmentHelpRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  app.get('/api/assignment-help', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const subject = s((req.query as any).subject, 60).toLowerCase();
    const list = (db.assignmentHelp as AssignmentHelp[])
      .filter((a) => (subject ? a.subject.toLowerCase().includes(subject) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ posts: list });
  });

  app.post('/api/assignment-help', requireAuth, (req, res) => {
    const user = (req as any).user;
    const b = (req.body || {}) as any;
    if (b.kind !== 'ask' && b.kind !== 'offer') return res.status(400).json({ error: 'kind must be ask or offer.' });
    const subject = s(b.subject, 60);
    const title = s(b.title, 120);
    if (!subject || !title) return res.status(400).json({ error: 'subject and title are required.' });
    let reward = Math.max(0, Math.floor(Number(b.rewardCoins) || 0));
    const db = loadDatabase();
    ensureCollection(db);
    const post: AssignmentHelp = {
      id: uid(),
      kind: b.kind,
      userId: user.id,
      userName: user.name || user.username || 'User',
      subject,
      title,
      description: s(b.description, 800),
      rewardCoins: reward,
      status: 'open',
      createdAt: Date.now(),
    };
    if (reward > 0) {
      const community = loadCommunity();
      const ok = spendBalance(community, user.id, reward);
      if (!ok) {
        return res.status(400).json({ error: `You need ${reward} coins in your wallet to post this reward.` });
      }
      saveCommunity(community);
    }
    (db.assignmentHelp as AssignmentHelp[]).unshift(post);
    saveDatabase(db);
    res.json({ post });
  });

  app.post('/api/assignment-help/:id/claim', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const post = (db.assignmentHelp as AssignmentHelp[]).find((a) => a.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (post.userId === user.id) return res.status(400).json({ error: 'This is your own post.' });
    if (post.status !== 'open') return res.status(400).json({ error: 'Already claimed.' });
    if (post.kind === 'offer') return res.status(400).json({ error: 'Offers are matched by the asker — post an ask instead.' });
    post.status = 'claimed';
    post.claimedBy = user.id;
    post.claimedByName = user.name || user.username || 'User';
    saveDatabase(db);
    res.json({ success: true, post });
  });

  app.post('/api/assignment-help/:id/complete', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const post = (db.assignmentHelp as AssignmentHelp[]).find((a) => a.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    if (post.userId !== user.id) return res.status(403).json({ error: 'Only the poster can complete.' });
    if (post.status !== 'claimed' || !post.claimedBy) return res.status(400).json({ error: 'No helper claimed this yet.' });
    if (post.rewardCoins > 0) {
      const community = loadCommunity();
      addBalance(community, post.claimedBy!, post.rewardCoins);
      saveCommunity(community);
    }
    post.status = 'done';
    saveDatabase(db);
    res.json({ success: true, paid: post.rewardCoins, to: post.claimedByName });
  });

  app.get('/api/assignment-help/mine', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.assignmentHelp as AssignmentHelp[])
      .filter((a) => a.userId === user.id || a.claimedBy === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ posts: mine });
  });
}
