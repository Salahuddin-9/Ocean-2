// ============================================================
// ENGAGEMENT PREDICTION MODELS
// Multi-Task Learning Architecture for User-Content Scoring
// ============================================================

import { sigmoid } from './math';

// ─────────────────────────────────────────────
// Feature Vector Definition
// ─────────────────────────────────────────────

export interface PredictionFeatures {
  // User features
  user: {
    interestMatch: number;          // cosine(user_emb, content_emb)
    historicalWatchRatio: number;
    historicalEngagementRate: number;
    sessionPosition: number;        // how many videos watched this session
    hourOfDay: number;
    dayOfWeek: number;
    recencyDays: number;            // days since last visit
    lifetimeValue: number;
    satisfactionScore: number;
  };
  
  // Content features
  content: {
    duration: number;
    qualityScore: number;
    hookScore: number;
    noveltyScore: number;           // how different from recent content
    trendingScore: number;
    viralPotential: number;
    ageHours: number;
    categoryPopularity: number;
  };
  
  // Creator features
  creator: {
    trustScore: number;
    qualityScore: number;
    followRelation: boolean;        // does user follow creator
    previousEngagement: number;     // past engagement with this creator
    creatorPopularity: number;
  };
  
  // Context features
  context: {
    deviceType: 'mobile' | 'tablet' | 'desktop';
    connectionType: 'wifi' | 'cellular' | 'unknown';
    sessionDuration: number;
    feedPosition: number;
    previousContentSimilarity: number;
    sessionEngagementRate: number;
  };
  
  // Historical signals for this content
  contentSignals: {
    globalCompletionRate: number;
    globalLikeRate: number;
    globalShareRate: number;
    globalCommentRate: number;
    globalSaveRate: number;
    recentCompletionRate: number;   // last 1 hour
    recentLikeRate: number;
  };
}

// ─────────────────────────────────────────────
// Base Prediction Model Interface
// ─────────────────────────────────────────────

export interface PredictionResult {
  probability: number;
  confidence: number;
  features: Record<string, number>;
}

// ─────────────────────────────────────────────
// P(Like) Model
// ─────────────────────────────────────────────
// Logistic regression approximation:
// P(like) = σ(w₁·interest_match + w₂·quality + w₃·creator_follow + 
//            w₄·global_like_rate + w₅·session_engagement + bias)

export function predictLikeProbability(f: PredictionFeatures): PredictionResult {
  const features = {
    interest_match: f.user.interestMatch * 2.0,
    quality: f.content.qualityScore / 10 * 1.5,
    creator_follow: f.creator.followRelation ? 2.0 : 0,
    global_like_rate: f.contentSignals.globalLikeRate * 3.0,
    session_engagement: f.context.sessionEngagementRate * 1.5,
    hook: f.content.hookScore * 1.0,
    creator_quality: f.creator.qualityScore / 100 * 0.8,
    novelty: f.content.noveltyScore * 0.5,
  };
  
  const bias = -1.5; // baseline: ~18% without signals
  const score = Object.values(features).reduce((a, b) => a + b, bias);
  
  return {
    probability: sigmoid(score),
    confidence: 0.85,
    features,
  };
}

// ─────────────────────────────────────────────
// P(Share) Model
// ─────────────────────────────────────────────
// Shares are rarer, need stronger signals
// P(share) = σ(w₁·viral_potential + w₂·emotional_response + w₃·novelty + 
//             w₄·social_relevance + w₅·global_share_rate)

export function predictShareProbability(f: PredictionFeatures): PredictionResult {
  const features = {
    viral_potential: f.content.viralPotential * 3.0,
    novelty: f.content.noveltyScore * 2.0,
    global_share_rate: f.contentSignals.globalShareRate * 5.0,
    trending: f.content.trendingScore * 2.0,
    quality: f.content.qualityScore / 10 * 1.5,
    interest_match: f.user.interestMatch * 1.0,
    completion_correlation: f.contentSignals.globalCompletionRate * 2.0,
  };
  
  const bias = -3.0; // baseline: ~5% without signals
  const score = Object.values(features).reduce((a, b) => a + b, bias);
  
  return {
    probability: sigmoid(score),
    confidence: 0.80,
    features,
  };
}

