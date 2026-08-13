/**
 * Ocean — Digital Twin Auto-Responder (Feature 149)
 * -------------------------------------------------
 * A bot that mimics YOUR chat style. The twin is trained on the user's own sent
 * messages (style fingerprint: average length, emoji usage, punctuation, top
 * phrases) and, when enabled, answers simple incoming messages in that style.
 * Uses a deterministic style-matching engine; when an LLM key is present the twin
 * can also ask the LLM to phrase a reply "as the user", always clamped to the
 * learned style.
 *
 * Model (global db, idempotent ensure):
 *   db.digitalTwins — array of { id, userId, enabled, tone, style, trainedAt }
 *
 * Routes (all auth):
 *   GET  /api/twin/status     -> my twin (or null)
 *   POST /api/twin/train      -> rescan my sent messages, rebuild style fingerprint
 *   POST /api/twin/enable     -> { enabled, tone? }
 *   POST /api/twin/reply      -> { text, senderName? } -> generated twin reply
 */

import express from 'express';
import { getCtx } from './turtleServerContext';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

export type TwinTone = 'casual' | 'formal' | 'witty';

export interface TwinStyle {
  avgLength: number; // avg word count per message
  emojiRate: number; // 0-1 share of messages containing emoji
  capsRate: number; // 0-1 share of messages with an excited (!) ending
  topPhrases: string[]; // most common openings/phrases
  sampleCount: number;
}

export interface DigitalTwin {
  id: string;
  userId: string;
  enabled: boolean;
  tone: TwinTone;
  style: TwinStyle;
  trainedAt: number | null;
}

