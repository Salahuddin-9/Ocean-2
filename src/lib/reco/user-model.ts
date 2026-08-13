/**
 * ATLAS-RANK :: Advanced User Modeling (spec §5).
 *
 * The user is represented by THREE co-existing objects:
 *   1. Interest graph  G_u = { (t, S, L, A, m, κ, conf) }   — interpretable
 *   2. Dense embedding e_u ∈ R^64                            — retrievable (ANN)
 *   3. Real-time context c_u (session depth, fatigue, tod)   — volatile
 *
 * DUAL-TIMESCALE INTEREST
 *   S(u,t) short-term, half-life H_S = 6h   (session intent)
 *   L(u,t) long-term,  half-life H_L = 504h (21d, stable taste)
 *   A(u,t) = λ·S + (1−λ)·L,  λ = 0.35 + 0.25·sessionIntensity
 *
 * UPDATE (per event e with signal weight w_e and topic t):
 *   S ← S·2^(−Δt/H_S) + η_S · w_e · surprise
 *   L ← L·2^(−Δt/H_L) + η_L · w_e · surprise
 *   surprise = 1 − Â(u,t)   (predictive coding: known interests move less)
 *
 * MOMENTUM (growth / decline detection)
 *   m(u,t) = (A_now − A_{t−7d}) / (A_{t−7d} + ε)   clipped to [−1, 3]
 *   kind = growing  if m >  0.35 and conf > 0.3
 *          declining if m < −0.30
 *          seasonal  if autocorr(A, period) > 0.5
 *          permanent if L > 0.55 and age > 30d and |m| < 0.15
 *
 * LATENT INTEREST DISCOVERY (graph diffusion over the topic manifold)
 *   Â(u, t*) = Σ_t A(u,t)·ρ(t,t*)^γ / Σ_t ρ(t,t*)^γ ,  γ = 1.7
 *   A topic is "latent" if Â > 0.35 while exposures(u,t*) < 5.
 */
import {
  EMBED_DIM,
  TOPIC_IDS,
  TOPIC_INDEX,
  topicAffinity,
  topicNeighbors,
} from "./taxonomy";
import { topicAnchor } from "./content-model";
import { clamp, halfLifeDecay, l2normalize, wilsonLower } from "./mathkit";

export const H_SHORT_HOURS = 6;
export const H_LONG_HOURS = 504; // 21 days
export const ETA_SHORT = 0.34;
export const ETA_LONG = 0.06;
export const DIFFUSION_GAMMA = 1.7;

export interface InterestRow {
  topic: string;
  affinity: number;
  shortTerm: number;
  longTerm: number;
  momentum: number;
  confidence: number;
  exposures: number;
  engagements: number;
  negatives: number;
  kind: string;
  latent: boolean;
  lastEventAt: Date;
}

export interface InterestUpdateResult extends InterestRow {
  delta: number;
}

/** λ blend factor: heavier short-term weight for intense sessions. */
export const blendLambda = (sessionIntensity: number): number =>
  clamp(0.35 + 0.25 * clamp(sessionIntensity), 0.2, 0.75);

/**
 * Apply one signal to an interest row.
 * `signal` is the normalised signal weight (may be negative for dislikes).
 */
