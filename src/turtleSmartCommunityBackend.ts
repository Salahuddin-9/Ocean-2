/**
 * Ocean — Smart Community backend (FEATURE 118 — AI-powered community management)
 * --------------------------------------------------------------------------------
 * Pure-heuristic community scanning + optional LLM summaries/replies.
 *
 * Routes (all under /api/community/smart/*):
 *   POST /api/community/smart/scan       -> run heuristic scan over posts + comments
 *   GET  /api/community/smart/report     -> latest scan summary + manual flags (guest-safe)
 *   POST /api/community/smart/flag       -> manually flag content
 *   POST /api/community/smart/clear      -> dismiss a detection or flag
 *   POST /api/community/smart/summarize  -> AI/template thread summary keyed by postId
 *   POST /api/community/smart/replies    -> smart reply suggestions
 *   POST /api/community/smart/settings   -> persist tuning thresholds / autoFlagMode
 *
 * Detection is 100% heuristic and deterministic — every detection lists WHICH
 * signals fired (the `signals` array holds human-readable labels) and carries a
 * per-tag score (`scoreByTag`) so settings thresholds map cleanly to tags. No
 * external AI is used for detection; the LLM (invokeLLM, Forge key) is used ONLY
 * for `/summarize` and `/replies` and always degrades to a template fallback.
 *
 * Persistence: global db via ctx.loadDatabase()/saveDatabase() under
 * `db.smartCommunity` (idempotent ensure). NEVER stores base64.
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tag = 'spam' | 'bot' | 'misleading' | 'harmful';

/** A single fired signal: key + human label + weight + the tags it votes for. */
export interface FiredSignal {
  key: string;
  label: string;
  weight: number;
  tags: Tag[];
}

export interface SmartDetection {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  authorId: string;
  /** Human-readable labels of every signal that fired (explainability). */
  signals: string[];
  /** 0-100 overall severity (sum of signal weights, clamped). */
  score: number;
  /** Per-tag severity so settings thresholds map to tags. */
  scoreByTag: Partial<Record<Tag, number>>;
  tags: Tag[];
  createdAt: number;
  /** Truncated source snippet for the UI. */
  text: string;
}

export interface SmartFlag {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string;
  flaggedBy: string;
  flaggedByName?: string;
  auto: boolean;
  createdAt: number;
}

export interface ThreadSummary {
  postId: string;
  summary: string;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'mixed' | 'negative';
  topCommenters: { id: string; name: string; count: number }[];
  mode: 'llm' | 'template';
  createdAt: number;
}

export interface ReplySuggestion {
  kind: 'agree' | 'empathize' | 'clarify' | 'praise';
  text: string;
}

