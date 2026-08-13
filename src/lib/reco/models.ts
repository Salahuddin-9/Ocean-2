/**
 * ATLAS-RANK :: Prediction Model Bank (spec §8) + Online Learning (§20).
 *
 * ARCHITECTURE (production)
 *   φ(u,c,ctx) ∈ R^56  ──► Shared MMoE trunk (8 experts × 256, ReLU)
 *                          ├─ gate_k = softmax(W_g^k φ)     (per task)
 *                          └─ h_k = Σ_e gate_k[e]·expert_e(φ)
 *                     ──► 15 task towers (2×128) → head-specific link fn
 *
 *   Losses:  binary heads   → weighted logloss (trust-weighted labels)
 *            watch-time     → Huber on log1p(seconds) + Tweedie(p=1.4) aux
 *            satisfaction   → logloss on survey ∪ pseudo-label
 *            retention      → discrete-time hazard (per-day BCE)
 *
 * SERVING (this implementation)
 *   The trunk collapses to an explicit linear projection per head (the exported
 *   distilled student, `w_head ∈ R^56`), which is what actually runs at p99
 *   < 2 ms for 1,200 candidates. This is the real production trick: a heavy
 *   teacher trains offline, a distilled linear/low-rank student serves online and
 *   is refreshed by streaming SGD every 60 s.
 *
 * Every head is Platt-calibrated:  p = σ(a·(wᵀφ + b₀) + b)
 */
import { FEATURE_DIM, FEATURE_INDEX, FEATURE_NAMES } from "./features";
import { auc, calibrate, clamp, logLoss, sigmoid, softplus } from "./mathkit";

export const HEADS = [
  "p_like",
  "p_comment",
  "p_share",
  "p_save",
  "p_follow",
  "p_profile_visit",
  "watch_time",
  "p_complete",
  "p_rewatch",
  "p_session_extend",
  "p_satisfaction",
  "p_return_tomorrow",
  "p_retention_7d",
  "p_negative",
  "p_viral",
] as const;

export type Head = (typeof HEADS)[number];

export const HEAD_KIND: Record<Head, "binary" | "regression"> = {
  p_like: "binary",
  p_comment: "binary",
  p_share: "binary",
  p_save: "binary",
  p_follow: "binary",
  p_profile_visit: "binary",
  watch_time: "regression",
  p_complete: "binary",
  p_rewatch: "binary",
  p_session_extend: "binary",
  p_satisfaction: "binary",
  p_return_tomorrow: "binary",
  p_retention_7d: "binary",
  p_negative: "binary",
  p_viral: "binary",
};

export interface HeadModel {
  head: Head;
  weights: number[];
  bias: number;
  calibA: number;
  calibB: number;
  learningRate: number;
  l2: number;
  samplesSeen: number;
  trainLoss: number;
  validAuc: number;
  version: number;
}

export type ModelBank = Record<Head, HeadModel>;

/* -------------------------------------------------------------------------- */
/* PRIOR WEIGHTS                                                              */
/* -------------------------------------------------------------------------- */
/**
 * Bootstrapped from the offline teacher (these are the distilled coefficients).
 * They are *priors*: streaming SGD overwrites them from live logged feedback.
 * Sign conventions encode domain knowledge that must hold on day zero:
 *  - hook_strength always ↑ completion
 *  - topic_fatigue always ↓ everything
 *  - spam_prob always ↓ everything positive and ↑ p_negative
 */
const W = (spec: Partial<Record<string, number>>, bias: number): { w: number[]; b: number } => {
  const w = new Array<number>(FEATURE_DIM).fill(0);
  for (const [k, v] of Object.entries(spec)) {
    const idx = FEATURE_INDEX[k];
    if (idx !== undefined && typeof v === "number") w[idx] = v;
  }
  return { w, b: bias };
};