// ─────────────────────────────────────────────
// P(Comment) Model
// ─────────────────────────────────────────────
// Comments require high engagement + something to say
// P(comment) = σ(w₁·engagement_depth + w₂·controversial_score + 
//               w₃·discussion_trigger + w₄·creator_interaction_history)

export function predictCommentProbability(f: PredictionFeatures): PredictionResult {
  const features = {
    global_comment_rate: f.contentSignals.globalCommentRate * 4.0,
    creator_follow: f.creator.followRelation ? 1.5 : 0,
    previous_engagement: f.creator.previousEngagement * 2.0,
    interest_match: f.user.interestMatch * 1.5,
    session_engagement: f.context.sessionEngagementRate * 1.0,
    quality: f.content.qualityScore / 10 * 0.5,
  };
  
  const bias = -2.5; // baseline: ~7% without signals
  const score = Object.values(features).reduce((a, b) => a + b, bias);
  
  return {
    probability: sigmoid(score),
    confidence: 0.78,
    features,
  };
}

// ─────────────────────────────────────────────
// P(Save) Model
// ─────────────────────────────────────────────
// Saves indicate high-value content for later
// P(save) = σ(w₁·informative_value + w₂·reference_potential + 
//            w₃·quality + w₄·personal_relevance)

export function predictSaveProbability(f: PredictionFeatures): PredictionResult {
  const features = {
    global_save_rate: f.contentSignals.globalSaveRate * 4.0,
    quality: f.content.qualityScore / 10 * 2.0,
    interest_match: f.user.interestMatch * 2.5,
    creator_follow: f.creator.followRelation ? 1.0 : 0,
    novelty: f.content.noveltyScore * 1.5,
    educational_signal: f.content.qualityScore > 7 ? 1.0 : 0, // proxy
  };
  
  const bias = -2.8; // baseline: ~6% without signals
  const score = Object.values(features).reduce((a, b) => a + b, bias);
  
  return {
    probability: sigmoid(score),
    confidence: 0.82,
    features,
  };
}

// ─────────────────────────────────────────────
// P(Follow) Model
// ─────────────────────────────────────────────
// Follows are the strongest creator affinity signal
// P(follow) = σ(w₁·creator_quality + w₂·content_quality + 
//              w₃·multiple_engagement + w₄·consistency + w₅·niche_match)

export function predictFollowProbability(f: PredictionFeatures): PredictionResult {
  const features = {
    creator_quality: f.creator.qualityScore / 100 * 3.0,
    creator_trust: f.creator.trustScore / 100 * 1.5,
    interest_match: f.user.interestMatch * 2.0,
    previous_engagement: f.creator.previousEngagement * 2.5,
    content_quality: f.content.qualityScore / 10 * 1.5,
    already_following: f.creator.followRelation ? -10 : 0, // can't follow twice
  };
  
  const bias = -4.0; // baseline: ~2% without signals
  const score = Object.values(features).reduce((a, b) => a + b, bias);
  
  return {
    probability: sigmoid(score),
    confidence: 0.75,
    features,
  };
}

// ─────────────────────────────────────────────
// Watch Time Prediction Model
// ─────────────────────────────────────────────
// Predicts expected watch time ratio E[W_r]
// Regression model, not classification
// E[W_r] = β₀ + Σᵢ βᵢ·xᵢ (capped at [0, 1.5] for rewatches)

export interface WatchTimePrediction {
  expectedRatio: number;            // E[watch_duration / video_length]
  expectedSeconds: number;          // E[watch_duration]
  completionProbability: number;    // P(watch >= 100%)
  rewatchProbability: number;       // P(watch > 100%)
  confidence: number;
}

