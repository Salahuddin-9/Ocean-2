// ============================================================
// CREATOR MODELING ENGINE
// Trust, Quality, Performance & Risk Scoring
// ============================================================

export interface CreatorProfile {
  creatorId: string;
  username: string;
  createdAt: number;
  
  // Trust & Safety
  trustScore: number;           // 0-100
  verificationLevel: 'none' | 'email' | 'phone' | 'identity' | 'official';
  
  // Quality Metrics
  qualityScore: number;         // 0-100
  consistencyScore: number;     // 0-100
  
  // Performance Metrics
  performanceMetrics: CreatorPerformanceMetrics;
  
  // Audience
  audienceMetrics: AudienceMetrics;
  
  // Risk Assessment
  riskAssessment: RiskAssessment;
  
  // Growth
  growthMetrics: GrowthMetrics;
  
  // Historical
  historicalPerformance: HistoricalPerformance;
}

export interface CreatorPerformanceMetrics {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  totalSaves: number;
  
  // Averages
  avgViewsPerPost: number;
  avgEngagementRate: number;
  avgWatchTimeRatio: number;
  avgCompletionRate: number;
  
  // Retention
  audienceRetentionRate: number;     // % viewers who watch next post
  returnViewerRate: number;          // % viewers who return
  
  // Virality
  viralPostCount: number;            // posts that went viral
  viralRate: number;                 // % of posts that go viral
}

export interface AudienceMetrics {
  followerCount: number;
  followingCount: number;
  followerGrowthRate: number;        // daily
  followerChurnRate: number;         // daily
  
  // Audience quality
  activeFollowerRatio: number;       // % followers who engage
  botFollowerRatio: number;          // estimated bot followers
  fakeFollowerRisk: number;
  
  // Demographics
  audienceCountries: Record<string, number>;
  audienceAgeGroups: Record<string, number>;
  audienceGenderSplit: { male: number; female: number; other: number };
}

export interface RiskAssessment {
  overallRisk: number;               // 0-100, higher = riskier
  spamRisk: number;                  // 0-100
  botRisk: number;                   // 0-100
  violationRisk: number;             // 0-100
  misinformationRisk: number;        // 0-100
  
  // Flags
  hasActiveStrikes: boolean;
  strikeCount: number;
  suspensionHistory: number;
  
  // Behavioral
  suspiciousActivityScore: number;
  engagementPodRisk: number;         // artificial engagement
  
  // Policy
  communityGuidelinesScore: number;  // 0-100, adherence
  copyrightStrikeCount: number;
}

export interface GrowthMetrics {
  // Velocity
  followerVelocity: number;          // followers/day
  viewVelocity: number;              // views/day
  engagementVelocity: number;
  
  // Acceleration
  followerAcceleration: number;      // change in velocity
  viewAcceleration: number;
  
  // Trends
  growthTrend: 'explosive' | 'rapid' | 'steady' | 'stagnant' | 'declining';
  
  // Projections
  projectedFollowers30d: number;
  projectedViews30d: number;
}

export interface HistoricalPerformance {
  // Rolling averages
  avg7dViews: number;
  avg30dViews: number;
  avg90dViews: number;
  
  avg7dEngagement: number;
  avg30dEngagement: number;
  avg90dEngagement: number;
  
  // Consistency
  postingFrequency: number;          // posts per week
  postingConsistency: number;        // variance in posting schedule
  
  // Quality trend
  qualityTrend: 'improving' | 'stable' | 'declining';
  
  // Best/worst
  bestPostId: string;
  bestPostViews: number;
  worstPostId: string;
  worstPostViews: number;
}

// ─────────────────────────────────────────────
// Creator Trust Score Formula
// ─────────────────────────────────────────────
// T_creator = w₁·age_factor + w₂·verification + w₃·consistency + 
//             w₄·engagement_quality - w₅·risk_factors

export const TRUST_WEIGHTS = {
  accountAge: 0.10,
  verification: 0.15,
  consistency: 0.20,
  engagementQuality: 0.25,
  communityStanding: 0.15,
  riskPenalty: 0.15,
};

export function computeCreatorTrustScore(profile: CreatorProfile): number {
  const now = Date.now();
  const accountAgeDays = (now - profile.createdAt) / (1000 * 60 * 60 * 24);
  
  // Age factor: logarithmic growth, caps around 2 years
  const ageFactor = Math.min(1, Math.log(accountAgeDays + 1) / Math.log(730));
  
  // Verification level
  const verificationScores: Record<string, number> = {
    'none': 0.2,
    'email': 0.4,
    'phone': 0.6,
    'identity': 0.8,
    'official': 1.0,
  };
  const verificationFactor = verificationScores[profile.verificationLevel] ?? 0.2;
  
  // Consistency
  const consistencyFactor = profile.consistencyScore / 100;
  
  // Engagement quality (real vs fake)
  const engagementQuality = 
    (1 - profile.audienceMetrics.botFollowerRatio) *
    profile.audienceMetrics.activeFollowerRatio *
    Math.min(1, profile.performanceMetrics.avgEngagementRate / 0.05);
  
  // Community standing
  const communityStanding = profile.riskAssessment.communityGuidelinesScore / 100;
  
  // Risk penalty
  const riskPenalty = profile.riskAssessment.overallRisk / 100;
  
  const trustScore = (
    TRUST_WEIGHTS.accountAge * ageFactor +
    TRUST_WEIGHTS.verification * verificationFactor +
    TRUST_WEIGHTS.consistency * consistencyFactor +
    TRUST_WEIGHTS.engagementQuality * engagementQuality +
    TRUST_WEIGHTS.communityStanding * communityStanding -
    TRUST_WEIGHTS.riskPenalty * riskPenalty
  ) * 100;
  
  return Math.max(0, Math.min(100, trustScore));
}