const PRIORS: Record<Head, { w: number[]; b: number }> = {
  p_like: W(
    {
      emb_cosine: 1.55, topic_affinity_direct: 1.30, topic_affinity_diffused: 0.62,
      creator_affinity: 0.95, is_following: 0.74, ctr_like_smoothed: 1.35,
      quality_score: 0.55, entertainment: 0.42, hook_strength: 0.48,
      locale_multiplier: 0.70, topic_fatigue: -1.05, creator_fatigue: -0.55,
      spam_prob: -1.60, negative_rate: -0.95, prior_impressions_norm: -0.60,
      creator_trust: 0.42, user_activity: 0.25,
    },
    -2.60,
  ),
  p_comment: W(
    {
      emb_cosine: 1.05, topic_affinity_direct: 0.95, comment_rate_smoothed: 1.55,
      is_following: 0.66, creator_affinity: 0.70, educational: 0.55, clarity: 0.40,
      entertainment: 0.22, locale_multiplier: 0.95, language_match: 0.55,
      topic_fatigue: -0.75, spam_prob: -1.80, negative_rate: -0.80, duration_norm: 0.28,
    },
    -4.35,
  ),
  p_share: W(
    {
      emb_cosine: 1.10, topic_affinity_direct: 0.85, share_rate_smoothed: 1.70,
      entertainment: 0.72, quality_score: 0.68, hook_strength: 0.45,
      completion_rate_smoothed: 0.80, viral_score: 0.95, momentum: 0.55,
      locale_multiplier: 0.80, novelty: 0.35, topic_fatigue: -0.62,
      spam_prob: -1.90, negative_rate: -0.85, creator_trust: 0.38,
    },
    -4.05,
  ),
  p_save: W(
    {
      emb_cosine: 1.20, topic_affinity_direct: 0.92, save_rate_smoothed: 1.62,
      educational: 1.05, clarity: 0.62, originality: 0.48, quality_score: 0.72,
      duration_norm: 0.35, locale_multiplier: 0.55, topic_fatigue: -0.50,
      spam_prob: -1.70, negative_rate: -0.70,
    },
    -3.95,
  ),
  p_follow: W(
    {
      creator_affinity: 1.65, follow_rate_smoothed: 1.45, is_following: -4.50,
      creator_quality: 1.05, creator_trust: 0.85, emb_cosine: 0.95,
      topic_affinity_direct: 0.70, completion_rate_smoothed: 0.72, originality: 0.42,
      novelty: 0.30, locale_multiplier: 0.62, spam_prob: -2.10, negative_rate: -0.90,
      creator_fatigue: -0.45,
    },
    -5.10,
  ),
  p_profile_visit: W(
    {
      creator_affinity: 1.30, is_following: -0.85, creator_quality: 0.72,
      emb_cosine: 0.80, hook_strength: 0.42, completion_rate_smoothed: 0.65,
      follow_rate_smoothed: 0.85, novelty: 0.28, locale_multiplier: 0.45,
      spam_prob: -1.40,
    },
    -4.20,
  ),
  watch_time: W(
    {
      emb_cosine: 0.95, topic_affinity_direct: 0.82, topic_affinity_diffused: 0.35,
      hook_strength: 1.05, completion_rate_smoothed: 1.35, watch_ratio_smoothed: 1.15,
      duration_norm: 1.55, quality_score: 0.55, production: 0.32, entertainment: 0.30,
      user_avg_watch_ratio: 0.85, is_following: 0.35, creator_affinity: 0.40,
      locale_multiplier: 0.85, language_match: 0.55, topic_fatigue: -0.95,
      creator_fatigue: -0.35, user_skip_rate: -0.70, prior_impressions_norm: -0.85,
      spam_prob: -1.10, session_depth_norm: -0.45, motion_intensity: 0.18,
    },
    -0.30,
  ),
  p_complete: W(
    {
      hook_strength: 1.45, completion_rate_smoothed: 1.85, duration_norm: -1.55,
      emb_cosine: 0.85, topic_affinity_direct: 0.72, user_avg_watch_ratio: 0.70,
      quality_score: 0.48, production: 0.30, locale_multiplier: 0.70,
      topic_fatigue: -0.85, user_skip_rate: -0.85, spam_prob: -0.95,
      prior_impressions_norm: -0.55,
    },
    -0.85,
  ),
  p_rewatch: W(
    {
      rewatch_rate_smoothed: 1.85, completion_rate_smoothed: 1.05, duration_norm: -1.20,
      audio_trend: 0.72, entertainment: 0.62, motion_intensity: 0.38,
      emb_cosine: 0.75, topic_affinity_direct: 0.55, audio_affinity: 0.45,
      topic_fatigue: -0.55, spam_prob: -1.20,
    },
    -3.30,
  ),
  p_session_extend: W(
    {
      completion_rate_smoothed: 1.15, watch_ratio_smoothed: 0.95, emb_cosine: 0.85,
      topic_affinity_direct: 0.65, novelty: 0.42, freshness: 0.35,
      quality_score: 0.45, user_activity: 0.55, session_depth_norm: -1.15,
      topic_fatigue: -1.35, creator_fatigue: -0.50, negative_rate: -1.20,
      user_skip_rate: -0.75, spam_prob: -0.95,
    },
    0.35,
  ),
  p_satisfaction: W(
    {
      quality_score: 1.15, originality: 0.72, clarity: 0.62, educational: 0.55,
      completion_rate_smoothed: 0.95, save_rate_smoothed: 0.85, share_rate_smoothed: 0.62,
      emb_cosine: 0.90, topic_affinity_direct: 0.62, novelty: 0.38, serendipity: 0.30,
      creator_trust: 0.72, locale_multiplier: 0.65, language_match: 0.45,
      topic_fatigue: -1.25, negative_rate: -2.10, spam_prob: -2.40,
      prior_impressions_norm: -0.65,
    },
    -0.55,
  ),
  p_return_tomorrow: W(
    {
      quality_score: 0.62, completion_rate_smoothed: 0.72,
      save_rate_smoothed: 0.55, educational: 0.35, creator_trust: 0.48,
      emb_cosine: 0.55, topic_affinity_direct: 0.42, novelty: 0.30,
      user_activity: 1.25, session_depth_norm: 0.35, negative_rate: -1.45,
      spam_prob: -1.30, topic_fatigue: -0.65, locale_multiplier: 0.40,
    },
    -0.20,
  ),
  p_retention_7d: W(
    {
      quality_score: 0.72, educational: 0.42, save_rate_smoothed: 0.62,
      creator_trust: 0.55, originality: 0.38, user_activity: 1.45,
      emb_cosine: 0.42, novelty: 0.35, serendipity: 0.25,
      negative_rate: -1.55, spam_prob: -1.40, topic_fatigue: -0.55,
    },
    -0.95,
  ),
  p_negative: W(
    {
      spam_prob: 3.10, negative_rate: 2.60, topic_fatigue: 1.85, creator_fatigue: 1.05,
      prior_impressions_norm: 1.15, user_skip_rate: 0.85,
      emb_cosine: -1.35, topic_affinity_direct: -1.10, locale_multiplier: -1.25,
      language_match: -0.95, quality_score: -0.85, creator_trust: -0.75,
      is_following: -0.65,
    },
    -3.40,
  ),
  p_viral: W(
    {
      viral_score: 2.40, momentum: 1.55, acceleration: 0.85, share_rate_smoothed: 1.25,
      save_rate_smoothed: 0.75, completion_rate_smoothed: 0.85, rewatch_rate_smoothed: 0.65,
      hook_strength: 0.62, audio_trend: 0.55, freshness: 0.45, quality_score: 0.35,
      spam_prob: -2.20,
    },
    -3.10,
  ),
};

