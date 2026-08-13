/**
 * Ocean — "Faceless" AI Video Generator backend
 * ----------------------------------------------
 * Turns a plain topic into a full production plan for a faceless (stock-b-roll)
 * short video, then — when the server actually has ffmpeg — assembles a
 * placeholder MP4 of color clips, one per scene.
 *
 * Pipeline:
 *   Step 1  Script     -> Gemini/Forge LLM via invokeLLM when a key is present,
 *                         deterministic 3-scene template fallback otherwise.
 *   Step 2  TTS        -> No server-side TTS exists (src/server/voiceTranscription.ts
 *                         only has transcribeAudio), so each plan marks the
 *                         voiceover as "client-speech" text the client can read
 *                         aloud (window.speechSynthesis) or pipe to external TTS.
 *   Step 3  Assembly   -> probe `ffmpeg -version` via child_process.execFile with a
 *                         short timeout; if present, render per-scene lavfi color
 *                         clips concat'd into uploads/faceless-<id>.mp4 and return
 *                         videoUrl. If absent, return assembly:"ffmpeg-required"
 *                         + the scene manifest so the client renders locally.
 *
 * Plans persist in the global db under `db.facelessVideos` (idempotent ensure,
 * per-user). NEVER crashes without a key or without ffmpeg.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { getCtx } from './turtleServerContext';
import { aiRateLimit } from './lib/aiRateLimit';
import { invokeLLM } from './server/llm';
import { ENV } from './server/env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A scene seed as produced by the LLM / template (before duration+color are attached). */
interface SceneSeed {
  voiceover: string;
  visual: string; // stock-footage description
  onscreenText: string;
}

export interface FacelessScene extends SceneSeed {
  index: number;
  durationSec: number;
  color: string; // deterministic accent / placeholder-clip color
}

export interface FacelessVideoPlan {
  id: string;
  userId: string;
  topic: string;
  style: string;
  durationSec: number;
  scenes: FacelessScene[];
  script: string; // concatenated voiceover
  mode: 'gemini' | 'template';
  tts: { mode: 'client-speech'; note: string };
  assembly: 'rendered' | 'ffmpeg-required';
  videoUrl: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Constants + pure helpers
// ---------------------------------------------------------------------------

const SCENE_COLORS = ['#3a342a', '#7c6f5a', '#a89f8e', '#b0644f', '#5c5446', '#8a8172'];
const MAX_SCENES = 12;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'for', 'with', 'on', 'in', 'at',
  'is', 'are', 'was', 'were', 'it', 'its', 'my', 'your', 'our', 'their', 'how', 'why',
  'what', 'when', 'about', 'from', 'by', 'as', 'be', 'you', 'this', 'that', 'do', 'does',
  'not', 'no', 'so', 'we', 'they', 'me', 'them', 'if', 'than', 'then', 'very', 'just', 'can',
]);

const FALLBACK_KEYWORDS = ['ideas', 'journey', 'story', 'focus', 'inspiration', 'moment'];

/** Always returns exactly 3 keywords derived from the topic (deterministic). */
function keywords(topic: string): string[] {
  const cleaned = topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const list: string[] = cleaned.length ? cleaned : [...FALLBACK_KEYWORDS];
  while (list.length < 3) list.push(FALLBACK_KEYWORDS[list.length % FALLBACK_KEYWORDS.length]);
  return list.slice(0, 3);
}

/** Distributes `total` seconds across `sceneCount` scenes (integer seconds, sums to total). */
function distributeDurations(sceneCount: number, total: number): number[] {
  if (sceneCount <= 0) return [];
  if (sceneCount >= total) return new Array<number>(sceneCount).fill(1);
  const base = Math.floor(total / sceneCount);
  const out = new Array<number>(sceneCount).fill(base);
  let rem = total - base * sceneCount;
  let i = 0;
  while (rem > 0) {
    out[i % sceneCount] += 1;
    rem -= 1;
    i += 1;
  }
  return out;
}

/** Strips markdown fences / surrounding whitespace from a JSON reply. */
function stripJsonFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

/** Normalizes invokeLLM's string-or-parts content into plain text. */
function extractText(content: string | Array<Record<string, unknown>> | null | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((c) => (typeof c === 'string' ? c : typeof c?.text === 'string' ? c.text : ''))
    .join('\n');
}

/** Validates/sanitizes raw scene objects from the LLM into SceneSeed[]. */
function sanitizeScenes(raw: unknown): SceneSeed[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneSeed[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const rec = s as Record<string, unknown>;
    const voiceover = typeof rec.voiceover === 'string' ? rec.voiceover.trim() : '';
    const visual = typeof rec.visual === 'string' ? rec.visual.trim() : '';
    const onscreenText = typeof rec.onscreenText === 'string' ? rec.onscreenText.trim() : '';
    if (!voiceover && !visual) continue;
    out.push({
      voiceover: voiceover.slice(0, 300),
      visual: visual.slice(0, 300),
      onscreenText: onscreenText.slice(0, 120),
    });
  }
  return out.slice(0, MAX_SCENES);
}

