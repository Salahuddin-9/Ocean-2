/**
 * Ocean — Split Bill in Chat (Feature 4)
 * ----------------------------------------
 * Group-chat expense splitting: add itemized bills with named items, amounts and
 * assigned payers; the server computes who owes whom; members settle directly
 * with Ocean Coins (real wallet) or record cash payments.
 *
 * Model (global db): db.splitBills — array of
 *   { id, chatId, title, createdBy, createdByName, createdAt,
 *     participants: { userId, name }[], settled: boolean,
 *     items: { id, name, amount, payers: string[], paidBy: string }[],
 *     payments: { fromUserId, toUserId, amount, at, method: 'coins'|'cash' }[] }
 *
 * Routes:
 *   GET  /api/chats/:chatId/split   (auth, participant) splits for a chat
 *   POST /api/chats/:chatId/split   (auth, participant) create a bill
 *   GET  /api/split/mine            (auth) my bills across chats
 *   POST /api/splits/:id/settle     (auth, participant) settle { fromUserId, toUserId, amount, method }
 *   POST /api/splits/:id/delete     (auth, creator)
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { transferCoins } from './turtleCoinTransfer';

interface SplitItem {
  id: string;
  name: string;
  amount: number;
  payers: string[];
  paidBy: string;
}

export interface SplitPayment {
  fromUserId: string;
  toUserId: string;
  amount: number;
  at: number;
  method: 'coins' | 'cash';
}

export interface SplitBill {
  id: string;
  chatId: string;
  title: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  participants: { userId: string; name: string }[];
  items: SplitItem[];
  payments: SplitPayment[];
  settled: boolean;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function num(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.splitBills)) db.splitBills = [];
}

/** Net balance per participant: positive = owed money by others, negative = owes. */
export function computeBalances(split: SplitBill): Record<string, number> {
  const net: Record<string, number> = {};
  for (const p of split.participants) net[p.userId] = 0;
  for (const item of split.items) {
    const count = Math.max(1, item.payers.length);
    const share = item.amount / count;
    for (const payerId of item.payers) {
      net[payerId] = (net[payerId] || 0) - share;
    }
    if (item.paidBy) net[item.paidBy] = (net[item.paidBy] || 0) + item.amount;
  }
  // Apply settled payments.
  for (const pay of split.payments) {
    net[pay.fromUserId] = (net[pay.fromUserId] || 0) + pay.amount;
    net[pay.toUserId] = (net[pay.toUserId] || 0) - pay.amount;
  }
  for (const k of Object.keys(net)) net[k] = Math.round(net[k] * 100) / 100;
  return net;
}

function isSettled(split: SplitBill): boolean {
  return Object.values(computeBalances(split)).every((v) => Math.abs(v) < 0.005);
}

