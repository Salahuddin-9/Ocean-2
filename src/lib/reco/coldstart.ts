/**
 * ATLAS-RANK :: Cold Start System (spec §12).
 *
 * Two distinct cold-start problems:
 *   A. CONTENT cold start — a new post has no engagement history.
 *   B. USER   cold start — a new user has no interest graph.
 *   C. CREATOR cold start — a new creator has no trust prior.
 *
 * -------------------------------------------------------------------------
 * A. CONTENT: a 6-phase escalating distribution ladder ("audience ladder").
 *
 *   Phase 1 →         50 impressions   (seed / calibration cohort)
 *   Phase 2 →        500 impressions   (micro validation)
 *   Phase 3 →      5,000 impressions   (topic-cohort validation)
 *   Phase 4 →     50,000 impressions   (regional expansion)
 *   Phase 5 →    500,000 impressions   (national / cross-region)
 *   Phase 6 →  unlimited               (global pool)
 *
 * The seed cohort is NOT random. It is a stratified sample designed to give a
 * low-variance estimate of the post's quality per unit of risk:
 *   55% high-affinity users for the topic (signal quality)
 *   20% the creator's own followers        (baseline)
 *   15% "calibrator" users — high-volume, high-trust, historically predictive
 *   10% out-of-topic users                 (measures crossover potential)
 *
 * PROMOTION RULE (phase k → k+1) requires ALL gates to pass on the cohort:
 *
 *   G1  Volume:        impressions ≥ N_k
 *   G2  Retention:     WatchRatio ≥ μ_topic·θ_w(k)        θ_w = [0.80,0.88,0.94,1.00,1.06]
 *   G3  Completion:    Completion  ≥ μ_topic·θ_c(k)       θ_c = [0.75,0.85,0.92,1.00,1.05]
 *   G4  Engagement:    E_norm      ≥ μ_topic·θ_e(k)       θ_e = [0.70,0.85,0.95,1.05,1.10]
 *   G5  Negative:      NegRate     ≤ ν_topic·θ_n(k)       θ_n = [2.00,1.60,1.30,1.10,1.00]
 *   G6  Integrity:     Spam < 0.35 ∧ Bot < 0.35 ∧ Violation < 0.20
 *   G7  Confidence:    LowerBound₉₅(score) ≥ promotionFloor(k)
 *
 * where E_norm = 3·shareRate + 2.2·saveRate + 1.4·likeRate + 2.6·followRate.
 *
 * The confidence gate G7 uses a Beta-Binomial lower bound so that a 2/2 lucky
 * start cannot skip phases — the ladder is fundamentally a sequential
 * hypothesis test with an ever-tightening α.
 *
 * DEMOTION: if at any phase the observed score falls below 0.55·μ_topic or
 * negative-rate exceeds 3·ν_topic, the post is frozen (cap := current
 * impressions) and re-enters only via manual/organic (following-feed) surface.
 *
 * -------------------------------------------------------------------------
 * B. USER cold start (first 40 interactions):
 *   1. Geo/language popularity prior (P(topic | country, language, age-band))
 *   2. Onboarding topic picks (if any) seeded at A = 0.55
 *   3. Max-entropy probe list: 12 items spanning 12 distinct verticals, chosen
 *      to maximise expected information gain about the user's latent vector
 *        argmax_S  H(prior) − E[H(posterior | S)]
 *   4. ε = 0.45 (decays to 0.20 over 40 interactions via ε = 0.20 + 0.25·2^(−n/12))
 *   5. Switch from popularity prior to personal model when
 *        confidence = 1 − 2^(−n/15) > 0.6
 *
 * -------------------------------------------------------------------------
 * C. CREATOR cold start:
 *   Trust prior T₀ = 0.45 + 0.15·verified + 0.10·phoneVerified − 0.20·burstSignup
 *   Distribution multiplier starts at 0.85 and is updated by the creator model
 *   after each graduated post. First 5 posts get a guaranteed Phase-2 (500)
 *   allocation ("new creator guarantee") unless integrity flags fire — this is
 *   what keeps the creator supply side alive.
 */
