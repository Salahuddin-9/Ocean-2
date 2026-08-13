/**
 * Ocean — Micro-Investment Group / Saving Circle (Feature 180)
 * ------------------------------------------------------------
 * A small group saves together toward a shared goal (e.g. a seed capital pot).
 * Contributions move through the REAL coin wallet; the circle tracks who
 * contributed how much and the pooled total.
 *
 * Model (global db, idempotent ensure):
 *   db.savingCircles — array of { id, name, goal, targetAmount, members:
 *                  [{userId, name, contributed}], createdAt }
 *
 * Routes:
 *   POST /api/savingcircle             (auth) { name, goal, targetAmount }
 *   GET  /api/savingcircle             (guest) circles with progress
 *   POST /api/savingcircle/:id/join    (auth)
 *   POST /api/savingcircle/:id/contribute (auth, member) { amount }
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { spendBalance } from './turtleCommunityBackend';

export interface SavingMember {
  userId: string;
  name: string;
  contributed: number;
}

export interface SavingCircle {
  id: string;
  name: string;
  goal: string;
  targetAmount: number;
  members: SavingMember[];
  createdAt: number;
}

function uid(): string {
  return `sc-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.savingCircles)) db.savingCircles = [];
}

export function registerSavingCircleRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  app.post('/api/savingcircle', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const goal = String(body.goal || 'Savings goal').trim();
    const targetAmount = Math.max(100, Math.floor(Number(body.targetAmount) || 1000));
    if (name.length < 3) return res.status(400).json({ error: 'Name must be at least 3 characters.' });
    const db = loadDatabase();
    ensureCollection(db);
    const circle: SavingCircle = {
      id: uid(),
      name: name.slice(0, 120),
      goal: goal.slice(0, 200),
      targetAmount,
      members: [{ userId: user.id, name: user.name || user.username || 'User', contributed: 0 }],
      createdAt: Date.now(),
    };
    (db.savingCircles as SavingCircle[]).unshift(circle);
    saveDatabase(db);
    res.json({ circle });
  });

  app.get('/api/savingcircle', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const list = (db.savingCircles as SavingCircle[]).map((c) => ({
      ...c,
      pooled: c.members.reduce((s, m) => s + m.contributed, 0),
      memberCount: c.members.length,
    })).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ circles: list });
  });

  app.post('/api/savingcircle/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.savingCircles as SavingCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    if (circle.members.some((m) => m.userId === user.id)) return res.status(400).json({ error: 'Already a member.' });
    circle.members.push({ userId: user.id, name: user.name || user.username || 'User', contributed: 0 });
    saveDatabase(db);
    res.json({ circle });
  });

  app.post('/api/savingcircle/:id/contribute', requireAuth, (req, res) => {
    const user = (req as any).user;
    const amount = Math.max(1, Math.floor(Number((req.body || {}).amount) || 0));
    const db = loadDatabase();
    ensureCollection(db);
    const circle = (db.savingCircles as SavingCircle[]).find((c) => c.id === req.params.id);
    if (!circle) return res.status(404).json({ error: 'Circle not found.' });
    const member = circle.members.find((m) => m.userId === user.id);
    if (!member) return res.status(403).json({ error: 'Only members can contribute.' });

    const state = loadCommunity();
    if (!spendBalance(state, user.id, amount)) {
      return res.status(402).json({ error: `Insufficient balance. Need ${amount} BDT, have ${state.balances[user.id] || 0}.`, balance: state.balances[user.id] || 0 });
    }
    saveCommunity(state);
    member.contributed += amount;
    saveDatabase(db);
    const pooled = circle.members.reduce((s, m) => s + m.contributed, 0);
    res.json({ circle, contributed: amount, pooled, balance: state.balances[user.id] || 0 });
  });
}