export function updateInterest(
  row: InterestRow,
  signal: number,
  now: Date,
  sessionIntensity = 0.5,
): InterestUpdateResult {
  const dtH = Math.max(0, (now.getTime() - row.lastEventAt.getTime()) / 3_600_000);
  const decS = halfLifeDecay(dtH, H_SHORT_HOURS);
  const decL = halfLifeDecay(dtH, H_LONG_HOURS);

  const prevA = row.affinity;
  const surprise = signal >= 0 ? 1 - clamp(prevA) : 1; // negatives always land fully

  const s = clamp(row.shortTerm * decS + ETA_SHORT * signal * surprise, -1, 1);
  const l = clamp(row.longTerm * decL + ETA_LONG * signal * surprise, -1, 1);

  const lambda = blendLambda(sessionIntensity);
  const affinity = clamp(lambda * s + (1 - lambda) * l, -1, 1);

  const exposures = row.exposures + 1;
  const engagements = row.engagements + (signal > 0.15 ? 1 : 0);
  const negatives = row.negatives + (signal < -0.05 ? 1 : 0);
  const confidence = wilsonLower(engagements, Math.max(exposures, 1));

  const momentum = clamp((affinity - prevA) * 6 + row.momentum * 0.7, -1, 3);

  return {
    ...row,
    shortTerm: s,
    longTerm: l,
    affinity,
    momentum,
    confidence,
    exposures,
    engagements,
    negatives,
    latent: false,
    kind: classifyInterest({ affinity, longTerm: l, momentum, confidence, exposures }),
    lastEventAt: now,
    delta: affinity - prevA,
  };
}

export function classifyInterest(x: {
  affinity: number;
  longTerm: number;
  momentum: number;
  confidence: number;
  exposures: number;
}): string {
  if (x.exposures < 5) return "emerging";
  if (x.momentum > 0.35 && x.confidence > 0.2) return "growing";
  if (x.momentum < -0.3) return "declining";
  if (x.longTerm > 0.55 && Math.abs(x.momentum) < 0.15) return "permanent";
  if (x.affinity > 0.3 && x.longTerm < 0.2) return "temporary";
  return "stable";
}

/** Time-decay a stored row to "now" without applying any new signal. */
export function decayInterest(row: InterestRow, now: Date, sessionIntensity = 0.5): InterestRow {
  const dtH = Math.max(0, (now.getTime() - row.lastEventAt.getTime()) / 3_600_000);
  if (dtH < 0.01) return row;
  const s = row.shortTerm * halfLifeDecay(dtH, H_SHORT_HOURS);
  const l = row.longTerm * halfLifeDecay(dtH, H_LONG_HOURS);
  const lambda = blendLambda(sessionIntensity);
  return { ...row, shortTerm: s, longTerm: l, affinity: clamp(lambda * s + (1 - lambda) * l, -1, 1) };
}

/**
 * Seasonal modulation. For topics with a period P (days), interests are
 * modulated by  1 + β·cos(2π·(d − φ)/P)  with β = 0.22.
 */
export function seasonalMultiplier(topic: string, now: Date, phaseDays = 0): number {
  const node = TOPIC_INDEX[topic];
  if (!node || node.seasonPeriodDays <= 0) return 1;
  const dayOfEra = now.getTime() / 86_400_000;
  const angle = (2 * Math.PI * (dayOfEra - phaseDays)) / node.seasonPeriodDays;
  return 1 + 0.22 * Math.cos(angle);
}

/**
 * Latent / hidden interest discovery by diffusion over the topic graph.
 * Returns topics whose diffused score is high but observed exposure is low.
 */
export function discoverLatentInterests(
  rows: InterestRow[],
  opts: { minScore?: number; maxExposures?: number; limit?: number } = {},
): { topic: string; predicted: number; source: string }[] {
  const minScore = opts.minScore ?? 0.32;
  const maxExposures = opts.maxExposures ?? 5;
  const limit = opts.limit ?? 6;

  const known = new Map(rows.map((r) => [r.topic, r]));
  const out: { topic: string; predicted: number; source: string }[] = [];

  for (const candidate of TOPIC_IDS) {
    const existing = known.get(candidate);
    if (existing && existing.exposures >= maxExposures) continue;

    let num = 0;
    let den = 0;
    let best = { topic: "", w: 0 };
    for (const r of rows) {
      if (r.topic === candidate || r.affinity <= 0) continue;
      const rho = Math.pow(topicAffinity(r.topic, candidate), DIFFUSION_GAMMA);
      if (rho < 0.02) continue;
      num += r.affinity * rho;
      den += rho;
      if (rho * r.affinity > best.w) best = { topic: r.topic, w: rho * r.affinity };
    }
    if (den <= 0) continue;
    const predicted = clamp(num / den);
    if (predicted >= minScore) out.push({ topic: candidate, predicted, source: best.topic });
  }

  return out.sort((a, b) => b.predicted - a.predicted).slice(0, limit);
}

