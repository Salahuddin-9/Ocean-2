// ============================================================
// MULTI-STAGE RECOMMENDATION PIPELINE
// 10-Stage Feed Generation System
// ============================================================

import { sigmoid, exponentialDecay, clamp } from './math';

// ─────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────

export interface CandidateContent {
  contentId: string;
  creatorId: string;
  embedding: Float32Array;
  features: ContentRankingFeatures;
  source: CandidateSource;
  sourceScore: number;
}

export type CandidateSource = 
  | 'following'
  | 'interest_match'
  | 'similar_users'
  | 'similar_content'
  | 'trending_local'
  | 'trending_global'
  | 'creator_expansion'
  | 'exploration'
  | 'boosted';

export interface ContentRankingFeatures {
  // Content
  publishedAt: number;
  duration: number;
  qualityScore: number;
  hookScore: number;
  language: string;
  country: string;
  category: string;
  
  // Creator
  creatorTrustScore: number;
  creatorQualityScore: number;
  creatorFollowed: boolean;
  
  // Engagement signals
  globalViews: number;
  globalLikeRate: number;
  globalShareRate: number;
  globalCommentRate: number;
  globalSaveRate: number;
  globalCompletionRate: number;
  
  // Velocity
  viewVelocity: number;
  likeVelocity: number;
  shareVelocity: number;
  
  // Safety
  isSafe: boolean;
  riskScore: number;
  
  // Boosting
  isBoosted: boolean;
  boostBudgetRemaining: number;
  boostQualityScore: number;
  boostBidAmount: number;
}

export interface UserContext {
  userId: string;
  embedding: Float32Array;
  language: string;
  country: string;
  interests: Map<string, number>;
  followedCreators: Set<string>;
  sessionPosition: number;
  sessionDuration: number;
  recentCategories: string[];
  recentCreators: string[];
  satisfactionScore: number;
}

export interface RankedContent {
  content: CandidateContent;
  scores: ScoringBreakdown;
  finalScore: number;
  rank: number;
  stage: string;
  filtered: boolean;
  filterReason?: string;
}

export interface ScoringBreakdown {
  engagementScore: number;
  watchTimeScore: number;
  satisfactionScore: number;
  freshnessScore: number;
  trendingScore: number;
  viralScore: number;
  creatorScore: number;
  trustScore: number;
  relevanceScore: number;
  diversityAdjustment: number;
  fatigueAdjustment: number;
  boostMultiplier: number;
  penaltyMultiplier: number;
}

// ─────────────────────────────────────────────
// STAGE 1: Candidate Generation
// ─────────────────────────────────────────────
// Sources: Following, Interest Match, Similar Users, Similar Content,
//          Trending (Local/Global), Creator Expansion, Exploration Pool

export interface CandidateGenerationConfig {
  followingQuota: number;           // max from following
  interestMatchQuota: number;       // max from interest match
  similarUsersQuota: number;        // max from similar users
  similarContentQuota: number;      // max from recent interactions
  trendingLocalQuota: number;       // max from local trending
  trendingGlobalQuota: number;      // max from global trending
  creatorExpansionQuota: number;    // max from similar creators
  explorationQuota: number;         // max from exploration pool
  totalCandidates: number;          // total to retrieve
}

export const DEFAULT_CANDIDATE_CONFIG: CandidateGenerationConfig = {
  followingQuota: 100,
  interestMatchQuota: 200,
  similarUsersQuota: 100,
  similarContentQuota: 100,
  trendingLocalQuota: 80,
  trendingGlobalQuota: 50,
  creatorExpansionQuota: 70,
  explorationQuota: 100,
  totalCandidates: 800,
};

// ─────────────────────────────────────────────
// STAGE 2: Eligibility Filtering
// ─────────────────────────────────────────────
// Hard filters: blocked, already seen, language mismatch, safety

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

export function checkEligibility(
  content: CandidateContent,
  _user: UserContext,
  seenContentIds: Set<string>,
  blockedCreators: Set<string>
): EligibilityResult {
  // Already seen
  if (seenContentIds.has(content.contentId)) {
    return { eligible: false, reason: 'already_seen' };
  }
  
  // Blocked creator
  if (blockedCreators.has(content.creatorId)) {
    return { eligible: false, reason: 'blocked_creator' };
  }
  
  // Safety check
  if (!content.features.isSafe) {
    return { eligible: false, reason: 'safety_violation' };
  }
  
  // High risk content
  if (content.features.riskScore > 0.8) {
    return { eligible: false, reason: 'high_risk' };
  }
  
  return { eligible: true };
}