// ─────────────────────────────────────────────
// Creator Quality Score Formula
// ─────────────────────────────────────────────
// Q_creator = Σᵢ wᵢ × avg_content_quality_i × consistency_factor

export const QUALITY_WEIGHTS = {
  contentQuality: 0.30,
  engagementDepth: 0.25,
  audienceRetention: 0.20,
  consistency: 0.15,
  growth: 0.10,
};

export function computeCreatorQualityScore(profile: CreatorProfile): number {
  const perf = profile.performanceMetrics;
  
  // Content quality from average post quality (would be from content analysis)
  const contentQuality = 0.7; // placeholder, would aggregate from posts
  
  // Engagement depth: beyond just likes
  const engagementDepth = Math.min(1, (
    perf.avgEngagementRate * 10 + // baseline
    (perf.avgWatchTimeRatio * 0.3) +
    (perf.avgCompletionRate * 0.3)
  ));
  
  // Audience retention
  const audienceRetention = (
    perf.audienceRetentionRate * 0.5 +
    perf.returnViewerRate * 0.5
  );
  
  // Consistency
  const consistency = profile.consistencyScore / 100;
  
  // Growth health
  const growthScore = profile.growthMetrics.growthTrend === 'explosive' ? 1.0 :
                      profile.growthMetrics.growthTrend === 'rapid' ? 0.8 :
                      profile.growthMetrics.growthTrend === 'steady' ? 0.6 :
                      profile.growthMetrics.growthTrend === 'stagnant' ? 0.3 : 0.1;
  
  const qualityScore = (
    QUALITY_WEIGHTS.contentQuality * contentQuality +
    QUALITY_WEIGHTS.engagementDepth * engagementDepth +
    QUALITY_WEIGHTS.audienceRetention * audienceRetention +
    QUALITY_WEIGHTS.consistency * consistency +
    QUALITY_WEIGHTS.growth * growthScore
  ) * 100;
  
  return Math.max(0, Math.min(100, qualityScore));
}

// ─────────────────────────────────────────────
// Audience Satisfaction Score
// ─────────────────────────────────────────────
// S_audience = avg_completion × (1 - bounce_rate) × engagement_depth × sentiment

export function computeAudienceSatisfactionScore(
  avgCompletionRate: number,
  bounceRate: number,
  avgEngagementRate: number,
  sentimentScore: number  // -1 to 1, from comments
): number {
  const completionFactor = avgCompletionRate;
  const retentionFactor = 1 - bounceRate;
  const engagementFactor = Math.min(1, avgEngagementRate / 0.1);
  const sentimentFactor = (sentimentScore + 1) / 2; // normalize to 0-1
  
  return (
    0.35 * completionFactor +
    0.25 * retentionFactor +
    0.25 * engagementFactor +
    0.15 * sentimentFactor
  ) * 100;
}

// ─────────────────────────────────────────────
// Spam/Bot Detection Score
// ─────────────────────────────────────────────
// P(spam) = σ(w · [posting_velocity, engagement_patterns, follower_quality, content_similarity])

export interface SpamSignals {
  postingVelocity: number;           // posts per hour
  avgTimeBetweenPosts: number;       // seconds
  duplicateContentRatio: number;     // % similar posts
  followerToFollowingRatio: number;
  engagementToFollowerRatio: number;
  commentQualityScore: number;       // depth of comments received
  profileCompleteness: number;
  accountAgeDays: number;
}

export function computeSpamProbability(signals: SpamSignals): number {
  const features = [
    signals.postingVelocity > 5 ? 1 : signals.postingVelocity / 5,
    signals.avgTimeBetweenPosts < 60 ? 1 : 60 / signals.avgTimeBetweenPosts,
    signals.duplicateContentRatio,
    signals.followerToFollowingRatio > 100 ? 1 : 0, // extreme ratio
    signals.engagementToFollowerRatio < 0.001 ? 0.5 : 0, // fake followers
    1 - signals.commentQualityScore,
    1 - signals.profileCompleteness,
    signals.accountAgeDays < 7 ? 0.3 : 0, // new account penalty
  ];
  
  const weights = [0.15, 0.15, 0.20, 0.10, 0.15, 0.10, 0.05, 0.10];
  
  let score = 0;
  for (let i = 0; i < features.length; i++) {
    score += weights[i] * features[i];
  }
  
  // Sigmoid to get probability
  return 1 / (1 + Math.exp(-5 * (score - 0.4)));
}

// ─────────────────────────────────────────────
// Creator Distribution Eligibility
// ─────────────────────────────────────────────
// Determines how much distribution a creator should receive

export type DistributionTier = 'restricted' | 'limited' | 'standard' | 'elevated' | 'premium';

export function computeDistributionTier(profile: CreatorProfile): DistributionTier {
  const trust = profile.trustScore;
  const quality = profile.qualityScore;
  const risk = profile.riskAssessment.overallRisk;
  
  // Composite eligibility score
  const eligibility = (
    0.4 * (trust / 100) +
    0.4 * (quality / 100) -
    0.2 * (risk / 100)
  );
  
  if (risk > 70 || profile.riskAssessment.hasActiveStrikes) return 'restricted';
  if (eligibility < 0.3) return 'limited';
  if (eligibility < 0.5) return 'standard';
  if (eligibility < 0.7) return 'elevated';
  return 'premium';
}

export const DISTRIBUTION_MULTIPLIERS: Record<DistributionTier, number> = {
  restricted: 0.1,
  limited: 0.4,
  standard: 1.0,
  elevated: 1.5,
  premium: 2.0,
};