const GREET_RE = /\b(hi|hello|hey|salam|assalam|good (morning|afternoon|evening)|yo)\b/i;
const THANKS_RE = /\b(thanks|thank you|thx|shukriya|dhonnobad)\b/i;
const QUESTION_RE = /\b(\?|what|how|why|when|where|who|can you|could you|do you)\b/i;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function uid(): string {
  return `twin-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function ensureCollection(db: any): void {
  if (!Array.isArray(db.digitalTwins)) db.digitalTwins = [];
}

/** Gather the user's own sent messages from every message store we know. */
function collectMyMessages(db: any, userId: string): string[] {
  const out: string[] = [];
  const push = (m: any) => {
    if (m && typeof m.text === 'string' && m.text.trim()) out.push(m.text.trim());
  };
  (db.messages || []).forEach((m: any) => { if (m.senderId === userId) push(m); });
  (db.chatMessages || []).forEach((m: any) => { if (m.senderId === userId) push(m); });
  (db.conversations || []).forEach((c: any) => {
    (c.messages || []).forEach((m: any) => { if (m.senderId === userId) push(m); });
  });
  // Fallback: the user's own post text reads as their voice.
  (db.users || []).forEach((u: any) => {
    if (u.id !== userId) return;
    (u.profile?.posts || []).forEach((p: any) => {
      const t = String(p?.content || '');
      if (t.trim().length >= 8) out.push(t.trim());
    });
  });
  return out.slice(0, 400);
}

export function buildStyle(messages: string[]): TwinStyle {
  if (messages.length === 0) {
    return { avgLength: 8, emojiRate: 0.15, capsRate: 0.2, topPhrases: [], sampleCount: 0 };
  }
  const lengths = messages.map((m) => m.split(/\s+/).length);
  const avgLength = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const emojiRate = messages.filter((m) => EMOJI_RE.test(m)).length / messages.length;
  const capsRate = messages.filter((m) => /[!]{1,}/.test(m)).length / messages.length;
  const phraseFreq = new Map<string, number>();
  messages.slice(0, 200).forEach((m) => {
    const first = m.split(/\s+/).slice(0, 3).join(' ').toLowerCase().replace(/[^\w\s]/g, '');
    if (first.length >= 4) phraseFreq.set(first, (phraseFreq.get(first) || 0) + 1);
  });
  const topPhrases = Array.from(phraseFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([p]) => p);
  return { avgLength: Math.max(3, Math.min(40, avgLength)), emojiRate, capsRate, topPhrases, sampleCount: messages.length };
}

const TONE_OPENERS: Record<TwinTone, string[]> = {
  casual: ['hey!', 'yo', 'hi there', 'haha'],
  formal: ['Hello', 'Greetings', 'Noted, and'],
  witty: ['Well well', 'Ah, classic', 'Plot twist:'],
};

const TONE_CLOSERS: Record<TwinTone, string[]> = {
  casual: ['talk soon', 'catch ya', 'brb'],
  formal: ['best regards', 'take care', 'sincerely'],
  witty: ['as always', 'apparently', 'per usual'],
};

/** Deterministic reply engine — mirrors the user's style fingerprint. */
export function twinReply(style: TwinStyle, tone: TwinTone, incoming: string): string {
  const lower = incoming.toLowerCase();
  let body = '';

  if (GREET_RE.test(lower)) {
    body = tone === 'formal' ? 'Hello! Good to hear from you.' : 'Hey! Good to see you around.';
  } else if (THANKS_RE.test(lower)) {
    body = tone === 'formal' ? 'You are most welcome.' : "No worries, anytime!";
  } else if (QUESTION_RE.test(lower)) {
    const o = TONE_OPENERS[tone][Math.floor(Math.random() * TONE_OPENERS[tone].length)];
    body = `${o}, that is a good question. I would say it depends — happy to explain more when I am back.`;
  } else {
    const o = TONE_OPENERS[tone][Math.floor(Math.random() * TONE_OPENERS[tone].length)];
    const c = TONE_CLOSERS[tone][Math.floor(Math.random() * TONE_CLOSERS[tone].length)];
    body = `${o}! Got your message — quick reply in my usual style: sounds good. ${c}!`;
  }

  // Apply the learned style fingerprint.
  let reply = body;
  if (style.topPhrases.length > 0 && Math.random() < 0.4) {
    reply = `${style.topPhrases[Math.floor(Math.random() * style.topPhrases.length)]} — ${body}`;
  }
  if (style.capsRate > 0.5) reply += '!';
  if (style.emojiRate > 0.25 && Math.random() < 0.7) {
    reply += [' 😄', ' 👍', ' ✌️', ' 🌊'][Math.floor(Math.random() * 4)];
  }
  // Clamp to the user's typical message length.
  const words = reply.split(/\s+/);
  if (words.length > style.avgLength + 12) {
    reply = words.slice(0, style.avgLength + 8).join(' ') + '…';
  }
  return reply;
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

export function registerDigitalTwinRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  // GET /api/twin/status
  app.get('/api/twin/status', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const twin = (db.digitalTwins as DigitalTwin[]).find((t) => t.userId === user.id) || null;
    res.json({ twin });
  });

  // POST /api/twin/train — rescan my messages, rebuild fingerprint
  app.post('/api/twin/train', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const style = buildStyle(collectMyMessages(db, user.id));
    let twin = (db.digitalTwins as DigitalTwin[]).find((t) => t.userId === user.id);
    if (!twin) {
      twin = { id: uid(), userId: user.id, enabled: false, tone: 'casual', style, trainedAt: Date.now() };
      (db.digitalTwins as DigitalTwin[]).push(twin);
    } else {
      twin.style = style;
      twin.trainedAt = Date.now();
    }
    saveDatabase(db);
    res.json({ twin });
  });

  // POST /api/twin/enable
  app.post('/api/twin/enable', requireAuth, (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const db = loadDatabase();
    ensureCollection(db);
    let twin = (db.digitalTwins as DigitalTwin[]).find((t) => t.userId === user.id);
    if (!twin) {
      twin = { id: uid(), userId: user.id, enabled: false, tone: 'casual', style: buildStyle([]), trainedAt: null };
      (db.digitalTwins as DigitalTwin[]).push(twin);
    }
    if (typeof body.enabled === 'boolean') twin.enabled = body.enabled;
    if (body.tone === 'casual' || body.tone === 'formal' || body.tone === 'witty') twin.tone = body.tone;
    saveDatabase(db);
    res.json({ twin });
  });

  // POST /api/twin/reply — generate a reply in the user's style
  app.post('/api/twin/reply', requireAuth, async (req, res) => {
    const user = (req as any).user;
    const body = req.body || {};
    const incoming = String(body.text || '').slice(0, 1000);
    if (!incoming.trim()) return res.status(400).json({ error: 'text is required.' });

    const db = loadDatabase();
    ensureCollection(db);
    const twin = (db.digitalTwins as DigitalTwin[]).find((t) => t.userId === user.id);
    if (!twin) return res.status(404).json({ error: 'No digital twin yet — train one first.' });

    let reply = twinReply(twin.style, twin.tone, incoming);
    let mode: 'style' | 'llm' = 'style';

    // Optional LLM polish — the prompt forces the user's learned tone + length.
    const keyPresent = !!(ENV.forgeApiKey || process.env.GEMINI_API_KEY);
    if (keyPresent) {
      try {
        const result = await invokeLLM({
          messages: [
            {
              role: 'system',
              content:
                `You are the digital twin of a social-app user. Reply in their voice: tone "${twin.tone}", ` +
                `around ${twin.style.avgLength} words, ${twin.style.emojiRate > 0.2 ? 'may use an emoji occasionally' : 'no emoji'}. ` +
                `Reply with JSON only: {"reply": string}. No markdown.`,
            },
            { role: 'user', content: incoming },
          ],
          model: 'gemini-3.5-flash',
          maxTokens: 120,
          responseFormat: { type: 'json_object' },
        });
        const raw = extractText(result.choices?.[0]?.message?.content);
        const parsed = JSON.parse(stripJsonFences(raw || '{}'));
        if (typeof parsed?.reply === 'string' && parsed.reply.trim()) {
          reply = parsed.reply.trim().slice(0, 400);
          mode = 'llm';
        }
      } catch (e: any) {
        console.warn('[twin] llm error:', e?.message || e);
      }
    }

    res.json({
      reply,
      mode,
      tone: twin.tone,
      enabled: twin.enabled,
      style: twin.style,
      offlineHint: 'Twin replies when you are offline',
    });
  });
}