// ─────────────────────────────────────────────
// STAGE 3: Quality Filtering
// ─────────────────────────────────────────────
// Soft filters: minimum quality thresholds

export interface QualityThresholds {
  minQualityScore: number;
  minCreatorTrust: number;
  minEngagementRate: number;
  minCompletionRate: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minQualityScore: 3.0,
  minCreatorTrust: 20,
  minEngagementRate: 0.01,
  minCompletionRate: 0.15,
};

export function checkQuality(
  content: CandidateContent,
  thresholds: QualityThresholds
): EligibilityResult {
  const f = content.features;
  
  // Quality score
  if (f.qualityScore < thresholds.minQualityScore) {
    return { eligible: false, reason: 'low_quality' };
  }
  
  // Creator trust (allow new creators)
  if (f.creatorTrustScore < thresholds.minCreatorTrust && f.globalViews > 1000) {
    return { eligible: false, reason: 'low_trust_creator' };
  }
  
  // Engagement rate (only for content with enough views)
  const engagementRate = f.globalLikeRate + f.globalShareRate + f.globalCommentRate + f.globalSaveRate;
  if (f.globalViews > 10000 && engagementRate < thresholds.minEngagementRate) {
    return { eligible: false, reason: 'low_engagement' };
  }
  
  return { eligible: true };
}

// ─────────────────────────────────────────────
// STAGE 4-6: Prediction Scoring
// ─────────────────────────────────────────────
// Engagement, Watch Time, Satisfaction predictions

export function computeEngagementScore(
  likeProbability: number,
  shareProbability: number,
  commentProbability: number,
  saveProbability: number,
  followProbability: number
): number {
  // Weighted combination (shares/saves more valuable)
  return (
    0.15 * likeProbability +
    0.25 * shareProbability +
    0.15 * commentProbability +
    0.25 * saveProbability +
    0.20 * followProbability
  );
}

export function computeWatchTimeScore(
  expectedWatchRatio: number,
  completionProbability: number,
  rewatchProbability: number
): number {
  return (
    0.50 * expectedWatchRatio +
    0.35 * completionProbability +
    0.15 * rewatchProbability
  );
}

// ─────────────────────────────────────────────
// STAGE 7: Re-Ranking (Master Score)
// ─────────────────────────────────────────────
// Combine all predictions into master feed score

export interface MasterScoreWeights {
  engagement: number;
  watchTime: number;
  satisfaction: number;
  retention: number;
  freshness: number;
  trending: number;
  viral: number;
  creatorQuality: number;
  trust: number;
  relevance: number;
  sessionExtension: number;
}

export const DEFAULT_MASTER_WEIGHTS: MasterScoreWeights = {
  engagement: 0.15,
  watchTime: 0.20,
  satisfaction: 0.15,
  retention: 0.10,
  freshness: 0.08,
  trending: 0.07,
  viral: 0.05,
  creatorQuality: 0.08,
  trust: 0.05,
  relevance: 0.05,
  sessionExtension: 0.02,
};

// ─────────────────────────────────────────────
// Freshness Score
// ─────────────────────────────────────────────
// F(t) = e^(-λ·t) × velocity_boost

export function computeFreshnessScore(
  publishedAt: number,
  nowMs: number,
  viewVelocity: number,
  halfLifeHours: number = 12
): number {
  const ageHours = (nowMs - publishedAt) / (1000 * 60 * 60);
  const decayScore = exponentialDecay(ageHours, halfLifeHours);
  
  // Velocity boost for high-performing content
  const velocityBoost = Math.min(1.5, 1 + Math.log10(viewVelocity + 1) / 10);
  
  return clamp(decayScore * velocityBoost, 0, 1);
}

// ─────────────────────────────────────────────
// Trending/Momentum Score
// ─────────────────────────────────────────────
// M(t) = α·log(V_velocity) + β·σ(acceleration) + γ·percentile_rank

export function computeTrendingScore(
  viewVelocity: number,
  likeVelocity: number,
  shareVelocity: number,
  percentileRank: number
): number {
  // Log-scaled velocity components
  const viewComponent = Math.log10(viewVelocity + 1) / 5;
  const likeComponent = Math.log10(likeVelocity + 1) / 4;
  const shareComponent = Math.log10(shareVelocity + 1) / 3;
  
  // Percentile rank (0-1)
  const percentileComponent = percentileRank / 100;
  
  return clamp(
    0.30 * viewComponent +
    0.25 * likeComponent +
    0.30 * shareComponent +
    0.15 * percentileComponent,
    0, 1
  );
}