export function registerSplitBillRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function isParticipant(split: SplitBill, userId: string): boolean {
    return split.participants.some((p) => p.userId === userId);
  }

  function isInChat(db: any, chatId: string, userId: string): boolean {
    const conv = (db.conversations || []).find((c: any) => c && c.id === chatId);
    return !!conv && Array.isArray(conv.participants) && conv.participants.includes(userId);
  }

  // GET /api/chats/:chatId/split — splits for one chat (auth, participant)
  app.get('/api/chats/:chatId/split', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const chatId = String(req.params.chatId || '');
    if (!isInChat(db, chatId, user.id)) return res.status(403).json({ error: 'Join this chat to view its splits.' });
    const splits = (db.splitBills as SplitBill[])
      .filter((s) => s.chatId === chatId)
      .map((s) => ({ ...s, balances: computeBalances(s), settled: s.settled || isSettled(s) }));
    res.json({ splits });
  });

  // POST /api/chats/:chatId/split — create a bill (auth, participant)
  app.post('/api/chats/:chatId/split', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const chatId = String(req.params.chatId || '');
    const conv = (db.conversations || []).find((c: any) => c && c.id === chatId);
    if (!conv) return res.status(404).json({ error: 'Chat not found.' });
    if (!Array.isArray(conv.participants) || !conv.participants.includes(user.id)) {
      return res.status(403).json({ error: 'Only chat members can split bills here.' });
    }
    const body = req.body || {};
    const title = String(body.title || '').trim().slice(0, 120);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const rawParticipants = Array.isArray(body.participants) ? body.participants : [];
    if (!title) return res.status(400).json({ error: 'Bill title is required.' });
    if (rawItems.length === 0) return res.status(400).json({ error: 'Add at least one item.' });

    const participants: { userId: string; name: string }[] = [];
    if (rawParticipants.length) {
      for (const p of rawParticipants) {
        const pid = String(p.userId || '');
        if (pid && !participants.some((x) => x.userId === pid)) {
          const u = (db.users || []).find((x: any) => x && x.id === pid);
          participants.push({ userId: pid, name: u ? u.name || u.username || 'User' : String(p.name || 'User') });
        }
      }
    } else {
      for (const pid of conv.participants) {
        const u = (db.users || []).find((x: any) => x && x.id === pid);
        participants.push({ userId: pid, name: u ? u.name || u.username || 'User' : 'User' });
      }
    }
    if (!participants.some((p) => p.userId === user.id)) {
      participants.unshift({ userId: user.id, name: user.name || user.username || 'User' });
    }
    const pids = new Set(participants.map((p) => p.userId));

    const items: SplitItem[] = [];
    for (const it of rawItems) {
      const name = String(it.name || '').trim().slice(0, 80);
      const amount = num(it.amount);
      if (!name || amount <= 0) continue;
      let payers = Array.isArray(it.payers) ? it.payers.map((x: any) => String(x)) : [];
      if (payers.length === 0) payers = Array.from(pids);
      payers = Array.from(new Set(payers.filter((x) => pids.has(x))));
      if (payers.length === 0) continue;
      items.push({
        id: uid('item'),
        name,
        amount,
        payers,
        paidBy: String(it.paidBy || user.id),
      });
    }
    if (items.length === 0) return res.status(400).json({ error: 'No valid items — each needs a name and a positive amount.' });

    const split: SplitBill = {
      id: uid('split'),
      chatId,
      title,
      createdBy: user.id,
      createdByName: user.name || user.username || 'User',
      createdAt: Date.now(),
      participants,
      items,
      payments: [],
      settled: false,
    };
    (db.splitBills as SplitBill[]).unshift(split);
    saveDatabase(db);
    res.json({ split: { ...split, balances: computeBalances(split), settled: false } });
  });

  // GET /api/split/mine — my bills (auth)
  app.get('/api/split/mine', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.splitBills as SplitBill[])
      .filter((s) => isParticipant(s, user.id))
      .map((s) => {
        const conv = (db.conversations || []).find((c: any) => c && c.id === s.chatId);
        return {
          ...s,
          chatName: conv ? conv.name || conv.participants?.length : 'Chat',
          balances: computeBalances(s),
          settled: s.settled || isSettled(s),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json({ splits: mine });
  });

  // POST /api/splits/:id/settle — settle a debt with coins or cash (auth)
  app.post('/api/splits/:id/settle', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const split = (db.splitBills as SplitBill[]).find((s) => s.id === req.params.id);
    if (!split) return res.status(404).json({ error: 'Split not found.' });
    if (!isParticipant(split, user.id)) return res.status(403).json({ error: 'Not part of this split.' });

    const body = req.body || {};
    const fromUserId = String(body.fromUserId || '');
    const toUserId = String(body.toUserId || '');
    const amount = num(body.amount);
    const method: 'coins' | 'cash' = body.method === 'cash' ? 'cash' : 'coins';
    if (!fromUserId || !toUserId) return res.status(400).json({ error: 'fromUserId and toUserId are required.' });
    if (!isParticipant(split, fromUserId) || !isParticipant(split, toUserId)) {
      return res.status(400).json({ error: 'Both parties must be in the split.' });
    }
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive.' });
    if (user.id !== fromUserId && user.id !== toUserId) {
      return res.status(403).json({ error: 'Only the payer or payee can record a settlement.' });
    }
    // Security: a coin debit must be authorized by the payer themselves — a
    // third party (even the payee) cannot drain another member's wallet.
    if (method === 'coins' && user.id !== fromUserId) {
      return res.status(403).json({ error: 'Only the payer can authorize a coin payment.' });
    }

    if (method === 'coins') {
      const result = transferCoins(getCtx(), fromUserId, toUserId, amount, {
        note: `Split "${split.title}" settlement`,
        kind: 'split_settle',
        refId: split.id,
      });
      if (!result.ok) return res.status(402).json({ error: result.reason, balance: result.balance });
    }

    split.payments.push({ fromUserId, toUserId, amount, at: Date.now(), method });
    const settled = isSettled(split);
    if (settled) split.settled = true;
    saveDatabase(db);
    res.json({
      success: true,
      balances: computeBalances(split),
      settled,
      message: settled ? '🎉 Split settled — everyone is even!' : 'Settlement recorded.',
    });
  });

  // POST /api/splits/:id/delete — creator only
  app.post('/api/splits/:id/delete', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const idx = (db.splitBills as SplitBill[]).findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Split not found.' });
    if ((db.splitBills as SplitBill[])[idx].createdBy !== user.id) {
      return res.status(403).json({ error: 'Only the creator can delete this split.' });
    }
    db.splitBills.splice(idx, 1);
    saveDatabase(db);
    res.json({ success: true });
  });
}
