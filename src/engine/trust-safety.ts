// ============================================================
// ANTI-SPAM & TRUST SAFETY SYSTEM
// Bot Detection, Engagement Fraud, Trust Scoring
// ============================================================

import { sigmoid, clamp } from './math';

// ─────────────────────────────────────────────
// Trust Score Components
// ─────────────────────────────────────────────

export interface UserTrustProfile {
  userId: string;
  
  // Core trust metrics
  trustScore: number;             // 0-100
  spamProbability: number;        // 0-1
  botProbability: number;         // 0-1
  
  // Behavioral signals
  behavioralSignals: BehavioralSignals;
  
  // Account signals
  accountSignals: AccountSignals;
  
  // Engagement signals
  engagementSignals: EngagementSignals;
  
  // Violation history
  violationHistory: ViolationHistory;
  
  // Classification
  trustTier: TrustTier;
  flags: TrustFlag[];
}

export type TrustTier = 'trusted' | 'standard' | 'limited' | 'restricted' | 'suspended';

export interface TrustFlag {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  resolved: boolean;
}

export interface BehavioralSignals {
  // Session patterns
  avgSessionDuration: number;
  sessionVariance: number;        // how consistent are sessions
  avgActionsPerSession: number;
  actionVariance: number;
  
  // Timing patterns
  avgTimeBetweenActions: number;  // seconds
  timingVariance: number;
  humanLikePatterns: number;      // 0-1, how human-like
  
  // Interaction patterns
  scrollPatterns: number;         // 0-1, natural scrolling
  clickPatterns: number;          // 0-1, natural clicking
  typingPatterns: number;         // 0-1, natural typing (comments)
}

export interface AccountSignals {
  accountAgeDays: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: number;        // 0-1
  hasProfilePicture: boolean;
  hasOriginalContent: boolean;
  
  // Social graph
  followerCount: number;
  followingCount: number;
  followerFollowingRatio: number;
  mutualConnections: number;
  graphDensity: number;           // 0-1, how interconnected
  
  // Device/location
  deviceConsistency: number;      // 0-1, uses same devices
  locationConsistency: number;    // 0-1, consistent location
  vpnDetected: boolean;
  datacenterIp: boolean;
}

export interface EngagementSignals {
  // Quality metrics
  avgCommentLength: number;
  commentQuality: number;         // 0-1, NLP quality score
  contentCreationQuality: number;
  
  // Pattern metrics
  engagementTiming: number;       // 0-1, natural timing
  engagementDistribution: number; // 0-1, spread across content
  reciprocalEngagement: number;   // 0-1, mutual interactions
  
  // Suspicious patterns
  burstActivity: number;          // 0-1, sudden activity spikes
  repetitiveActions: number;      // 0-1, same actions repeatedly
  coordinatedActivity: number;    // 0-1, acting with other accounts
}

export interface ViolationHistory {
  totalViolations: number;
  recentViolations: number;       // last 30 days
  spamViolations: number;
  contentViolations: number;
  harassmentViolations: number;
  strikeCount: number;
  appealsWon: number;
  lastViolationDate: number;
}

// ─────────────────────────────────────────────
// Bot Detection Model
// ─────────────────────────────────────────────
// P(bot) = σ(w · features)

export function computeBotProbability(
  behavioral: BehavioralSignals,
  account: AccountSignals,
  engagement: EngagementSignals
): number {
  const features = [
    // Behavioral red flags
    1 - behavioral.humanLikePatterns,
    1 - behavioral.scrollPatterns,
    1 - behavioral.clickPatterns,
    behavioral.timingVariance < 0.1 ? 0.5 : 0, // too consistent = suspicious
    
    // Account red flags
    account.accountAgeDays < 7 ? 0.3 : 0,
    !account.emailVerified ? 0.2 : 0,
    !account.profileComplete ? 0.2 : 0,
    account.datacenterIp ? 0.5 : 0,
    account.vpnDetected ? 0.2 : 0,
    1 - account.deviceConsistency,
    
    // Engagement red flags
    1 - engagement.engagementTiming,
    engagement.burstActivity,
    engagement.repetitiveActions,
    engagement.coordinatedActivity,
    1 - engagement.commentQuality,
  ];
  
  const weights = [
    0.08, 0.06, 0.06, 0.05,
    0.05, 0.04, 0.03, 0.10, 0.03, 0.05,
    0.08, 0.10, 0.10, 0.12, 0.05,
  ];
  
  let score = 0;
  for (let i = 0; i < features.length; i++) {
    score += weights[i] * features[i];
  }
  
  return sigmoid((score - 0.3) * 5);
}

// ─────────────────────────────────────────────
// Spam Detection Model
// ─────────────────────────────────────────────
// P(spam) = f(content_patterns, behavior_patterns, network_patterns)

export interface SpamSignals {
  // Content signals
  duplicateContentRatio: number;  // % of posts that are duplicates
  templateUsage: number;          // 0-1, using templates
  linkSpamRatio: number;          // % of posts with suspicious links
  hashtagAbuse: number;           // 0-1, excessive hashtags
  mentionAbuse: number;           // 0-1, excessive mentions
  
