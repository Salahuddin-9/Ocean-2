/**
 * Ocean — Ocean Pay (P2P Coin Transfer, Feature 19)
 * ---------------------------------------------------
 * Send Ocean Coins to any user directly — from the wallet tab or inline in chat
 * via the /pay @user 50 command. Every movement goes through the REAL wallet
 * (community.json) and is recorded in db.oceanPayTransactions.
 *
 * Model (global db): db.oceanPayTransactions — array of CoinTransaction.
 *
 * Routes:
 *   GET  /api/wallet/balance      (auth) my balance + quick stats
 *   POST /api/wallet/transfer     (auth) { toUserId, amount, note? } -> transfer
 *   POST /api/wallet/pay          (auth) alias used by the chat /pay command
 *   GET  /api/wallet/transactions (auth) my ledger (sent + received)
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { transferCoins, pushNotification, walletBalance } from './turtleCoinTransfer';

function ensureLedger(db: any): void {
  if (!Array.isArray(db.oceanPayTransactions)) db.oceanPayTransactions = [];
}

export function registerOceanPayRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/wallet/balance — my balance (auth)
  app.get('/api/wallet/balance', requireAuth, (req, res) => {
    const user = (req as any).user;
    // Seed a starter balance for brand-new wallets (matches /api/community/rewards
    // in server.ts) so the wallet is demoable immediately.
    const community = getCtx().loadCommunity();
    if (community.balances[user.id] === undefined) {
      community.balances[user.id] = 100;
      getCtx().saveCommunity(community);
    }
    const balance = walletBalance(getCtx(), user.id);
    const db = loadDatabase();
    ensureLedger(db);
    const mine = (db.oceanPayTransactions as any[]).filter(
      (t) => t.fromId === user.id || t.toId === user.id
    );
    const sent = mine.filter((t) => t.fromId === user.id).reduce((s, t) => s + t.amount, 0);
    const received = mine.filter((t) => t.toId === user.id).reduce((s, t) => s + t.amount, 0);
    res.json({ balance, sent, received, count: mine.length });
  });

  // POST /api/wallet/transfer — P2P transfer (auth)
  app.post('/api/wallet/transfer', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const toUserId = String(body.toUserId || '');
    const amount = Math.floor(Number(body.amount) || 0);
    const note = String(body.note || '');

    const db = loadDatabase();
    const recipient = (db.users || []).find((u: any) => u && u.id === toUserId);
    if (!recipient) return res.status(404).json({ error: 'Recipient user not found.' });
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be a positive whole number.' });

    const result = transferCoins(getCtx(), user.id, toUserId, amount, {
      note: note || 'Ocean Pay transfer',
      kind: 'transfer',
    });
    if (!result.ok) return res.status(402).json({ error: result.reason, balance: result.balance });

    const senderName = user.name || user.username || 'User';
    pushNotification(
      db,
      toUserId,
      'ocean_pay',
      `${senderName} sent you ${amount} Ocean Coins${note ? ` — ${note.slice(0, 60)}` : ''}.`,
      { id: user.id, name: senderName }
    );
    saveDatabase(db);
    res.json({
      success: true,
      transaction: result.transaction,
      balance: result.balance,
      message: `Sent ${amount} coins to ${recipient.name || recipient.username || 'user'}.`,
    });
  });

  // POST /api/wallet/pay — same transfer, used by the chat /pay @user 50 command
  app.post('/api/wallet/pay', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const toUserId = String(body.toUserId || '');
    const amount = Math.floor(Number(body.amount) || 0);
    const note = String(body.note || '');
    const db = loadDatabase();
    const recipient = (db.users || []).find((u: any) => u && u.id === toUserId);
    if (!recipient) return res.status(404).json({ error: 'Recipient user not found.' });

    const result = transferCoins(getCtx(), user.id, toUserId, amount, {
      note: note || 'In-chat payment',
      kind: 'pay',
    });
    if (!result.ok) return res.status(402).json({ error: result.reason, balance: result.balance });

    const senderName = user.name || user.username || 'User';
    pushNotification(
      db,
      toUserId,
      'ocean_pay',
      `${senderName} paid you ${amount} Ocean Coins in chat.`,
      { id: user.id, name: senderName }
    );
    saveDatabase(db);
    res.json({
      success: true,
      transaction: result.transaction,
      balance: result.balance,
      message: `Paid ${amount} coins to ${recipient.name || recipient.username || 'user'}.`,
    });
  });

  // GET /api/wallet/transactions — my ledger (auth)
  app.get('/api/wallet/transactions', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureLedger(db);
    const mine = (db.oceanPayTransactions as any[])
      .filter((t) => t.fromId === user.id || t.toId === user.id)
      .slice(0, 100)
      .map((t) => {
        const otherId = t.fromId === user.id ? t.toId : t.fromId;
        const other = (db.users || []).find((u: any) => u && u.id === otherId);
        return {
          ...t,
          direction: t.fromId === user.id ? 'sent' : 'received',
          otherName: other ? other.name || other.username || 'User' : 'User',
        };
      });
    res.json({ transactions: mine });
  });
}
