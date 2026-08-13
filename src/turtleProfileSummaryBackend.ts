/**
 * Ocean — AI Profile Summary (Feature 141)
 * ----------------------------------------
 * Generates a one-line summary of a user from their posts, bio and interests.
 * Uses the LLM when a key is present; always degrades to a deterministic template.
 * Caches the result on the user's profile (user.profile.aiSummary).
 *
 * Routes:
 *   GET  /api/users/:userId/summary            -> cached or freshly generated summary (guest-safe)
 *   POST /api/users/:userId/summary/refresh    -> force regeneration (auth: self or admin)
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

export interface ProfileSummary {
  text: string;
  mode: 'llm' | 'template';
  generatedAt: number;
  stats: {
    posts: number;
    reels: number;
    topHashtags: string[];
    topTopic: string;
    mostEngaged: string;
  };
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'is', 'are', 'was', 'were', 'this', 'that', 'it', 'be',
  'as', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'their', 'our', 'its', 'not', 'no', 'so', 'if', 'do',
  'does', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have', 'had',
  'about', 'just', 'very', 'really', 'like', 'get', 'got', 'go', 'went', 'please',
]);

function resolveUser(db: any, ref: string): any | null {
  const q = String(ref || '').trim();
  if (!q) return null;
  const byId = (db.users || []).find((u: any) => u && u.id === q);
  if (byId) return byId;
  return (
    (db.users || []).find(
      (u: any) => u && (u.name === q || u.username === q || (u.profile && u.profile.username === q))
    ) || null
  );
}

function postsOf(u: any): any[] {
  return Array.isArray(u?.profile?.posts) ? u.profile.posts : [];
}

function topHashtags(posts: any[]): string[] {
  const freq = new Map<string, number>();
  posts.forEach((p) => {
    (String(p?.content || '') + ' ' + String(p?.title || ''))
      .match(/#[a-zA-Z0-9_]+/g)
      ?.forEach((h) => freq.set(h.toLowerCase(), (freq.get(h.toLowerCase()) || 0) + 1));
  });
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([h]) => h);
}

function topTopic(posts: any[]): string {
  const freq = new Map<string, number>();
  posts.forEach((p) => {
    String(p?.content || '')
      .toLowerCase()
      .replace(/[^a-z0-9À-ÿ]+/g, ' ')
      .split(/\s+/)
      .forEach((w) => {
        if (w.length >= 4 && !STOP_WORDS.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
      });
  });
  const best = Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : '';
}

function mostEngaged(posts: any[]): string {
  let best: any = null;
  let bestScore = -1;
  posts.forEach((p) => {
    const score = Number(p?.views || 0) + Number(p?.likes || 0) * 5 + (p?.comments?.length || 0) * 10;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  });
  if (!best) return '';
  const s = String(best?.content || best?.title || '').trim();
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function templateSummary(u: any, stats: ProfileSummary['stats']): string {
  const name = u?.name || u?.username || 'This user';
  const bio = String(u?.profile?.bio || '').trim();
  const interests = Array.isArray(u?.profile?.interests) ? u.profile.interests : [];
  const bits: string[] = [];
  if (bio) bits.push(`“${bio.slice(0, 80)}${bio.length > 80 ? '…' : ''}”`);
  if (interests.length > 0) bits.push(`interested in ${interests.slice(0, 3).join(', ')}`);
  if (stats.posts > 0) {
    const topic = stats.topTopic ? `mostly posting about ${stats.topTopic}` : 'an active poster';
    bits.push(topic);
  }
  if (stats.mostEngaged) bits.push(`best post: “${stats.mostEngaged}”`);
  if (bits.length === 0) return `${name} keeps a quiet, private profile.`;
  return `${name} — ${bits.join('; ')}.`;
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

export function buildProfileSummary(db: any, u: any): ProfileSummary {
  const posts = postsOf(u);
  const stats: ProfileSummary['stats'] = {
    posts: posts.length,
    reels: posts.filter((p: any) => p.type === 'reel' || p.videoUrl).length,
    topHashtags: topHashtags(posts),
    topTopic: topTopic(posts),
    mostEngaged: mostEngaged(posts),
  };

  return { text: templateSummary(u, stats), mode: 'template', generatedAt: Date.now(), stats };
}

async function buildProfileSummaryLlm(db: any, u: any): Promise<ProfileSummary> {
  const base = buildProfileSummary(db, u);
  const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
  if (!keyPresent) return base;

  const name = u?.name || u?.username || 'User';
  const bio = String(u?.profile?.bio || '').trim();
  const interests = Array.isArray(u?.profile?.interests) ? u.profile.interests : [];
  const samplePosts = postsOf(u)
    .slice(0, 10)
    .map((p: any) => String(p?.content || p?.title || '').slice(0, 120))
    .filter(Boolean)
    .slice(0, 6);

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: 'system',
          content:
            'You write ONE friendly one-line social-media profile summary (max 40 words) from bio, interests and post samples. Reply with JSON only: {"text": string}. No markdown.',
        },
        {
          role: 'user',
          content: `Name: ${name}\nBio: ${bio || '(none)'}\nInterests: ${interests.join(', ') || '(none)'}\nRecent posts:\n${samplePosts.map((s: string) => `- ${s}`).join('\n') || '(none)'}`,
        },
      ],
      model: 'gemini-3.5-flash',
      maxTokens: 120,
      responseFormat: { type: 'json_object' },
    });
    const raw = extractText(result.choices?.[0]?.message?.content);
    const parsed = JSON.parse(stripJsonFences(raw || '{}'));
    const text = typeof parsed?.text === 'string' && parsed.text.trim() ? parsed.text.trim().slice(0, 240) : base.text;
    return { ...base, text, mode: 'llm' as const };
  } catch (e: any) {
    console.warn('[profile-summary] llm error:', e?.message || e);
    return base;
  }
}

export function registerProfileSummaryRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/users/:userId/summary — cached or generated (guest-safe)
  app.get('/api/users/:userId/summary', async (req, res) => {
    try {
      const db = loadDatabase();
      const u = resolveUser(db, req.params.userId);
      if (!u) return res.status(404).json({ error: 'User not found.' });
      const cached: ProfileSummary | undefined = u?.profile?.aiSummary;
      if (cached && cached.generatedAt && Date.now() - cached.generatedAt < 6 * 3600 * 1000) {
        return res.json({ summary: cached, cached: true });
      }
      const summary = await buildProfileSummaryLlm(db, u);
      if (!u.profile) u.profile = {};
      u.profile.aiSummary = summary;
      saveDatabase(db);
      res.json({ summary, cached: false });
    } catch (e: any) {
      console.warn('[profile-summary] error:', e?.message || e);
      res.status(500).json({ error: 'Summary generation failed.' });
    }
  });

  // POST /api/users/:userId/summary/refresh — force regenerate (auth)
  app.post('/api/users/:userId/summary/refresh', requireAuth, async (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    const u = resolveUser(db, req.params.userId);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    if (u.id !== user.id && !user.isAdmin) {
      return res.status(403).json({ error: 'You can only refresh your own summary.' });
    }
    const summary = await buildProfileSummaryLlm(db, u);
    if (!u.profile) u.profile = {};
    u.profile.aiSummary = summary;
    saveDatabase(db);
    res.json({ summary, cached: false });
  });
}
