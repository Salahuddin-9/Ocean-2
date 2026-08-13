// ============================================================
// VIRAL DETECTION & TRENDING MOMENTUM ENGINE
// Real-Time Velocity Tracking & Viral Potential Scoring
// ============================================================

import { sigmoid, clamp } from './math';

// ─────────────────────────────────────────────
// Velocity Tracking
// ─────────────────────────────────────────────

export interface VelocityMetrics {
  contentId: string;
  
  // Current velocities (per hour)
  viewVelocity: number;
  likeVelocity: number;
  shareVelocity: number;
  commentVelocity: number;
  saveVelocity: number;
  watchTimeVelocity: number;      // total watch seconds per hour
  completionVelocity: number;     // completions per hour
  followerGrowthVelocity: number; // creator follower gain per hour
  
  // Accelerations (change in velocity)
  viewAcceleration: number;
  likeAcceleration: number;
  shareAcceleration: number;
  commentAcceleration: number;
  
  // Historical
  peakViewVelocity: number;
  peakShareVelocity: number;
  
  // Timing
  lastUpdated: number;
  publishedAt: number;
  peakTime: number;               // when velocity peaked
}

// ─────────────────────────────────────────────
// Velocity Calculation
// ─────────────────────────────────────────────
// V(t) = ΔMetric / Δt (smoothed with EMA)

export interface VelocityWindow {
  timestamp: number;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  watchSeconds: number;
  completions: number;
}

export function computeVelocity(
  windows: VelocityWindow[],  // last N windows (e.g., 5-minute intervals)
  windowDurationMinutes: number = 5
): VelocityMetrics {
  if (windows.length < 2) {
    return createEmptyVelocity('');
  }
  
  // Sort by timestamp
  const sorted = [...windows].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  
  const hourFactor = 60 / windowDurationMinutes; // convert to per-hour
  
  // Current velocities
  const viewVelocity = (latest.views - previous.views) * hourFactor;
  const likeVelocity = (latest.likes - previous.likes) * hourFactor;
  const shareVelocity = (latest.shares - previous.shares) * hourFactor;
  const commentVelocity = (latest.comments - previous.comments) * hourFactor;
  const saveVelocity = (latest.saves - previous.saves) * hourFactor;
  const watchTimeVelocity = (latest.watchSeconds - previous.watchSeconds) * hourFactor;
  const completionVelocity = (latest.completions - previous.completions) * hourFactor;
  
  // Accelerations (if we have 3+ windows)
  let viewAcceleration = 0;
  let likeAcceleration = 0;
  let shareAcceleration = 0;
  let commentAcceleration = 0;
  
  if (sorted.length >= 3) {
    const prePrevious = sorted[sorted.length - 3];
    const prevViewVel = (previous.views - prePrevious.views) * hourFactor;
    const prevLikeVel = (previous.likes - prePrevious.likes) * hourFactor;
    const prevShareVel = (previous.shares - prePrevious.shares) * hourFactor;
    const prevCommentVel = (previous.comments - prePrevious.comments) * hourFactor;
    
    viewAcceleration = viewVelocity - prevViewVel;
    likeAcceleration = likeVelocity - prevLikeVel;
    shareAcceleration = shareVelocity - prevShareVel;
    commentAcceleration = commentVelocity - prevCommentVel;
  }
  
  return {
    contentId: '',
    viewVelocity: Math.max(0, viewVelocity),
    likeVelocity: Math.max(0, likeVelocity),
    shareVelocity: Math.max(0, shareVelocity),
    commentVelocity: Math.max(0, commentVelocity),
    saveVelocity: Math.max(0, saveVelocity),
    watchTimeVelocity: Math.max(0, watchTimeVelocity),
    completionVelocity: Math.max(0, completionVelocity),
    followerGrowthVelocity: 0, // would need creator data
    viewAcceleration,
    likeAcceleration,
    shareAcceleration,
    commentAcceleration,
    peakViewVelocity: Math.max(0, viewVelocity),
    peakShareVelocity: Math.max(0, shareVelocity),
    lastUpdated: latest.timestamp,
    publishedAt: sorted[0].timestamp,
    peakTime: latest.timestamp,
  };
}

