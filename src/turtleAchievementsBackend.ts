/**
 * Ocean — Achievement System (Feature 165)
 * ----------------------------------------
 * Milestone badges unlocked from real account metrics. A scan computes metrics
 * from the live db and unlocks any achievement whose threshold is now met.
 *
 * Model (global db, idempotent ensure):
 *   db.achievementCatalog — seeded catalog: { key, name, desc, icon, metric, threshold }
 *   db.userAchievements   — { id, userId, achievementKey, unlockedAt }
 *
 * Metrics measured per user: posts, reels, comments_written, likes_received,
 * streak_days (best, from the streaks module), bounties_won, subscriptions (as creator).
 *
 * Routes:
 *   POST /api/achievements/scan  (auth) -> recompute metrics, unlock, return new unlocks
 *   GET  /api/achievements       (auth) -> my unlocks + progress bars
 *   GET  /api/achievements/all   (guest) -> catalog
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface AchievementDef {
  key: string;
  name: string;
  desc: string;
  icon: string;
  metric: 'posts' | 'reels' | 'comments_written' | 'likes_received' | 'streak_days' | 'bounties_won' | 'subscribers';
  threshold: number;
}

const CATALOG: AchievementDef[] = [
  { key: 'first_post', name: 'First Ripple', desc: 'Publish your first post', icon: '🌊', metric: 'posts', threshold: 1 },
  { key: 'poster_25', name: 'Storyteller', desc: '25 posts published', icon: '📖', metric: 'posts', threshold: 25 },
  { key: 'poster_100', name: 'Ocean Author', desc: '100 posts published', icon: '✍️', metric: 'posts', threshold: 100 },
  { key: 'reel_5', name: 'Reel Maker', desc: 'Upload 5 reels', icon: '🎬', metric: 'reels', threshold: 5 },
  { key: 'comment_20', name: 'Conversation Starter', desc: 'Write 20 comments', icon: '💬', metric: 'comments_written', threshold: 20 },
  { key: 'liked_50', name: 'Liked by Many', desc: 'Receive 50 reactions', icon: '❤️', metric: 'likes_received', threshold: 50 },
  { key: 'streak_7', name: 'Week of Meaning', desc: 'Reach a 7-day streak', icon: '🔥', metric: 'streak_days', threshold: 7 },
  { key: 'streak_30', name: 'Month of Meaning', desc: 'Reach a 30-day streak', icon: '🏆', metric: 'streak_days', threshold: 30 },
  { key: 'bounty_win', name: 'Bug Hunter', desc: 'Win a reel bounty', icon: '🐛', metric: 'bounties_won', threshold: 1 },
  { key: 'patron_3', name: 'Creator Magnet', desc: '3 active subscribers', icon: '⭐', metric: 'subscribers', threshold: 3 },
];

function uid(): string {
  return `ach-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollections(db: any): void {
  if (!Array.isArray(db.achievementCatalog)) {
    db.achievementCatalog = CATALOG;
  }
  if (!Array.isArray(db.userAchievements)) db.userAchievements = [];
}

/** Compute achievement metrics for a user from live db state. */
export function computeMetrics(db: any, userId: string): Record<AchievementDef['metric'], number> {
  const u = (db.users || []).find((x: any) => x && x.id === userId);
  const posts = Array.isArray(u?.profile?.posts) ? u.profile.posts : [];
  const reels = posts.filter((p: any) => !!p.videoUrl || p.type === 'reel').length;
  let commentsWritten = 0;
  let likesReceived = 0;
  posts.forEach((p: any) => {
    commentsWritten += (p.comments || []).filter((c: any) => c.senderId === userId).length;
    likesReceived += Number(p.likes || p.reactions || 0);
  });
  // Comments written anywhere (on others' posts too).
  (db.posts || []).forEach((p: any) => {
    commentsWritten += (p.comments || []).filter((c: any) => c.senderId === userId).length;
  });
  // Best streak (from the streaks module).
  const streak = (db.streaks || []).filter((s: any) => s.userId === userId).reduce((best: number, s: any) => Math.max(best, s.best || 0), 0);
  // Bounties won (acceptedBy === userId).
  const bountiesWon = (db.bounties || []).filter((b: any) => b.acceptedBy === userId).length;
  // Subscribers (active subs where creatorId === userId).
  const subscribers = (db.subscriptions || []).filter((s: any) => s.creatorId === userId && s.status === 'active').length;

  return { posts: posts.length, reels, comments_written: commentsWritten, likes_received: likesReceived, streak_days: streak, bounties_won: bountiesWon, subscribers };
}

export function registerAchievementRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/achievements/scan — recompute + unlock
  app.post('/api/achievements/scan', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const metrics = computeMetrics(db, user.id);
    const unlocked = db.userAchievements as { id: string; userId: string; achievementKey: string; unlockedAt: number }[];
    const mine = new Set(unlocked.filter((x) => x.userId === user.id).map((x) => x.achievementKey));
    const newly: AchievementDef[] = [];
    (db.achievementCatalog as AchievementDef[]).forEach((a) => {
      if (!mine.has(a.key) && (metrics[a.metric] || 0) >= a.threshold) {
        unlocked.push({ id: uid(), userId: user.id, achievementKey: a.key, unlockedAt: Date.now() });
        mine.add(a.key);
        newly.push(a);
      }
    });
    saveDatabase(db);
    res.json({ metrics, newlyUnlocked: newly, totalUnlocked: mine.size });
  });

  // GET /api/achievements — my progress
  app.get('/api/achievements', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollections(db);
    const metrics = computeMetrics(db, user.id);
    const unlockedSet = new Set(
      (db.userAchievements as { userId: string; achievementKey: string }[])
        .filter((x) => x.userId === user.id)
        .map((x) => x.achievementKey)
    );
    const rows = (db.achievementCatalog as AchievementDef[]).map((a) => {
      const value = Math.min(metrics[a.metric] || 0, a.threshold);
      return {
        ...a,
        unlocked: unlockedSet.has(a.key),
        progress: Math.min(100, Math.round((value / a.threshold) * 100)),
        value: metrics[a.metric] || 0,
      };
    });
    res.json({ achievements: rows, unlockedCount: unlockedSet.size, total: rows.length });
  });

  // GET /api/achievements/all — catalog (guest)
  app.get('/api/achievements/all', (req, res) => {
    const db = loadDatabase();
    ensureCollections(db);
    res.json({ catalog: db.achievementCatalog });
  });
}