// ─────────────────────────────────────────────
// Viral Potential Score
// ─────────────────────────────────────────────
// V_potential = σ(growth_rate) × share_amplifier × quality_factor

export function computeViralScore(
  shareVelocity: number,
  shareAcceleration: number,
  globalShareRate: number,
  qualityScore: number
): number {
  const shareVelocityScore = sigmoid(shareVelocity / 100 - 0.5);
  const accelerationScore = sigmoid(shareAcceleration / 10);
  const shareRateScore = Math.min(1, globalShareRate / 0.05);
  const qualityFactor = qualityScore / 10;
  
  return clamp(
    0.35 * shareVelocityScore +
    0.25 * accelerationScore +
    0.25 * shareRateScore +
    0.15 * qualityFactor,
    0, 1
  );
}

// ─────────────────────────────────────────────
// STAGE 8: Diversity Injection
// ─────────────────────────────────────────────
// Ensure variety in categories, creators, content types

export interface DiversityConfig {
  maxSameCategoryConsecutive: number;
  maxSameCreatorInWindow: number;
  windowSize: number;
  categoryBoostFactor: number;
  creatorBoostFactor: number;
}

export const DEFAULT_DIVERSITY_CONFIG: DiversityConfig = {
  maxSameCategoryConsecutive: 2,
  maxSameCreatorInWindow: 2,
  windowSize: 10,
  categoryBoostFactor: 1.2,
  creatorBoostFactor: 1.3,
};

export function computeDiversityAdjustment(
  content: CandidateContent,
  recentCategories: string[],
  recentCreators: string[],
  config: DiversityConfig
): number {
  let adjustment = 1.0;
  
  // Category diversity
  const categoryCount = recentCategories.filter(c => c === content.features.category).length;
  if (categoryCount >= config.maxSameCategoryConsecutive) {
    adjustment *= 0.7; // penalty for repetition
  } else if (categoryCount === 0) {
    adjustment *= config.categoryBoostFactor; // boost for variety
  }
  
  // Creator diversity
  const creatorCount = recentCreators.filter(c => c === content.creatorId).length;
  if (creatorCount >= config.maxSameCreatorInWindow) {
    adjustment *= 0.5; // stronger penalty for same creator
  } else if (creatorCount === 0 && !content.features.creatorFollowed) {
    adjustment *= config.creatorBoostFactor; // boost for new creator discovery
  }
  
  return adjustment;
}

// ─────────────────────────────────────────────
// STAGE 9: Freshness Balancing
// ─────────────────────────────────────────────
// Mix of new and proven content

export interface FreshnessBalanceConfig {
  newContentRatio: number;          // % of feed that should be < 1 hour old
  provenContentRatio: number;       // % that should be proven performers
  exploratoryRatio: number;         // % that should be experimental
}

export const DEFAULT_FRESHNESS_BALANCE: FreshnessBalanceConfig = {
  newContentRatio: 0.20,
  provenContentRatio: 0.60,
  exploratoryRatio: 0.20,
};

// ─────────────────────────────────────────────
// Topic Fatigue Engine
// ─────────────────────────────────────────────
// Penalize repetitive content within session

export function computeFatigueAdjustment(
  category: string,
  categoryExposureCounts: Map<string, number>,
  maxExposureBeforeFatigue: number = 5
): number {
  const exposures = categoryExposureCounts.get(category) || 0;
  
  if (exposures < maxExposureBeforeFatigue) {
    return 1.0; // no fatigue
  }
  
  // Exponential decay penalty after fatigue threshold
  const fatigueLevel = exposures - maxExposureBeforeFatigue;
  return Math.exp(-0.2 * fatigueLevel);
}

// ─────────────────────────────────────────────
// Language & Geo Scoring
// ─────────────────────────────────────────────

export function computeLanguageScore(
  contentLanguage: string,
  userLanguage: string,
  userSecondaryLanguages: string[] = []
): number {
  if (contentLanguage === userLanguage) return 1.0;
  if (userSecondaryLanguages.includes(contentLanguage)) return 0.8;
  return 0.2; // cross-language content (only for viral)
}