import { clamp, wilsonLower } from "./mathkit";

export const PHASE_CAPS = [50, 500, 5_000, 50_000, 500_000, Number.MAX_SAFE_INTEGER];

export const PHASE_THRESHOLDS = {
  watch: [0.8, 0.88, 0.94, 1.0, 1.06],
  completion: [0.75, 0.85, 0.92, 1.0, 1.05],
  engagement: [0.7, 0.85, 0.95, 1.05, 1.1],
  negative: [2.0, 1.6, 1.3, 1.1, 1.0],
  confidenceFloor: [0.18, 0.28, 0.36, 0.44, 0.52],
};

export interface TopicBaseline {
  watchRatio: number;
  completionRate: number;
  engagementNorm: number;
  negativeRate: number;
}

export interface ColdStartObservation {
  phase: number; // 1..6
  impressions: number;
  views: number;
  watchTimeSec: number;
  durationSec: number;
  completions: number;
  likes: number;
  shares: number;
  saves: number;
  follows: number;
  negatives: number;
  spamProbability: number;
  botProbability: number;
  violationRisk: number;
}

export interface ColdStartDecision {
  decision: "promote" | "hold" | "freeze" | "accelerate";
  nextPhase: number;
  nextCap: number;
  gates: Record<string, { pass: boolean; observed: number; required: number }>;
  score: number;
  confidenceLower: number;
  reason: string;
}

export function engagementNorm(o: ColdStartObservation): number {
  const v = Math.max(1, o.views);
  return 3 * (o.shares / v) + 2.2 * (o.saves / v) + 1.4 * (o.likes / v) + 2.6 * (o.follows / v);
}