  // Behavior signals
  postingVelocity: number;        // posts per hour
  commentVelocity: number;        // comments per hour
  followVelocity: number;         // follows per hour
  massActions: boolean;           // bulk actions detected
  
  // Network signals
  spammerConnections: number;     // connections to known spammers
  lowQualityAudience: number;     // % of followers that are low-quality
}

export function computeSpamProbability(signals: SpamSignals): number {
  const features = [
    signals.duplicateContentRatio,
    signals.templateUsage,
    signals.linkSpamRatio,
    signals.hashtagAbuse,
    signals.mentionAbuse,
    clamp(signals.postingVelocity / 10, 0, 1),
    clamp(signals.commentVelocity / 20, 0, 1),
    clamp(signals.followVelocity / 50, 0, 1),
    signals.massActions ? 0.5 : 0,
    clamp(signals.spammerConnections / 10, 0, 1),
    signals.lowQualityAudience,
  ];
  
  const weights = [
    0.12, 0.08, 0.15, 0.08, 0.08,
    0.10, 0.08, 0.08, 0.08,
    0.10, 0.05,
  ];
  
  let score = 0;
  for (let i = 0; i < features.length; i++) {
    score += weights[i] * features[i];
  }
  
  return sigmoid((score - 0.25) * 6);
}

// ─────────────────────────────────────────────
// Engagement Pod / Fraud Detection
// ─────────────────────────────────────────────
// Detects coordinated inauthentic behavior

export interface EngagementPodSignals {
  // Timing correlation
  engagementTimingCorrelation: number;  // how correlated with other accounts
  responseLatency: number;               // avg seconds to engage after post
  
  // Network patterns
  mutualEngagementRatio: number;        // % engagement that is mutual
  clusterCoefficient: number;           // network clustering
  engagementCircularity: number;        // A→B→C→A patterns
  
  // Content patterns
  genericComments: number;              // % of generic/template comments
  engagementDiversity: number;          // 0-1, variety in engagement targets
}

export function computeEngagementPodProbability(signals: EngagementPodSignals): number {
  const features = [
    signals.engagementTimingCorrelation,
    signals.responseLatency < 60 ? 0.5 : 0, // too fast
    signals.mutualEngagementRatio > 0.5 ? (signals.mutualEngagementRatio - 0.5) * 2 : 0,
    signals.clusterCoefficient > 0.7 ? (signals.clusterCoefficient - 0.7) * 3 : 0,
    signals.engagementCircularity,
    signals.genericComments,
    1 - signals.engagementDiversity,
  ];
  
  const weights = [0.20, 0.10, 0.15, 0.15, 0.15, 0.15, 0.10];
  
  let score = 0;
  for (let i = 0; i < features.length; i++) {
    score += weights[i] * features[i];
  }
  
  return sigmoid((score - 0.3) * 5);
}

// ─────────────────────────────────────────────
// Fake Follower Detection
// ─────────────────────────────────────────────

export interface FollowerQualitySignals {
  // Audience metrics
  activeFollowerRatio: number;    // % that engage
  realFollowerEstimate: number;   // estimated real followers
  
  // Individual follower signals (aggregated)
  avgFollowerAccountAge: number;
  avgFollowerProfileComplete: number;
  avgFollowerActivity: number;
  
  // Pattern signals
  followerGrowthPattern: 'organic' | 'suspicious' | 'purchased';
  followerCountryDistribution: number;  // 0-1, how spread out
  followerTimingPattern: number;        // 0-1, natural growth
}

export function computeFakeFollowerRatio(signals: FollowerQualitySignals): number {
  // Estimate based on engagement and quality signals
  const expectedEngagement = 0.02; // typical 2% engagement
  const actualEngagement = signals.activeFollowerRatio;
  
  const engagementGap = Math.max(0, expectedEngagement - actualEngagement) / expectedEngagement;
  const qualityScore = (
    signals.avgFollowerAccountAge / 365 * 0.3 +
    signals.avgFollowerProfileComplete * 0.3 +
    signals.avgFollowerActivity * 0.4
  );
  
  const growthPenalty = signals.followerGrowthPattern === 'purchased' ? 0.5 :
                        signals.followerGrowthPattern === 'suspicious' ? 0.2 : 0;
  
  return clamp(
    engagementGap * 0.4 +
    (1 - qualityScore) * 0.3 +
    growthPenalty * 0.3,
    0, 1
  );
}

// ─────────────────────────────────────────────
// Overall Trust Score Computation
// ─────────────────────────────────────────────
// T = base_score × (1 - spam_prob) × (1 - bot_prob) × violation_factor × age_factor

