/**
 * Ocean — Community Bot-Bounty (Feature 138)
 * ------------------------------------------
 * Extends the report system with a "bot" category. A user reports an account as a
 * bot; the backend runs a deterministic bot-detection check (profile completeness,
 * posting velocity, link-heavy content, optional Humanity Score cross-check). When
 * the evidence confirms a bot (score >= 70), the reporter is rewarded Ocean Coins.
 *
 * Model (global db, idempotent ensure):
 *   db.botReports — array of { id, targetUserId, targetName, reporterId, reporterName,
 *                    reason, botScore, verdict: 'confirmed'|'pending'|'rejected',
 *                    reward, createdAt, decidedAt }
 *   db.botBountyStats — Record<userId, { reports, confirmed, coinsEarned }> leaderboard feed
 *
 * Routes:
 *   POST /api/botbounty/report      { targetUserId, reason? } -> verdict + reward on confirm
 *   GET  /api/botbounty/reports     -> my reports (auth)
 *   GET  /api/botbounty/leaderboard -> top rewarded reporters (guest-safe)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { addBalance } from './turtleCommunityBackend';

export type BotVerdict = 'confirmed' | 'pending' | 'rejected';

export interface BotReport {
  id: string;
  targetUserId: string;
  targetName: string;
  reporterId: string;
  reporterName?: string;
  reason: string;
  botScore: number;
  verdict: BotVerdict;
  signals: string[];
  reward: number;
  createdAt: number;
  decidedAt: number | null;
}

export interface BotBountyStats {
  reports: number;
  confirmed: number;
  rejected: number;
  coinsEarned: number;
}

const CONFIRM_THRESHOLD = 70;
const PENDING_THRESHOLD = 45;
const REWARD_COINS = 15;

function uid(): string {
  return `botrep-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.botReports)) db.botReports = [];
  if (!db.botBountyStats || typeof db.botBountyStats !== 'object' || Array.isArray(db.botBountyStats)) {
    db.botBountyStats = {};
  }
}

function statsFor(db: any, userId: string): BotBountyStats {
  const map = db.botBountyStats as Record<string, BotBountyStats>;
  if (!map[userId]) map[userId] = { reports: 0, confirmed: 0, rejected: 0, coinsEarned: 0 };
  return map[userId];
}

/** Resolve a target user by userId (or by username for convenience). */
function resolveTarget(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  if (!q) return null;
  if (db.users) {
    const byId = db.users.find((u: any) => u && u.id === q);
    if (byId) return byId;
    const byName = db.users.find(
      (u: any) => u && (u.name === q || u.username === q || (u.profile && u.profile.username === q))
    );
    if (byName) return byName;
  }
  return null;
}