function createEmptyVelocity(contentId: string): VelocityMetrics {
  return {
    contentId,
    viewVelocity: 0, likeVelocity: 0, shareVelocity: 0, commentVelocity: 0,
    saveVelocity: 0, watchTimeVelocity: 0, completionVelocity: 0,
    followerGrowthVelocity: 0,
    viewAcceleration: 0, likeAcceleration: 0, shareAcceleration: 0, commentAcceleration: 0,
    peakViewVelocity: 0, peakShareVelocity: 0,
    lastUpdated: Date.now(), publishedAt: Date.now(), peakTime: Date.now(),
  };
}

// ─────────────────────────────────────────────
// Trending Momentum Score
// ─────────────────────────────────────────────
// M = α·log(V_views) + β·log(V_shares) + γ·σ(acceleration) + δ·percentile
// 
// Momentum captures "how fast is this content growing relative to typical content"

export interface TrendingScore {
  momentumScore: number;          // 0-100
  velocityRank: number;           // percentile among recent content
  accelerationRank: number;       // percentile of acceleration
  trendingTier: 'viral' | 'trending' | 'rising' | 'normal' | 'declining';
  expectedPeakHours: number;      // hours until expected peak
  confidence: number;
}

export function computeTrendingMomentum(
  velocity: VelocityMetrics,
  categoryAvgVelocity: number,
  globalPercentile: number        // 0-100, where this content ranks
): TrendingScore {
  // Velocity components (log-scaled to handle variance)
  const viewVelScore = Math.log10(velocity.viewVelocity + 1) / 5;
  const shareVelScore = Math.log10(velocity.shareVelocity + 1) / 3;
  const likeVelScore = Math.log10(velocity.likeVelocity + 1) / 4;
  
  // Acceleration component (sigmoid for bounded output)
  const accelScore = sigmoid(velocity.viewAcceleration / 1000);
  
  // Relative to category average
  const categoryRelative = categoryAvgVelocity > 0 
    ? velocity.viewVelocity / categoryAvgVelocity 
    : 1;
  const categoryScore = Math.min(1, categoryRelative / 5);
  
  // Percentile component
  const percentileScore = globalPercentile / 100;
  
  // Weighted momentum
  const momentumScore = clamp(
    (0.25 * viewVelScore +
     0.30 * shareVelScore +
     0.15 * likeVelScore +
     0.15 * accelScore +
     0.10 * categoryScore +
     0.05 * percentileScore) * 100,
    0, 100
  );
  
  // Determine tier
  let trendingTier: TrendingScore['trendingTier'];
  if (momentumScore >= 90 && velocity.viewAcceleration > 0) {
    trendingTier = 'viral';
  } else if (momentumScore >= 70) {
    trendingTier = 'trending';
  } else if (momentumScore >= 40 && velocity.viewAcceleration > 0) {
    trendingTier = 'rising';
  } else if (velocity.viewAcceleration < -100) {
    trendingTier = 'declining';
  } else {
    trendingTier = 'normal';
  }
  
  // Expected peak (simplified model)
  const ageHours = (Date.now() - velocity.publishedAt) / (1000 * 60 * 60);
  const expectedPeakHours = trendingTier === 'viral' 
    ? Math.max(0, 6 - ageHours) 
    : Math.max(0, 24 - ageHours);
  
  return {
    momentumScore,
    velocityRank: globalPercentile,
    accelerationRank: 50 + velocity.viewAcceleration / 100, // simplified
    trendingTier,
    expectedPeakHours,
    confidence: Math.min(1, ageHours / 2), // more confident with more data
  };
}

// ─────────────────────────────────────────────
// Viral Detection Engine
// ─────────────────────────────────────────────
// V_potential = f(growth_velocity, share_amplifier, completion_rate, regional_spread)
//
// Viral content characteristics:
// 1. Exponential growth in views
// 2. High share-to-view ratio
// 3. High completion rate
// 4. Spreading across regions
// 5. Positive acceleration

