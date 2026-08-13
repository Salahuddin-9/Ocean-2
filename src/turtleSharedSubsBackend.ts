/**
 * Ocean — Subscription Manager (Feature 181)
 * ------------------------------------------
 * Track shared subscriptions (Netflix, Spotify, cloud storage) across a group
 * of friends: one owner, members split the monthly cost. The manager records
 * who owes what and lets members mark their share paid. Optional real-wallet
 * settlement: the owner can request a member's share, which moves coins.
 *
 * Model (global db, idempotent ensure):
 *   db.sharedSubs — array of { id, service, monthlyCost, ownerId, ownerName,
 *                  members: [{userId, name, paidShare: boolean}], createdAt }
 *
 * Routes:
 *   POST /api/sharedsubs            (auth) { service, monthlyCost }
 *   GET  /api/sharedsubs            (auth) my subs (owned + member)
 *   POST /api/sharedsubs/:id/join   (auth)
 *   POST /api/sharedsubs/:id/pay    (auth, member) mark my share paid
 *   POST /api/sharedsubs/:id/settle (auth, owner) { userId } -> request share via wallet
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface SharedSubMember {
  userId: string;
  name: string;
  paidShare: boolean;
}

export interface SharedSub {
  id: string;
  service: string;
  monthlyCost: number;
  ownerId: string;
  ownerName: string;
  members: SharedSubMember[];
  createdAt: number;
}

function uid(): string {
  return `ss-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.sharedSubs)) db.sharedSubs = [];
}

export function registerSharedSubsRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  app.post('/api/sharedsubs', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const service = String(body.service || '').trim();
    const monthlyCost = Math.floor(Number(body.monthlyCost) || 0);
    if (service.length < 2) return res.status(400).json({ error: 'Service name is required.' });
    if (monthlyCost <= 0) return res.status(400).json({ error: 'Monthly cost must be positive.' });
    const db = loadDatabase();
    ensureCollection(db);
    const sub: SharedSub = {
      id: uid(),
      service: service.slice(0, 100),
      monthlyCost,
      ownerId: user.id,
      ownerName: user.name || user.username || 'User',
      members: [{ userId: user.id, name: user.name || user.username || 'User', paidShare: true }],
      createdAt: Date.now(),
    };
    (db.sharedSubs as SharedSub[]).unshift(sub);
    saveDatabase(db);
    res.json({ sub });
  });

  app.get('/api/sharedsubs', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.sharedSubs as SharedSub[])
      .filter((s) => s.ownerId === user.id || s.members.some((m) => m.userId === user.id))
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ subs: mine });
  });

  app.post('/api/sharedsubs/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const sub = (db.sharedSubs as SharedSub[]).find((s) => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
    if (sub.members.some((m) => m.userId === user.id)) return res.status(400).json({ error: 'Already a member.' });
    sub.members.push({ userId: user.id, name: user.name || user.username || 'User', paidShare: false });
    saveDatabase(db);
    res.json({ sub, share: Math.round(sub.monthlyCost / sub.members.length) });
  });

  app.post('/api/sharedsubs/:id/pay', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const sub = (db.sharedSubs as SharedSub[]).find((s) => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
    const member = sub.members.find((m) => m.userId === user.id);
    if (!member) return res.status(403).json({ error: 'Only members can pay a share.' });
    member.paidShare = true;
    saveDatabase(db);
    res.json({ sub, share: Math.round(sub.monthlyCost / sub.members.length) });
  });

  app.post('/api/sharedsubs/:id/settle', requireAuth, (req, res) => {
    const user = (req as any).user;
    const userId = String((req.body || {}).userId || '');
    const db = loadDatabase();
    ensureCollection(db);
    const sub = (db.sharedSubs as SharedSub[]).find((s) => s.id === req.params.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
    if (sub.ownerId !== user.id) return res.status(403).json({ error: 'Only the owner can collect shares.' });
    const member = sub.members.find((m) => m.userId === userId);
    if (!member) return res.status(400).json({ error: 'That user is not a member.' });
    const share = Math.round(sub.monthlyCost / sub.members.length);
    const state = loadCommunity();
    if (!spendBalance(state, userId, share)) {
      return res.status(402).json({ error: `Member has insufficient balance for their ${share} BDT share.`, balance: state.balances[userId] || 0 });
    }
    // The share moves member → owner (this is the whole point of settle).
    addBalance(state, sub.ownerId, share);
    saveCommunity(state);
    member.paidShare = true;
    saveDatabase(db);
    res.json({ sub, collected: share, from: member.name, balance: state.balances[userId] || 0 });
  });
}
