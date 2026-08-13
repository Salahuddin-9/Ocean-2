// ============================================================
// Type Definitions for the Hybrid Recommendation Engine
// ============================================================

export interface UserProfile {
  userId: string;
  language: string;
  country: string;
  interests: string[];
  platformWeights: PlatformWeights;
  historicalEngagement: HistoricalEngagement;
}

export interface PlatformWeights {
  instagram: number; // 0.50
  youtube: number;   // 0.25
  tiktok: number;    // 0.25
}

export interface HistoricalEngagement {
  avgWatchTimeRatio: number;
  avgSessionDuration: number;
  topCategories: string[];
  engagementRate: number;
}

export interface PostCandidate {
  postId: string;
  creatorId: string;
  language: string;
  country: string;
  category: string;
  videoLength: number; // seconds
  createdAt: number;   // timestamp ms
  totalViews: number;
  viewVelocity: number; // views per hour
  isBoosted: boolean;
  boostConfig?: BoostConfig;
  // Engagement counters (global)
  globalLikes: number;
  globalShares: number;
  globalComments: number;
  globalSaves: number;
  globalFollows: number;
  globalProfileVisits: number;
  // Percentile rank
  engagementPercentile: number; // 0-100
}

export interface BoostConfig {
  dailyBudget: number;
  totalBudget: number;
  bidAmount: number;
  bidStrategy: 'cpm' | 'cpc' | 'cpa' | 'lowest_cost';
  targetDemographics: DemographicTarget;
  qualityScore: number; // 0-10
  spent: number;
  impressions: number;
}

export interface DemographicTarget {
  languages: string[];
  countries: string[];
  ageRange: [number, number];
  interests: string[];
}

export interface UserPostInteraction {
  watchDuration: number;   // seconds
  videoLength: number;     // seconds
  rewatchCount: number;
  liked: boolean;
  shared: boolean;
  commented: boolean;
  followed: boolean;
  saved: boolean;
  profileVisited: boolean;
  feedbackPositive: boolean;  // "Interested" click
  feedbackNegative: boolean;  // "Not Interested" click
  appUsageTriggered: boolean; // Post-watch conversion
}

export interface ScoredPost {
  post: PostCandidate;
  scores: ScoreBreakdown;
  finalScore: number;
  rank: number;
  filtered: boolean;
  filterReason?: string;
}

export interface ScoreBreakdown {
  watchTimeScore: number;
  rewatchScore: number;
  engagementScore: number;
  feedbackScore: number;
  recencyScore: number;
  velocityScore: number;
  conversionScore: number;
  platformWeightedScore: number;
  boostMultiplier: number;
  penaltyFactor: number;
  rawScore: number;
  normalizedScore: number;
}

export interface EngineConfig {
  // Weight parameters
  weights: WeightMatrix;
  // Thresholds
  thresholds: ThresholdConfig;
  // Platform distribution
  platformWeights: PlatformWeights;
}

export interface WeightMatrix {
  watchTime: number;
  rewatch: number;
  like: number;
  share: number;
  comment: number;
  follow: number;
  save: number;
  profileVisit: number;
  feedbackPositive: number;
  feedbackNegative: number;
  recency: number;
  velocity: number;
  conversion: number;
}

export interface ThresholdConfig {
  bounceThreshold: number;        // W_r < 0.1 = bounce
  viralPercentile: number;        // 95th percentile for cross-border
  minOrganicQuality: number;      // minimum quality for boosted
  recencyHalfLifeHours: number;   // half-life for decay
  maxBoostMultiplier: number;     // cap boost factor
}