export function predictWatchTime(f: PredictionFeatures): WatchTimePrediction {
  // Base watch ratio prediction
  const baseRatio = 0.3; // average baseline
  
  const adjustments = {
    interest_match: (f.user.interestMatch - 0.5) * 0.3,
    historical_watch: (f.user.historicalWatchRatio - 0.5) * 0.2,
    hook_score: (f.content.hookScore - 0.5) * 0.15,
    quality: (f.content.qualityScore / 10 - 0.5) * 0.1,
    creator_follow: f.creator.followRelation ? 0.1 : 0,
    global_completion: (f.contentSignals.globalCompletionRate - 0.5) * 0.15,
    session_fatigue: -f.context.feedPosition * 0.01, // fatigue penalty
    duration_penalty: f.content.duration > 60 ? -0.1 : 0, // longer = harder
  };
  
  const expectedRatio = Math.max(0, Math.min(1.5, 
    baseRatio + Object.values(adjustments).reduce((a, b) => a + b, 0)
  ));
  
  const expectedSeconds = expectedRatio * f.content.duration;
  
  // Completion probability
  const completionScore = expectedRatio * 2 - 0.5;
  const completionProbability = sigmoid(completionScore * 3);
  
  // Rewatch probability
  const rewatchScore = expectedRatio - 1;
  const rewatchProbability = sigmoid(rewatchScore * 5);
  
  return {
    expectedRatio,
    expectedSeconds,
    completionProbability,
    rewatchProbability,
    confidence: 0.70,
  };
}

// ─────────────────────────────────────────────
// Session Extension Prediction
// ─────────────────────────────────────────────
// P(continues_session | watches_this_content)
// Critical for feed optimization

export function predictSessionExtension(f: PredictionFeatures): PredictionResult {
  const features = {
    satisfaction: f.user.satisfactionScore * 2.0,
    session_momentum: f.context.sessionEngagementRate * 1.5,
    content_quality: f.content.qualityScore / 10 * 1.0,
    interest_match: f.user.interestMatch * 1.5,
    session_duration_penalty: -Math.log(f.context.sessionDuration / 60 + 1) * 0.5,
    feed_position_penalty: -f.context.feedPosition * 0.02,
    time_of_day_factor: f.user.hourOfDay >= 22 || f.user.hourOfDay <= 6 ? -0.5 : 0,
  };
  
  const bias = 0.5; // baseline: ~62% continue
  const score = Object.values(features).reduce((a, b) => a + b, bias);
  
  return {
    probability: sigmoid(score),
    confidence: 0.72,
    features,
  };
}

// ─────────────────────────────────────────────
// User Satisfaction Prediction
// ─────────────────────────────────────────────
// Long-term metric prediction
// Based on: quality, relevance, diversity, no regret

export interface SatisfactionPrediction {
  immediateScore: number;           // satisfaction with this content
  sessionScore: number;             // satisfaction with session so far
  predictedSurveyScore: number;     // predicted 1-5 rating
  regretProbability: number;        // P(would not watch again)
}

export function predictSatisfaction(f: PredictionFeatures): SatisfactionPrediction {
  // Immediate satisfaction with this content
  const immediateFactors = {
    interest_match: f.user.interestMatch * 0.3,
    quality: f.content.qualityScore / 10 * 0.25,
    expected_completion: f.contentSignals.globalCompletionRate * 0.2,
    novelty: f.content.noveltyScore * 0.15,
    creator_trust: f.creator.trustScore / 100 * 0.1,
  };
  const immediateScore = Object.values(immediateFactors).reduce((a, b) => a + b, 0);
  
  // Session satisfaction
  const sessionFactors = {
    engagement_rate: f.context.sessionEngagementRate * 0.3,
    diversity: (1 - f.context.previousContentSimilarity) * 0.2, // variety is good
    momentum: f.context.sessionDuration < 300 ? 0.1 : 0, // good start
  };
  const sessionScore = Object.values(sessionFactors).reduce((a, b) => a + b, 0.5);
  
  // Predicted survey score (1-5)
  const surveyScore = 1 + immediateScore * 4;
  
  // Regret probability
  const regretFeatures = -immediateScore + 0.3; // inverse of satisfaction
  const regretProbability = sigmoid(regretFeatures * 3);
  
  return {
    immediateScore: Math.min(1, immediateScore),
    sessionScore: Math.min(1, sessionScore),
    predictedSurveyScore: Math.max(1, Math.min(5, surveyScore)),
    regretProbability,
  };
}