/** Deterministic bot detection — explainable signals, 0-100. */
function detectBot(db: any, target: any): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  // --- Profile completeness ------------------------------------------------
  const profile = target.profile || {};
  const hasAvatar = !!profile.avatarUrl;
  const hasBio = !!String(profile.bio || '').trim();
  const hasInterests = Array.isArray(profile.interests) && profile.interests.length > 0;
  const completeness = [hasAvatar, hasBio, hasInterests].filter(Boolean).length;
  if (completeness <= 1) {
    score += 30;
    signals.push('Thin profile (no avatar/bio/interests)');
  }

  // --- Post velocity + link-heavy content -----------------------------------
  const posts = Array.isArray(profile.posts) ? profile.posts : [];
  const now = Date.now();
  const recent = posts.filter((p: any) => {
    const t = typeof p.timestamp === 'number' ? p.timestamp : now;
    return now - t < 24 * 3600 * 1000;
  });
  if (recent.length >= 5) {
    score += 25;
    signals.push(`${recent.length} posts within 24h (spam velocity)`);
  }
  const linky = posts.filter((p: any) => /(https?:\/\/|www\.|t\.me\/|bit\.ly\/)/i.test(String(p.content || ''))).length;
  if (posts.length >= 3 && linky / posts.length >= 0.6) {
    score += 20;
    signals.push('Majority of posts contain links');
  }

  // --- Account freshness ----------------------------------------------------
  const created = typeof target.createdAt === 'number' ? target.createdAt : 0;
  if (created && now - created < 24 * 3600 * 1000) {
    score += 15;
    signals.push('Account created within the last 24h');
  }

  // --- Humanity Score cross-check -------------------------------------------
  const hs = (db.humanityScores || []).find((r: any) => r.userId === target.id);
  if (hs) {
    if (hs.score < 40) {
      score += 30;
      signals.push(`Low humanity score (${hs.score}/100)`);
    } else if (hs.score >= 70) {
      score -= 40;
      signals.push(`High humanity score (${hs.score}/100)`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

export function registerBotBountyRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, loadCommunity, saveCommunity } = getCtx();

  // POST /api/botbounty/report — report a user as a bot
  app.post('/api/botbounty/report', requireAuth, (req, res) => {
    const user = (req as any).user;
    const targetRef = String((req.body || {}).targetUserId || '').trim();
    const reason = String((req.body || {}).reason || '').trim().slice(0, 300);
    if (!targetRef) return res.status(400).json({ error: 'targetUserId (or username) is required.' });
    if (targetRef === user.id) return res.status(400).json({ error: 'You cannot report yourself.' });

    const db = loadDatabase();
    ensureCollections(db);
    const target = resolveTarget(db, targetRef);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    // One active report per reporter+target (no spam-bounty farming).
    const existing = (db.botReports as BotReport[]).find(
      (r) => r.reporterId === user.id && r.targetUserId === target.id
    );
    if (existing) {
      return res.status(409).json({ error: 'You already reported this account.', report: existing });
    }

    const { score, signals } = detectBot(db, target);
    const verdict: BotVerdict = score >= CONFIRM_THRESHOLD ? 'confirmed' : score >= PENDING_THRESHOLD ? 'pending' : 'rejected';
    let reward = 0;
    let balance: number | undefined;

    if (verdict === 'confirmed') {
      reward = REWARD_COINS;
      const state = loadCommunity();
      addBalance(state, user.id, reward);
      saveCommunity(state);
      balance = state.balances[user.id] || 0;
    }

    const report: BotReport = {
      id: uid(),
      targetUserId: target.id,
      targetName: target.name || target.username || 'User',
      reporterId: user.id,
      reporterName: user.name || user.username || 'User',
      reason,
      botScore: score,
      verdict,
      signals,
      reward,
      createdAt: Date.now(),
      decidedAt: verdict !== 'pending' ? Date.now() : null,
    };
    (db.botReports as BotReport[]).unshift(report);

    const stats = statsFor(db, user.id);
    stats.reports += 1;
    if (verdict === 'confirmed') {
      stats.confirmed += 1;
      stats.coinsEarned += reward;
    } else if (verdict === 'rejected') {
      stats.rejected += 1;
    }
    saveDatabase(db);

    res.json({ report, verdict, botScore: score, signals, reward, balance });
  });

  // GET /api/botbounty/reports — my reports + stats (auth)
  app.get('/api/botbounty/reports', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const mine = (db.botReports as BotReport[]).filter((r) => r.reporterId === user.id).slice(0, 100);
    res.json({ reports: mine, stats: statsFor(db, user.id) });
  });

  // GET /api/botbounty/leaderboard — top reporters by coins earned (guest-safe)
  app.get('/api/botbounty/leaderboard', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    const rows = Object.entries(db.botBountyStats as Record<string, BotBountyStats>)
      .map(([userId, s]) => {
        const u = (db.users || []).find((x: any) => x && x.id === userId);
        return {
          userId,
          name: u ? u.name || u.username || 'User' : 'User',
          ...s,
        };
      })
      .filter((r) => r.confirmed > 0)
      .sort((a, b) => b.coinsEarned - a.coinsEarned || b.confirmed - a.confirmed)
      .slice(0, 20);
    res.json({ leaderboard: rows, rewardPerConfirm: REWARD_COINS });
  });
}
