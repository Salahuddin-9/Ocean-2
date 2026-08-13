/**
 * ATLAS-RANK :: Freshness (§13), Trend Momentum (§14), Viral Detection (§11).
 *
 * All three consume the same rolling-window counter set maintained by the
 * Flink jobs (1m / 5m / 1h / 6h / 24h tumbling + session windows) and written
 * into `content_stats`.
 */
import { clamp, ewmaTimed, halfLifeDecay, lg, sigmoid, tanh, zscore } from "./mathkit";
import { TOPIC_INDEX } from "./taxonomy";

export interface DynamicsInput {
  ageHours: number;
  topic: string;
  impressions: number;
  views: number;
  watchTimeSec: number;
  durationSec: number;
  completions: number;
  rewatches: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  negatives: number;
  /** per-hour EWMA velocities */
  vViews: number;
  vWatch: number;
  vShares: number;
  vSaves: number;
  vComments: number;
  vFollows: number;
  vViewsPrev: number;
  regionsReached: number;
  totalRegions: number;
  /** cohort baselines (topic × phase) for z-normalisation */
  baseline: CohortBaseline;
}

export interface CohortBaseline {
  muViewVelocity: number;
  sdViewVelocity: number;
  muCompletion: number;
  sdCompletion: number;
  muShareRate: number;
  sdShareRate: number;
  muSaveRate: number;
  sdSaveRate: number;
  muWatchRatio: number;
  sdWatchRatio: number;
}

export const DEFAULT_BASELINE: CohortBaseline = {
  muViewVelocity: 40,
  sdViewVelocity: 90,
  muCompletion: 0.34,
  sdCompletion: 0.16,
  muShareRate: 0.011,
  sdShareRate: 0.014,
  muSaveRate: 0.017,
  sdSaveRate: 0.02,
  muWatchRatio: 0.46,
  sdWatchRatio: 0.19,
};

/* ========================================================================== */
/* 13. FRESHNESS ENGINE                                                       */
/* ========================================================================== */

/**
 * F(c) = w_r·R(c) + w_v·V(c) + w_e·E(c) + w_l·(1 − L(c))
 *
 *   R(c) recency        = 2^(−age / H_topic)                    (topic-adaptive)
 *   V(c) velocity term  = tanh( vViews / (μ_v + σ_v) )
 *   E(c) recent engage  = tanh( (vShares·3 + vSaves·2 + vComments) / 6 )
 *   L(c) lifecycle pos  = 1 − 2^(−age / H_topic_lifecycle)
 *
 *   weights: w_r=0.42, w_v=0.26, w_e=0.20, w_l=0.12
 *
 * The topic-adaptive half-life is the key design decision: `news` decays with
 * H = 4h while `diy` decays with H = 96h, so an evergreen tutorial is not
 * unfairly buried by a hard-recency prior.
 */
export function freshnessScore(x: DynamicsInput): number {
  const node = TOPIC_INDEX[x.topic];
  const lifecycleH = node?.lifecycleHalfLifeH ?? 96;
  const recencyH = Math.max(3, lifecycleH * 0.28);

  const R = halfLifeDecay(x.ageHours, recencyH);
  const V = tanh(x.vViews / (x.baseline.muViewVelocity + x.baseline.sdViewVelocity));
  const E = tanh((x.vShares * 3 + x.vSaves * 2 + x.vComments) / 6);
  const L = 1 - halfLifeDecay(x.ageHours, lifecycleH);

  return clamp(0.42 * R + 0.26 * V + 0.2 * E + 0.12 * (1 - L));
}

/* ========================================================================== */
/* 14. TRENDING MOMENTUM ENGINE                                               */
/* ========================================================================== */