export interface ViralSignals {
  // Growth signals
  viewGrowthRate: number;         // % growth per hour
  shareGrowthRate: number;
  completionGrowthRate: number;
  
  // Quality signals
  shareToViewRatio: number;
  completionRate: number;
  rewatchRate: number;
  
  // Spread signals
  regionsReached: number;
  crossBorderRatio: number;       // % views from outside origin country
  
  // Momentum signals
  accelerationPositive: boolean;
  sustainedGrowthHours: number;   // hours of continuous growth
}

export interface ViralPotentialScore {
  score: number;                  // 0-100
  isViral: boolean;               // above viral threshold
  viralPhase: 'pre-viral' | 'early-viral' | 'peak-viral' | 'post-viral' | 'not-viral';
  projectedReach: number;         // expected total views if trajectory continues
  confidence: number;
  signals: {
    growthScore: number;
    shareScore: number;
    completionScore: number;
    spreadScore: number;
    momentumScore: number;
  };
}

export function computeViralPotential(signals: ViralSignals): ViralPotentialScore {
  // Growth score: exponential growth is key
  const growthScore = clamp(
    sigmoid(signals.viewGrowthRate / 100 - 0.5) * 0.6 +
    sigmoid(signals.shareGrowthRate / 50 - 0.5) * 0.4,
    0, 1
  );
  
  // Share amplification score
  const shareScore = clamp(
    signals.shareToViewRatio / 0.05, // 5% share rate = 100%
    0, 1
  );
  
  // Completion score: viral content is usually highly engaging
  const completionScore = clamp(
    signals.completionRate * 0.6 + signals.rewatchRate * 0.4,
    0, 1
  );
  
  // Spread score: geographic expansion
  const spreadScore = clamp(
    Math.log10(signals.regionsReached + 1) / 2 * 0.5 +
    signals.crossBorderRatio * 0.5,
    0, 1
  );
  
  // Momentum score: sustained positive acceleration
  const momentumScore = signals.accelerationPositive
    ? clamp(signals.sustainedGrowthHours / 12, 0, 1)
    : 0;
  
  // Weighted viral potential
  const score = clamp(
    (0.30 * growthScore +
     0.25 * shareScore +
     0.20 * completionScore +
     0.15 * spreadScore +
     0.10 * momentumScore) * 100,
    0, 100
  );
  
  // Determine viral phase
  let viralPhase: ViralPotentialScore['viralPhase'];
  if (score >= 80 && signals.accelerationPositive) {
    viralPhase = signals.sustainedGrowthHours < 6 ? 'early-viral' : 'peak-viral';
  } else if (score >= 60 && signals.accelerationPositive) {
    viralPhase = 'pre-viral';
  } else if (score >= 60 && !signals.accelerationPositive) {
    viralPhase = 'post-viral';
  } else {
    viralPhase = 'not-viral';
  }
  
  // Project reach (very simplified model)
  const currentVelocity = signals.viewGrowthRate;
  const projectedHours = signals.accelerationPositive ? 24 : 6;
  const projectedReach = Math.round(currentVelocity * projectedHours * (1 + score / 100));
  
  return {
    score,
    isViral: score >= 70,
    viralPhase,
    projectedReach,
    confidence: Math.min(1, signals.sustainedGrowthHours / 6),
    signals: {
      growthScore: growthScore * 100,
      shareScore: shareScore * 100,
      completionScore: completionScore * 100,
      spreadScore: spreadScore * 100,
      momentumScore: momentumScore * 100,
    },
  };
}

// ─────────────────────────────────────────────
// Cold Start Distribution Phases
// ─────────────────────────────────────────────
// New content goes through staged distribution with gates

export interface ColdStartPhase {
  phase: number;
  audienceSize: number;
  minCompletionRate: number;
  minEngagementRate: number;
  minWatchRatio: number;
  maxBounceRate: number;
}