/** Deterministic 3-scene template derived from the topic keywords. */
function templateScenes(topic: string, style: string): SceneSeed[] {
  const [k1, k2, k3] = keywords(topic);
  const s = style.toLowerCase();
  let cta = 'If this sparked something in you, follow for more. See you in the next one.';
  if (s.includes('fun')) {
    cta = 'That was the fun part — hit follow, and I will see you in the next clip.';
  } else if (s.includes('edu') || s.includes('explain') || s.includes('how')) {
    cta = 'That is how it works. Share this with someone who needs to know.';
  } else if (s.includes('story') || s.includes('doc') || s.includes('cinema')) {
    cta = 'That story is bigger than a reel — follow along for the rest of it.';
  }
  return [
    {
      voiceover: `You won't believe what I discovered about ${topic}. Stay with me — this changes everything.`,
      visual: `Cinematic aerial establishing shot of ${k1} opening a faceless ${style} reel, slow push-in.`,
      onscreenText: topic.toUpperCase().slice(0, 40),
    },
    {
      voiceover: `Here is the part most people miss about ${k1}: the real magic is in the small details nobody notices.`,
      visual: `Smooth close-up detail shots of ${k2} with a slow dolly movement and shallow depth of field.`,
      onscreenText: k2.toUpperCase().slice(0, 40),
    },
    {
      voiceover: `So next time you think about ${k2}, remember this one idea: ${k3}. ${cta}`,
      visual: `Wide sunset establishing shot of ${k3} with a soft warm grade and gentle camera drift.`,
      onscreenText: 'FOLLOW FOR MORE',
    },
  ];
}

// ---------------------------------------------------------------------------
// Step 1 — LLM script (graceful degradation)
// ---------------------------------------------------------------------------

