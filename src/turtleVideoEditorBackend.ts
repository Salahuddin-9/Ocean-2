/**
 * Ocean — Ocean Cut editor backend (features #250 / #251 / #257)
 * ----------------------------------------------------------------
 * Backend support for the client-side video + photo editors:
 *   POST /api/ai/subtitle-bengali   → Gemini-transcribed Bengali subtitle segments (SRT ready)
 *   POST /api/ai/enhance-image      → classic auto-enhance (contrast/saturation/sharpen) via jpeg-js
 *   GET/POST /api/editor/templates  → save/reuse Creation-Lab templates
 *
 * Both AI routes degrade gracefully: subtitle generation falls back to a
 * deterministic local segmenter when no Gemini key is configured.
 */
import express from 'express';
import { getCtx } from './turtleServerContext';
import { makeJsonStore } from './turtleJsonStore';
import { invokeLLM } from './server/llm';
import { aiRateLimit } from './lib/aiRateLimit';
import jpegjs from 'jpeg-js';

export interface SubtitleSegment { start: number; end: number; text: string }
export interface EditorTemplate {
  id: string;
  name: string;
  kind: 'video' | 'photo';
  config: Record<string, unknown>;
  createdBy: string;
  createdAt: number;
}

interface EditorStore { templates: EditorTemplate[] }

const store = makeJsonStore<EditorStore>('editor.json', () => ({ templates: [] }));

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

/** Deterministic local fallback: split text into ~9-word lines, 2.2s each. */
function localSubtitles(text: string): SubtitleSegment[] {
  const words = text.split(/\s+/).filter(Boolean);
  const segs: SubtitleSegment[] = [];
  const size = 9;
  let t = 0.5;
  for (let i = 0; i < words.length; i += size) {
    const chunk = words.slice(i, i + size).join(' ');
    const dur = Math.max(1.6, chunk.length / 14);
    segs.push({ start: Math.round(t * 10) / 10, end: Math.round((t + dur) * 10) / 10, text: chunk });
    t += dur + 0.15;
  }
  return segs;
}

