/**
 * ATLAS-RANK :: Creator Intelligence Layer (spec §7).
 *
 * Creator-level scores are *priors* that (a) gate distribution in cold start,
 * (b) enter the ranking feature vector, and (c) drive the creator-ecosystem
 * fairness controller (spec §26).
 *
 * All scores are in [0,1] and are recomputed hourly from the last 90 days of
 * post-level aggregates with exponential recency weighting (half-life 14d).
 */
import { clamp, gini, lg, mean, sigmoid, stddev, wilsonLower } from "./mathkit";

export interface CreatorPostAggregate {
  contentId: string;
  ageHours: number;
  impressions: number;
  views: number;
  watchTimeSec: number;
  durationSec: number;
  completions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  negatives: number; // hide + notInterested + report + mute
  reports: number;
  originality: number;
  quality: number;
  spamProbability: number;
}

export interface CreatorScores {
  qualityScore: number;
  consistencyScore: number;
  audienceSatisfaction: number;
  retentionScore: number;
  growthVelocity: number;
  violationRisk: number;
  spamRisk: number;
  trustScore: number;
  historicalPerformance: number;
  performanceVariance: number;
  tier: "new" | "emerging" | "established" | "elite";
  distributionMultiplier: number;
}

const RECENCY_HALF_LIFE_H = 336; // 14 days

const recencyWeight = (ageHours: number): number => Math.pow(2, -ageHours / RECENCY_HALF_LIFE_H);

/**
 * Per-post normalised performance:
 *   perf_p = 0.34·completionRate + 0.26·watchRatio + 0.22·engagementRate
 *          + 0.18·saveShareRate − 0.40·negativeRate
 */
export function postPerformance(p: CreatorPostAggregate): number {
  const views = Math.max(1, p.views);
  const completionRate = clamp(p.completions / views);
  const watchRatio = clamp(p.watchTimeSec / (views * Math.max(1, p.durationSec)));
  const engagementRate = clamp((p.likes + p.comments) / views, 0, 1);
  const saveShareRate = clamp((p.saves + p.shares * 1.4) / views, 0, 1);
  const negativeRate = clamp(p.negatives / Math.max(1, p.impressions), 0, 1);
  return clamp(
    0.34 * completionRate +
      0.26 * watchRatio +
      0.22 * engagementRate * 4 +
      0.18 * saveShareRate * 6 -
      0.4 * negativeRate * 8,
  );
}

