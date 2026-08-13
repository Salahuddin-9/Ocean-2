// ============================================================
// Default Engine Configuration & Weight Matrix
// ============================================================

import { EngineConfig } from './types';

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  weights: {
    // Core engagement weights (sum ≈ 1.0 for engagement block)
    watchTime:        0.25,   // α₁ - Most important passive signal
    rewatch:          0.10,   // α₂ - Strong intent signal
    like:             0.05,   // α₃ - Lightweight positive
    share:            0.15,   // α₄ - Strongest organic amplifier
    comment:          0.10,   // α₅ - Active engagement
    follow:           0.08,   // α₆ - Creator affinity
    save:             0.12,   // α₇ - High-intent bookmark
    profileVisit:     0.05,   // α₈ - Curiosity signal
    feedbackPositive: 0.10,   // β₊ - Explicit positive
    feedbackNegative: -3.00,  // β₋ - Heavy negative penalty
    recency:          0.15,   // γ  - Time decay importance
    velocity:         0.10,   // δ  - Trending signal
    conversion:       0.20,   // ε  - App usage conversion (highest value)
  },
  thresholds: {
    bounceThreshold:      0.10,    // W_r < 10% = bounce
    viralPercentile:      95,      // 95th percentile for cross-border
    minOrganicQuality:    3.0,     // min quality score /10 for boosted
    recencyHalfLifeHours: 6,      // content freshness half-life
    maxBoostMultiplier:   2.5,     // cap boost at 2.5x
  },
  platformWeights: {
    instagram: 0.50,
    youtube:   0.25,
    tiktok:    0.25,
  },
};

// Sigmoid function parameters
export const SIGMOID_CONFIG = {
  watchTime: { steepness: 5, midpoint: 0.5 },     // σ(5(x - 0.5))
  rewatch:   { steepness: 1.5, midpoint: 2 },      // σ(1.5(x - 2))
  velocity:  { steepness: 0.01, midpoint: 500 },   // σ(0.01(x - 500))
};

// Logarithmic scaling parameters
export const LOG_CONFIG = {
  viewsBase: 10,      // log₁₀(V_total + 1)
  velocityBase: 2,    // log₂(V_rate + 1)
};

// Platform-specific engagement multipliers
export const PLATFORM_ENGAGEMENT_MULTIPLIERS = {
  instagram: {
    like: 1.0, share: 1.2, comment: 1.1, save: 1.5, follow: 1.3, profileVisit: 1.0,
    description: 'Save-heavy, visual-first platform',
  },
  youtube: {
    like: 1.0, share: 1.0, comment: 1.3, save: 1.0, follow: 1.1, profileVisit: 0.8,
    description: 'Comment-heavy, watch-time-first platform',
  },
  tiktok: {
    like: 1.0, share: 1.5, comment: 1.0, save: 1.2, follow: 1.0, profileVisit: 0.9,
    description: 'Share-heavy, virality-first platform',
  },
};

// Boost bidding strategy multipliers
export const BID_STRATEGY_MULTIPLIERS: Record<string, number> = {
  cpm:          1.0,
  cpc:          1.2,
  cpa:          1.5,
  lowest_cost:  0.8,
};