export function evaluateColdStart(
  o: ColdStartObservation,
  base: TopicBaseline,
  creatorMultiplier: number,
  viralMultiplier = 1,
): ColdStartDecision {
  const k = clamp(o.phase - 1, 0, 4);
  const v = Math.max(1, o.views);
  const imps = Math.max(1, o.impressions);

  const watchRatio = o.watchTimeSec / (v * Math.max(1, o.durationSec));
  const completion = o.completions / v;
  const eNorm = engagementNorm(o);
  const negRate = o.negatives / imps;

  const reqVolume = PHASE_CAPS[o.phase - 1] ?? 50;
  const reqWatch = base.watchRatio * PHASE_THRESHOLDS.watch[k];
  const reqCompletion = base.completionRate * PHASE_THRESHOLDS.completion[k];
  const reqEngagement = base.engagementNorm * PHASE_THRESHOLDS.engagement[k];
  const reqNegative = base.negativeRate * PHASE_THRESHOLDS.negative[k];

  // Composite phase score, normalised against the topic cohort.
  const score = clamp(
    0.32 * (watchRatio / Math.max(1e-6, base.watchRatio)) * 0.5 +
      0.28 * (completion / Math.max(1e-6, base.completionRate)) * 0.5 +
      0.3 * (eNorm / Math.max(1e-6, base.engagementNorm)) * 0.5 +
      0.1,
    0,
    2,
  );

  // Beta-Binomial style lower bound on the "good outcome" rate.
  const successes = o.completions + o.likes + 2 * o.saves + 3 * o.shares + 4 * o.follows;
  const confidenceLower = wilsonLower(Math.min(successes, imps), imps);

  const gates: ColdStartDecision["gates"] = {
    G1_volume: { pass: o.impressions >= reqVolume, observed: o.impressions, required: reqVolume },
    G2_watch: { pass: watchRatio >= reqWatch, observed: watchRatio, required: reqWatch },
    G3_completion: { pass: completion >= reqCompletion, observed: completion, required: reqCompletion },
    G4_engagement: { pass: eNorm >= reqEngagement, observed: eNorm, required: reqEngagement },
    G5_negative: { pass: negRate <= reqNegative, observed: negRate, required: reqNegative },
    G6_integrity: {
      pass: o.spamProbability < 0.35 && o.botProbability < 0.35 && o.violationRisk < 0.2,
      observed: Math.max(o.spamProbability, o.botProbability, o.violationRisk),
      required: 0.35,
    },
    G7_confidence: {
      pass: confidenceLower >= PHASE_THRESHOLDS.confidenceFloor[k],
      observed: confidenceLower,
      required: PHASE_THRESHOLDS.confidenceFloor[k],
    },
  };

  // Freeze conditions dominate.
  if (negRate > 3 * base.negativeRate && o.impressions > 30) {
    return {
      decision: "freeze",
      nextPhase: o.phase,
      nextCap: o.impressions,
      gates,
      score,
      confidenceLower,
      reason: "negative_rate_breach",
    };
  }
  if (o.impressions >= reqVolume && score < 0.55) {
    return {
      decision: "freeze",
      nextPhase: o.phase,
      nextCap: o.impressions,
      gates,
      score,
      confidenceLower,
      reason: "below_cohort_floor",
    };
  }
  if (!gates.G6_integrity.pass) {
    return {
      decision: "freeze",
      nextPhase: o.phase,
      nextCap: Math.min(o.impressions, reqVolume),
      gates,
      score,
      confidenceLower,
      reason: "integrity_gate",
    };
  }

  const allPass = Object.values(gates).every((g) => g.pass);
  if (!allPass) {
    return {
      decision: "hold",
      nextPhase: o.phase,
      nextCap: Math.round(reqVolume * creatorMultiplier * viralMultiplier),
      gates,
      score,
      confidenceLower,
      reason: "gates_pending",
    };
  }

  // Skip-a-phase acceleration for exceptional early signal (score ≥ 1.45 and
  // strong confidence) — this is how a true breakout reaches millions in hours.
  const accelerate = score >= 1.45 && confidenceLower >= PHASE_THRESHOLDS.confidenceFloor[k] * 1.6;
  const nextPhase = Math.min(6, o.phase + (accelerate ? 2 : 1));
  const nextCap = Math.round(
    Math.min(PHASE_CAPS[nextPhase - 1], Number.MAX_SAFE_INTEGER / 4) * creatorMultiplier * viralMultiplier,
  );

  return {
    decision: accelerate ? "accelerate" : "promote",
    nextPhase,
    nextCap,
    gates,
    score,
    confidenceLower,
    reason: accelerate ? "breakout_signal" : "gates_passed",
  };
}

/** User cold-start exploration schedule: ε(n) = 0.20 + 0.25·2^(−n/12). */
export const coldStartEpsilon = (interactions: number): number =>
  clamp(0.2 + 0.25 * Math.pow(2, -interactions / 12), 0.2, 0.45);

/** Personal-model confidence: 1 − 2^(−n/15). Below 0.6 we blend the geo prior. */
export const personalModelConfidence = (interactions: number): number =>
  clamp(1 - Math.pow(2, -interactions / 15));

/**
 * Blend geo-popularity prior with the personal model during user cold start.
 *   A_eff(u,t) = γ·A_personal + (1−γ)·P(t | country, lang)
 */
export function blendColdStartAffinity(
  personal: number,
  geoPrior: number,
  interactions: number,
): number {
  const g = personalModelConfidence(interactions);
  return clamp(g * personal + (1 - g) * geoPrior);
}

/**
 * Stratified seed-cohort composition for Phase 1.
 * Returns target proportions; the candidate sampler fills them from the live
 * user pool with per-user daily "new content quota" enforcement (≤ 12% of a
 * user's feed may be Phase-1 content, so exploration never wrecks a session).
 */
export const SEED_COHORT_MIX = {
  highAffinity: 0.55,
  creatorFollowers: 0.2,
  calibrators: 0.15,
  outOfTopic: 0.1,
} as const;

export const MAX_PHASE1_SHARE_OF_FEED = 0.12;

/** New-creator guarantee: first 5 posts get at least Phase-2 allocation. */
export const newCreatorGuarantee = (postIndex: number, integrityClean: boolean): number =>
  integrityClean && postIndex < 5 ? 500 : 50;