export const COLD_START_PHASES: ColdStartPhase[] = [
  { phase: 1, audienceSize: 50,      minCompletionRate: 0.20, minEngagementRate: 0.02, minWatchRatio: 0.25, maxBounceRate: 0.50 },
  { phase: 2, audienceSize: 500,     minCompletionRate: 0.25, minEngagementRate: 0.03, minWatchRatio: 0.30, maxBounceRate: 0.45 },
  { phase: 3, audienceSize: 5000,    minCompletionRate: 0.30, minEngagementRate: 0.04, minWatchRatio: 0.35, maxBounceRate: 0.40 },
  { phase: 4, audienceSize: 50000,   minCompletionRate: 0.35, minEngagementRate: 0.05, minWatchRatio: 0.40, maxBounceRate: 0.35 },
  { phase: 5, audienceSize: 500000,  minCompletionRate: 0.40, minEngagementRate: 0.06, minWatchRatio: 0.45, maxBounceRate: 0.30 },
  { phase: 6, audienceSize: 5000000, minCompletionRate: 0.45, minEngagementRate: 0.07, minWatchRatio: 0.50, maxBounceRate: 0.25 },
];

export interface ColdStartMetrics {
  currentViews: number;
  completionRate: number;
  engagementRate: number;
  avgWatchRatio: number;
  bounceRate: number;
}

export interface ColdStartDecision {
  currentPhase: number;
  nextPhase: number | null;
  canAdvance: boolean;
  blockers: string[];
  estimatedReachMultiplier: number;
}

export function evaluateColdStart(metrics: ColdStartMetrics): ColdStartDecision {
  // Find current phase based on views
  let currentPhase = 1;
  for (const phase of COLD_START_PHASES) {
    if (metrics.currentViews >= phase.audienceSize) {
      currentPhase = phase.phase;
    }
  }
  
  // Check if can advance to next phase
  const nextPhaseConfig = COLD_START_PHASES.find(p => p.phase === currentPhase + 1);
  const currentPhaseConfig = COLD_START_PHASES.find(p => p.phase === currentPhase)!;
  
  const blockers: string[] = [];
  
  if (metrics.completionRate < currentPhaseConfig.minCompletionRate) {
    blockers.push(`Completion rate ${(metrics.completionRate * 100).toFixed(1)}% < ${(currentPhaseConfig.minCompletionRate * 100)}% required`);
  }
  if (metrics.engagementRate < currentPhaseConfig.minEngagementRate) {
    blockers.push(`Engagement rate ${(metrics.engagementRate * 100).toFixed(1)}% < ${(currentPhaseConfig.minEngagementRate * 100)}% required`);
  }
  if (metrics.avgWatchRatio < currentPhaseConfig.minWatchRatio) {
    blockers.push(`Watch ratio ${(metrics.avgWatchRatio * 100).toFixed(1)}% < ${(currentPhaseConfig.minWatchRatio * 100)}% required`);
  }
  if (metrics.bounceRate > currentPhaseConfig.maxBounceRate) {
    blockers.push(`Bounce rate ${(metrics.bounceRate * 100).toFixed(1)}% > ${(currentPhaseConfig.maxBounceRate * 100)}% max`);
  }
  
  const canAdvance = blockers.length === 0 && nextPhaseConfig !== undefined;
  
  // Estimate reach multiplier based on performance
  let reachMultiplier = 1.0;
  if (canAdvance) {
    const performanceBonus = 
      (metrics.completionRate / currentPhaseConfig.minCompletionRate - 1) * 0.5 +
      (metrics.engagementRate / currentPhaseConfig.minEngagementRate - 1) * 0.5;
    reachMultiplier = 1 + clamp(performanceBonus, 0, 1);
  } else {
    reachMultiplier = 0.5; // reduce distribution if not meeting thresholds
  }
  
  return {
    currentPhase,
    nextPhase: canAdvance ? currentPhase + 1 : null,
    canAdvance,
    blockers,
    estimatedReachMultiplier: reachMultiplier,
  };
}
