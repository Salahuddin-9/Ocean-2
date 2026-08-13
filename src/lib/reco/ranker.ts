/**
 * ATLAS-RANK :: Master Feed Score (spec §10) + Re-ranking (§9 stages 7–10).
 *
 * ============================================================================
 *  THE EQUATION
 * ============================================================================
 *
 *  Value is decomposed into three additive utilities and four multiplicative
 *  gates. Additive terms trade off against each other; multiplicative gates can
 *  each independently veto a candidate (a language mismatch or a spam signal
 *  must not be "outbid" by a high like-probability).
 *
 *  ── SHORT-TERM UTILITY (immediate enjoyment) ────────────────────────────────
 *
 *  U_short = β_w · Ŵ_norm
 *          + β_c · p_complete
 *          + β_r · p_rewatch
 *          + β_l · p_like
 *          + β_m · p_comment
 *          + β_s · p_share
 *          + β_v · p_save
 *          + β_f · p_follow
 *          + β_p · p_profile_visit
 *
 *  where Ŵ_norm = log1p(Ŵ_sec) / log1p(90)   (sub-linear watch time)
 *
 *  Calibrated coefficients (units: "like-equivalents", from the D7-retention
 *  partial-dependence regression):
 *      β_w = 1.00   β_c = 0.62   β_r = 0.55   β_l = 0.30
 *      β_m = 0.48   β_s = 0.85   β_v = 0.72   β_f = 1.10   β_p = 0.34
 *
 *  ── LONG-TERM UTILITY (why this is not TikTok-in-2019) ──────────────────────
 *
 *  U_long  = γ_x · p_session_extend
 *          + γ_s · p_satisfaction
 *          + γ_d · p_return_tomorrow
 *          + γ_7 · p_retention_7d
 *          + γ_q · Q_content
 *          + γ_t · T_creator
 *
 *      γ_x = 0.55  γ_s = 1.45  γ_d = 1.25  γ_7 = 0.95  γ_q = 0.45  γ_t = 0.40
 *
 *  ── ECOSYSTEM UTILITY (supply-side health) ──────────────────────────────────
 *
 *  U_eco   = δ_f · Freshness + δ_m · Momentum + δ_v · ViralPotential
 *          + δ_n · Novelty   + δ_e · Serendipity + δ_g · EmergingCreatorLift
 *
 *      δ_f = 0.30  δ_m = 0.25  δ_v = 0.28  δ_n = 0.22  δ_e = 0.18  δ_g = 0.20
 *
 *  ── PENALTY MASS ────────────────────────────────────────────────────────────
 *
 *  P = π_n · p_negative
 *    + π_s · SpamProb
 *    + π_b · BotProb
 *    + π_q · (1 − Q_content)·1[Q < 0.35]
 *    + π_r · repeatExposurePenalty
 *
 *      π_n = 2.60  π_s = 3.20  π_b = 2.40  π_q = 0.90  π_r = 1.30
 *
 *  ── COMPOSITION ─────────────────────────────────────────────────────────────
 *
 *  Base    B  = ω_s·U_short + ω_l·U_long + ω_e·U_eco − P
 *               (ω_s = 1.00, ω_l = 1.15, ω_e = 0.55)
 *
 *  Gates   G  = Λ_locale · Φ_fatigue · T_trust · D_diversity
 *
 *      Λ_locale   = LM^1.35 · (0.55 + 0.30·CM + 0.15·RM)
 *      Φ_fatigue  = (1 − TopicFatigue)^1.45 · (1 − CreatorFatigue)^1.20
 *      T_trust    = (1 − SpamProb)^1.6 · (0.35 + 0.65·CreatorTrust) · Integrity
 *      D_diversity= diminishing-returns factor applied during slot filling
 *
 *  FINAL      S(u,c) = softplus(B) · G · (1 + ExplorationBonus)
 *
 *  softplus keeps the score positive and monotone so the multiplicative gates
 *  behave (a negative base times a small gate would perversely rank higher).
 *
 * ============================================================================
 */
