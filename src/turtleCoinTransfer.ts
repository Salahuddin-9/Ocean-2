/**
 * Ocean — Shared Coin Wallet helpers
 * ----------------------------------
 * One place for the REAL wallet (community.json via turtleCommunityBackend) plus a
 * durable transaction ledger (db.oceanPayTransactions) so Ocean Pay, Split Bill and
 * bounty settlement all record the same traceable coin movements.
 */
import type { ServerContext } from './turtleServerContext';
import { addBalance, spendBalance } from './turtleCommunityBackend';

export interface CoinTransaction {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  note: string;
  kind: 'transfer' | 'split_settle' | 'pay';
  refId?: string | null;
  at: number;
}

export interface CoinTransferResult {
  ok: boolean;
  reason?: string;
  balance?: number;
  transaction?: CoinTransaction;
}

function uid(p: string): string {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

/**
 * Move `amount` whole coins from `fromId` to `toId` through the REAL wallet and
 * append a ledger entry. Returns { ok:false, reason } when the balance is short.
 */
export function transferCoins(
  ctx: ServerContext,
  fromId: string,
  toId: string,
  amount: number,
  opts: { note?: string; kind?: 'transfer' | 'split_settle' | 'pay'; refId?: string } = {}
): CoinTransferResult {
  if (!fromId || !toId) return { ok: false, reason: 'Sender and recipient are required.' };
  if (fromId === toId) return { ok: false, reason: 'You cannot send coins to yourself.' };
  const amt = Math.floor(Number(amount) || 0);
  if (amt <= 0) return { ok: false, reason: 'Amount must be a positive whole number.' };

  const community = ctx.loadCommunity();
  if (!spendBalance(community, fromId, amt)) {
    return {
      ok: false,
      reason: `Insufficient balance — you have ${community.balances[fromId] || 0} coins.`,
    };
  }
  addBalance(community, toId, amt);
  ctx.saveCommunity(community);

  const db = ctx.loadDatabase();
  if (!Array.isArray(db.oceanPayTransactions)) db.oceanPayTransactions = [];
  const transaction: CoinTransaction = {
    id: uid('tx'),
    fromId,
    toId,
    amount: amt,
    note: String(opts.note || '').slice(0, 200),
    kind: opts.kind || 'transfer',
    refId: opts.refId || null,
    at: Date.now(),
  };
  db.oceanPayTransactions.unshift(transaction);
  if (db.oceanPayTransactions.length > 600) db.oceanPayTransactions.length = 600;
  ctx.saveDatabase(db);

  return { ok: true, balance: community.balances[fromId] || 0, transaction };
}

/** Current wallet balance for a user (0 when never touched). */
export function walletBalance(ctx: ServerContext, userId: string): number {
  const community = ctx.loadCommunity();
  return community.balances[userId] || 0;
}

/**
 * Push an in-app notification into a user's notification bell (same shape the
 * core /api/notifications feed reads: { id, type, message, actorIds, actorNames,
 * timestamp, isRead }).
 */
export function pushNotification(
  db: any,
  targetUserId: string,
  type: string,
  message: string,
  actor: { id: string; name: string }
): void {
  if (actor.id === targetUserId) return;
  const target = (db.users || []).find((u: any) => u && u.id === targetUserId);
  if (!target) return;
  if (!Array.isArray(target.notifications)) target.notifications = [];
  target.notifications.unshift({
    id: uid('notif'),
    type,
    message: String(message).slice(0, 220),
    actorIds: [actor.id],
    actorNames: [actor.name],
    timestamp: Date.now(),
    isRead: false,
  });
  if (target.notifications.length > 120) target.notifications.length = 120;
}

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
