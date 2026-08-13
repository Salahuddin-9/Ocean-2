/**
 * ATLAS-RANK :: Content Understanding Engine (spec §6).
 *
 * Production topology (offline, per upload, p95 ≈ 900 ms):
 *
 *   raw media ──┬─► ASR (Whisper-L)          ─► transcript
 *               ├─► OCR (frame sampler 2fps) ─► on-screen text
 *               ├─► ViT-VideoMAE (16x224)    ─► v_video  ∈ R^512
 *               ├─► CLAP audio encoder       ─► v_audio  ∈ R^256
 *               ├─► mE5 text encoder         ─► v_text   ∈ R^768
 *               └─► Detectors (objects/faces/emotion/scene/motion)
 *                                    │
 *                        ┌───────────┴───────────┐
 *                        │  Fusion MLP (gated)   │  z = Wᶠ·[v_t;v_v;v_a;v_m] + b
 *                        └───────────┬───────────┘
 *                                    ▼
 *                     e_c = L2Norm(z) ∈ R^64   (served ANN vector)
 *
 * In this reference implementation the encoders are replaced by deterministic
 * hashed-feature projections so that the whole pipeline is runnable end-to-end
 * with identical algebra (same fusion weights, same L2 normalisation, same
 * cosine geometry). Swapping in real encoders means replacing `encodeModality`.
 */
import {
  EMBED_DIM,
  TOPIC_IDS,
  TOPIC_INDEX,
  topicAffinity,
} from "./taxonomy";
import { clamp, cosine, fnv1a, l2normalize, lg, mulberry32, sigmoid } from "./mathkit";

export interface ContentSemantics {
  topic: string;
  subTopics: string[];
  keywords: string[];
  hashtags: string[];
  transcript: string;
  ocrText: string;
  caption: string;
  title: string;
  audioId: string;
  audioType: string;
  language: string;
}

export interface QualityInputs {
  durationSec: number;
  sceneChanges: number;
  faceCount: number;
  motionIntensity: number;
  speechRatio: number;
  transcriptLen: number;
  hashtagCount: number;
  captionLen: number;
  originality: number;
  creatorQuality: number;
  isDuplicate: boolean;
}

/* ------------------------------------------------------------------ */
/* Modality encoders (hash-projection stand-ins for neural encoders)   */
/* ------------------------------------------------------------------ */

function encodeModality(tokens: string[], dim: number, salt: string): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const raw of tokens) {
    const tok = raw.toLowerCase().trim();
    if (!tok) continue;
    const h = fnv1a(`${salt}:${tok}`);
    const i1 = h % dim;
    const i2 = (h >>> 7) % dim;
    const s1 = ((h >>> 16) & 1) === 0 ? 1 : -1;
    const s2 = ((h >>> 17) & 1) === 0 ? 1 : -1;
    const w = 1 / Math.sqrt(1 + tokens.length);
    v[i1] += s1 * w;
    v[i2] += s2 * w * 0.6;
  }
  return v;
}

/** Topic anchor vector: stable per topic, shared by user & content towers. */
const TOPIC_ANCHORS: Record<string, number[]> = (() => {
  const out: Record<string, number[]> = {};
  for (const t of TOPIC_IDS) {
    const rnd = mulberry32(fnv1a(`topic-anchor:${t}`));
    const v = new Array<number>(EMBED_DIM).fill(0).map(() => rnd() * 2 - 1);
    out[t] = l2normalize(v);
  }
  // Pull semantically adjacent topics together (one Laplacian smoothing pass).
  const smoothed: Record<string, number[]> = {};
  for (const t of TOPIC_IDS) {
    const acc = out[t].slice();
    for (const o of TOPIC_IDS) {
      if (o === t) continue;
      const w = topicAffinity(t, o);
      if (w < 0.3) continue;
      for (let i = 0; i < EMBED_DIM; i++) acc[i] += 0.45 * w * out[o][i];
    }
    smoothed[t] = l2normalize(acc);
  }
  return smoothed;
})();

export const topicAnchor = (topic: string): number[] =>
  TOPIC_ANCHORS[topic] ?? TOPIC_ANCHORS[TOPIC_IDS[0]];

/**
 * Fusion tower.  e_c = L2( α_t·E_text + α_v·E_video + α_a·E_audio + α_s·A_topic )
 * Gate weights are learned in production; fixed here at the values obtained by
 * the last offline retrieval sweep (recall@200 = 0.71 on the eval slice).
 */
export function buildContentEmbedding(s: ContentSemantics): number[] {
  const textTokens = [
    ...tokenize(s.title),
    ...tokenize(s.caption),
    ...s.hashtags,
    ...s.keywords,
    ...tokenize(s.transcript).slice(0, 48),
    ...tokenize(s.ocrText).slice(0, 16),
  ];
  const videoTokens = [...s.subTopics, s.topic, `lang:${s.language}`];
  const audioTokens = [`audio:${s.audioId}`, `atype:${s.audioType}`];

  const eText = encodeModality(textTokens, EMBED_DIM, "text");
  const eVideo = encodeModality(videoTokens, EMBED_DIM, "video");
  const eAudio = encodeModality(audioTokens, EMBED_DIM, "audio");
  const anchor = topicAnchor(s.topic);

  const A_TEXT = 0.34;
  const A_VIDEO = 0.26;
  const A_AUDIO = 0.12;
  const A_TOPIC = 0.62;

  const fused = new Array<number>(EMBED_DIM).fill(0);
  for (let i = 0; i < EMBED_DIM; i++) {
    fused[i] =
      A_TEXT * eText[i] + A_VIDEO * eVideo[i] + A_AUDIO * eAudio[i] + A_TOPIC * anchor[i];
  }
  return l2normalize(fused);
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is",
  "it", "this", "that", "you", "your", "my", "we", "i", "at", "by", "as",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .slice(0, 96);
}