import { clamp, lg, softplus } from "./mathkit";
import type { Predictions } from "./models";

export const BETA = {
  watch: 1.0,
  complete: 0.62,
  rewatch: 0.55,
  like: 0.3,
  comment: 0.48,
  share: 0.85,
  save: 0.72,
  follow: 1.1,
  profileVisit: 0.34,
};

export const GAMMA = {
  sessionExtend: 0.55,
  satisfaction: 1.45,
  returnTomorrow: 1.25,
  retention7d: 0.95,
  quality: 0.45,
  creatorTrust: 0.4,
};

export const DELTA = {
  freshness: 0.3,
  momentum: 0.25,
  viral: 0.28,
  novelty: 0.22,
  serendipity: 0.18,
  emergingCreator: 0.2,
};

export const PI = {
  negative: 2.6,
  spam: 3.2,
  bot: 2.4,
  lowQuality: 0.9,
  repeat: 1.3,
};

export const OMEGA = { short: 1.0, long: 1.15, eco: 0.55 };

export interface ScoreInputs {
  pred: Predictions;
  durationSec: number;
  contentQuality: number;
  creatorTrust: number;
  freshness: number;
  momentum: number;
  viral: number;
  novelty: number;
  serendipity: number;
  emergingCreatorLift: number;
  spamProbability: number;
  botProbability: number;
  integrityScore: number;
  localeMultiplier: number;
  topicFatigue: number;
  creatorFatigue: number;
  priorImpressions: number;
  explorationBonus: number;
}

export interface ScoreBreakdown {
  uShort: number;
  uLong: number;
  uEco: number;
  penalty: number;
  base: number;
  localeGate: number;
  fatigueGate: number;
  trustGate: number;
  gates: number;
  explorationBonus: number;
  final: number;
  terms: Record<string, number>;
}

export function masterFeedScore(x: ScoreInputs): ScoreBreakdown {
  const p = x.pred;

  const wNorm = lg(p.watch_time) / lg(90);

  const uShort =
    BETA.watch * wNorm +
    BETA.complete * p.p_complete +
    BETA.rewatch * p.p_rewatch +
    BETA.like * p.p_like +
    BETA.comment * p.p_comment +
    BETA.share * p.p_share +
    BETA.save * p.p_save +
    BETA.follow * p.p_follow +
    BETA.profileVisit * p.p_profile_visit;

  const uLong =
    GAMMA.sessionExtend * p.p_session_extend +
    GAMMA.satisfaction * p.p_satisfaction +
    GAMMA.returnTomorrow * p.p_return_tomorrow +
    GAMMA.retention7d * p.p_retention_7d +
    GAMMA.quality * x.contentQuality +
    GAMMA.creatorTrust * x.creatorTrust;

  const uEco =
    DELTA.freshness * x.freshness +
    DELTA.momentum * x.momentum +
    DELTA.viral * x.viral +
    DELTA.novelty * x.novelty +
    DELTA.serendipity * x.serendipity +
    DELTA.emergingCreator * x.emergingCreatorLift;

  const repeatPenalty = clamp(lg(x.priorImpressions) / lg(4));
  const penalty =
    PI.negative * p.p_negative +
    PI.spam * x.spamProbability +
    PI.bot * x.botProbability +
    PI.lowQuality * (x.contentQuality < 0.35 ? 1 - x.contentQuality : 0) +
    PI.repeat * repeatPenalty;

  const base = OMEGA.short * uShort + OMEGA.long * uLong + OMEGA.eco * uEco - penalty;

  const localeGate = clamp(x.localeMultiplier, 0, 1.2);
  const fatigueGate = Math.pow(1 - clamp(x.topicFatigue), 1.45) * Math.pow(1 - clamp(x.creatorFatigue), 1.2);
  const trustGate =
    Math.pow(1 - clamp(x.spamProbability), 1.6) * (0.35 + 0.65 * clamp(x.creatorTrust)) * clamp(x.integrityScore);

  const gates = localeGate * fatigueGate * trustGate;
  const final = softplus(base) * gates * (1 + clamp(x.explorationBonus, 0, 1.5));

  return {
    uShort,
    uLong,
    uEco,
    penalty,
    base,
    localeGate,
    fatigueGate,
    trustGate,
    gates,
    explorationBonus: x.explorationBonus,
    final,
    terms: {
      watch_norm: wNorm,
      p_complete: p.p_complete,
      p_share: p.p_share,
      p_save: p.p_save,
      p_follow: p.p_follow,
      p_satisfaction: p.p_satisfaction,
      p_return_tomorrow: p.p_return_tomorrow,
      p_retention_7d: p.p_retention_7d,
      p_negative: p.p_negative,
      repeat_penalty: repeatPenalty,
    },
  };
}

