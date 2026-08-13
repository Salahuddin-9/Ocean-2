// ============================================================
// Core Scoring Pipeline
// ============================================================
// 
// Master Scoring Formula:
// 
// Score(u, p) = Penalty(W_r) × [ 
//     α₁·σ(W_r) + α₂·σ(R_c) + 
//     Σ αᵢ·Eᵢ·Πⱼ(platform_mult_j) +
//     β₊·F_pos + β₋·F_neg +
//     γ·Decay(T_age) +
//     δ·log(V_rate) +
//     ε·A_use
// ] × B_factor
//
// Where:
//   σ(x) = sigmoid scaling function
//   Decay(t) = e^(-λt), λ = ln(2)/halfLife
//   B_factor = boost multiplier (1.0 for organic)
//   Penalty(W_r) = bounce penalty function
// ============================================================

import {
  UserProfile,
  PostCandidate,
  UserPostInteraction,
  ScoreBreakdown,
  ScoredPost,
  EngineConfig,
  BoostConfig,
} from './types';

import {
  sigmoid,
  logScale,
  exponentialDecay,
  clamp,
  bouncePenalty,
  relu,
} from './math';

import {
  DEFAULT_ENGINE_CONFIG,
  SIGMOID_CONFIG,
  LOG_CONFIG,
  PLATFORM_ENGAGEMENT_MULTIPLIERS,
  BID_STRATEGY_MULTIPLIERS,
} from './config';

// ─────────────────────────────────────────────
// 1. Watch Time Score
// ─────────────────────────────────────────────
// W_score = σ(k₁(W_r - 0.5))
// Sigmoid maps 0→1 watch ratio to (0, 1) score
// Midpoint at 50% watch = 0.5 score
export function computeWatchTimeScore(watchDuration: number, videoLength: number): number {
  if (videoLength <= 0) return 0;
  const Wr = clamp(watchDuration / videoLength, 0, 3); // cap at 3x for loops
  const { steepness, midpoint } = SIGMOID_CONFIG.watchTime;
  return sigmoid(Wr, steepness, midpoint);
}

// ─────────────────────────────────────────────
// 2. Rewatch Score
// ─────────────────────────────────────────────
// R_score = σ(k₂(R_c - 2))
// Sigmoid with midpoint at 2 rewatches
export function computeRewatchScore(rewatchCount: number): number {
  const { steepness, midpoint } = SIGMOID_CONFIG.rewatch;
  return sigmoid(rewatchCount, steepness, midpoint);
}

// ─────────────────────────────────────────────
// 3. Engagement Score (Platform-Weighted)
// ─────────────────────────────────────────────
// E_score = Σᵢ wᵢ × Eᵢ × Π_platform
// Platform multipliers adjust engagement weights
// based on 50/25/25 Instagram/YouTube/TikTok split
export function computeEngagementScore(
  interaction: UserPostInteraction,
  config: EngineConfig
): number {
  const w = config.weights;
  const pw = config.platformWeights;
  const pm = PLATFORM_ENGAGEMENT_MULTIPLIERS;

  // Compute per-platform weighted engagement
  const engagements = [
    { type: 'like' as const,         active: interaction.liked,          weight: w.like },
    { type: 'share' as const,        active: interaction.shared,         weight: w.share },
    { type: 'comment' as const,      active: interaction.commented,      weight: w.comment },
    { type: 'follow' as const,       active: interaction.followed,       weight: w.follow },
    { type: 'save' as const,         active: interaction.saved,          weight: w.save },
    { type: 'profileVisit' as const, active: interaction.profileVisited, weight: w.profileVisit },
  ];

  let score = 0;
  for (const eng of engagements) {
    if (!eng.active) continue;
    // Platform-weighted multiplier: Σ(platform_weight × platform_multiplier)
    const platformMult =
      pw.instagram * pm.instagram[eng.type] +
      pw.youtube * pm.youtube[eng.type] +
      pw.tiktok * pm.tiktok[eng.type];
    score += eng.weight * platformMult;
  }

  return score;
}

