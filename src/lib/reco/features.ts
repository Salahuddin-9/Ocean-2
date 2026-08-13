/**
 * ATLAS-RANK :: Feature Engineering (spec §4).
 *
 * ONE shared trunk feature vector φ(u, c, ctx) ∈ R^56 is computed exactly once
 * per (user, candidate) pair and reused by all 15 prediction heads. This is the
 * single most important latency decision in the system: heads are linear/low-
 * rank projections on a shared trunk, so scoring 1,200 candidates costs
 * 1,200 × 56 multiply-adds per head instead of 15 independent forward passes.
 *
 * Feature families
 *   [0-7]    affinity / retrieval geometry
 *   [8-16]   content quality & understanding
 *   [17-25]  content historical performance (Bayesian smoothed)
 *   [26-32]  dynamics: freshness / momentum / virality / lifecycle
 *   [33-37]  locale
 *   [38-44]  fatigue, novelty, exposure
 *   [45-50]  user state & temporal context
 *   [51-54]  integrity
 *   [55]     bias
 */
import { clamp, cosine, lg, smoothRate } from "./mathkit";
import { topicAffinity } from "./taxonomy";

export const FEATURE_NAMES = [
  // 0-7 affinity / geometry
  "emb_cosine",
  "topic_affinity_direct",
  "topic_affinity_diffused",
  "topic_momentum_user",
  "creator_affinity",
  "is_following",
  "subtopic_overlap",
  "audio_affinity",
  // 8-16 content understanding
  "quality_score",
  "originality",
  "production",
  "clarity",
  "educational",
  "entertainment",
  "hook_strength",
  "motion_intensity",
  "duration_norm",
  // 17-25 historical performance
  "log_impressions",
  "ctr_like_smoothed",
  "completion_rate_smoothed",
  "watch_ratio_smoothed",
  "share_rate_smoothed",
  "save_rate_smoothed",
  "comment_rate_smoothed",
  "follow_rate_smoothed",
  "rewatch_rate_smoothed",
  // 26-32 dynamics
  "freshness",
  "momentum",
  "viral_score",
  "acceleration",
  "age_hours_norm",
  "lifecycle_position",
  "audio_trend",
  // 33-37 locale
  "language_match",
  "country_match",
  "region_match",
  "locale_multiplier",
  "creator_same_region",
  // 38-44 fatigue / novelty
  "topic_fatigue",
  "creator_fatigue",
  "novelty",
  "serendipity",
  "prior_impressions_norm",
  "hours_since_topic",
  "session_depth_norm",
  // 45-50 user state / temporal
  "user_activity",
  "user_avg_watch_ratio",
  "user_skip_rate",
  "user_novelty_appetite",
  "tod_prime",
  "tod_commute",
  // 51-54 integrity
  "creator_trust",
  "creator_quality",
  "spam_prob",
  "negative_rate",
  // 55 bias
  "bias",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export const FEATURE_DIM = FEATURE_NAMES.length;
export const FEATURE_INDEX: Record<string, number> = Object.fromEntries(
  FEATURE_NAMES.map((n, i) => [n, i]),
);

export interface FeatureContextUser {
  embedding: number[];
  interests: Map<string, { affinity: number; momentum: number }>;
  creatorAffinity: Map<string, { affinity: number; isFollowing: boolean }>;
  activityLevel: number;
  avgWatchRatio: number;
  skipRate: number;
  noveltyAppetite: number;
  language: string;
  country: string;
  region: string;
  sessionDepth: number;
  recentEmbeddings: number[][];
  recentAudioIds: Set<string>;
  temporal: { isPrimeTime: number; isCommute: number };
}

export interface FeatureContextContent {
  id: string;
  creatorId: string;
  topic: string;
  subTopics: string[];
  language: string;
  country: string;
  region: string;
  durationSec: number;
  ageHours: number;
  embedding: number[];
  audioId: string;
  audioTrendScore: number;
  qualityScore: number;
  originalityScore: number;
  productionScore: number;
  clarityScore: number;
  educationalScore: number;
  entertainmentScore: number;
  hookStrength: number;
  motionIntensity: number;
  lifecyclePosition: number;
  stats: {
    impressions: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    follows: number;
    completions: number;
    rewatches: number;
    watchTimeSec: number;
    negativeRate: number;
    spamProbability: number;
    freshnessScore: number;
    momentumScore: number;
    viralScore: number;
    acceleration: number;
  };
  creator: { trustScore: number; qualityScore: number; region: string };
}

export interface FeatureContextSignals {
  topicFatigue: number;
  creatorFatigue: number;
  priorImpressions: number;
  hoursSinceTopic: number;
  localeLm: number;
  localeCm: number;
  localeRm: number;
  localeMultiplier: number;
  diffusedAffinity: number;
}

/** Global engagement priors used for empirical-Bayes smoothing. */
export const GLOBAL_PRIORS = {
  like: 0.041,
  comment: 0.0048,
  share: 0.0092,
  save: 0.0135,
  follow: 0.0021,
  completion: 0.34,
  watchRatio: 0.46,
  rewatch: 0.058,
  profileVisit: 0.0067,
};

export function buildFeatureVector(
  u: FeatureContextUser,
  c: FeatureContextContent,
  s: FeatureContextSignals,
): number[] {
  const f = new Array<number>(FEATURE_DIM).fill(0);
  const set = (name: FeatureName, v: number) => {
    f[FEATURE_INDEX[name]] = Number.isFinite(v) ? v : 0;
  };

  const views = Math.max(1, c.stats.views);
  const imps = Math.max(1, c.stats.impressions);

  /* ---- affinity / geometry ---- */
  set("emb_cosine", cosine(u.embedding, c.embedding));
  const direct = u.interests.get(c.topic);
  set("topic_affinity_direct", clamp(direct?.affinity ?? 0, -1, 1));
  set("topic_affinity_diffused", s.diffusedAffinity);
  set("topic_momentum_user", clamp(direct?.momentum ?? 0, -1, 1));
  const ca = u.creatorAffinity.get(c.creatorId);
  set("creator_affinity", clamp(ca?.affinity ?? 0, -1, 1));
  set("is_following", ca?.isFollowing ? 1 : 0);
  let subOverlap = 0;
  for (const st of c.subTopics) {
    const parentAff = u.interests.get(st)?.affinity ?? 0;
    subOverlap = Math.max(subOverlap, parentAff);
  }
  set("subtopic_overlap", clamp(subOverlap));
  set("audio_affinity", u.recentAudioIds.has(c.audioId) ? 1 : 0);

  /* ---- content understanding ---- */
  set("quality_score", c.qualityScore);
  set("originality", c.originalityScore);
  set("production", c.productionScore);
  set("clarity", c.clarityScore);
  set("educational", c.educationalScore);
  set("entertainment", c.entertainmentScore);
  set("hook_strength", c.hookStrength);
  set("motion_intensity", c.motionIntensity);
  set("duration_norm", clamp(lg(c.durationSec) / lg(90)));

  /* ---- historical performance (empirical Bayes) ---- */
  set("log_impressions", clamp(lg(imps) / lg(1e6)));
  set("ctr_like_smoothed", smoothRate(c.stats.likes, views, GLOBAL_PRIORS.like, 60) * 8);
  set("completion_rate_smoothed", smoothRate(c.stats.completions, views, GLOBAL_PRIORS.completion, 40));
  set(
    "watch_ratio_smoothed",
    clamp(
      smoothRate(
        c.stats.watchTimeSec / Math.max(1, c.durationSec),
        views,
        GLOBAL_PRIORS.watchRatio,
        40,
      ),
      0,
      2,
    ),
  );
  set("share_rate_smoothed", smoothRate(c.stats.shares, views, GLOBAL_PRIORS.share, 80) * 20);
  set("save_rate_smoothed", smoothRate(c.stats.saves, views, GLOBAL_PRIORS.save, 80) * 15);
  set("comment_rate_smoothed", smoothRate(c.stats.comments, views, GLOBAL_PRIORS.comment, 80) * 30);
  set("follow_rate_smoothed", smoothRate(c.stats.follows, views, GLOBAL_PRIORS.follow, 100) * 40);
  set("rewatch_rate_smoothed", smoothRate(c.stats.rewatches, views, GLOBAL_PRIORS.rewatch, 60) * 6);

  /* ---- dynamics ---- */
  set("freshness", c.stats.freshnessScore);
  set("momentum", c.stats.momentumScore);
  set("viral_score", c.stats.viralScore);
  set("acceleration", clamp(Math.tanh(c.stats.acceleration), -1, 1));
  set("age_hours_norm", clamp(lg(c.ageHours) / lg(720)));
  set("lifecycle_position", c.lifecyclePosition);
  set("audio_trend", c.audioTrendScore);

  /* ---- locale ---- */
  set("language_match", s.localeLm);
  set("country_match", s.localeCm);
  set("region_match", s.localeRm);
  set("locale_multiplier", s.localeMultiplier);
  set("creator_same_region", c.creator.region === u.region ? 1 : 0);

  /* ---- fatigue / novelty ---- */
  set("topic_fatigue", s.topicFatigue);
  set("creator_fatigue", s.creatorFatigue);
  let maxSim = 0;
  for (const r of u.recentEmbeddings) maxSim = Math.max(maxSim, cosine(r, c.embedding));
  const novelty = clamp(1 - maxSim);
  set("novelty", novelty);
  set("serendipity", clamp(novelty * (1 - clamp(direct?.affinity ?? 0)) * 1.3));
  set("prior_impressions_norm", clamp(lg(s.priorImpressions) / lg(10)));
  set("hours_since_topic", clamp(lg(s.hoursSinceTopic) / lg(72)));
  set("session_depth_norm", clamp(lg(u.sessionDepth) / lg(60)));

  /* ---- user state / temporal ---- */
  set("user_activity", clamp(u.activityLevel));
  set("user_avg_watch_ratio", clamp(u.avgWatchRatio, 0, 2));
  set("user_skip_rate", clamp(u.skipRate));
  set("user_novelty_appetite", clamp(u.noveltyAppetite));
  set("tod_prime", u.temporal.isPrimeTime);
  set("tod_commute", u.temporal.isCommute);

  /* ---- integrity ---- */
  set("creator_trust", c.creator.trustScore);
  set("creator_quality", c.creator.qualityScore);
  set("spam_prob", c.stats.spamProbability);
  set("negative_rate", clamp(c.stats.negativeRate * 10));

  /* ---- bias ---- */
  set("bias", 1);

  return f;
}

/** Diffused affinity Â(u, topic_c) = Σ A(u,t)·ρ(t,t_c)^1.7 / Σ ρ^1.7 */
export function diffusedAffinity(
  interests: Map<string, { affinity: number }>,
  topic: string,
): number {
  let num = 0;
  let den = 0;
  for (const [t, v] of interests) {
    if (v.affinity <= 0) continue;
    const rho = Math.pow(topicAffinity(t, topic), 1.7);
    if (rho < 0.01) continue;
    num += v.affinity * rho;
    den += rho;
  }
  return den > 0 ? clamp(num / den) : 0;
}

/** Human-readable feature attribution for a scored candidate (debug / audits). */
export function explainFeatures(
  features: number[],
  weights: number[],
  topK = 8,
): { feature: string; value: number; weight: number; contribution: number }[] {
  return FEATURE_NAMES.map((name, i) => ({
    feature: name,
    value: features[i] ?? 0,
    weight: weights[i] ?? 0,
    contribution: (features[i] ?? 0) * (weights[i] ?? 0),
  }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, topK);
}