export interface SmartSettings {
  spamThreshold: number;
  misleadingThreshold: number;
  harmfulThreshold: number;
  autoFlagMode: 'off' | 'notify' | 'auto';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TAG_ORDER: Tag[] = ['spam', 'bot', 'misleading', 'harmful'];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordHitCount(text: string, words: string[]): number {
  if (words.length === 0) return 0;
  const re = new RegExp(`\\b(?:${words.map(escRe).join('|')})\\b`, 'gi');
  return (text.match(re) || []).length;
}

function matchPhrases(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

/** Word-boundary phrase matcher — avoids substring false positives like
 * "cure" inside "secure"/"obscure". Returns the distinct phrases that fired. */
function matchWords(text: string, phrases: string[]): string[] {
  if (phrases.length === 0) return [];
  const lower = text.toLowerCase();
  const re = new RegExp(`\\b(?:${phrases.map(escRe).join('|')})\\b`, 'gi');
  const hits = (lower.match(re) || []).map((m) => m.toLowerCase());
  const fired = new Set<string>();
  for (const h of hits) {
    const exact = phrases.find((p) => p.toLowerCase() === h);
    if (exact) {
      fired.add(exact);
    } else {
      // case-insensitive match mapped back to the longest source phrase
      const mapped = phrases
        .filter((p) => h.startsWith(p.toLowerCase()) || p.toLowerCase().startsWith(h))
        .sort((a, b) => b.length - a.length)[0];
      if (mapped) fired.add(mapped);
    }
  }
  return Array.from(fired);
}

/** Deterministic lowercase text normalization (keeps non-Latin codepoints). */
function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9À-￿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Post text = title + content (hashtags included — counted separately). */
function postText(p: any): string {
  return String(p?.content || '') + (p?.title ? ` ${String(p.title)}` : '');
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

/** Largest number of timestamps that fit inside a `windowMs` sliding window. */
function maxInWindow(times: number[], windowMs: number): number {
  if (times.length === 0) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  let max = 1;
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j < sorted.length && sorted[j] - sorted[i] <= windowMs) j++;
    max = Math.max(max, j - i);
  }
  return max;
}

/** Crude phone detector: a single whitespace/comma-separated token with 10-15 digits. */
function hasPhone(text: string): boolean {
  return text
    .split(/[\s,\n]+/)
    .some((token) => {
      const digits = token.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15;
    });
}

// ---------------------------------------------------------------------------
// Heuristic signal tables (deterministic + explainable)
// ---------------------------------------------------------------------------

const LINK_RE = /(?:https?:\/\/|www\.|bit\.ly\/|t\.me\/|wa\.me\/|tinyurl\.com\/)/gi;

// Promotional / spammy keywords (word-boundary matched).
const PROMO_WORDS = [
  'buy', 'click', 'follow', 'dm', 'link in bio', 'offer', 'discount', 'win',
  'free', 'prize', 'telegram', 'whatsapp', 'cheap', 'deal', 'cash', 'paid',
  'earn', 'profit', 'gift', 'giveaway', 'bonus', 'subscribe', 'affiliate',
];

// Sensational fake-news style phrases (substring matched, lowercase).
const SENSATIONAL_PHRASES = [
  'shocking', "you won't believe", 'you wont believe', 'miracle cure',
  '100% guaranteed', 'doctors hate', "they don't want you to know",
  'share before deleted', 'this will change your life', 'must watch',
  'breaking news', 'urgent', 'incredible', 'unbelievable', 'secret',
];

// Unverifiable health / financial claim phrases.
const CLAIM_PHRASES = [
  'cure', 'cures', 'miracle', 'detox', 'lose weight', 'guaranteed profit',
  'double your money', 'earn money fast', 'risk-free', 'guaranteed returns',
  'one weird trick', 'make money', 'get rich', 'overnight', 'instant',
];

// Clickbait pattern phrases.
const CLICKBAIT_PHRASES = [
  'you will never guess', "you won't believe what", 'this is insane',
  'nobody will tell you', 'the truth about', 'they are hiding',
  'gone viral', 'must see', 'top secret', 'number 1',
];

// Compact, clearly-documented profanity list (common English slurs/insults).
// Keep small on purpose — matches the "compact list" requirement; false
// positives are controlled because each hit only contributes to a score.
const PROFANITY = [
  'fuck', 'fucking', 'shit', 'asshole', 'bitch', 'bastard', 'dickhead',
  'motherfucker', 'wanker', 'slut', 'whore', 'cunt', 'retard', 'moron', 'idiot',
];

const THREAT_PATTERNS = [
  /\b(i('| a)?ll|we('| a)?ll|gonna|will) (kill|hurt|beat|shoot|stab|murder|destroy)\b/i,
  /\bkill (you|yourself|him|her|them)\b/i,
  /\bdie\b[\s\S]{0,40}\b(you|your)\b/i,
  /\b(go|rot) (to )?hell\b/i,
  /\b(punch|attack|slash|burn) (you|your)\b/i,
  /\byou('| a)?re (dead|finished|done)\b/i,
];

const ADDRESS_KEYWORDS = [
  'road', 'street', 'lane', 'avenue', 'ave', 'apt', 'house no', 'block',
  'area', 'floor', 'flat', 'gulshan', 'banani', 'mirpur', 'dhanmondi',
  'uttara', 'motijheel', 'chittagong', 'khulna', 'sylhet', 'dhaka', 'baridhara',
];
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/i;

/**
 * Pure text heuristic — returns every signal that fired on `raw`, with a
 * human-readable label, a weight and the tags the signal votes for.
 */
export function analyzeText(raw: string): FiredSignal[] {
  const text = String(raw || '');
  if (!text.trim()) return [];
  const lower = text.toLowerCase();
  const signals: FiredSignal[] = [];

  // --- spam / bot signals ------------------------------------------------
  const letters = text.replace(/[^a-zA-Z]/g, '');
  const upper = text.replace(/[^A-Z]/g, '');
  if (letters.length >= 8 && upper.length / letters.length >= 0.6) {
    signals.push({ key: 'all_caps', label: 'Mostly ALL-CAPS text', weight: 15, tags: ['spam'] });
  }

  const hashtags = (text.match(/#[a-zA-Z0-9_]+/g) || []).length;
  if (hashtags > 15) {
    signals.push({ key: 'hashtag_stuffing', label: `${hashtags} hashtags (>15)`, weight: 35, tags: ['spam'] });
  }

  const links = (text.match(LINK_RE) || []).length;
  if (links >= 2 || (links >= 1 && text.length < 80)) {
    signals.push({ key: 'link_heavy', label: `${links} link(s) in a short text`, weight: 30, tags: ['spam'] });
  }

  const promoHits = wordHitCount(lower, PROMO_WORDS);
  if (promoHits >= 3) {
    signals.push({ key: 'keyword_stuffed', label: `${promoHits} promotional keywords`, weight: 25, tags: ['spam'] });
  }

  const bangCount = (text.match(/[!?]/g) || []).length;
  const runCount = (text.match(/([!?])\1{2,}/g) || []).length;
  if (runCount > 0 || bangCount >= 5) {
    signals.push({ key: 'excessive_punctuation', label: `Excessive punctuation (${bangCount} !/?)`, weight: 10, tags: ['spam', 'misleading'] });
  }

  // --- misleading-info signals --------------------------------------------
  const sensational = matchPhrases(lower, SENSATIONAL_PHRASES);
  if (sensational.length > 0) {
    signals.push({ key: 'sensational_language', label: `Sensational phrase “${sensational[0]}”`, weight: 25, tags: ['misleading'] });
  }

  const claims = matchWords(lower, CLAIM_PHRASES);
  if (claims.length > 0) {
    signals.push({ key: 'unverifiable_claim', label: `Unverifiable claim phrase “${claims[0]}”`, weight: 30, tags: ['misleading'] });
  }

  const clickbait = matchPhrases(lower, CLICKBAIT_PHRASES);
  if (clickbait.length > 0) {
    signals.push({ key: 'clickbait_phrase', label: `Clickbait phrase “${clickbait[0]}”`, weight: 25, tags: ['misleading'] });
  }

  // --- harmful-content signals --------------------------------------------
  const profanityHits = wordHitCount(lower, PROFANITY);
  if (profanityHits > 0) {
    signals.push({ key: 'toxicity', label: `${profanityHits} profanity match(es)`, weight: 40, tags: ['harmful'] });
  }

  const threatHit = THREAT_PATTERNS.some((re) => re.test(text));
  if (threatHit) {
    signals.push({ key: 'threat_language', label: 'Threatening language pattern', weight: 50, tags: ['harmful'] });
  }

  if (hasPhone(text) && (EMAIL_RE.test(text) || ADDRESS_KEYWORDS.some((k) => lower.includes(k)))) {
    signals.push({ key: 'doxxing', label: 'Phone number + address/email pattern (doxxing)', weight: 60, tags: ['harmful'] });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Scan construction
// ---------------------------------------------------------------------------

function buildDetection(
  targetType: 'post' | 'comment',
  targetId: string,
  authorId: string,
  signals: FiredSignal[],
  source: any
): SmartDetection | null {
  if (signals.length === 0) return null;
  const tags: Tag[] = [];
  const scoreByTag: Partial<Record<Tag, number>> = {};
  for (const sig of signals) {
    for (const t of sig.tags) {
      scoreByTag[t] = (scoreByTag[t] || 0) + sig.weight;
      if (!tags.includes(t)) tags.push(t);
    }
  }
  tags.sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b));
  const score = Math.min(100, Math.round(signals.reduce((s, x) => s + x.weight, 0)));
  const rawText = String(source?.content || source?.title || source?.text || '');
  return {
    id: nextId('detect'),
    targetType,
    targetId: String(targetId),
    authorId: String(authorId || 'unknown'),
    signals: signals.map((s) => s.label),
    score,
    scoreByTag,
    tags,
    createdAt: Date.now(),
    text: rawText.length > 220 ? `${rawText.slice(0, 220)}…` : rawText,
  };
}

/**
 * Scans every post (db.posts merged with user.profile.posts) and every comment
 * with the deterministic heuristics above. Returns the total items scanned plus
 * every detection (>=1 fired signal).
 */
export function scanCommunity(db: any): { scanned: number; detections: SmartDetection[] } {
  // Gather posts (dedupe by id across db.posts + user.profile.posts).
  const postMap = new Map<string, any>();
  (db.posts || []).forEach((p: any) => { if (p && p.id) postMap.set(p.id, p); });
  (db.users || []).forEach((u: any) => {
    (u.profile?.posts || []).forEach((p: any) => { if (p && p.id) postMap.set(p.id, p); });
  });
  const posts = Array.from(postMap.values());

  // High posting velocity: >=5 posts by one author inside any 60-min window.
  const authorTimes = new Map<string, number[]>();
  posts.forEach((p) => {
    const aid = postAuthorId(p);
    if (!authorTimes.has(aid)) authorTimes.set(aid, []);
    authorTimes.get(aid)!.push(postTimestamp(p));
  });
  const highVelocityAuthors = new Set<string>();
  authorTimes.forEach((times, aid) => {
    if (maxInWindow(times, 60 * 60 * 1000) >= 5) highVelocityAuthors.add(aid);
  });

  // Near-duplicate post text (non-reposts), normalized >= 20 chars.
  const normCount = new Map<string, number>();
  posts.forEach((p) => {
    if (p?.isRepost) return;
    const nt = normalizeText(postText(p));
    if (nt.length >= 20) normCount.set(nt, (normCount.get(nt) || 0) + 1);
  });
  const duplicateTexts = new Set<string>();
  normCount.forEach((count, nt) => { if (count >= 2) duplicateTexts.add(nt); });

  // Repetitive comment text: same author + same normalized text >= 3 times.
  const commentKeyCount = new Map<string, number>();
  posts.forEach((p) => {
    (p.comments || []).forEach((c: any) => {
      const nt = normalizeText(c?.text || '');
      if (nt.length >= 15) {
        const key = `${c?.senderId || 'anon'}:${nt}`;
        commentKeyCount.set(key, (commentKeyCount.get(key) || 0) + 1);
      }
    });
  });
  const repeatCommentKeys = new Set<string>();
  commentKeyCount.forEach((count, key) => { if (count >= 3) repeatCommentKeys.add(key); });

  const detections: SmartDetection[] = [];
  let scanned = 0;

  posts.forEach((p) => {
    scanned += 1;
    const signals = analyzeText(postText(p));
    const aid = postAuthorId(p);
    if (highVelocityAuthors.has(aid)) {
      signals.push({ key: 'high_post_velocity', label: 'Author posted 5+ times within an hour', weight: 40, tags: ['bot'] });
    }
    if (!p?.isRepost) {
      const nt = normalizeText(postText(p));
      if (nt && duplicateTexts.has(nt)) {
        signals.push({ key: 'near_duplicate_post', label: 'Near-duplicate post text appears elsewhere', weight: 40, tags: ['bot'] });
      }
    }
    const det = buildDetection('post', p.id, aid, signals, p);
    if (det) detections.push(det);
  });

  posts.forEach((p) => {
    (p.comments || []).forEach((c: any) => {
      scanned += 1;
      const signals = analyzeText(c?.text || '');
      const nt = normalizeText(c?.text || '');
      const key = `${c?.senderId || 'anon'}:${nt}`;
      if (repeatCommentKeys.has(key)) {
        signals.push({ key: 'repeat_comment', label: 'Same comment text repeated 3+ times', weight: 25, tags: ['spam'] });
      }
      const det = buildDetection('comment', c?.id || 'comment-unknown', c?.senderId || 'unknown', signals, c);
      if (det) detections.push(det);
    });
  });

  return { scanned, detections };
}

/** True when any of a detection's tags clears its settings threshold. */
function isActionable(d: SmartDetection, s: SmartSettings): boolean {
  return (
    (d.scoreByTag?.spam ?? 0) >= (s.spamThreshold ?? 55) ||
    (d.scoreByTag?.bot ?? 0) >= (s.spamThreshold ?? 55) ||
    (d.scoreByTag?.misleading ?? 0) >= (s.misleadingThreshold ?? 55) ||
    (d.scoreByTag?.harmful ?? 0) >= (s.harmfulThreshold ?? 60)
  );
}

function countByTag(detections: SmartDetection[]): Record<Tag, number> {
  const out: Record<Tag, number> = { spam: 0, bot: 0, misleading: 0, harmful: 0 };
  detections.forEach((d) => {
    d.tags.forEach((t) => { if (t in out) out[t] += 1; });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Settings + model ensure
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: SmartSettings = {
  spamThreshold: 55,
  misleadingThreshold: 55,
  harmfulThreshold: 60,
  autoFlagMode: 'notify',
};

/** Idempotent ensure of db.smartCommunity — safe to run on every load. */
function ensureSmartCommunity(db: any): any {
  if (!db.smartCommunity || typeof db.smartCommunity !== 'object' || Array.isArray(db.smartCommunity)) {
    db.smartCommunity = {};
  }
  const sc = db.smartCommunity;
  if (!Array.isArray(sc.scanResults)) sc.scanResults = [];
  if (!Array.isArray(sc.flags)) sc.flags = [];
  if (!Array.isArray(sc.summaries)) sc.summaries = [];
  if (!sc.settings || typeof sc.settings !== 'object' || Array.isArray(sc.settings)) sc.settings = {};
  const s = sc.settings;
  if (typeof s.spamThreshold !== 'number') s.spamThreshold = DEFAULT_SETTINGS.spamThreshold;
  if (typeof s.misleadingThreshold !== 'number') s.misleadingThreshold = DEFAULT_SETTINGS.misleadingThreshold;
  if (typeof s.harmfulThreshold !== 'number') s.harmfulThreshold = DEFAULT_SETTINGS.harmfulThreshold;
  if (s.autoFlagMode !== 'off' && s.autoFlagMode !== 'notify' && s.autoFlagMode !== 'auto') {
    s.autoFlagMode = DEFAULT_SETTINGS.autoFlagMode;
  }
  return sc;
}

// ---------------------------------------------------------------------------
// Thread summary helpers (deterministic template fallback)
// ---------------------------------------------------------------------------

function resolveThread(db: any, post: any) {
  const comments = (post.comments || []).map((c: any) => {
    let senderName = c.senderName;
    let avatarUrl = '';
    if (c.senderId) {
      const u = (db.users || []).find((x: any) => x && x.id === c.senderId);
      if (u) {
        senderName = u.name || senderName;
        avatarUrl = u.profile?.avatarUrl || '';
      }
    }
    return { ...c, senderName: senderName || 'Anonymous', avatarUrl };
  });
  return { ...post, comments };
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'is', 'are', 'was', 'were', 'this', 'that', 'it', 'be',
  'as', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'their', 'our', 'its', 'not', 'no', 'so', 'if', 'do',
  'does', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have', 'had',
  'about', 'just', 'very', 'really', 'like', 'get', 'got', 'go', 'went',
  'please', 'thanks', 'thank', 'ok', 'okay', 'also', 'even', 'still',
]);

function templateTopics(comments: any[]): string[] {
  const freq = new Map<string, number>();
  comments.forEach((c: any) => {
    String(c?.text || '')
      .toLowerCase()
      .replace(/[^a-z0-9À-￿]+/g, ' ')
      .split(/\s+/)
      .forEach((w: string) => {
        if (w.length >= 3 && !STOP_WORDS.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
      });
  });
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([w]) => w);
}

const POSITIVE_WORDS = ['love', 'great', 'good', 'awesome', 'nice', 'amazing', 'thanks', 'thank', 'helpful', 'excellent', 'best', 'beautiful', 'happy', 'enjoy', 'wonderful', 'agree', 'like'];
const NEGATIVE_WORDS = ['hate', 'bad', 'terrible', 'awful', 'worst', 'disappointed', 'annoying', 'angry', 'sad', 'wrong', 'scam', 'fake', 'useless', 'disgusting', 'regret'];

function sentimentFromComments(comments: any[]): ThreadSummary['sentiment'] {
  let pos = 0;
  let neg = 0;
  comments.forEach((c: any) => {
    const lower = String(c?.text || '').toLowerCase();
    pos += wordHitCount(lower, POSITIVE_WORDS);
    neg += wordHitCount(lower, NEGATIVE_WORDS);
  });
  if (pos === 0 && neg === 0) return 'neutral';
  if (pos > 0 && neg > 0) return 'mixed';
  return pos > neg ? 'positive' : 'negative';
}

function sanitizeSentiment(v: unknown): ThreadSummary['sentiment'] {
  return v === 'positive' || v === 'neutral' || v === 'mixed' || v === 'negative' ? v : 'neutral';
}

function templateSummary(post: any, comments: any[], topCommenters: { id: string; name: string; count: number }[]): string {
  const count = comments.length;
  const top = topCommenters[0];
  const themes = templateTopics(comments).slice(0, 3);
  let s = `This post has ${count} comment${count === 1 ? '' : 's'}.`;
  if (top) s += ` ${top.name} is the most active participant (${top.count} comment${top.count === 1 ? '' : 's'}).`;
  if (themes.length > 0) s += ` The discussion centers on ${themes.join(', ')}.`;
  return s;
}

function stripJsonFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
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

async function buildThreadSummary(db: any, post: any): Promise<ThreadSummary> {
  const comments = post.comments || [];
  const commenters = new Map<string, { id: string; name: string; count: number }>();
  comments.forEach((c: any) => {
    const key = String(c.senderId || c.senderName || 'anon');
    if (!commenters.has(key)) commenters.set(key, { id: key, name: c.senderName || 'Anonymous', count: 0 });
    commenters.get(key)!.count += 1;
  });
  const topCommenters = Array.from(commenters.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  const threadText = [
    `Post by ${post.creator?.name || post.authorName || 'user'}: ${post.content || post.title || ''}`,
    ...comments.map((c: any) => `${c.senderName || 'Anonymous'}: ${c.text || ''}`),
  ]
    .join('\n')
    .slice(0, 4000);

  const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
  if (keyPresent) {
    try {
      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You are a community manager for a social app. Summarize the discussion thread below. Reply with JSON only: {"summary": string (2-3 sentences), "topics": string[] (3-6 short keywords), "sentiment": "positive"|"neutral"|"mixed"|"negative"}. No markdown.',
          },
          { role: 'user', content: threadText },
        ],
        model: 'gemini-3.5-flash',
        maxTokens: 400,
        responseFormat: { type: 'json_object' },
      });
      const raw = extractText(result.choices?.[0]?.message?.content);
      const parsed = JSON.parse(stripJsonFences(raw || '{}'));
      const topics = Array.isArray(parsed?.topics)
        ? parsed.topics.map((t: unknown) => String(t).slice(0, 40)).filter((t: string) => t.length > 0).slice(0, 8)
        : templateTopics(comments);
      return {
        postId: post.id,
        summary:
          typeof parsed?.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim().slice(0, 600)
            : templateSummary(post, comments, topCommenters),
        topics,
        sentiment: sanitizeSentiment(parsed?.sentiment),
        topCommenters,
        mode: 'llm',
        createdAt: Date.now(),
      };
    } catch (e: any) {
      console.warn('[smart-community] summarize llm error:', e?.message || e);
    }
  }

  return {
    postId: post.id,
    summary: templateSummary(post, comments, topCommenters),
    topics: templateTopics(comments),
    sentiment: sentimentFromComments(comments),
    topCommenters,
    mode: 'template',
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Reply suggestions
// ---------------------------------------------------------------------------

function cannedReplies(): ReplySuggestion[] {
  return [
    { kind: 'agree', text: 'That makes sense — I agree with you.' },
    { kind: 'empathize', text: 'I can understand how that feels. Thanks for sharing.' },
    { kind: 'clarify', text: 'Could you explain what you mean a bit more?' },
    { kind: 'praise', text: 'Great point! I really appreciate your perspective.' },
  ];
}

function sanitizeKind(v: unknown): ReplySuggestion['kind'] {
  return v === 'agree' || v === 'empathize' || v === 'clarify' || v === 'praise' ? v : 'agree';
}

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

export function registerSmartCommunityRoutes(app: express.Express): void {
  const ctx = getCtx();
  const { requireAuth, loadDatabase, saveDatabase, getRequestUser } = ctx;

  // POST /api/community/smart/scan — run the heuristic scan (requireAuth)
  app.post('/api/community/smart/scan', requireAuth, (req, res) => {
    try {
      const db = loadDatabase();
      const sc = ensureSmartCommunity(db);
      const { scanned, detections } = scanCommunity(db);

      // Keep the most recent ~200 detections.
      sc.scanResults = [...detections, ...sc.scanResults].slice(0, 200);

      // autoFlagMode === 'auto': promote above-threshold detections to manual flags.
      if (sc.settings.autoFlagMode === 'auto') {
        for (const d of detections) {
          if (isActionable(d, sc.settings) && !sc.flags.some((f: SmartFlag) => f.auto && f.targetId === d.targetId)) {
            sc.flags.unshift({
              id: nextId('flag'),
              targetType: d.targetType,
              targetId: d.targetId,
              reason: `Auto-flagged by scan: ${d.tags.join(', ')} (score ${d.score})`,
              flaggedBy: 'smart-scan',
              flaggedByName: 'Smart Community',
              auto: true,
              createdAt: Date.now(),
            });
          }
        }
      }

      saveDatabase(db);
      res.json({ scanned, detections, countByTag: countByTag(detections), autoFlagMode: sc.settings.autoFlagMode });
    } catch (e: any) {
      console.warn('[smart-community] scan error:', e?.message || e);
      res.status(500).json({ error: 'Scan failed.' });
    }
  });

  // GET /api/community/smart/report — latest scan summary (guest-safe)
  app.get('/api/community/smart/report', (req, res) => {
    const db = loadDatabase();
    const sc = ensureSmartCommunity(db);
    const detections = (sc.scanResults || []) as SmartDetection[];
    const flags = (sc.flags || []) as SmartFlag[];
    const viewer = getRequestUser(req);
    res.json({
      detections,
      countByTag: countByTag(detections),
      flaggedPosts: detections.filter((d) => isActionable(d, sc.settings)),
      flags,
      lastScanAt: detections.length > 0 ? detections[0].createdAt : null,
      settings: sc.settings,
      viewerId: viewer?.id ?? null,
    });
  });

  // POST /api/community/smart/flag — manually flag content (requireAuth)
  app.post('/api/community/smart/flag', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const targetId = String(body.targetId || '').trim();
    if (!targetId) return res.status(400).json({ error: 'targetId is required.' });
    const db = loadDatabase();
    const sc = ensureSmartCommunity(db);
    const flag: SmartFlag = {
      id: nextId('flag'),
      targetType: body.targetType === 'comment' ? 'comment' : 'post',
      targetId: targetId.slice(0, 200),
      reason: String(body.reason || 'manual flag').trim().slice(0, 500),
      flaggedBy: user.id,
      flaggedByName: user.name || user.username || 'User',
      auto: false,
      createdAt: Date.now(),
    };
    sc.flags.unshift(flag);
    saveDatabase(db);
    res.json({ flag, flags: (sc.flags || []).slice(0, 100) });
  });

  // POST /api/community/smart/clear — dismiss a detection or flag (requireAuth)
  app.post('/api/community/smart/clear', requireAuth, (req, res) => {
    const id = String((req.body || {}).id || '').trim();
    if (!id) return res.status(400).json({ error: 'id is required.' });
    const db = loadDatabase();
    const sc = ensureSmartCommunity(db);
    let cleared: 'detection' | 'flag' | 'none' = 'none';
    const di = (sc.scanResults || []).findIndex((d: any) => d && d.id === id);
    if (di >= 0) {
      sc.scanResults.splice(di, 1);
      cleared = 'detection';
    } else {
      const fi = (sc.flags || []).findIndex((f: any) => f && f.id === id);
      if (fi >= 0) {
        sc.flags.splice(fi, 1);
        cleared = 'flag';
      }
    }
    saveDatabase(db);
    res.json({ cleared, success: cleared !== 'none' });
  });

  // POST /api/community/smart/summarize — AI/template thread summary (requireAuth)
  app.post('/api/community/smart/summarize', requireAuth, async (req, res) => {
    try {
      const postId = String((req.body || {}).postId || '').trim();
      if (!postId) return res.status(400).json({ error: 'postId is required.' });
      const db = loadDatabase();
      const sc = ensureSmartCommunity(db);
      const post = findPostById(db, postId);
      if (!post) return res.status(404).json({ error: 'Post not found.' });

      const thread = resolveThread(db, post);
      const summary = await buildThreadSummary(db, thread);

      const existingIdx = (sc.summaries || []).findIndex((s: any) => s && s.postId === postId);
      if (existingIdx >= 0) sc.summaries[existingIdx] = summary;
      else sc.summaries.unshift(summary);
      if (sc.summaries.length > 100) sc.summaries = sc.summaries.slice(0, 100);
      saveDatabase(db);
      res.json({ summary });
    } catch (e: any) {
      console.warn('[smart-community] summarize error:', e?.message || e);
      res.status(500).json({ error: 'Summarize failed.' });
    }
  });

  // POST /api/community/smart/replies — smart reply suggestions (requireAuth)
  app.post('/api/community/smart/replies', requireAuth, async (req, res) => {
    try {
      const context = String((req.body || {}).contextText || '').trim().slice(0, 1000);
      let suggestions: ReplySuggestion[] = cannedReplies();
      const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
      if (keyPresent && context) {
        try {
          const result = await invokeLLM({
            messages: [
              {
                role: 'system',
                content:
                  'You suggest short, friendly social-media replies. Reply with JSON only: {"suggestions": [{"kind": "agree"|"empathize"|"clarify"|"praise", "text": string}]} — exactly 4 items, each text under 40 words. No markdown.',
              },
              { role: 'user', content: `Message/comment to reply to: ${context}` },
            ],
            model: 'gemini-3.5-flash',
            maxTokens: 300,
            responseFormat: { type: 'json_object' },
          });
          const raw = extractText(result.choices?.[0]?.message?.content);
          const parsed = JSON.parse(stripJsonFences(raw || '{}'));
          if (Array.isArray(parsed?.suggestions)) {
            const cleaned = parsed.suggestions
              .filter((s: any) => s && typeof s === 'object')
              .map((s: any) => ({
                kind: sanitizeKind(s.kind),
                text: String(s.text || '').trim().slice(0, 120),
              }))
              .filter((s: ReplySuggestion) => s.text.length > 0)
              .slice(0, 4);
            if (cleaned.length === 4) suggestions = cleaned;
          }
        } catch (e: any) {
          console.warn('[smart-community] replies llm error:', e?.message || e);
        }
      }
      res.json({ suggestions });
    } catch (e: any) {
      console.warn('[smart-community] replies error:', e?.message || e);
      res.json({ suggestions: cannedReplies() });
    }
  });

  // POST /api/community/smart/settings — persist tuning (requireAuth)
  app.post('/api/community/smart/settings', requireAuth, (req, res) => {
    const body = req.body || {};
    const db = loadDatabase();
    const sc = ensureSmartCommunity(db);
    const s = sc.settings;
    if (typeof body.spamThreshold === 'number' && Number.isFinite(body.spamThreshold)) {
      s.spamThreshold = clamp(Math.round(body.spamThreshold), 0, 100);
    }
    if (typeof body.misleadingThreshold === 'number' && Number.isFinite(body.misleadingThreshold)) {
      s.misleadingThreshold = clamp(Math.round(body.misleadingThreshold), 0, 100);
    }
    if (typeof body.harmfulThreshold === 'number' && Number.isFinite(body.harmfulThreshold)) {
      s.harmfulThreshold = clamp(Math.round(body.harmfulThreshold), 0, 100);
    }
    if (body.autoFlagMode === 'off' || body.autoFlagMode === 'notify' || body.autoFlagMode === 'auto') {
      s.autoFlagMode = body.autoFlagMode;
    }
    saveDatabase(db);
    res.json({ settings: s });
  });
}
