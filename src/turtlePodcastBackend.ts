/**
 * Ocean — Personal Daily Podcast Generator (Feature 147)
 * -------------------------------------------------------
 * Compiles the day's top 5 items from a user's network + trending, writes a
 * natural-sounding podcast script, and stores it under "Daily Podcast".
 * Server-side TTS does not exist in this project, so the client reads the script
 * aloud with the browser speechSynthesis API (audio never leaves the device).
 *
 * Model (global db, idempotent ensure):
 *   db.podcasts — array of { id, userId, date (YYYY-MM-DD), title, script: {speaker,text}[],
 *                  items: {postId,type,title,by,reason}[], createdAt }
 *
 * Routes:
 *   POST /api/podcast/generate (auth) -> build/replace today's digest
 *   GET  /api/podcast/today     (auth) -> today's digest (generates if missing)
 *   GET  /api/podcast/history   (auth) -> past digests
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface PodcastItem {
  postId: string;
  type: 'post' | 'reel' | 'video';
  title: string;
  by: string;
  reason: string;
}

export interface PodcastLine {
  speaker: 'host' | 'outro';
  text: string;
}

export interface DailyPodcast {
  id: string;
  userId: string;
  date: string;
  title: string;
  script: PodcastLine[];
  items: PodcastItem[];
  createdAt: number;
}

function uid(): string {
  return `pod-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.podcasts)) db.podcasts = [];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function postText(p: any): string {
  return String(p?.content || p?.title || p?.caption || '').trim();
}

function shortTitle(p: any): string {
  const s = postText(p);
  return s.length > 70 ? `${s.slice(0, 70)}…` : s || '(media post)';
}

function authorName(db: any, owner: any, post: any): string {
  const id = String(post?.creator?.id || post?.authorId || post?.ownerId || '');
  const u = (db.users || []).find((x: any) => x && (x.id === id || (owner && owner.id === id)));
  if (u) return u.name || u.username || 'User';
  if (owner) return owner.name || owner.username || 'User';
  return 'A friend';
}

function engagement(p: any): number {
  return Number(p?.views || 0) + Number(p?.likes || p?.reactions || 0) * 5 + (p?.comments?.length || 0) * 10;
}

/** Gather candidate posts: my network's posts + trending (high-engagement) posts. */
function gatherCandidates(db: any, me: any): { post: any; owner: any }[] {
  const out: { post: any; owner: any }[] = [];
  const seen = new Set<string>();
  const push = (post: any, owner: any) => {
    if (post && post.id && !seen.has(post.id)) {
      seen.add(post.id);
      out.push({ post, owner });
    }
  };
  // 1. Network: posts by users I follow (db.follows / db.friendships best-effort).
  const followed = new Set<string>();
  (db.follows || db.friendships || []).forEach((f: any) => {
    if (f.followerId === me.id) followed.add(f.followingId);
    if (f.senderId === me.id || f.receiverId === me.id) followed.add(f.senderId === me.id ? f.receiverId : f.senderId);
  });
  (db.users || []).forEach((u: any) => {
    const isMine = u.id === me.id;
    const isNetwork = followed.has(u.id) || followed.size === 0; // fallback: everyone when no follow data
    if (!isMine && !isNetwork) return;
    (u.profile?.posts || []).forEach((p: any) => push(p, u));
  });
  (db.posts || []).forEach((p: any) => push(p, null));
  return out;
}

/** Deterministic script writer — the "AI" of the digest is editorial logic. */
function writeScript(items: PodcastItem[]): PodcastLine[] {
  const lines: PodcastLine[] = [];
  lines.push({
    speaker: 'host',
    text: `Good morning. Here is your Ocean daily digest — ${items.length} stories picked for you today.`,
  });
  items.forEach((it, i) => {
    lines.push({
      speaker: 'host',
      text: `Item ${i + 1}: ${it.title} — by ${it.by}. ${it.reason}.`,
    });
  });
  lines.push({
    speaker: 'outro',
    text: 'That is all for today. Thanks for listening — see you tomorrow on Ocean.',
  });
  return lines;
}

export function buildDailyPodcast(db: any, me: any): DailyPodcast {
  const candidates = gatherCandidates(db, me);
  const scored = candidates
    .map((c) => ({ ...c, score: engagement(c.post) * (Math.random() * 0.1 + 0.95) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const items: PodcastItem[] = scored.map((c) => ({
    postId: String(c.post.id),
    type: c.post.videoUrl ? 'reel' : c.post.type === 'video' ? 'video' : 'post',
    title: shortTitle(c.post),
    by: authorName(db, c.owner, c.post),
    reason: engagement(c.post) > 0
      ? `Gaining momentum with ${c.post.views || 0} views and ${(c.post.comments || []).length} comments`
      : 'Fresh from your network',
  }));

  return {
    id: uid(),
    userId: me.id,
    date: today(),
    title: `Ocean Daily · ${today()}`,
    script: writeScript(items),
    items,
    createdAt: Date.now(),
  };
}

export function registerPodcastRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/podcast/generate — (re)build today's digest
  app.post('/api/podcast/generate', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.podcasts as DailyPodcast[];
    const idx = list.findIndex((p) => p.userId === user.id && p.date === today());
    const podcast = buildDailyPodcast(db, user);
    if (idx >= 0) list[idx] = podcast;
    else list.unshift(podcast);
    saveDatabase(db);
    res.json({ podcast });
  });

  // GET /api/podcast/today — today's digest (auto-generate on first hit)
  app.get('/api/podcast/today', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const list = db.podcasts as DailyPodcast[];
    let podcast = list.find((p) => p.userId === user.id && p.date === today());
    if (!podcast) {
      podcast = buildDailyPodcast(db, user);
      list.unshift(podcast);
      saveDatabase(db);
    }
    res.json({ podcast });
  });

  // GET /api/podcast/history
  app.get('/api/podcast/history', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.podcasts as DailyPodcast[])
      .filter((p) => p.userId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30);
    res.json({ podcasts: mine });
  });
}