function toSrt(segs: SubtitleSegment[]): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const fmt = (s: number) => {
    const ms = Math.floor((s % 1) * 1000);
    const sec = Math.floor(s);
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)},${ms}`;
  };
  return segs.map((s, i) => `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text}\n`).join('\n');
}

export function registerVideoEditorRoutes(app: express.Express) {
  const { requireAuth } = getCtx();

  // --- Bengali subtitles ------------------------------------------------------
  app.post('/api/ai/subtitle-bengali', requireAuth, aiRateLimit, async (req, res) => {
    const text = String(req.body?.text || '').trim().slice(0, 4000);
    if (!text) return res.status(400).json({ error: 'text is required.' });
    const language = String(req.body?.language || 'bn');

    try {
      const result = await invokeLLM({
        messages: [
          {
            role: 'system',
            content:
              'You generate subtitle timing. Return JSON only: {"subtitles":[{"start":number(seconds),"end":number(seconds),"text":string}]}. ' +
              `Split the transcript into readable subtitle lines in ${language === 'bn' ? 'Bengali (Bangla)' : 'English'}, each 2-4 seconds long, sequential timings starting near 0.5s. No markdown, no commentary.`,
          },
          { role: 'user', content: text },
        ],
        model: 'gemini-3.5-flash',
        maxTokens: 1000,
        responseFormat: { type: 'json_object' } as any,
      });
      const raw = extractText(result.choices?.[0]?.message?.content);
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : null;
      const subs: SubtitleSegment[] = Array.isArray(parsed?.subtitles)
        ? parsed.subtitles
            .filter((s: any) => typeof s?.text === 'string' && Number.isFinite(Number(s?.start)) && Number.isFinite(Number(s?.end)))
            .map((s: any) => ({
              start: Math.max(0, Number(s.start)),
              end: Math.max(Number(s.start) + 0.5, Number(s.end)),
              text: String(s.text).slice(0, 120),
            }))
            .slice(0, 200)
        : [];
      if (subs.length === 0) throw new Error('empty');
      return res.json({ subtitles: subs, srt: toSrt(subs), mode: 'llm', language });
    } catch {
      const subs = localSubtitles(text);
      return res.json({ subtitles: subs, srt: toSrt(subs), mode: 'local', language, note: 'Gemini key missing — used local segmenter.' });
    }
  });

  // --- AI image enhance --------------------------------------------------------
  app.post('/api/ai/enhance-image', requireAuth, aiRateLimit, (req, res) => {
    const dataUrl = String(req.body?.image || '');
    const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'image must be a base64 data URL.' });
    try {
      const buf = Buffer.from(m[2], 'base64');
      const decoded = jpegjs.decode(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 12 });
      const { width, height, data } = decoded;

      // downscale huge images to keep processing fast
      const MAX = 1600;
      let W = width, H = height;
      if (W > MAX || H > MAX) {
        const k = MAX / Math.max(W, H);
        W = Math.round(W * k); H = Math.round(H * k);
      }

      const out = new Uint8Array(W * H * 4);
      const srcStride = width * 4;
      const dstStride = W * 4;

      const brightness = Number(req.body?.brightness) || 6;
      const contrast = Number(req.body?.contrast) || 1.12;
      const sat = Number(req.body?.saturation) || 1.18;
      const sharpen = Number(req.body?.sharpen) ?? 0.35;

      // Downsample original into src[] and compute a box-blur into blur[] (unsharp mask).
      const src = new Float32Array(W * H * 3);
      const blur = new Float32Array(W * H * 3);
      const bx = 3, by = 3;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const sx = Math.min(width - 1, Math.floor((x / W) * width));
          const sy = Math.min(height - 1, Math.floor((y / H) * height));
          const si = sy * srcStride + sx * 4;
          const oi = y * W + x;
          src[oi] = data[si]; src[oi + W * H] = data[si + 1]; src[oi + 2 * W * H] = data[si + 2];
          let r = 0, g = 0, b = 0, n = 0;
          for (let dy = -by; dy <= by; dy++) {
            for (let dx = -bx; dx <= bx; dx++) {
              const yy = Math.min(height - 1, Math.max(0, sy + dy * 2));
              const xx = Math.min(width - 1, Math.max(0, sx + dx * 2));
              const p = yy * srcStride + xx * 4;
              r += data[p]; g += data[p + 1]; b += data[p + 2];
              n += 1;
            }
          }
          blur[oi] = r / n; blur[oi + W * H] = g / n; blur[oi + 2 * W * H] = b / n;
        }
      }

      // enhance: brightness + contrast + saturation + unsharp (src - blur)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * dstStride + x * 4;
          const oi = y * W + x;
          const r0 = src[oi], g0 = src[oi + W * H], b0 = src[oi + 2 * W * H];
          const r = clamp(r0 + brightness + (r0 - 128) * (contrast - 1) + (r0 - blur[oi]) * sharpen);
          const g = clamp(g0 + brightness + (g0 - 128) * (contrast - 1) + (g0 - blur[oi + W * H]) * sharpen);
          const b = clamp(b0 + brightness + (b0 - 128) * (contrast - 1) + (b0 - blur[oi + 2 * W * H]) * sharpen);
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          out[i] = clamp(gray + (r - gray) * sat);
          out[i + 1] = clamp(gray + (g - gray) * sat);
          out[i + 2] = clamp(gray + (b - gray) * sat);
          out[i + 3] = 255;
        }
      }

      const encoded = jpegjs.encode({ data: out as unknown as Buffer, width: W, height: H }, 92);
      const resultUrl = `data:image/jpeg;base64,${encoded.data.toString('base64')}`;
      res.json({
        image: resultUrl,
        width: W,
        height: H,
        mode: 'auto-enhance',
        applied: { brightness, contrast, saturation: sat, sharpen },
      });
    } catch (e: any) {
      res.status(500).json({ error: `Enhance failed: ${e?.message || e}` });
    }
  });

  // --- Templates ----------------------------------------------------------------
  app.get('/api/editor/templates', requireAuth, (_req, res) => {
    res.json({ templates: store.load().templates });
  });

  app.post('/api/editor/templates', requireAuth, (req, res) => {
    const me = (req as any).user;
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const kind = req.body?.kind === 'photo' ? 'photo' : 'video';
    if (!name) return res.status(400).json({ error: 'Template name is required.' });
    const tpl: EditorTemplate = {
      id: `tpl-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name,
      kind,
      config: req.body?.config && typeof req.body.config === 'object' ? req.body.config : {},
      createdBy: me.id,
      createdAt: Date.now(),
    };
    store.load().templates.unshift(tpl);
    store.persist();
    res.json({ template: tpl });
  });

  app.delete('/api/editor/templates/:id', requireAuth, (req, res) => {
    const me = (req as any).user;
    const s = store.load();
    const idx = s.templates.findIndex((t) => t.id === req.params.id && t.createdBy === me.id);
    if (idx === -1) return res.status(404).json({ error: 'Template not found or not yours.' });
    s.templates.splice(idx, 1);
    store.persist();
    res.json({ ok: true });
  });
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