/**
 * Momentum is a z-normalised, acceleration-aware growth index.
 *
 *   z_view  = z(vViews,   μ_v, σ_v)
 *   z_watch = z(vWatch/vViews, μ_wr, σ_wr)
 *   z_share = z(vShares/vViews, μ_sh, σ_sh)
 *   z_save  = z(vSaves /vViews, μ_sa, σ_sa)
 *   z_cmt   = z(vComments/vViews, 0.02, 0.03)
 *   z_fol   = z(vFollows /vViews, 0.004, 0.008)
 *
 *   a(c) = (vViews − vViews_prev) / (vViews_prev + ε)      (acceleration)
 *
 *   M_raw = 0.24·z_view + 0.22·z_watch + 0.20·z_share
 *         + 0.14·z_save + 0.10·z_cmt  + 0.10·z_fol
 *         + 0.35·tanh(2a)
 *
 *   M(c)  = σ(1.15 · M_raw) · earlyPhaseDamp(age)
 *
 * earlyPhaseDamp prevents a 3-impression post with a 100% share rate from
 * detonating the trend engine:  damp = 1 − 2^(−impressions/120).
 */
export function momentumScore(x: DynamicsInput): { score: number; acceleration: number; z: Record<string, number> } {
  const v = Math.max(1e-6, x.vViews);
  const b = x.baseline;

  const zView = zscore(x.vViews, b.muViewVelocity, b.sdViewVelocity);
  const zWatch = zscore(x.vWatch / v / Math.max(1, x.durationSec), b.muWatchRatio, b.sdWatchRatio);
  const zShare = zscore(x.vShares / v, b.muShareRate, b.sdShareRate);
  const zSave = zscore(x.vSaves / v, b.muSaveRate, b.sdSaveRate);
  const zCmt = zscore(x.vComments / v, 0.02, 0.03);
  const zFol = zscore(x.vFollows / v, 0.004, 0.008);

  const acceleration = (x.vViews - x.vViewsPrev) / (Math.abs(x.vViewsPrev) + 1);

  const raw =
    0.24 * zView +
    0.22 * zWatch +
    0.2 * zShare +
    0.14 * zSave +
    0.1 * zCmt +
    0.1 * zFol +
    0.35 * tanh(2 * acceleration);

  const damp = 1 - halfLifeDecay(x.impressions, 120);
  const score = clamp(sigmoid(1.15 * raw) * damp);

  return { score, acceleration, z: { zView, zWatch, zShare, zSave, zCmt, zFol } };
}

/** Update the per-hour EWMA velocity for a counter. */
export function updateVelocity(prev: number, deltaCount: number, deltaHours: number): number {
  const rate = deltaCount / Math.max(1 / 60, deltaHours);
  return ewmaTimed(prev, rate, deltaHours, 1.5);
}

/* ========================================================================== */
/* 11. VIRAL DETECTION ENGINE                                                 */
/* ========================================================================== */

/**
 * Virality is NOT "many views". It is *unusually efficient propagation per
 * impression, accelerating, and crossing audience boundaries.*
 *
 * Component scores (all in [0,1]):
 *   G_w  watch-growth      = σ(2.1·z_watch)
 *   G_c  completion-growth = σ(2.4·z(completionRate))
 *   G_r  rewatch-growth    = σ(3.0·(rewatchRate − 0.06)/0.10)
 *   G_s  share-growth      = σ(2.6·z_share)
 *   G_v  save-growth       = σ(2.2·z_save)
 *   G_m  comment-growth    = σ(1.8·z_cmt)
 *   A    acceleration      = σ(3.0·a)
 *   M    momentum          = momentumScore
 *   X    region expansion  = regionsReached / totalRegions,
 *                            weighted by cross-region share ratio
 *
 * Viral Potential Score:
 *   VP(c) = ( 0.20·G_s + 0.16·G_w + 0.14·G_c + 0.12·G_v
 *           + 0.10·G_r + 0.08·G_m + 0.10·A + 0.10·M ) · (0.65 + 0.35·X)
 *           · Integrity(c) · earlyDamp
 *
 * where Integrity(c) = (1 − spamProb)·(1 − botProb)·(1 − 3·negativeRate)⁺.
 *
 * Escalation bands:
 *   VP < 0.35   normal
 *   0.35–0.55   rising      → +20% distribution cap
 *   0.55–0.72   hot         → +120% cap, cross-region unlock
 *   0.72–0.86   viral       → global pool, human-review queue if borderline
 *   ≥ 0.86      mega-viral  → integrity re-scan mandatory before global fanout
 */