// ─────────────────────────────────────────────
// Return/Retention Prediction
// ─────────────────────────────────────────────
// P(return_next_day), P(return_7_days), P(return_30_days)

export interface RetentionPrediction {
  nextDayProbability: number;
  day7Probability: number;
  day30Probability: number;
  lifetimeValueDelta: number;       // expected change in LTV from this session
}

export function predictRetention(f: PredictionFeatures): RetentionPrediction {
  // Base retention from user's historical pattern
  const baseRetention = Math.min(1, f.user.satisfactionScore * 0.5 + 0.4);
  
  // Session quality adjustments
  const sessionQuality = f.context.sessionEngagementRate;
  const contentRelevance = f.user.interestMatch;
  
  // Next day prediction
  const nextDayFeatures = {
    base: baseRetention,
    session_quality: sessionQuality * 0.2,
    relevance: contentRelevance * 0.1,
    recency_bonus: f.user.recencyDays < 2 ? 0.1 : 0,
  };
  const nextDayScore = Object.values(nextDayFeatures).reduce((a, b) => a + b, 0);
  const nextDayProbability = sigmoid((nextDayScore - 0.5) * 4);
  
  // 7-day and 30-day with decay
  const day7Probability = 1 - Math.pow(1 - nextDayProbability, 7) * 0.5;
  const day30Probability = 1 - Math.pow(1 - nextDayProbability, 30) * 0.3;
  
  // LTV delta
  const lifetimeValueDelta = sessionQuality * f.user.lifetimeValue * 0.01;
  
  return {
    nextDayProbability,
    day7Probability,
    day30Probability,
    lifetimeValueDelta,
  };
}

// ─────────────────────────────────────────────
// Viral Probability Prediction
// ─────────────────────────────────────────────
// P(content goes viral in next 24 hours)

export interface ViralPrediction {
  viralProbability: number;
  expectedReach: number;            // expected views if viral
  shareVelocityPrediction: number;  // expected shares/hour
  confidence: number;
}

export function predictViralProbability(f: PredictionFeatures): ViralPrediction {
  const features = {
    current_viral_potential: f.content.viralPotential * 3.0,
    share_rate: f.contentSignals.globalShareRate * 5.0,
    trending_momentum: f.content.trendingScore * 2.0,
    completion_rate: f.contentSignals.globalCompletionRate * 2.0,
    novelty: f.content.noveltyScore * 2.0,
    quality: f.content.qualityScore / 10 * 1.5,
    age_penalty: f.content.ageHours > 24 ? -1.0 : 0,
  };
  
  const bias = -4.0; // viral is rare
  const score = Object.values(features).reduce((a, b) => a + b, bias);
  const viralProbability = sigmoid(score);
  
  // Expected reach if viral (log-normal approximation)
  const baseReach = 100000;
  const expectedReach = viralProbability > 0.1 ? 
    baseReach * Math.exp(score - bias) : 
    baseReach * 0.1;
  
  const shareVelocityPrediction = viralProbability * 100; // shares per hour
  
  return {
    viralProbability,
    expectedReach: Math.round(expectedReach),
    shareVelocityPrediction,
    confidence: 0.65,
  };
}

// ─────────────────────────────────────────────
// Multi-Task Prediction Aggregator
// ─────────────────────────────────────────────

export interface AllPredictions {
  like: PredictionResult;
  share: PredictionResult;
  comment: PredictionResult;
  save: PredictionResult;
  follow: PredictionResult;
  watchTime: WatchTimePrediction;
  sessionExtension: PredictionResult;
  satisfaction: SatisfactionPrediction;
  retention: RetentionPrediction;
  viral: ViralPrediction;
}

export function predictAll(f: PredictionFeatures): AllPredictions {
  return {
    like: predictLikeProbability(f),
    share: predictShareProbability(f),
    comment: predictCommentProbability(f),
    save: predictSaveProbability(f),
    follow: predictFollowProbability(f),
    watchTime: predictWatchTime(f),
    sessionExtension: predictSessionExtension(f),
    satisfaction: predictSatisfaction(f),
    retention: predictRetention(f),
    viral: predictViralProbability(f),
  };
}