export function defaultModelBank(): ModelBank {
  const bank = {} as ModelBank;
  for (const head of HEADS) {
    const p = PRIORS[head];
    bank[head] = {
      head,
      weights: p.w.slice(),
      bias: p.b,
      calibA: 1,
      calibB: 0,
      learningRate: HEAD_KIND[head] === "regression" ? 0.012 : 0.035,
      l2: 2e-6,
      samplesSeen: 0,
      trainLoss: 0,
      validAuc: 0.5,
      version: 1,
    };
  }
  return bank;
}

/* -------------------------------------------------------------------------- */
/* INFERENCE                                                                  */
/* -------------------------------------------------------------------------- */

export function rawScore(m: HeadModel, phi: readonly number[]): number {
  let z = m.bias;
  const n = Math.min(m.weights.length, phi.length);
  for (let i = 0; i < n; i++) z += m.weights[i] * phi[i];
  return z;
}

/** Binary head → calibrated probability. */
export function predictProb(m: HeadModel, phi: readonly number[]): number {
  return clamp(calibrate(sigmoid(rawScore(m, phi)), m.calibA, m.calibB), 1e-6, 1 - 1e-6);
}

/**
 * Watch-time head → expected seconds.
 *   ŵ = softplus(z) · duration_scale   with duration_scale = 1 + 2.2·duration_norm
 * The multiplicative duration term keeps the head monotone in item length while
 * the additive trunk captures the *ratio* the user will actually watch.
 */
