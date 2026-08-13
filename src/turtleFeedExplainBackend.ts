/**
 * Ocean — AI Personal Feed Explanation (Feature 140)
 * ---------------------------------------------------
 * Answers "Why did I see this?" for any feed item by decomposing the REAL ranking
 * signals the app already uses (recency, engagement, author trust, topic match,
 * content type) into an explainable breakdown — same explainability philosophy as
 * the ATLAS-RANK engine's signal ledger, delivered as a human-readable blurb.
 *
 * Model (global db, idempotent ensure):
 *   db.feedExplanations — ring buffer of { id, userId, postId, reasons, blurb, createdAt }
 *
 * Routes:
 *   POST /api/feed/explain          { postId } -> explain (auth; per-user)
 *   GET  /api/feed/explain-history            -> my recent explanations (auth)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

export interface ExplainReason {
  signal: string;
  label: string;
  value: number; // 0-100
  weight: number; // 0-1
  detail: string;
}

export interface FeedExplanation {
  id: string;
  userId: string;
  postId: string;
  postSnippet: string;
  reasons: ExplainReason[];
  blurb: string;
  topReason: string;
  createdAt: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.feedExplanations)) db.feedExplanations = [];
}

function findPostById(db: any, postId: string): any | null {
  if (!postId) return null;
  for (const u of db.users || []) {
    const p = (u.profile?.posts || []).find((x: any) => x && x.id === postId);
    if (p) return p;
  }
  const p = (db.posts || []).find((x: any) => x && x.id === postId);
  return p || null;
}

function postAuthorId(p: any): string {
  return String(p?.creator?.id || p?.authorId || p?.creatorId || p?.userId || p?.ownerId || 'unknown');
}

function postTimestamp(p: any): number {
  const raw = p?.timestamp ?? p?.createdAt ?? p?.createdTime ?? 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

function postSnippet(p: any): string {
  const s = String(p?.content || p?.title || p?.caption || '').trim();
  return s.length > 120 ? `${s.slice(0, 120)}…` : s || '(media post)';
}

function hashtagsOf(p: any): string[] {
  return (String(p?.content || '') + ' ' + String(p?.title || ''))
    .match(/#[a-zA-Z0-9_]+/g)
    ?.map((h) => h.toLowerCase().slice(1)) || [];
}

function authorTrust(db: any, authorId: string): number {
  // Fall back to the user's ATS/TS scores if present, else neutral 60.
  if (authorId === 'unknown') return 60;
  const u = (db.users || []).find((x: any) => x && x.id === authorId);
  if (!u) return 60;
  const trust = u.profile?.trustScore ?? u.trustScore;
  if (typeof trust === 'number' && Number.isFinite(trust)) return clamp(Math.round(trust), 0, 100);
  return 60;
}

function topicMatch(db: any, viewer: any, p: any): { value: number; detail: string } {
  const interests = Array.isArray(viewer?.profile?.interests)
    ? viewer.profile.interests.map((i: string) => String(i).toLowerCase())
    : [];
  const tags = hashtagsOf(p);
  if (interests.length === 0 && tags.length === 0) return { value: 50, detail: 'No interest signals to compare' };
  // Count each shared tag once (tags are the canonical set to compare).
  const hits = tags.filter((t) => interests.includes(t)).length;
  const value = tags.length === 0 ? 50 : clamp(40 + (hits / Math.max(1, tags.length)) * 60, 10, 100);
  const detail =
    hits > 0
      ? `Matches your interests (${hits} shared tag${hits === 1 ? '' : 's'})`
      : tags.length > 0
        ? `No direct overlap with your interests (tags: ${tags.slice(0, 4).join(', ')})`
        : 'No hashtags to compare';
  return { value, detail };
}

function engagementScore(p: any): { value: number; detail: string } {
  const views = Number(p?.views || p?.viewCount || 0);
  const likes = Number(p?.likes || p?.reactions || 0);
  const comments = Number(p?.comments?.length || 0);
  const total = views + likes * 5 + comments * 10;
  const value = clamp(Math.round(20 + Math.log10(Math.max(1, total + 1)) * 18), 20, 100);
  return { value, detail: `${views} views · ${likes} likes · ${comments} comments` };
}

function recencyScore(p: any): { value: number; detail: string } {
  const ageH = (Date.now() - postTimestamp(p)) / 3600_000;
  if (ageH < 1) return { value: 98, detail: 'Posted less than an hour ago' };
  if (ageH < 24) return { value: 88, detail: `Posted ${Math.round(ageH)}h ago` };
  if (ageH < 168) return { value: 62, detail: `Posted ${Math.round(ageH / 24)}d ago` };
  return { value: 30, detail: `Posted ${Math.round(ageH / 24)}d ago — evergreen` };
}

function typeScore(p: any): { value: number; detail: string } {
  const t = String(p?.type || (p?.videoUrl ? 'reel' : 'post'));
  if (t === 'reel') return { value: 82, detail: 'Reels get an exploration boost in your feed' };
  if (t === 'video') return { value: 72, detail: 'Long-form video surfaced by watch history' };
  return { value: 60, detail: 'Standard post from your network' };
}

function buildBlurb(reasons: ExplainReason[], top: ExplainReason): string {
  const r = reasons.filter((x) => x.value >= 55);
  const parts = r.map((x) => x.label.toLowerCase());
  if (parts.length === 0) return `This item made it to your feed mainly via ${top.label.toLowerCase()} (${top.value}/100).`;
  const lead = parts.slice(0, 2).join(' and ');
  return `You saw this because it ranks high on ${lead}${parts.length > 2 ? `, plus ${parts.length - 2} more signal${parts.length === 3 ? '' : 's'}` : ''}. ${top.detail}.`;
}

/** Deterministic explanation from real post + viewer signals. */
export function explainPost(db: any, viewer: any, post: any): { reasons: ExplainReason[]; blurb: string; topReason: string } {
  const rec = recencyScore(post);
  const eng = engagementScore(post);
  const auth = authorTrust(db, postAuthorId(post));
  const topic = topicMatch(db, viewer, post);
  const type = typeScore(post);

  // Mirror the feed's actual weighting: engagement + recency lead, trust + topic moderate.
  const reasons: ExplainReason[] = [
    { signal: 'engagement', label: 'Engagement', value: eng.value, weight: 0.3, detail: eng.detail },
    { signal: 'recency', label: 'Recency', value: rec.value, weight: 0.25, detail: rec.detail },
    { signal: 'author_trust', label: 'Author trust', value: auth, weight: 0.2, detail: `Author trust score ${auth}/100` },
    { signal: 'topic_match', label: 'Topic match', value: topic.value, weight: 0.15, detail: topic.detail },
    { signal: 'content_type', label: 'Content type', value: type.value, weight: 0.1, detail: type.detail },
  ];
  const weighted = reasons.reduce((s, r) => s + r.value * r.weight, 0);
  const top = reasons.reduce((a, b) => (b.value > a.value ? b : a));
  const blurb = buildBlurb(reasons, top) + ` Overall fit ${Math.round(weighted)}/100.`;
  return { reasons, blurb, topReason: top.signal };
}