async function generateScriptWithLLM(topic: string, durationSec: number, style: string): Promise<SceneSeed[]> {
  const prompt =
    `Write a short engaging voiceover script for a faceless video about "${topic}", ` +
    `about ${durationSec} seconds long, in a ${style} style, split into 3-5 scenes.\n` +
    `Return strict JSON, no markdown, in this exact shape:\n` +
    `{ "scenes": [ { "voiceover": "...", "visual": "stock-footage description", "onscreenText": "..." } ] }\n` +
    `Each voiceover must be under 25 words, natural and punchy. Each visual is a one-line ` +
    `description of stock footage / b-roll to show on screen. Each onscreenText is a short ` +
    `caption overlaid on screen (1-5 words).`;
  const result = await invokeLLM({
    messages: [
      {
        role: 'system',
        content: 'You are a scriptwriter for faceless YouTube Shorts / Instagram Reels. You always reply with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ],
    model: 'gemini-3.5-flash',
    maxTokens: 1200,
    responseFormat: { type: 'json_object' },
  });
  const text = extractText(result.choices?.[0]?.message?.content);
  const parsed = JSON.parse(stripJsonFences(text || ''));
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : Array.isArray(parsed) ? parsed : [];
  const cleaned = sanitizeScenes(scenes);
  if (cleaned.length === 0) throw new Error('LLM returned no usable scenes.');
  return cleaned;
}

// ---------------------------------------------------------------------------
// Step 3 — ffmpeg probe + placeholder MP4 assembly
// ---------------------------------------------------------------------------

let ffmpegProbe: boolean | null = null;

/** Probes `ffmpeg -version` once with a short timeout; caches the result. */
function ffmpegAvailable(): Promise<boolean> {
  if (ffmpegProbe !== null) return Promise.resolve(ffmpegProbe);
  return new Promise((resolve) => {
    try {
      execFile('ffmpeg', ['-version'], { timeout: 3000 }, (err) => {
        ffmpegProbe = !err;
        resolve(ffmpegProbe);
      });
    } catch {
      ffmpegProbe = false;
      resolve(false);
    }
  });
}

/**
 * Assembles a 1280x720 placeholder MP4: one lavfi solid-color clip per scene,
 * concatenated in order. Never throws — resolves {ok:false} on any failure so
 * the caller degrades to assembly:"ffmpeg-required".
 */
function renderPlaceholderVideo(plan: FacelessVideoPlan, uploadsDir: string): Promise<{ ok: boolean; path?: string }> {
  return new Promise((resolve) => {
    try {
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
      } catch {
        /* ignore */
      }
      const outFile = path.join(uploadsDir, `faceless-${plan.id}.mp4`);
      const args: string[] = ['-y'];
      for (const scene of plan.scenes) {
        const hex = scene.color.replace('#', '0x'); // ffmpeg lavfi color accepts 0xRRGGBB
        args.push('-f', 'lavfi', '-i', `color=c=${hex}:s=1280x720:d=${Math.max(1, scene.durationSec)}`);
      }
      args.push('-filter_complex', `concat=n=${plan.scenes.length}:v=1:a=0`);
      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
      args.push(outFile);
      execFile('ffmpeg', args, { timeout: 120000 }, (err) => {
        if (err) {
          console.warn('[faceless] ffmpeg render failed:', err.message);
          resolve({ ok: false });
        } else {
          resolve({ ok: true, path: outFile });
        }
      });
    } catch (e: any) {
      console.warn('[faceless] ffmpeg render exception:', e?.message);
      resolve({ ok: false });
    }
  });
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

export async function generateFacelessPlan(args: {
  topic: string;
  durationSec: number;
  style: string;
  userId: string;
  uploadsDir: string;
}): Promise<FacelessVideoPlan> {
  const id = `faceless-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  let mode: 'gemini' | 'template' = 'template';
  let seeds: SceneSeed[] = [];

  // invokeLLM requires BUILT_IN_FORGE_API_KEY; the spec also names GEMINI_API_KEY,
  // so attempt the real call when EITHER is configured and fall back on any error.
  const hasLLMKey = !!process.env.GEMINI_API_KEY || !!ENV.forgeApiKey;
  if (hasLLMKey) {
    try {
      seeds = await generateScriptWithLLM(args.topic, args.durationSec, args.style);
      mode = 'gemini';
    } catch (e: any) {
      console.warn('[faceless] LLM script failed, using template:', e?.message);
    }
  }
  if (seeds.length === 0) {
    seeds = templateScenes(args.topic, args.style);
  }

  const durations = distributeDurations(seeds.length, args.durationSec);
  const scenes: FacelessScene[] = seeds.map((s, i) => ({
    ...s,
    index: i + 1,
    durationSec: durations[i] ?? 1,
    color: SCENE_COLORS[i % SCENE_COLORS.length],
  }));

  const plan: FacelessVideoPlan = {
    id,
    userId: args.userId,
    topic: args.topic,
    style: args.style,
    durationSec: args.durationSec,
    scenes,
    script: scenes.map((s) => s.voiceover).join(' '),
    mode,
    tts: {
      mode: 'client-speech',
      note: 'No server-side TTS configured. Read the voiceover aloud on-device (window.speechSynthesis) or pipe the scenes to an external TTS.',
    },
    assembly: 'ffmpeg-required',
    videoUrl: null,
    createdAt: Date.now(),
  };

  // Step 3 — assembly only when ffmpeg exists on this machine.
  if (await ffmpegAvailable()) {
    const r = await renderPlaceholderVideo(plan, args.uploadsDir);
    if (r.ok) {
      plan.assembly = 'rendered';
      plan.videoUrl = `/uploads/faceless-${plan.id}.mp4`;
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Idempotent collection ensure — safe to run on every load. */
function ensureCollection(db: any): void {
  if (!Array.isArray(db.facelessVideos)) db.facelessVideos = [];
}

export function registerFacelessVideoRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase, uploadsDir } = getCtx();

  // Generate a new faceless-video production plan (+ render MP4 when ffmpeg exists).
  app.post('/api/ai/faceless-video', requireAuth, aiRateLimit, async (req, res) => {
    try {
      const user = (req as any).user;
      const topic = String(req.body?.topic || '').trim().slice(0, 200);
      if (!topic) return res.status(400).json({ error: 'topic is required.' });
      const durationSec = Math.max(5, Math.min(Number(req.body?.durationSec) || 30, 300));
      const style = String(req.body?.style || '').trim().slice(0, 60) || 'motivational';

      const plan = await generateFacelessPlan({
        topic,
        durationSec,
        style,
        userId: user.id,
        uploadsDir,
      });

      const db = loadDatabase();
      ensureCollection(db);
      (db.facelessVideos as FacelessVideoPlan[]).unshift(plan);
      saveDatabase(db);

      res.json({ plan });
    } catch (e: any) {
      console.warn('[faceless] generate error:', e?.message);
      res.status(500).json({ error: 'Failed to generate the video plan.' });
    }
  });

  // List my plans.
  app.get('/api/ai/faceless-video', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const mine = (db.facelessVideos as FacelessVideoPlan[]).filter((p) => p.userId === user.id);
    res.json({ plans: mine });
  });

  // Get one plan by id (owner only).
  app.get('/api/ai/faceless-video/:id', requireAuth, (req, res) => {
    const user = (req as any).user;
    const db = loadDatabase();
    ensureCollection(db);
    const plan = (db.facelessVideos as FacelessVideoPlan[]).find((p) => p.id === req.params.id);
    if (!plan || plan.userId !== user.id) {
      return res.status(404).json({ error: 'Video plan not found.' });
    }
    res.json({ plan });
  });
}