// ─────────────────────────────────────────────
// 4. Feedback Score
// ─────────────────────────────────────────────
// F_score = β₊·F_pos + β₋·F_neg
// F_neg carries heavy negative weight (-3.0)
export function computeFeedbackScore(
  feedbackPositive: boolean,
  feedbackNegative: boolean,
  config: EngineConfig
): number {
  let score = 0;
  if (feedbackPositive) score += config.weights.feedbackPositive;
  if (feedbackNegative) score += config.weights.feedbackNegative; // negative value
  return score;
}

// ─────────────────────────────────────────────
// 5. Recency / Decay Score
// ─────────────────────────────────────────────
// D_score = γ · e^(-λ · T_age)
// λ = ln(2) / halfLife
// Half-life default: 6 hours
export function computeRecencyScore(
  postCreatedAt: number,
  now: number,
  config: EngineConfig
): number {
  const ageMs = Math.max(0, now - postCreatedAt);
  const ageHours = ageMs / (1000 * 60 * 60);
  const decay = exponentialDecay(ageHours, config.thresholds.recencyHalfLifeHours);
  return config.weights.recency * decay;
}

// ─────────────────────────────────────────────
// 6. Velocity Score
// ─────────────────────────────────────────────
// V_score = δ · σ(k₃(V_rate - 500)) · log₁₀(V_total + 1)
// Combines trending velocity with total reach
export function computeVelocityScore(
  totalViews: number,
  viewRate: number,
  config: EngineConfig
): number {
  const { steepness, midpoint } = SIGMOID_CONFIG.velocity;
  const velocitySigmoid = sigmoid(viewRate, steepness, midpoint);
  const viewsLog = logScale(totalViews, LOG_CONFIG.viewsBase);
  return config.weights.velocity * velocitySigmoid * viewsLog;
}

// ─────────────────────────────────────────────
// 7. Conversion Score
// ─────────────────────────────────────────────
// C_score = ε · A_use (binary: 0 or weight)
export function computeConversionScore(
  appUsageTriggered: boolean,
  config: EngineConfig
): number {
  return appUsageTriggered ? config.weights.conversion : 0;
}

// ─────────────────────────────────────────────
// 8. Bounce Penalty Factor
// ─────────────────────────────────────────────
// P(W_r) = { 0.05            if W_r < threshold
//          { smoothstep       if threshold ≤ W_r < 3×threshold
//          { 1.0              if W_r ≥ 3×threshold
export function computeBounceP(
  watchDuration: number,
  videoLength: number,
  config: EngineConfig
): number {
  if (videoLength <= 0) return 0.05;
  const Wr = watchDuration / videoLength;
  return bouncePenalty(Wr, config.thresholds.bounceThreshold);
}

// ─────────────────────────────────────────────
// 9. Facebook Boost Multiplier
// ─────────────────────────────────────────────
// B_factor = min(maxBoost, 1 + bidMult × (budget_remaining / budget_total) × qualityNorm)
// Only applied if qualityScore ≥ minOrganicQuality
export function computeBoostMultiplier(
  boostConfig: BoostConfig | undefined,
  config: EngineConfig
): number {
  if (!boostConfig) return 1.0; // organic content

  // Quality gate: reject low-quality boosted content
  if (boostConfig.qualityScore < config.thresholds.minOrganicQuality) {
    return 0.5; // actually penalize low-quality ads
  }

  const bidMult = BID_STRATEGY_MULTIPLIERS[boostConfig.bidStrategy] ?? 1.0;
  const budgetRemaining = Math.max(0, boostConfig.totalBudget - boostConfig.spent);
  const budgetRatio = boostConfig.totalBudget > 0
    ? budgetRemaining / boostConfig.totalBudget
    : 0;
  const qualityNorm = boostConfig.qualityScore / 10; // normalize to 0-1

  const rawBoost = 1 + bidMult * budgetRatio * qualityNorm;
  return clamp(rawBoost, 1.0, config.thresholds.maxBoostMultiplier);
}

// ─────────────────────────────────────────────
// 10. Localization Hard Filter
// ─────────────────────────────────────────────
// Returns false if post should be filtered out
export function passesLocalizationFilter(
  user: UserProfile,
  post: PostCandidate
): { passes: boolean; reason?: string } {
  // Hard constraint: Language match
  if (post.language !== user.language) {
    // Soft constraint: Allow cross-border if viral (95th percentile)
    if (post.engagementPercentile >= 95) {
      return { passes: true }; // viral exception
    }
    return { passes: false, reason: `Language mismatch: ${post.language} ≠ ${user.language}` };
  }

  // Hard constraint: Country/Region match
  if (post.country !== user.country) {
    if (post.engagementPercentile >= 95) {
      return { passes: true }; // viral exception
    }
    return { passes: false, reason: `Country mismatch: ${post.country} ≠ ${user.country}` };
  }

  return { passes: true };
}