/**
 * User tower:  e_u = L2( Σ_t softplusW(A(u,t)) · anchor(t) + 0.30·e_recent )
 * where e_recent is the mean embedding of the last-K positively engaged items
 * (recency-weighted). This makes the user vector live in the same metric space
 * as content vectors, enabling a single ANN index for retrieval.
 */
export function buildUserEmbedding(
  rows: InterestRow[],
  recentPositiveEmbeddings: { vec: number[]; ageHours: number }[] = [],
): number[] {
  const acc = new Array<number>(EMBED_DIM).fill(0);
  for (const r of rows) {
    if (r.affinity <= 0.02) continue;
    const w = Math.pow(r.affinity, 1.25) * (0.6 + 0.4 * r.confidence);
    const anchor = topicAnchor(r.topic);
    for (let i = 0; i < EMBED_DIM; i++) acc[i] += w * anchor[i];
  }
  if (recentPositiveEmbeddings.length > 0) {
    const rec = new Array<number>(EMBED_DIM).fill(0);
    let wsum = 0;
    for (const item of recentPositiveEmbeddings) {
      const w = halfLifeDecay(item.ageHours, 72);
      wsum += w;
      for (let i = 0; i < Math.min(EMBED_DIM, item.vec.length); i++) rec[i] += w * item.vec[i];
    }
    if (wsum > 0) {
      for (let i = 0; i < EMBED_DIM; i++) acc[i] += 0.3 * (rec[i] / wsum) * TOPIC_IDS.length * 0.02;
    }
  }
  return l2normalize(acc);
}

/** Top-N interpretable interest profile. */
export function topInterests(rows: InterestRow[], n = 12): InterestRow[] {
  return rows
    .slice()
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, n);
}

/**
 * Interest drift detector: KL-style divergence between the short-term and the
 * long-term distributions. High drift ⇒ raise exploration budget.
 *   D(u) = Σ_t p_S(t)·log(p_S(t)/p_L(t))
 */
export function interestDrift(rows: InterestRow[]): number {
  const pos = rows.filter((r) => r.shortTerm > 0 || r.longTerm > 0);
  if (pos.length === 0) return 0;
  const sSum = pos.reduce((a, r) => a + Math.max(0, r.shortTerm), 0) + 1e-6;
  const lSum = pos.reduce((a, r) => a + Math.max(0, r.longTerm), 0) + 1e-6;
  let d = 0;
  for (const r of pos) {
    const ps = (Math.max(0, r.shortTerm) + 1e-6) / sSum;
    const pl = (Math.max(0, r.longTerm) + 1e-6) / lSum;
    d += ps * Math.log(ps / pl);
  }
  return clamp(d / Math.log(Math.max(2, pos.length)), 0, 1);
}

/** Expand a user's topic set to its diffusion neighbourhood for retrieval. */
export function retrievalTopicSet(rows: InterestRow[], k = 10): { topic: string; weight: number }[] {
  const scores = new Map<string, number>();
  for (const r of topInterests(rows, k)) {
    if (r.affinity <= 0) continue;
    scores.set(r.topic, Math.max(scores.get(r.topic) ?? 0, r.affinity));
    for (const nb of topicNeighbors(r.topic, 0.45).slice(0, 3)) {
      const v = r.affinity * nb.weight * 0.7;
      scores.set(nb.topic, Math.max(scores.get(nb.topic) ?? 0, v));
    }
  }
  return [...scores.entries()]
    .map(([topic, weight]) => ({ topic, weight }))
    .sort((a, b) => b.weight - a.weight);
}
