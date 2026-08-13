/**
 * Ocean — Semantic Media Search backend
 * --------------------------------------
 * Natural-language visual search over reels / media keyframes (FEATURE 110).
 *
 * Flow:
 *  1. The frontend captures a video keyframe client-side (canvas), uploads it to
 *     the existing `/api/upload` route, then POSTs `/api/search/media/index`
 *     with the returned `/uploads/<name>` url (+ postId / mediaUrl / caption).
 *  2. The backend optionally enriches the frame with Gemini vision
 *     (GEMINI_API_KEY gated — degrades silently to the caption), tokenizes into a
 *     deterministic 128-dim hashed vector, and upserts the entry into db.mediaIndex.
 *  3. `GET /api/search/media?q=...` embeds the query and returns cosine-ranked hits.
 *
 * Persistence: db.mediaIndex (idempotent ensure). NEVER base64 in the db — always
 * `/uploads/...` urls (base64 keyframes/media urls are rejected at the route).
 */

import fs from 'fs';
import path from 'path';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { getCtx } from './turtleServerContext';

export interface MediaIndexEntry {
  id: string;
  postId: string | null;
  mediaUrl: string | null;
  keyframeUrl: string | null;
  caption: string;
  description: string;
  keywords: string[];
  vector: number[];
  indexedBy: string;
  indexedAt: number;
}

// ---------------------------------------------------------------------------
// Deterministic text embedding (no external API needed)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'is', 'are', 'was', 'were', 'this', 'that', 'it', 'be', 'as',
]);

/** Lowercases, splits on non-alphanumerics and filters a small stopword list.
 * Keeps all codepoints >= U+0080 so Bengali / Devanagari / Arabic text (as well as
 * Latin) survives tokenization — this app serves Bangladeshi users. */
export function tokenize(text: string): string[] {
  return String(text || '')
    .normalize('NFC')
    .toLowerCase()
            .split(/[^a-z0-9\u00C0-\uFFFF]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Stable FNV-ish 32-bit string hash (deterministic across restarts). */
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Bag-of-hashed-tokens embedding: each token votes +1 into one position and -1
 * into another (derived from two hash bits), then the vector is L2-normalized.
 */
export function embedText(text: string, dim = 128): number[] {
  const vec = new Array<number>(dim).fill(0);
  for (const token of tokenize(text)) {
    const h = hashString(token);
    vec[h % dim] += 1;
    vec[(h >>> 8) % dim] -= 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] = vec[i] / norm;
  }
  return vec;
}

/** Cosine similarity between two equal-length vectors (0 on bad input). */
export function cosine(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------------
// Gemini vision enrichment (OPTIONAL — returns null without a key, never crashes)
// ---------------------------------------------------------------------------

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not configured.');
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    default: return 'image/jpeg';
  }
}

/**
 * Describes an image keyframe with Gemini (model gemini-3.5-flash) returning
 * `{ description, keywords }`. `keyframeUrl` must be a same-origin /uploads/...
 * url. Returns null if the key is unset, the file is missing, or on any error.
 */
export async function describeImage(
  keyframeUrl: string
): Promise<{ description: string; keywords: string[] } | null> {
  if (!keyframeUrl || !process.env.GEMINI_API_KEY) return null;
  try {
    if (!/^\/uploads\//.test(keyframeUrl)) return null; // never accept base64/data urls
    const filePath = path.join(process.cwd(), keyframeUrl.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(keyframeUrl).replace('.', '');
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeFromExt(ext), data: buf.toString('base64') } },
          {
            text: 'Describe the visual content of this image in one short, concrete sentence (e.g. "girl in red saree dancing"). Then list 3-8 short lowercase keyword tags someone might search for. Reply with JSON only: {"description": string, "keywords": string[]}. No markdown.',
          },
        ],
      },
      config: { responseMimeType: 'application/json', temperature: 0.4 },
    });
    const text = response.text?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k: unknown) => String(k).toLowerCase()).filter((k: string) => k.length > 0).slice(0, 12)
      : [];
    return { description: String(parsed.description || ''), keywords };
  } catch (e: any) {
    console.warn('[media-search] describeImage error:', e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Small db helpers
// ---------------------------------------------------------------------------

function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  const re = /#([a-zA-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || ''))) !== null) {
    tags.push(m[1].toLowerCase());
  }
  return tags;
}