// ─────────────────────────────────────────────
// MASTER SCORING FUNCTION
// ─────────────────────────────────────────────
// Score(u, p) = P(W_r) × [W_score + R_score + E_score + F_score + D_score + V_score + C_score] × B_factor
export function computeScore(
  _user: UserProfile,
  post: PostCandidate,
  interaction: UserPostInteraction,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
  now: number = Date.now()
): ScoreBreakdown {
  const watchTimeScore = config.weights.watchTime * computeWatchTimeScore(interaction.watchDuration, interaction.videoLength);
  const rewatchScore = config.weights.rewatch * computeRewatchScore(interaction.rewatchCount);
  const engagementScore = computeEngagementScore(interaction, config);
  const feedbackScore = computeFeedbackScore(interaction.feedbackPositive, interaction.feedbackNegative, config);
  const recencyScore = computeRecencyScore(post.createdAt, now, config);
  const velocityScore = computeVelocityScore(post.totalViews, post.viewVelocity, config);
  const conversionScore = computeConversionScore(interaction.appUsageTriggered, config);

  const penaltyFactor = computeBounceP(interaction.watchDuration, interaction.videoLength, config);
  const boostMultiplier = computeBoostMultiplier(post.boostConfig, config);

  // Raw composite score before penalty and boost
  const rawScore = watchTimeScore + rewatchScore + engagementScore +
    feedbackScore + recencyScore + velocityScore + conversionScore;

  // Apply penalty and boost
  const finalRaw = relu(penaltyFactor * rawScore) * boostMultiplier;

  // Normalize to 0-100 scale (approximate)
  const normalizedScore = clamp(finalRaw * 100, 0, 100);

  return {
    watchTimeScore,
    rewatchScore,
    engagementScore,
    feedbackScore,
    recencyScore,
    velocityScore,
    conversionScore,
    platformWeightedScore: engagementScore,
    boostMultiplier,
    penaltyFactor,
    rawScore,
    normalizedScore,
  };
}

// ─────────────────────────────────────────────
// RANKING PIPELINE
// ─────────────────────────────────────────────
// rank_feed(user_profile, candidate_posts) → sorted ScoredPost[]
export function rankFeed(
  user: UserProfile,
  candidatePosts: { post: PostCandidate; interaction: UserPostInteraction }[],
  config: EngineConfig = DEFAULT_ENGINE_CONFIG,
  now: number = Date.now()
): ScoredPost[] {
  const results: ScoredPost[] = [];

  for (const { post, interaction } of candidatePosts) {
    // Step 1: Localization filter
    const filterResult = passesLocalizationFilter(user, post);
    if (!filterResult.passes) {
      results.push({
        post,
        scores: {
          watchTimeScore: 0, rewatchScore: 0, engagementScore: 0,
          feedbackScore: 0, recencyScore: 0, velocityScore: 0,
          conversionScore: 0, platformWeightedScore: 0,
          boostMultiplier: 1, penaltyFactor: 0,
          rawScore: 0, normalizedScore: 0,
        },
        finalScore: 0,
        rank: -1,
        filtered: true,
        filterReason: filterResult.reason,
      });
      continue;
    }

    // Step 2: Compute full score
    const scores = computeScore(user, post, interaction, config, now);

    results.push({
      post,
      scores,
      finalScore: scores.normalizedScore,
      rank: 0,
      filtered: false,
    });
  }

  // Step 3: Sort by finalScore descending
  const scoredPosts = results
    .filter(r => !r.filtered)
    .sort((a, b) => b.finalScore - a.finalScore);

  // Step 4: Assign ranks
  scoredPosts.forEach((sp, i) => {
    sp.rank = i + 1;
  });

  // Return all (filtered appear at end)
  const filteredPosts = results.filter(r => r.filtered);
  return [...scoredPosts, ...filteredPosts];
}