export function computeCreatorScores(
  posts: CreatorPostAggregate[],
  ctx: {
    followers: number;
    followersPrev: number;
    accountAgeDays: number;
    strikes: number;
    followerAuthenticity: number; // 1 - fraction of low-trust followers
    postCadencePerWeek: number;
  },
): CreatorScores {
  if (posts.length === 0) {
    return {
      qualityScore: 0.4,
      consistencyScore: 0.3,
      audienceSatisfaction: 0.45,
      retentionScore: 0.4,
      growthVelocity: 0,
      violationRisk: 0.05,
      spamRisk: 0.05,
      trustScore: 0.5,
      historicalPerformance: 0.4,
      performanceVariance: 0.3,
      tier: "new",
      distributionMultiplier: 0.85,
    };
  }

  const weights = posts.map((p) => recencyWeight(p.ageHours));
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const perfs = posts.map(postPerformance);

  /* ---- historical performance: recency-weighted mean of perf_p ---- */
  const historicalPerformance = clamp(
    perfs.reduce((a, v, i) => a + v * weights[i], 0) / wSum,
  );

  /* ---- consistency: 1 − CV of performance, floored --------------- */
  const sd = stddev(perfs);
  const mu = Math.max(0.05, mean(perfs));
  const consistencyScore = clamp(1 - sd / mu, 0, 1) * clamp(0.55 + 0.45 * clamp(posts.length / 12));

  /* ---- quality: content quality × originality × delivery --------- */
  const qWeighted = posts.reduce((a, p, i) => a + p.quality * weights[i], 0) / wSum;
  const oWeighted = posts.reduce((a, p, i) => a + p.originality * weights[i], 0) / wSum;
  const qualityScore = clamp(0.55 * qWeighted + 0.30 * oWeighted + 0.15 * historicalPerformance);

  /* ---- audience satisfaction (Wilson-smoothed) ------------------- */
  const totalViews = posts.reduce((a, p) => a + p.views, 0);
  const totalDeep = posts.reduce((a, p) => a + p.saves + p.shares + p.follows + p.completions * 0.35, 0);
  const totalNeg = posts.reduce((a, p) => a + p.negatives, 0);
  const totalImp = posts.reduce((a, p) => a + p.impressions, 0);
  const posRate = wilsonLower(totalDeep, Math.max(1, totalViews));
  const negRate = totalNeg / Math.max(1, totalImp);
  const audienceSatisfaction = clamp(sigmoid(6.5 * posRate - 55 * negRate + 0.15));

  /* ---- retention: does watching this creator extend sessions? ---- */
  const completionRates = posts.map((p) => clamp(p.completions / Math.max(1, p.views)));
  const retentionScore = clamp(
    0.6 * (completionRates.reduce((a, v, i) => a + v * weights[i], 0) / wSum) +
      0.4 * audienceSatisfaction,
  );

  /* ---- growth velocity: log-relative follower growth ------------- */
  const gv = (ctx.followers - ctx.followersPrev) / Math.max(50, ctx.followersPrev);
  const growthVelocity = clamp(Math.tanh(gv * 4), -1, 1);

  /* ---- risk ------------------------------------------------------ */
  const reportRate = posts.reduce((a, p) => a + p.reports, 0) / Math.max(1, totalImp);
  const violationRisk = clamp(
    sigmoid(2.4 * ctx.strikes + 900 * reportRate - 3.1),
  );
  const spamMean = posts.reduce((a, p, i) => a + p.spamProbability * weights[i], 0) / wSum;
  const cadencePenalty = clamp((ctx.postCadencePerWeek - 40) / 80); // >40 posts/week is suspicious
  const dupPenalty = clamp(1 - oWeighted);
  const spamRisk = clamp(
    sigmoid(3.0 * spamMean + 2.2 * cadencePenalty + 1.6 * dupPenalty + 2.5 * (1 - ctx.followerAuthenticity) - 3.2),
  );

  /* ---- TRUST ------------------------------------------------------
   * T_c = σ( 2.2·quality + 1.6·consistency + 1.8·satisfaction
   *          + 0.9·log1p(ageDays)/log1p(365) + 1.1·authenticity
   *          − 3.4·violationRisk − 3.0·spamRisk − 0.8·strikes − 2.6 )
   */
  const trustScore = clamp(
    sigmoid(
      2.2 * qualityScore +
        1.6 * consistencyScore +
        1.8 * audienceSatisfaction +
        0.9 * (lg(ctx.accountAgeDays) / lg(365)) +
        1.1 * ctx.followerAuthenticity -
        3.4 * violationRisk -
        3.0 * spamRisk -
        0.8 * Math.min(3, ctx.strikes) -
        2.6,
    ),
  );

  /* ---- tiering + distribution multiplier ------------------------- */
  const composite = 0.35 * trustScore + 0.3 * qualityScore + 0.2 * audienceSatisfaction + 0.15 * consistencyScore;
  const tier: CreatorScores["tier"] =
    posts.length < 3 || ctx.accountAgeDays < 14
      ? "new"
      : composite > 0.78 && ctx.followers > 50_000
        ? "elite"
        : composite > 0.6
          ? "established"
          : "emerging";

  /**
   * Distribution multiplier applied to cold-start caps. Deliberately
   * *sub-linear in followers* so the ecosystem keeps admitting new creators
   * (anti-rich-get-richer control, spec §26.4):
   *   M = 0.75 + 0.55·composite + 0.20·(log1p(followers)/log1p(10^7)) − 0.35·spamRisk
   */
  const distributionMultiplier = clamp(
    0.75 + 0.55 * composite + 0.2 * (lg(ctx.followers) / lg(1e7)) - 0.35 * spamRisk,
    0.25,
    1.9,
  );

  return {
    qualityScore,
    consistencyScore,
    audienceSatisfaction,
    retentionScore,
    growthVelocity,
    violationRisk,
    spamRisk,
    trustScore,
    historicalPerformance,
    performanceVariance: clamp(sd),
    tier,
    distributionMultiplier,
  };
}

/**
 * Creator-ecosystem health: how concentrated is impression supply?
 * Target Gini ≤ 0.82 for the top-10k creator cohort. If exceeded, the fairness
 * controller raises the exploration budget for emerging creators.
 */
export function ecosystemConcentration(impressionsPerCreator: number[]): {
  gini: number;
  healthy: boolean;
  emergingBoost: number;
} {
  const g = gini(impressionsPerCreator);
  const healthy = g <= 0.82;
  return { gini: g, healthy, emergingBoost: healthy ? 1 : clamp(1 + (g - 0.82) * 3, 1, 1.6) };
}