export function computeTrustScore(
  botProbability: number,
  spamProbability: number,
  engagementPodProbability: number,
  violations: ViolationHistory,
  accountAgeDays: number,
  verificationLevel: number       // 0-1
): number {
  // Base score from verifications and age
  const ageFactor = Math.min(1, accountAgeDays / 180); // caps at 6 months
  const baseScore = 50 + verificationLevel * 30 + ageFactor * 20;
  
  // Probability penalties
  const botPenalty = botProbability * 50;
  const spamPenalty = spamProbability * 40;
  const podPenalty = engagementPodProbability * 20;
  
  // Violation penalty (exponential for repeat offenders)
  const violationPenalty = Math.min(50, violations.strikeCount * 10 + violations.recentViolations * 5);
  
  // Appeals bonus
  const appealBonus = violations.appealsWon * 5;
  
  const score = baseScore - botPenalty - spamPenalty - podPenalty - violationPenalty + appealBonus;
  
  return clamp(score, 0, 100);
}

// ─────────────────────────────────────────────
// Trust Tier Classification
// ─────────────────────────────────────────────

export function classifyTrustTier(
  trustScore: number,
  violations: ViolationHistory,
  botProbability: number
): TrustTier {
  // Hard rules
  if (violations.strikeCount >= 3) return 'suspended';
  if (botProbability > 0.9) return 'suspended';
  if (botProbability > 0.7 || violations.strikeCount >= 2) return 'restricted';
  
  // Score-based
  if (trustScore >= 80) return 'trusted';
  if (trustScore >= 50) return 'standard';
  if (trustScore >= 25) return 'limited';
  return 'restricted';
}

// ─────────────────────────────────────────────
// Distribution Limits by Trust Tier
// ─────────────────────────────────────────────

export const TRUST_TIER_LIMITS: Record<TrustTier, {
  maxDailyPosts: number;
  maxDailyComments: number;
  maxDailyFollows: number;
  reachMultiplier: number;
  canGoViral: boolean;
  canUseTrendingHashtags: boolean;
}> = {
  trusted: {
    maxDailyPosts: 50,
    maxDailyComments: 500,
    maxDailyFollows: 200,
    reachMultiplier: 1.2,
    canGoViral: true,
    canUseTrendingHashtags: true,
  },
  standard: {
    maxDailyPosts: 20,
    maxDailyComments: 200,
    maxDailyFollows: 100,
    reachMultiplier: 1.0,
    canGoViral: true,
    canUseTrendingHashtags: true,
  },
  limited: {
    maxDailyPosts: 10,
    maxDailyComments: 50,
    maxDailyFollows: 30,
    reachMultiplier: 0.5,
    canGoViral: false,
    canUseTrendingHashtags: false,
  },
  restricted: {
    maxDailyPosts: 3,
    maxDailyComments: 10,
    maxDailyFollows: 5,
    reachMultiplier: 0.1,
    canGoViral: false,
    canUseTrendingHashtags: false,
  },
  suspended: {
    maxDailyPosts: 0,
    maxDailyComments: 0,
    maxDailyFollows: 0,
    reachMultiplier: 0,
    canGoViral: false,
    canUseTrendingHashtags: false,
  },
};

// ─────────────────────────────────────────────
// Real-Time Anomaly Detection
// ─────────────────────────────────────────────

export interface AnomalyAlert {
  alertId: string;
  userId: string;
  type: 'velocity_spike' | 'pattern_change' | 'coordination' | 'automation' | 'fraud';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  description: string;
  detectedAt: number;
  metrics: Record<string, number>;
}

export function detectRealTimeAnomaly(
  userId: string,
  currentMetrics: {
    postsLastHour: number;
    commentsLastHour: number;
    followsLastHour: number;
    likesLastHour: number;
  },
  baselineMetrics: {
    avgPostsPerHour: number;
    avgCommentsPerHour: number;
    avgFollowsPerHour: number;
    avgLikesPerHour: number;
  }
): AnomalyAlert | null {
  // Check for velocity spikes (3x baseline)
  const postSpike = currentMetrics.postsLastHour / Math.max(1, baselineMetrics.avgPostsPerHour);
  const commentSpike = currentMetrics.commentsLastHour / Math.max(1, baselineMetrics.avgCommentsPerHour);
  const followSpike = currentMetrics.followsLastHour / Math.max(1, baselineMetrics.avgFollowsPerHour);
  const likeSpike = currentMetrics.likesLastHour / Math.max(1, baselineMetrics.avgLikesPerHour);
  
  const maxSpike = Math.max(postSpike, commentSpike, followSpike, likeSpike);
  
  if (maxSpike > 5) {
    return {
      alertId: `alert_${Date.now()}`,
      userId,
      type: 'velocity_spike',
      severity: maxSpike > 10 ? 'critical' : maxSpike > 7 ? 'high' : 'medium',
      confidence: Math.min(0.95, maxSpike / 20),
      description: `Activity spike detected: ${maxSpike.toFixed(1)}x baseline`,
      detectedAt: Date.now(),
      metrics: { postSpike, commentSpike, followSpike, likeSpike, maxSpike },
    };
  }
  
  return null;
}