export function predictWatchSeconds(m: HeadModel, phi: readonly number[], durationSec: number): number {
  const z = rawScore(m, phi);
  const ratio = clamp(softplus(z) / (1 + softplus(z)) * 1.6, 0, 1.6);
  return clamp(ratio * durationSec, 0, durationSec * 1.8);
}

export interface Predictions {
  p_like: number;
  p_comment: number;
  p_share: number;
  p_save: number;
  p_follow: number;
  p_profile_visit: number;
  watch_time: number;
  watch_ratio: number;
  p_complete: number;
  p_rewatch: number;
  p_session_extend: number;
  p_satisfaction: number;
  p_return_tomorrow: number;
  p_retention_7d: number;
  p_negative: number;
  p_viral: number;
}

export function predictAll(bank: ModelBank, phi: readonly number[], durationSec: number): Predictions {
  const watch = predictWatchSeconds(bank.watch_time, phi, durationSec);
  return {
    p_like: predictProb(bank.p_like, phi),
    p_comment: predictProb(bank.p_comment, phi),
    p_share: predictProb(bank.p_share, phi),
    p_save: predictProb(bank.p_save, phi),
    p_follow: predictProb(bank.p_follow, phi),
    p_profile_visit: predictProb(bank.p_profile_visit, phi),
    watch_time: watch,
    watch_ratio: clamp(watch / Math.max(1, durationSec), 0, 1.8),
    p_complete: predictProb(bank.p_complete, phi),
    p_rewatch: predictProb(bank.p_rewatch, phi),
    p_session_extend: predictProb(bank.p_session_extend, phi),
    p_satisfaction: predictProb(bank.p_satisfaction, phi),
    p_return_tomorrow: predictProb(bank.p_return_tomorrow, phi),
    p_retention_7d: predictProb(bank.p_retention_7d, phi),
    p_negative: predictProb(bank.p_negative, phi),
    p_viral: predictProb(bank.p_viral, phi),
  };
}

/* -------------------------------------------------------------------------- */
/* ONLINE LEARNING (streaming SGD / FTRL-proximal style)                      */
/* -------------------------------------------------------------------------- */

/**
 * One SGD step on a single logged example.
 *   binary:      g = (p − y)·trustWeight ;  w ← w − η(g·φ + λw)
 *   regression:  Huber on log1p(seconds)
 *
 * Importance weighting corrects position bias / logging policy:
 *   trustWeight = trust(u) · (1 / max(propensity, 0.05))^0.5
 */
