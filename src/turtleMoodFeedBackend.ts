/**
 * Ocean — Mood Feed (Feature 245)
 * ---------------------------------
 * Filter the feed by sentiment: POSITIVE (uplift), EDUCATIONAL (informative),
 * ALL. A lightweight lexicon-based sentiment scorer runs server-side so the
 * mood feed works without an LLM key; Gemini can upgrade accuracy when set.
 *
 * NOTE: `/api/feed/mood` is already owned by feature 156 (Uplift Feed), so this
 * module deliberately uses `/api/mood/feed` to avoid a route collision.
 *
 * Routes:
 *   GET /api/mood/feed?mood=positive|educational|all|uplift  (auth) sentiment-filtered feed
 *   GET /api/mood/sentiment?text=...                         (auth) score a snippet
 */

import express from 'express';
import { getCtx } from './turtleServerContext';

const POSITIVE = new Set(['happy', 'joy', 'love', 'great', 'amazing', 'awesome', 'good', 'best', 'thank', 'thanks', 'congrats', 'proud', 'beautiful', 'wonderful', 'excited', 'fantastic', 'blessed', 'win', 'success', 'hope', 'smile', 'grateful', '🙏', '😊', '😍', '🎉', '❤️']);
const EDUCATIONAL = new Set(['learn', 'how to', 'tutorial', 'guide', 'tips', 'explain', 'science', 'math', 'history', 'why', 'what is', 'study', 'course', 'lesson', 'formula', 'fact', 'research', 'books', 'practice', 'solve']);
const NEGATIVE = new Set(['sad', 'hate', 'angry', 'bad', 'worst', 'terrible', 'awful', 'fail', 'cry', 'fear', 'scared', 'depressed', '😢', '😡', '💔']);

export type Sentiment = 'positive' | 'negative' | 'neutral' | 'educational';

function classify(text: string): Sentiment {
  const t = ` ${text.toLowerCase()} `;
  let pos = 0, neg = 0, edu = 0;
  for (const w of POSITIVE) if (t.includes(w)) pos++;
  for (const w of NEGATIVE) if (t.includes(w)) neg++;
  for (const w of EDUCATIONAL) if (t.includes(w)) edu++;
  if (edu >= 2 && edu > neg) return 'educational';
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

export function classifySentiment(text: string): Sentiment {
  return classify(text);
}

/** Dedupe posts across db.posts + user.profile.posts (canonical store merge). */
function gatherPosts(db: any): any[] {
  const postMap = new Map<string, any>();
  (db.posts || []).forEach((p: any) => { if (p && p.id) postMap.set(p.id, p); });
  (db.users || []).forEach((u: any) => {
    (u.profile?.posts || []).forEach((p: any) => {
      if (p && p.id && !postMap.has(p.id)) postMap.set(p.id, { ...p, _ownerName: u.name || u.username });
    });
  });
  return Array.from(postMap.values());
}

function s(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerMoodFeedRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase } = getCtx();

  app.get('/api/mood/feed', requireAuth, (req, res) => {
    const mood = s((req.query as any).mood, 20) || 'all';
    const db = loadDatabase();
    const scored = gatherPosts(db).map((p) => {
      const text = [p.text, p.caption, p.title, p.content].filter(Boolean).join(' ');
      return { post: p, sentiment: classify(text) };
    });
    let filtered = scored;
    if (mood === 'positive') filtered = scored.filter((x) => x.sentiment === 'positive');
    else if (mood === 'educational') filtered = scored.filter((x) => x.sentiment === 'educational');
    else if (mood === 'uplift') filtered = scored.filter((x) => x.sentiment !== 'negative');
    const ts = (p: any): number => {
      const raw = p?.timestamp ?? p?.createdAt ?? 0;
      return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : Date.now();
    };
    filtered.sort((a, b) => ts(b.post) - ts(a.post));
    res.json({ posts: filtered.slice(0, 60).map((x) => ({ ...x.post, moodSentiment: x.sentiment })), mood });
  });

  app.get('/api/mood/sentiment', requireAuth, (req, res) => {
    const text = s((req.query as any).text, 500);
    res.json({ text, sentiment: classify(text) });
  });
}