export function registerFeedExplainRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // POST /api/feed/explain — explain a post for the current user (auth)
  app.post('/api/feed/explain', requireAuth, (req, res) => {
    const user = (req as any).user;
    const postId = String((req.body || {}).postId || '').trim();
    if (!postId) return res.status(400).json({ error: 'postId is required.' });

    const db = loadDatabase();
    ensureCollection(db);
    const post = findPostById(db, postId);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const explanation: FeedExplanation = {
      id: `fx-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      userId: user.id,
      postId,
      postSnippet: postSnippet(post),
      ...explainPost(db, user, post),
      createdAt: Date.now(),
    };
    const list = db.feedExplanations as FeedExplanation[];
    list.unshift(explanation);
    // per-user ring buffer (last 30)
    const mine = list.filter((x) => x.userId === user.id);
    if (mine.length > 30) {
      const drop = new Set(mine.slice(30).map((x) => x.id));
      for (let i = list.length - 1; i >= 0; i--) if (drop.has(list[i].id)) list.splice(i, 1);
    }
    saveDatabase(db);
    res.json({ explanation });
  });

  // GET /api/feed/explain-history — my recent explanations (auth)
  app.get('/api/feed/explain-history', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.feedExplanations as FeedExplanation[])
      .filter((x) => x.userId === user.id)
      .slice(0, 30);
    res.json({ explanations: mine });
  });
}