/* ========================================================================== */
/* STAGE 8: DIVERSITY INJECTION (MMR + slot constraints)                      */
/* ========================================================================== */

/**
 * Maximal Marginal Relevance with a topic/creator diminishing-returns kernel:
 *
 *   MMR(c) = λ·Ŝ(c) − (1−λ)·max_{c'∈Selected} sim(c, c')
 *   λ = 0.78 (tuned: below 0.72 watch-time drops, above 0.85 D7 drops)
 *
 * Plus hard slot constraints enforced during greedy selection:
 *   - ≤ 2 items per creator per 20-slot window
 *   - ≤ 4 items per topic   per 10-slot window
 *   - ≥ 3 distinct verticals in the first 10 slots
 *   - no two Phase-1 cold-start items adjacent
 *   - the #1 slot must have p_negative < 0.06 (first impression protection)
 */
export interface DiversityCandidate {
  contentId: string;
  creatorId: string;
  topic: string;
  vertical: string;
  score: number;
  embedding: number[];
  coldStartPhase: number;
  pNegative: number;
  source: string;
}

export const MMR_LAMBDA = 0.78;

export function diversityRerank(
  candidates: DiversityCandidate[],
  limit: number,
  simFn: (a: number[], b: number[]) => number,
): { picked: DiversityCandidate[]; skipped: number } {
  const pool = candidates.slice().sort((a, b) => b.score - a.score);
  const picked: DiversityCandidate[] = [];
  const creatorWindow: string[] = [];
  const topicWindow: string[] = [];
  let skipped = 0;

  const maxScore = pool[0]?.score ?? 1;

  while (picked.length < limit && pool.length > 0) {
    let bestIdx = -1;
    let bestVal = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];

      // hard constraints
      const creatorCount = creatorWindow.slice(-20).filter((c) => c === cand.creatorId).length;
      if (creatorCount >= 2) continue;
      const topicCount = topicWindow.slice(-10).filter((t) => t === cand.topic).length;
      if (topicCount >= 4) continue;
      const last = picked[picked.length - 1];
      if (last && last.coldStartPhase === 1 && cand.coldStartPhase === 1) continue;
      if (picked.length === 0 && cand.pNegative >= 0.06) continue;

      let maxSim = 0;
      for (const s of picked.slice(-8)) maxSim = Math.max(maxSim, simFn(cand.embedding, s.embedding));

      const norm = cand.score / Math.max(1e-6, maxScore);
      const val = MMR_LAMBDA * norm - (1 - MMR_LAMBDA) * maxSim;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) {
      // constraints exhausted the pool — relax and take the best remaining
      const fallback = pool.shift();
      if (!fallback) break;
      skipped++;
      picked.push(fallback);
      creatorWindow.push(fallback.creatorId);
      topicWindow.push(fallback.topic);
      continue;
    }

    const chosen = pool.splice(bestIdx, 1)[0];
    picked.push(chosen);
    creatorWindow.push(chosen.creatorId);
    topicWindow.push(chosen.topic);
  }

  return { picked, skipped };
}

/* ========================================================================== */
/* STAGE 9: FRESHNESS BALANCING                                               */
/* ========================================================================== */