/** Looks a post up in both db.posts and every user's profile.posts. */
function findPostById(db: any, postId: string): any {
  if (!postId) return null;
  if (Array.isArray(db.posts)) {
    const p = db.posts.find((x: any) => x && x.id === postId);
    if (p) return p;
  }
  for (const u of db.users || []) {
    const posts = u?.profile?.posts;
    if (Array.isArray(posts)) {
      const p = posts.find((x: any) => x && x.id === postId);
      if (p) return p;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerMediaSearchRoutes(app: express.Express) {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase } = ctx;

  // POST /api/search/media/index — upsert a single media entry (requireAuth)
  app.post('/api/search/media/index', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const body = req.body || {};
      const postId = body.postId ? String(body.postId) : null;
      const rawMedia = body.mediaUrl ? String(body.mediaUrl) : null;
      const mediaUrl = rawMedia && !/^data:/.test(rawMedia) ? rawMedia : null; // never base64
      const rawKeyframe = body.keyframeUrl ? String(body.keyframeUrl) : null;
      const keyframeUrl = rawKeyframe && /^\/uploads\//.test(rawKeyframe) ? rawKeyframe : null;
      const caption = body.caption ? String(body.caption) : '';

      const db = loadDatabase();
      if (!Array.isArray(db.mediaIndex)) db.mediaIndex = [];

      // Backfill mediaUrl / caption from the post when a postId is supplied.
      const post = postId ? findPostById(db, postId) : null;
      const resolvedMediaUrl = mediaUrl || post?.videoUrl || post?.imageUrl || null;
      const resolvedCaption = caption || post?.content || post?.title || '';

      // Gemini enrichment first, caption fallback.
      let description = '';
      const keywords: string[] = [];
      if (keyframeUrl) {
        const enriched = await describeImage(keyframeUrl);
        if (enriched) {
          description = enriched.description || '';
          enriched.keywords.forEach((k) => {
            if (k && !keywords.includes(k)) keywords.push(k);
          });
        }
      }
      if (!description) description = resolvedCaption;
      extractHashtags(resolvedCaption).forEach((t) => {
        if (!keywords.includes(t)) keywords.push(t);
      });

      const vector = embedText([description, keywords.join(' ')].filter(Boolean).join(' '));

      let idx = -1;
      if (postId) {
        idx = db.mediaIndex.findIndex((e: any) => e && e.postId === postId);
      } else if (resolvedMediaUrl) {
        idx = db.mediaIndex.findIndex((e: any) => e && e.mediaUrl === resolvedMediaUrl);
      }
      const existing = idx >= 0 ? db.mediaIndex[idx] : null;

      const entry: MediaIndexEntry = {
        id: existing?.id || `media-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        postId,
        mediaUrl: resolvedMediaUrl,
        keyframeUrl,
        caption: resolvedCaption,
        description: description || resolvedCaption,
        keywords,
        vector,
        indexedBy: user.id,
        indexedAt: Date.now(),
      };
      if (idx >= 0) db.mediaIndex[idx] = entry;
      else db.mediaIndex.push(entry);
      saveDatabase(db);
      res.json({ entry, gemini: !!(keyframeUrl && process.env.GEMINI_API_KEY) });
    } catch (e: any) {
      console.warn('[media-search] index error:', e?.message || e);
      res.status(500).json({ error: 'Failed to index media.' });
    }
  });

  // GET /api/search/media?q=<query> — guest-safe cosine search (top 20)
  app.get('/api/search/media', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Query required (?q=...)' });
    const db = loadDatabase();
    const entries = Array.isArray(db.mediaIndex) ? db.mediaIndex : [];
    const viewer = ctx.getRequestUser(req);
    const viewerId = viewer?.id || null;
    const qvec = embedText(q);
    const results = entries
      .filter((e: any) => e && Array.isArray(e.vector) && e.vector.length > 0)
      .map((e: any) => {
        let sim = cosine(e.vector, qvec);
        if (viewerId && e.indexedBy === viewerId) sim = Math.min(1, sim + 0.04); // light personalization
        return { entry: e as MediaIndexEntry, similarity: Number(sim.toFixed(4)) };
      })
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, 20);
    res.json({ results, query: q, total: results.length, indexed: entries.length, viewerId });
  });

  // POST /api/search/media/backfill — index the caller's own reels (caption-only,
  // no keyframes) so the index is never empty even before the client captures frames.
  app.post('/api/search/media/backfill', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    if (!Array.isArray(db.mediaIndex)) db.mediaIndex = [];
    const indexedPostIds = new Set<string>();
    db.mediaIndex.forEach((e: any) => {
      if (e && e.postId) indexedPostIds.add(e.postId);
    });

    const own: any[] = [];
    const seen = new Set<string>();
    (user.profile?.posts || []).forEach((p: any) => {
      if (p && p.id && p.videoUrl && !seen.has(p.id)) {
        seen.add(p.id);
        own.push(p);
      }
    });
    (db.posts || []).forEach((p: any) => {
      if (p && p.id && p.videoUrl && !seen.has(p.id)) {
        const ownerId = p.creator?.id || p.authorId || p.creatorId;
        if (ownerId === user.id) {
          seen.add(p.id);
          own.push(p);
        }
      }
    });

    let indexed = 0;
    let skipped = 0;
    for (const p of own) {
      if (indexedPostIds.has(p.id)) {
        skipped++;
        continue;
      }
      const caption = p.content || p.title || '';
      const hashtags = extractHashtags(caption);
      db.mediaIndex.push({
        id: `media-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        postId: p.id,
        mediaUrl: p.videoUrl || null,
        keyframeUrl: null,
        caption,
        description: caption,
        keywords: hashtags,
        vector: embedText([caption, hashtags.join(' ')].filter(Boolean).join(' ')),
        indexedBy: user.id,
        indexedAt: Date.now(),
      });
      indexed++;
    }
    saveDatabase(db);
    res.json({ indexed, skipped, total: db.mediaIndex.length });
  });
}