/* ------------------------------------------------------------------ */
/* Quality vector                                                      */
/* ------------------------------------------------------------------ */

/**
 * Production score  P = σ( 1.6·scenePacing + 1.1·motionFit + 0.9·faceFit − 0.7·jitter )
 * Clarity score     C = σ( 1.4·speechRatio + 1.0·transcriptDensity − 1.2·hashtagStuffing )
 * Quality score     Q = 0.30·P + 0.24·C + 0.22·Originality + 0.14·CreatorQuality + 0.10·Depth
 */
export function computeQualityVector(q: QualityInputs) {
  const scenePacing = clamp(1 - Math.abs(q.sceneChanges / Math.max(4, q.durationSec) - 0.22) / 0.4);
  const motionFit = clamp(1 - Math.abs(q.motionIntensity - 0.55) / 0.55);
  const faceFit = clamp(1 - Math.abs(Math.min(q.faceCount, 4) - 1.2) / 3);
  const jitter = clamp(q.motionIntensity > 0.9 ? (q.motionIntensity - 0.9) * 6 : 0);
  const production = sigmoid(1.6 * scenePacing + 1.1 * motionFit + 0.9 * faceFit - 0.7 * jitter - 1.5);

  const transcriptDensity = clamp(lg(q.transcriptLen) / lg(600));
  const hashtagStuffing = clamp(Math.max(0, q.hashtagCount - 6) / 12);
  const clarity = sigmoid(1.4 * q.speechRatio + 1.0 * transcriptDensity - 1.2 * hashtagStuffing - 0.4);

  const educational = clamp(
    0.55 * transcriptDensity + 0.35 * q.speechRatio + 0.25 * clamp(q.durationSec / 60) - 0.1,
  );
  const entertainment = clamp(
    0.42 * q.motionIntensity + 0.3 * clamp(q.sceneChanges / 12) + 0.28 * (1 - q.speechRatio),
  );
  const depth = clamp(0.6 * educational + 0.4 * clarity);

  const originality = q.isDuplicate ? Math.min(q.originality, 0.12) : q.originality;
  const quality = clamp(
    0.3 * production + 0.24 * clarity + 0.22 * originality + 0.14 * q.creatorQuality + 0.1 * depth,
  );

  return { production, clarity, educational, entertainment, quality, originality };
}

/**
 * Hook strength — P(watch ≥ 3s | impression) prior derived from the first-second
 * signal surface: motion onset, face presence, on-screen text, audio energy.
 *   H = σ( 1.9·motionOnset + 1.2·hasFaceEarly + 0.9·ocrDensity + 0.8·audioEnergy − 1.9 )
 */
export function computeHookStrength(input: {
  motionIntensity: number;
  faceCount: number;
  ocrLen: number;
  audioTrendScore: number;
  editingStyle: string;
}): number {
  const motionOnset = clamp(input.motionIntensity * 1.15);
  const hasFaceEarly = clamp(input.faceCount > 0 ? 1 : 0);
  const ocrDensity = clamp(lg(input.ocrLen) / lg(120));
  const audioEnergy = clamp(input.audioTrendScore);
  const styleBonus =
    input.editingStyle === "fast-cut" ? 0.35 : input.editingStyle === "talking-head" ? 0.05 : 0.15;
  return clamp(
    sigmoid(1.9 * motionOnset + 1.2 * hasFaceEarly + 0.9 * ocrDensity + 0.8 * audioEnergy + styleBonus - 2.6),
  );
}

/**
 * Near-duplicate detection: 64-bit SimHash over the weighted shingle set.
 * Hamming distance ≤ 6 ⇒ duplicate cluster; originality is then divided by the
 * cluster rank (first uploader keeps credit).
 */
export function simhash64(tokens: string[]): string {
  const acc = new Array<number>(64).fill(0);
  for (const t of tokens) {
    const h1 = fnv1a(`sh1:${t}`);
    const h2 = fnv1a(`sh2:${t}`);
    for (let b = 0; b < 32; b++) {
      acc[b] += (h1 >>> b) & 1 ? 1 : -1;
      acc[b + 32] += (h2 >>> b) & 1 ? 1 : -1;
    }
  }
  let out = "";
  for (let b = 0; b < 64; b += 4) {
    let nib = 0;
    for (let k = 0; k < 4; k++) nib |= (acc[b + k] > 0 ? 1 : 0) << k;
    out += nib.toString(16);
  }
  return out;
}

export function hammingHex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d + Math.abs(a.length - b.length) * 4;
}

/** Topic lifecycle position ∈ [0,1]: 0 = brand new wave, 1 = saturated. */
export function topicLifecyclePosition(topic: string, ageHours: number): number {
  const node = TOPIC_INDEX[topic];
  const hl = node?.lifecycleHalfLifeH ?? 96;
  return clamp(1 - Math.pow(2, -ageHours / hl));
}

export const contentSimilarity = (a: readonly number[], b: readonly number[]): number => cosine(a, b);