export interface ViralResult {
  score: number;
  band: "normal" | "rising" | "hot" | "viral" | "mega";
  components: Record<string, number>;
  distributionMultiplier: number;
}

export function viralPotential(
  x: DynamicsInput,
  integrity: { spamProbability: number; botProbability: number; negativeRate: number },
): ViralResult {
  const m = momentumScore(x);
  const views = Math.max(1, x.views);
  const b = x.baseline;

  const completionRate = clamp(x.completions / views);
  const rewatchRate = clamp(x.rewatches / views);
  const watchRatio = clamp(x.watchTimeSec / (views * Math.max(1, x.durationSec)));

  const Gw = sigmoid(2.1 * zscore(watchRatio, b.muWatchRatio, b.sdWatchRatio));
  const Gc = sigmoid(2.4 * zscore(completionRate, b.muCompletion, b.sdCompletion));
  const Gr = sigmoid(3.0 * ((rewatchRate - 0.06) / 0.1));
  const Gs = sigmoid(2.6 * zscore(x.shares / views, b.muShareRate, b.sdShareRate));
  const Gv = sigmoid(2.2 * zscore(x.saves / views, b.muSaveRate, b.sdSaveRate));
  const Gm = sigmoid(1.8 * zscore(x.comments / views, 0.02, 0.03));
  const A = sigmoid(3.0 * m.acceleration);
  const X = clamp(x.regionsReached / Math.max(1, x.totalRegions));

  const integrityFactor =
    clamp(1 - integrity.spamProbability) *
    clamp(1 - integrity.botProbability) *
    clamp(1 - 3 * integrity.negativeRate);

  const earlyDamp = 1 - halfLifeDecay(x.impressions, 200);

  const core =
    0.2 * Gs + 0.16 * Gw + 0.14 * Gc + 0.12 * Gv + 0.1 * Gr + 0.08 * Gm + 0.1 * A + 0.1 * m.score;

  const score = clamp(core * (0.65 + 0.35 * X) * integrityFactor * earlyDamp);

  const band: ViralResult["band"] =
    score >= 0.86 ? "mega" : score >= 0.72 ? "viral" : score >= 0.55 ? "hot" : score >= 0.35 ? "rising" : "normal";

  const distributionMultiplier =
    band === "mega" ? 6.0 : band === "viral" ? 4.0 : band === "hot" ? 2.2 : band === "rising" ? 1.2 : 1.0;

  return {
    score,
    band,
    components: { Gw, Gc, Gr, Gs, Gv, Gm, A, X, momentum: m.score, integrityFactor, earlyDamp },
    distributionMultiplier,
  };
}

/**
 * Trend momentum at the TOPIC / AUDIO level (what is trending, not just which
 * post). Uses the same z-machinery aggregated over the topic's live corpus.
 *   TM(t) = σ( 1.4·z(Σ vViews) + 1.1·z(Σ vShares) + 0.9·tanh(2·a_t) )
 *           · (1 − lifecyclePosition(t))^0.5
 */
export function topicMomentum(input: {
  topic: string;
  sumViewVelocity: number;
  sumShareVelocity: number;
  acceleration: number;
  corpusSize: number;
  ageHoursMedian: number;
}): number {
  const node = TOPIC_INDEX[input.topic];
  const hl = node?.lifecycleHalfLifeH ?? 96;
  const lifecycle = 1 - halfLifeDecay(input.ageHoursMedian, hl);
  const scale = Math.max(1, input.corpusSize);
  const z1 = zscore(input.sumViewVelocity / scale, 40, 70);
  const z2 = zscore(input.sumShareVelocity / scale, 0.6, 1.4);
  return clamp(sigmoid(1.4 * z1 + 1.1 * z2 + 0.9 * tanh(2 * input.acceleration)) * Math.sqrt(clamp(1 - lifecycle)));
}

/** Global-vs-regional trending split. */
export function regionalTrendScore(
  regionVelocity: number,
  globalVelocity: number,
  regionCorpus: number,
): number {
  const localLift = regionVelocity / Math.max(1e-6, globalVelocity);
  return clamp(sigmoid(1.3 * Math.log(Math.max(1e-3, localLift)) + 0.4 * (lg(regionCorpus) / lg(1000))));
}