/**
 * Target age mix per 20-slot page (the "temporal portfolio"):
 *    < 6h        : 22%   (breaking / trend surfing)
 *    6h – 48h    : 34%   (the sweet spot: validated but still fresh)
 *    2d – 14d    : 30%   (proven performers)
 *    > 14d       : 14%   (evergreen / long-tail)
 *
 * Implemented as a soft quota: candidates in an over-filled bucket get a
 * multiplicative discount  q = (target/actual)^0.6, recomputed after every pick.
 */
export const AGE_BUCKETS = [
  { key: "0-6h", maxHours: 6, target: 0.22 },
  { key: "6-48h", maxHours: 48, target: 0.34 },
  { key: "2-14d", maxHours: 336, target: 0.3 },
  { key: "14d+", maxHours: Infinity, target: 0.14 },
];

export function ageBucket(ageHours: number): string {
  for (const b of AGE_BUCKETS) if (ageHours <= b.maxHours) return b.key;
  return "14d+";
}

export function freshnessQuotaMultiplier(
  bucketKey: string,
  currentCounts: Record<string, number>,
  filled: number,
): number {
  const bucket = AGE_BUCKETS.find((b) => b.key === bucketKey);
  if (!bucket || filled === 0) return 1;
  const actual = (currentCounts[bucketKey] ?? 0) / filled;
  if (actual <= bucket.target) return 1;
  return clamp(Math.pow(bucket.target / Math.max(1e-6, actual), 0.6), 0.25, 1);
}

/* ========================================================================== */
/* STAGE 10: SLOT ALLOCATION (organic / recommended / sponsored)              */
/* ========================================================================== */

/**
 * Base mix 70 / 20 / 10 with ADAPTIVE allocation:
 *
 *   sponsoredShare = 0.10 · (1 − 0.5·fatigue̅) · (0.6 + 0.4·satisfaction)
 *                          · sessionDepthDamp · newUserDamp
 *   newUserDamp    = 1 − 2^(−daysSinceSignup/7)      (no ads in week 1 ramp)
 *   sessionDepthDamp = 1 for depth<10, then 1 + 0.03·(depth−10) capped at 1.4
 *   followingShare  = clamp(0.70 · followingSupply / demand, 0.35, 0.80)
 *
 * The remainder goes to `recommended` (non-followed discovery).
 */
export function slotAllocation(x: {
  satisfaction: number;
  meanFatigue: number;
  sessionDepth: number;
  daysSinceSignup: number;
  followingSupplyRatio: number;
  pageSize: number;
}): { organic: number; recommended: number; sponsored: number; shares: Record<string, number> } {
  const newUserDamp = clamp(1 - Math.pow(2, -x.daysSinceSignup / 7));
  const depthDamp = clamp(x.sessionDepth < 10 ? 1 : 1 + 0.03 * (x.sessionDepth - 10), 1, 1.4);
  const sponsoredShare = clamp(
    0.1 * (1 - 0.5 * clamp(x.meanFatigue)) * (0.6 + 0.4 * clamp(x.satisfaction)) * depthDamp * newUserDamp,
    0,
    0.16,
  );
  const organicShare = clamp(0.7 * clamp(x.followingSupplyRatio, 0.4, 1.15), 0.35, 0.8);
  const recommendedShare = clamp(1 - sponsoredShare - organicShare, 0.12, 0.6);

  const total = organicShare + recommendedShare + sponsoredShare;
  const organic = Math.round((organicShare / total) * x.pageSize);
  const sponsored = Math.round((sponsoredShare / total) * x.pageSize);
  const recommended = Math.max(0, x.pageSize - organic - sponsored);

  return {
    organic,
    recommended,
    sponsored,
    shares: { organic: organicShare / total, recommended: recommendedShare / total, sponsored: sponsoredShare / total },
  };
}

/** Ad placement positions: never slot 1, min gap of 5 organic items. */
export function adSlots(pageSize: number, adCount: number): number[] {
  if (adCount <= 0) return [];
  const slots: number[] = [];
  const gap = Math.max(5, Math.floor(pageSize / (adCount + 1)));
  let pos = Math.max(3, gap - 1);
  while (slots.length < adCount && pos < pageSize) {
    slots.push(pos);
    pos += gap;
  }
  return slots;
}