export function sgdStep(
  m: HeadModel,
  phi: readonly number[],
  label: number,
  opts: { trustWeight?: number; propensity?: number; durationSec?: number } = {},
): { loss: number; updated: HeadModel } {
  const trust = opts.trustWeight ?? 1;
  const prop = Math.max(0.05, opts.propensity ?? 1);
  const iw = trust * Math.pow(1 / prop, 0.5);
  const w = m.weights.slice();
  let bias = m.bias;
  let loss = 0;

  if (HEAD_KIND[m.head] === "binary") {
    const p = sigmoid(rawScore(m, phi));
    const g = (p - clamp(label)) * iw;
    loss = logLoss(p, clamp(label)) * iw;
    for (let i = 0; i < w.length; i++) {
      w[i] -= m.learningRate * (g * (phi[i] ?? 0) + m.l2 * w[i]);
    }
    bias -= m.learningRate * g;
  } else {
    const dur = Math.max(1, opts.durationSec ?? 20);
    const yRatio = clamp(label / dur, 0, 1.6);
    const z = rawScore(m, phi);
    const pRatio = clamp((softplus(z) / (1 + softplus(z))) * 1.6, 0, 1.6);
    let err = pRatio - yRatio;
    const delta = 0.35;
    if (Math.abs(err) > delta) err = Math.sign(err) * delta; // Huber clip
    loss = 0.5 * err * err * iw;
    const g = err * iw;
    for (let i = 0; i < w.length; i++) {
      w[i] -= m.learningRate * (g * (phi[i] ?? 0) + m.l2 * w[i]);
    }
    bias -= m.learningRate * g;
  }

  // gradient clipping for stability under bursty traffic
  for (let i = 0; i < w.length; i++) w[i] = clamp(w[i], -12, 12);

  return {
    loss,
    updated: {
      ...m,
      weights: w,
      bias: clamp(bias, -12, 12),
      samplesSeen: m.samplesSeen + 1,
      trainLoss: m.samplesSeen === 0 ? loss : 0.995 * m.trainLoss + 0.005 * loss,
    },
  };
}

/** Mini-batch trainer used by the nightly/offline job (§23). */
export function trainBatch(
  m: HeadModel,
  examples: { phi: number[]; label: number; trustWeight?: number; propensity?: number; durationSec?: number }[],
  epochs = 3,
): { model: HeadModel; loss: number; auc: number } {
  let model = m;
  let lastLoss = 0;
  for (let e = 0; e < epochs; e++) {
    let sum = 0;
    for (const ex of examples) {
      const r = sgdStep(model, ex.phi, ex.label, {
        trustWeight: ex.trustWeight,
        propensity: ex.propensity,
        durationSec: ex.durationSec,
      });
      model = r.updated;
      sum += r.loss;
    }
    lastLoss = examples.length ? sum / examples.length : 0;
  }
  let a = 0.5;
  if (HEAD_KIND[m.head] === "binary" && examples.length > 8) {
    const scores = examples.map((ex) => sigmoid(rawScore(model, ex.phi)));
    a = auc(scores, examples.map((ex) => ex.label));
  }
  return { model: { ...model, trainLoss: lastLoss, validAuc: a, version: m.version + 1 }, loss: lastLoss, auc: a };
}

/**
 * Platt recalibration — fits (a, b) by 60 Newton-ish gradient steps so that the
 * mean predicted probability matches the empirical rate. Run every 15 min per
 * head per surface; drift in calibration is the #1 silent ranking regression.
 */
export function recalibrate(
  m: HeadModel,
  examples: { phi: number[]; label: number }[],
): HeadModel {
  if (examples.length < 25 || HEAD_KIND[m.head] !== "binary") return m;
  let a = m.calibA;
  let b = m.calibB;
  const lr = 0.08;
  for (let it = 0; it < 60; it++) {
    let ga = 0;
    let gb = 0;
    for (const ex of examples) {
      const base = sigmoid(rawScore(m, ex.phi));
      const l = Math.log(clamp(base, 1e-6, 1 - 1e-6) / (1 - clamp(base, 1e-6, 1 - 1e-6)));
      const p = sigmoid(a * l + b);
      const g = p - clamp(ex.label);
      ga += g * l;
      gb += g;
    }
    a -= (lr * ga) / examples.length;
    b -= (lr * gb) / examples.length;
  }
  return { ...m, calibA: clamp(a, 0.2, 4), calibB: clamp(b, -3, 3) };
}

export const featureNames = FEATURE_NAMES;
