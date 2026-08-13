/**
 * Ocean — Voice Note Summarizer (Feature 5)
 * -------------------------------------------
 * Extends the existing /api/ai/transcribe pipeline: given an audioUrl, transcribe
 * it (same engine as feature 90) and then produce a short human summary + key
 * points using Gemini text generation. When GEMINI_API_KEY is missing it falls
 * back to a deterministic extractive summary so the feature always works.
 *
 * Model (global db): db.voiceSummaries — ring buffer keyed by userId + audioUrl.
 *
 * Routes:
 *   POST /api/ai/voice-summary  (auth) { audioUrl, language?, prompt? }
 *   GET  /api/ai/voice-summary  (auth) ?audioUrl= -> cached summary
 */
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { getCtx } from './turtleServerContext';
import { transcribeAudio } from './server/voiceTranscription';

export interface VoiceSummaryResult {
  id?: string;
  userId?: string;
  audioUrl: string;
  transcript: string;
  summary: string;
  keyPoints: string[];
  source: 'gemini' | 'extractive';
  cached: boolean;
}

function uid(): string {
  return `vs-${Date.now()}-${Math.floor(Math.random() * 99999)}`;
}

function extractKeyPoints(transcript: string, max = 3): string[] {
  const sentences = transcript
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const freq: Record<string, number> = {};
  for (const w of transcript.toLowerCase().match(/[a-z0-9]{4,}/g) || []) {
    if (['this', 'that', 'with', 'from', 'have', 'they', 'there', 'about', 'would', 'could'].includes(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
  const points = sentences.slice(0, max).map((s) => s.slice(0, 140));
  if (points.length < max && top.length) {
    points.push(`Main topics: ${top.join(', ')}.`);
  }
  return points.slice(0, max);
}

function extractiveSummary(transcript: string): string {
  const clean = transcript.trim();
  if (!clean) return 'No speech was detected in this voice note.';
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lead = sentences.slice(0, 2).join(' ');
  return lead.length > 240 ? `${lead.slice(0, 237)}…` : lead;
}

async function geminiSummary(transcript: string): Promise<{ summary: string; keyPoints: string[] } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
    const prompt = `
Transcribe the following voice note. Produce:
1. SUMMARY: 2-3 concise sentences capturing the main point.
2. KEY POINTS: up to 3 bullet lines (no markdown asterisks, prefix with "- ").

TRANSCRIPT:
${transcript.slice(0, 4000)}`;
    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: { temperature: 0.3 },
    });
    const text = response.text || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const summary = lines[0]?.replace(/^summary:?\s*/i, '') || extractiveSummary(transcript);
    const keyPoints = lines
      .filter((l) => l.startsWith('-') || /^\d+[.)]/.test(l))
      .map((l) => l.replace(/^[-•\d.)\s]+/, '').slice(0, 140))
      .slice(0, 3);
    return { summary: summary.slice(0, 400), keyPoints: keyPoints.length ? keyPoints : extractKeyPoints(transcript) };
  } catch (err: any) {
    console.warn('[voice-summary] Gemini summarization failed, using extractive fallback:', err?.message || err);
    return null;
  }
}

// Light per-user rate limit (10 summary generations / minute) — sibling AI routes
// use the shared aiRateLimit middleware in server.ts which is not exposed via ctx.
const recentCalls: Record<string, number[]> = {};
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const window = (recentCalls[userId] = (recentCalls[userId] || []).filter((t) => now - t < 60_000));
  if (window.length >= 10) return true;
  window.push(now);
  return false;
}

export function registerVoiceSummaryRoutes(app: express.Express): void {
  const { requireAuth, loadDatabase, saveDatabase } = getCtx();

  function cached(db: any, userId: string, audioUrl: string): VoiceSummaryResult | null {
    if (!Array.isArray(db.voiceSummaries)) return null;
    const hit = (db.voiceSummaries as VoiceSummaryResult[]).find(
      (v) => v.userId === userId && v.audioUrl === audioUrl
    );
    return hit || null;
  }

  app.get('/api/ai/voice-summary', requireAuth, (req, res) => {
    const user = (req as any).user;
    const audioUrl = String((req.query as any).audioUrl || '');
    if (!audioUrl) return res.status(400).json({ error: 'audioUrl query param required.' });
    const db = loadDatabase();
    const hit = cached(db, user.id, audioUrl);
    if (hit) return res.json({ ...hit, cached: true });
    res.status(404).json({ error: 'No cached summary — POST to /api/ai/voice-summary to generate one.' });
  });

  app.post('/api/ai/voice-summary', requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { audioUrl, language, prompt } = req.body || {};
    if (!audioUrl) return res.status(400).json({ error: 'audioUrl required.' });
    if (isRateLimited(user.id)) return res.status(429).json({ error: 'Too many summarizations — try again in a minute.' });

    const db = loadDatabase();
    const hit = cached(db, user.id, String(audioUrl));
    if (hit) return res.json({ ...hit, cached: true });

    // 1. Transcribe with the existing engine.
    let transcript = '';
    try {
      const result: any = await transcribeAudio({ audioUrl, language, prompt });
      transcript = String(result?.text ?? result?.transcript ?? result?.data?.text ?? '').trim();
    } catch (err: any) {
      console.warn('[voice-summary] transcription failed:', err?.message || err);
    }
    if (!transcript) {
      return res.status(422).json({ error: 'Could not transcribe this audio. The URL may be unreachable or the file unreadable.' });
    }

    // 2. Summarize (Gemini first, extractive fallback).
    let summary = '';
    let keyPoints: string[] = [];
    let source: 'gemini' | 'extractive' = 'extractive';
    const g = await geminiSummary(transcript);
    if (g) {
      summary = g.summary;
      keyPoints = g.keyPoints;
      source = 'gemini';
    } else {
      summary = extractiveSummary(transcript);
      keyPoints = extractKeyPoints(transcript);
    }

    const result: VoiceSummaryResult = {
      id: uid(),
      userId: user.id,
      audioUrl: String(audioUrl),
      transcript,
      summary,
      keyPoints,
      source,
      cached: false,
    };
    if (!Array.isArray(db.voiceSummaries)) db.voiceSummaries = [];
    (db.voiceSummaries as any[]).unshift(result);
    if (db.voiceSummaries.length > 200) db.voiceSummaries.length = 200;
    saveDatabase(db);
    res.json(result);
  });
}