export function computeGeoScore(
  contentCountry: string,
  userCountry: string,
  neighboringCountries: string[] = []
): number {
  if (contentCountry === userCountry) return 1.0;
  if (neighboringCountries.includes(contentCountry)) return 0.7;
  return 0.3; // global content
}

// ─────────────────────────────────────────────
// MASTER FEED SCORE FORMULA
// ─────────────────────────────────────────────
// 
// Score(u, c) = [
//   w_engagement × E_score +
//   w_watchTime × W_score +
//   w_satisfaction × S_score +
//   w_retention × R_score +
//   w_freshness × F_score +
//   w_trending × T_score +
//   w_viral × V_score +
//   w_creator × C_score +
//   w_trust × Trust_score +
//   w_relevance × Rel_score +
//   w_session × Session_score
// ] × Diversity_adj × Fatigue_adj × Boost_mult × Penalty_mult × Geo_score × Lang_score

export interface MasterScoreInputs {
  engagementScore: number;
  watchTimeScore: number;
  satisfactionScore: number;
  retentionScore: number;
  freshnessScore: number;
  trendingScore: number;
  viralScore: number;
  creatorQualityScore: number;
  trustScore: number;
  relevanceScore: number;
  sessionExtensionScore: number;
  diversityAdjustment: number;
  fatigueAdjustment: number;
  boostMultiplier: number;
  penaltyMultiplier: number;
  languageScore: number;
  geoScore: number;
}

export function computeMasterFeedScore(
  inputs: MasterScoreInputs,
  weights: MasterScoreWeights = DEFAULT_MASTER_WEIGHTS
): number {
  // Weighted sum of components
  const baseScore = 
    weights.engagement * inputs.engagementScore +
    weights.watchTime * inputs.watchTimeScore +
    weights.satisfaction * inputs.satisfactionScore +
    weights.retention * inputs.retentionScore +
    weights.freshness * inputs.freshnessScore +
    weights.trending * inputs.trendingScore +
    weights.viral * inputs.viralScore +
    weights.creatorQuality * inputs.creatorQualityScore +
    weights.trust * inputs.trustScore +
    weights.relevance * inputs.relevanceScore +
    weights.sessionExtension * inputs.sessionExtensionScore;
  
  // Apply multiplicative factors
  const adjustedScore = 
    baseScore *
    inputs.diversityAdjustment *
    inputs.fatigueAdjustment *
    inputs.boostMultiplier *
    inputs.penaltyMultiplier *
    inputs.languageScore *
    inputs.geoScore;
  
  // Normalize to 0-100
  return clamp(adjustedScore * 100, 0, 100);
}

// ─────────────────────────────────────────────
// STAGE 10: Final Feed Generation
// ─────────────────────────────────────────────
// Sort, apply position-based adjustments, generate final feed

export interface FeedGenerationConfig {
  feedSize: number;
  positionBias: boolean;
  boostedContentRatio: number;
  maxBoostedConsecutive: number;
}

export const DEFAULT_FEED_CONFIG: FeedGenerationConfig = {
  feedSize: 30,
  positionBias: true,
  boostedContentRatio: 0.10,
  maxBoostedConsecutive: 1,
};

// Position bias adjustment (higher positions get viewed more)
export function applyPositionBias(score: number, position: number): number {
  // Log decay based on position
  const positionFactor = 1 / Math.log2(position + 2);
  return score * positionFactor;
}

// ─────────────────────────────────────────────
// Complete Pipeline Orchestrator
// ─────────────────────────────────────────────

export interface PipelineConfig {
  candidateGeneration: CandidateGenerationConfig;
  qualityThresholds: QualityThresholds;
  masterWeights: MasterScoreWeights;
  diversityConfig: DiversityConfig;
  freshnessBalance: FreshnessBalanceConfig;
  feedGeneration: FeedGenerationConfig;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  candidateGeneration: DEFAULT_CANDIDATE_CONFIG,
  qualityThresholds: DEFAULT_QUALITY_THRESHOLDS,
  masterWeights: DEFAULT_MASTER_WEIGHTS,
  diversityConfig: DEFAULT_DIVERSITY_CONFIG,
  freshnessBalance: DEFAULT_FRESHNESS_BALANCE,
  feedGeneration: DEFAULT_FEED_CONFIG,
};

export interface PipelineMetrics {
  candidatesGenerated: number;
  afterEligibility: number;
  afterQuality: number;
  afterScoring: number;
  finalFeedSize: number;
  avgFinalScore: number;
  diversityScore: number;
  processingTimeMs: number;
}
