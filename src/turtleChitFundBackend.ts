/**
 * Ocean — Chit Fund / Committee Tracker (Feature 179)
 * ---------------------------------------------------
 * A rotating savings circle: members commit a fixed monthly amount. The fund
 * tracks each member's paid months and computes who is current; the pooled
 * payout rotation (who collects this cycle) is derived deterministically from
 * the join order. Coins are NOT moved automatically — committees run offline in
 * cash; the tracker records commitments and payment status.
 *
 * Model (global db, idempotent ensure):
 *   db.chitFunds — array of { id, name, monthlyAmount, members: [{userId,name,
 *                  joinedAt, paidMonths: number[], paidCash: number}],
 *                  cycleCount, createdAt }
 *
 * Routes:
 *   POST /api/chitfund            (auth) { name, monthlyAmount }
 *   GET  /api/chitfund            (guest) funds with member counts
 *   POST /api/chitfund/:id/join   (auth) join
 *   POST /api/chitfund/:id/pay    (auth, member) mark this month paid
 *   GET  /api/chitfund/:id        (guest) detail + payout rotation
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ChitMember {
  userId: string;
  name: string;
  joinedAt: number;
  paidMonths: string[]; // YYYY-MM
  paidCash: number;
}

export interface ChitFund {
  id: string;
  name: string;
  monthlyAmount: number;
  members: ChitMember[];
  cycleCount: number;
  createdAt: number;
}

function uid(): string {
  return `cf-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.chitFunds)) db.chitFunds = [];
}

function monthKey(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function registerChitFundRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  app.post('/api/chitfund', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const monthlyAmount = Math.floor(Number(body.monthlyAmount) || 0);
    if (name.length < 3) return res.status(400).json({ error: 'Name must be at least 3 characters.' });
    if (monthlyAmount <= 0) return res.status(400).json({ error: 'Monthly amount must be positive.' });
    const db = loadDatabase();
    ensureCollection(db);
    const fund: ChitFund = {
      id: uid(),
      name: name.slice(0, 120),
      monthlyAmount,
      members: [{ userId: user.id, name: user.name || user.username || 'User', joinedAt: Date.now(), paidMonths: [], paidCash: 0 }],
      cycleCount: 0,
      createdAt: Date.now(),
    };
    (db.chitFunds as ChitFund[]).unshift(fund);
    saveDatabase(db);
    res.json({ fund });
  });

  app.get('/api/chitfund', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const list = (db.chitFunds as ChitFund[]).map((f) => ({ ...f, memberCount: f.members.length })).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ funds: list });
  });

  app.post('/api/chitfund/:id/join', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const fund = (db.chitFunds as ChitFund[]).find((f) => f.id === req.params.id);
    if (!fund) return res.status(404).json({ error: 'Fund not found.' });
    if (fund.members.some((m) => m.userId === user.id)) return res.status(400).json({ error: 'Already a member.' });
    fund.members.push({ userId: user.id, name: user.name || user.username || 'User', joinedAt: Date.now(), paidMonths: [], paidCash: 0 });
    saveDatabase(db);
    res.json({ fund });
  });

  app.post('/api/chitfund/:id/pay', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const fund = (db.chitFunds as ChitFund[]).find((f) => f.id === req.params.id);
    if (!fund) return res.status(404).json({ error: 'Fund not found.' });
    const member = fund.members.find((m) => m.userId === user.id);
    if (!member) return res.status(403).json({ error: 'Only members can pay into the fund.' });
    const month = monthKey();
    if (member.paidMonths.includes(month)) return res.status(400).json({ error: 'Already paid this month.' });
    member.paidMonths.push(month);
    member.paidCash += fund.monthlyAmount;
    saveDatabase(db);
    res.json({ fund, month, totalPaid: member.paidCash });
  });

  app.get('/api/chitfund/:id', (req, res) => {
    const db = loadDatabase();
    ensureCollection(db);
    const fund = (db.chitFunds as ChitFund[]).find((f) => f.id === req.params.id);
    if (!fund) return res.status(404).json({ error: 'Fund not found.' });
    // Deterministic payout rotation: the collector for month N is members[N % members.length].
    const month = monthKey();
    const collectorIdx = (fund.members.length > 0 ? new Date().getMonth() : 0) % Math.max(1, fund.members.length);
    res.json({
      fund,
      month,
      pool: fund.members.reduce((sum, m) => sum + m.paidCash, 0),
      currentCollector: fund.members[collectorIdx] ? { name: fund.members[collectorIdx].name, userId: fund.members[collectorIdx].userId } : null,
    });
  });
}
