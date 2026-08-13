/**
 * Ocean — AI Comment Summarizer (Feature 142)
 * -------------------------------------------
 * Aggregates a post's comments into: overall sentiment, key themes, top
 * participants and 2-3 key points. Uses the LLM when a key is present; always
 * degrades to a deterministic extractive template. Cached per post.
 *
 * Model (global db, idempotent ensure):
 *   db.commentSummaries — array of { postId, summary, sentiment, themes, keyPoints,
 *                          topCommenters, commentCount, mode, createdAt }
 *
 * Routes:
 *   GET  /api/posts/:postId/comment-summary          -> cached or fresh (guest-safe)
 *   POST /api/posts/:postId/comment-summary/refresh  -> force regenerate
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

export type Sentiment = 'positive' | 'neutral' | 'mixed' | 'negative';

export interface CommentSummary {
  postId: string;
  commentCount: number;
  summary: string;
  sentiment: Sentiment;
  themes: string[];
  keyPoints: string[];
  topCommenters: { id: string; name: string; count: number }[];
  mode: 'llm' | 'template';
  createdAt: number;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'is', 'are', 'was', 'were', 'this', 'that', 'it', 'be',
  'as', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'their', 'our', 'its', 'not', 'no', 'so', 'if', 'do',
  'does', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have', 'had',
  'about', 'just', 'very', 'really', 'like', 'get', 'got', 'go', 'went', 'please', 'post', 'comment',
]);

const POSITIVE_WORDS = ['love', 'great', 'good', 'awesome', 'nice', 'amazing', 'thanks', 'thank', 'helpful', 'excellent', 'best', 'beautiful', 'happy', 'enjoy', 'wonderful', 'agree', 'like', 'cool', 'perfect', 'superb'];
const NEGATIVE_WORDS = ['hate', 'bad', 'terrible', 'awful', 'worst', 'disappointed', 'annoying', 'angry', 'sad', 'wrong', 'scam', 'fake', 'useless', 'disgusting', 'regret', 'broken', 'failed', 'waste'];

function ensureCollection(db: any): void {
  if (!Array.isArray(db.commentSummaries)) db.commentSummaries = [];
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

function normalizeComments(db: any, post: any): any[] {
  return (post.comments || []).map((c: any) => {
    let name = c.senderName;
    if (c.senderId) {
      const u = (db.users || []).find((x: any) => x && x.id === c.senderId);
      if (u) name = u.name || u.username || name;
    }
    return { ...c, senderName: name || 'Anonymous' };
  });
}

function themesFrom(comments: any[]): string[] {
  const freq = new Map<string, number>();
  comments.forEach((c) => {
    String(c?.text || '')
      .toLowerCase()
      .replace(/[^a-z0-9À-ÿ]+/g, ' ')
      .split(/\s+/)
      .forEach((w) => {
        if (w.length >= 4 && !STOP_WORDS.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
      });
  });
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([w]) => w);
}

function sentimentFrom(comments: any[]): Sentiment {
  let pos = 0;
  let neg = 0;
  comments.forEach((c) => {
    const lower = String(c?.text || '').toLowerCase();
    pos += POSITIVE_WORDS.filter((w) => lower.includes(w)).length;
    neg += NEGATIVE_WORDS.filter((w) => lower.includes(w)).length;
  });
  if (pos === 0 && neg === 0) return 'neutral';
  if (pos > 0 && neg > 0) return 'mixed';
  return pos > neg ? 'positive' : 'negative';
}

function keyPointsFrom(comments: any[]): string[] {
  // Extractive: pick the sentences with the most theme keywords.
  const themes = themesFrom(comments);
  const scored: { text: string; score: number }[] = [];
  comments.forEach((c) => {
    const t = String(c?.text || '').trim();
    if (t.length < 15) return;
    const lower = t.toLowerCase();
    let score = 0;
    themes.forEach((th) => {
      if (lower.includes(th)) score += 2;
    });
    if (t.length > 90) score += 1; // substantive comments
    scored.push({ text: t.length > 140 ? `${t.slice(0, 140)}…` : t, score });
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.text);
}

function topCommentersFrom(comments: any[]): { id: string; name: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; count: number }>();
  comments.forEach((c) => {
    const key = String(c?.senderId || c?.senderName || 'anon');
    if (!map.has(key)) map.set(key, { id: key, name: c.senderName || 'Anonymous', count: 0 });
    map.get(key)!.count += 1;
  });
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function templateSummary(comments: any[], sentiment: Sentiment, themes: string[]): string {
  const n = comments.length;
  let s = `${n} comment${n === 1 ? '' : 's'} on this post.`;
  s += ` Overall tone is ${sentiment}.`;
  if (themes.length > 0) s += ` The discussion centers on ${themes.slice(0, 3).join(', ')}.`;
  return s;
}

function extractText(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : typeof (c as any)?.text === 'string' ? (c as any).text : ''))
      .join('\n');
  }
  return '';
}

function stripJsonFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

function sanitizeSentiment(v: unknown): Sentiment {
  return v === 'positive' || v === 'neutral' || v === 'mixed' || v === 'negative' ? v : 'neutral';
}

async function buildSummary(db: any, post: any): Promise<CommentSummary> {
  const comments = normalizeComments(db, post);
  const themes = themesFrom(comments);
  const sentiment = sentimentFrom(comments);
  const keyPoints = keyPointsFrom(comments);
  const topCommenters = topCommentersFrom(comments);
  const base = {
    postId: post.id,
    commentCount: comments.length,
    summary: templateSummary(comments, sentiment, themes),
    sentiment,
    themes,
    keyPoints,
    topCommenters,
    mode: 'template' as const,
    createdAt: Date.now(),
  };

  const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
  if (!keyPresent || comments.length < 2) return base;

  try {
    const transcript = comments
      .map((c: any) => `${c.senderName}: ${String(c?.text || '').slice(0, 200)}`)
      .join('\n')
      .slice(0, 4000);
    const result = await invokeLLM({
      messages: [
        {
          role: 'system',
          content:
            'You summarize a comment thread. Reply with JSON only: {"summary": string (2 sentences), "sentiment": "positive"|"neutral"|"mixed"|"negative", "keyPoints": string[] (2-3 short bullets, each under 60 words)}. No markdown.',
        },
        { role: 'user', content: transcript },
      ],
      model: 'gemini-3.5-flash',
      maxTokens: 350,
      responseFormat: { type: 'json_object' },
    });
    const raw = extractText(result.choices?.[0]?.message?.content);
    const parsed = JSON.parse(stripJsonFences(raw || '{}'));
    return {
      ...base,
      summary: typeof parsed?.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim().slice(0, 600) : base.summary,
      sentiment: sanitizeSentiment(parsed?.sentiment),
      keyPoints: Array.isArray(parsed?.keyPoints)
        ? parsed.keyPoints.map((k: unknown) => String(k).trim().slice(0, 160)).filter(Boolean).slice(0, 3)
        : keyPoints,
      mode: 'llm',
    };
  } catch (e: any) {
    console.warn('[comment-summary] llm error:', e?.message || e);
    return base;
  }
}

export function registerCommentSummaryRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/posts/:postId/comment-summary
  app.get('/api/posts/:postId/comment-summary', async (req, res) => {
    try {
      const db = loadDatabase();
      ensureCollection(db);
      const post = findPostById(db, req.params.postId);
      if (!post) return res.status(404).json({ error: 'Post not found.' });
      const cached = (db.commentSummaries as CommentSummary[]).find((s) => s.postId === req.params.postId);
      if (cached && Date.now() - cached.createdAt < 10 * 60 * 1000) {
        return res.json({ summary: cached, cached: true });
      }
      const summary = await buildSummary(db, post);
      const list = db.commentSummaries as CommentSummary[];
      const idx = list.findIndex((s) => s.postId === req.params.postId);
      if (idx >= 0) list[idx] = summary;
      else list.unshift(summary);
      saveDatabase(db);
      res.json({ summary, cached: false });
    } catch (e: any) {
      console.warn('[comment-summary] error:', e?.message || e);
      res.status(500).json({ error: 'Comment summarization failed.' });
    }
  });

  // POST /api/posts/:postId/comment-summary/refresh (auth — regeneration costs LLM budget)
  app.post('/api/posts/:postId/comment-summary/refresh', requireAuth, async (req, res) => {
    try {
      const db = loadDatabase();
      ensureCollection(db);
      const post = findPostById(db, req.params.postId);
      if (!post) return res.status(404).json({ error: 'Post not found.' });
      const summary = await buildSummary(db, post);
      const list = db.commentSummaries as CommentSummary[];
      const idx = list.findIndex((s) => s.postId === req.params.postId);
      if (idx >= 0) list[idx] = summary;
      else list.unshift(summary);
      saveDatabase(db);
      res.json({ summary, cached: false });
    } catch (e: any) {
      console.warn('[comment-summary] refresh error:', e?.message || e);
      res.status(500).json({ error: 'Comment summarization failed.' });
    }
  });
}
