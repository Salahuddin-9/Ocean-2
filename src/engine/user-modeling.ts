// ============================================================
// ADVANCED USER MODELING ENGINE
// Dynamic User-Interest Graph with Time-Decay & Hidden Interest Discovery
// ============================================================

export interface UserInterestVector {
  userId: string;
  interests: Map<string, InterestNode>;
  embeddings: Float32Array; // 512-dim user embedding
  lastUpdated: number;
  sessionCount: number;
  lifetimeValue: number;
}

export interface InterestNode {
  topic: string;
  score: number;                    // Current interest score [0, 1]
  rawScore: number;                 // Pre-decay score
  confidence: number;               // Confidence in this interest [0, 1]
  engagementCount: number;          // Total engagements with this topic
  lastEngagement: number;           // Timestamp of last engagement
  firstEngagement: number;          // Timestamp of first engagement
  trend: 'rising' | 'stable' | 'declining' | 'dormant';
  type: 'permanent' | 'temporary' | 'seasonal' | 'latent';
  decayRate: number;                // Topic-specific decay rate
  parentTopics: string[];           // Hierarchy
  childTopics: string[];
  correlatedTopics: Map<string, number>; // Co-occurrence scores
}

export interface UserBehaviorProfile {
  // Session patterns
  avgSessionDuration: number;
  avgDailySessions: number;
  preferredHours: number[];         // 0-23
  preferredDays: number[];          // 0-6
  sessionFrequencyTrend: 'increasing' | 'stable' | 'decreasing';
  
  // Content preferences
  preferredContentLength: 'short' | 'medium' | 'long';
  avgWatchTimeRatio: number;
  completionRate: number;
  rewatchRate: number;
  
  // Engagement patterns
  likeRate: number;
  shareRate: number;
  commentRate: number;
  saveRate: number;
  followRate: number;
  
  // Quality signals
  satisfactionScore: number;
  retentionProbability: number;
  churnRisk: number;
}

// ─────────────────────────────────────────────
// Interest Score Decay Function
// ─────────────────────────────────────────────
// I(t) = I₀ · e^(-λ·Δt) + α·Σ(engagement_weights)
// λ = topic-specific decay rate
// α = engagement boost factor

export const INTEREST_DECAY_RATES: Record<string, number> = {
  permanent: 0.001,    // ~693 days half-life (evergreen: tech, cooking)
  stable: 0.005,       // ~139 days half-life (hobbies: gaming, fitness)
  temporary: 0.05,     // ~14 days half-life (trends, events)
  seasonal: 0.02,      // ~35 days half-life (holidays, sports seasons)
  latent: 0.01,        // ~69 days half-life (discovered but not active)
};

export function computeInterestDecay(
  rawScore: number,
  lastEngagementMs: number,
  nowMs: number,
  decayRate: number
): number {
  const daysSinceEngagement = (nowMs - lastEngagementMs) / (1000 * 60 * 60 * 24);
  return rawScore * Math.exp(-decayRate * daysSinceEngagement);
}

// ─────────────────────────────────────────────
// Interest Growth Detection
// ─────────────────────────────────────────────
// Detects if user's interest in a topic is rising
// G(t) = (I(t) - I(t-w)) / I(t-w) where w = window

export function detectInterestTrend(
  currentScore: number,
  historicalScores: number[], // last 7 days
): 'rising' | 'stable' | 'declining' | 'dormant' {
  if (historicalScores.length < 3) return 'stable';
  
  const avgPast = historicalScores.slice(0, -1).reduce((a, b) => a + b, 0) / (historicalScores.length - 1);
  const growthRate = avgPast > 0.01 ? (currentScore - avgPast) / avgPast : 0;
  
  if (currentScore < 0.05) return 'dormant';
  if (growthRate > 0.2) return 'rising';
  if (growthRate < -0.2) return 'declining';
  return 'stable';
}

// ─────────────────────────────────────────────
// Multi-Interest Embedding
// ─────────────────────────────────────────────
// U_emb = Σᵢ wᵢ · normalize(Tᵢ_emb)
// where wᵢ = softmax(interest_scores)

export function computeUserEmbedding(
  topicEmbeddings: Map<string, Float32Array>, // topic → 512-dim
  interestScores: Map<string, number>,
  embeddingDim: number = 512
): Float32Array {
  const result = new Float32Array(embeddingDim);
  
  // Softmax over interest scores
  const scores = Array.from(interestScores.values());
  const maxScore = Math.max(...scores, 0.001);
  const expScores = scores.map(s => Math.exp((s - maxScore) * 5)); // temperature=0.2
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  const weights = expScores.map(e => e / sumExp);
  
  let i = 0;
  for (const [topic, _score] of interestScores) {
    const embedding = topicEmbeddings.get(topic);
    if (!embedding) { i++; continue; }
    
    const weight = weights[i];
    for (let d = 0; d < embeddingDim; d++) {
      result[d] += weight * embedding[d];
    }
    i++;
  }
  
  // L2 normalize
  const norm = Math.sqrt(result.reduce((a, b) => a + b * b, 0));
  if (norm > 0) {
    for (let d = 0; d < embeddingDim; d++) {
      result[d] /= norm;
    }
  }
  
  return result;
}

// ─────────────────────────────────────────────
// Hidden Interest Discovery
// ─────────────────────────────────────────────
// Uses collaborative filtering signals
// H_score(u, t) = Σⱼ sim(u, uⱼ) · I(uⱼ, t) · confidence(uⱼ, t)

export interface HiddenInterestCandidate {
  topic: string;
  predictedScore: number;
  confidence: number;
  sourceUsers: number;     // how many similar users have this interest
  correlatedWith: string[]; // user's existing interests that correlate
}

export function discoverHiddenInterests(
  _userId: string,
  similarUsers: { userId: string; similarity: number; interests: Map<string, number> }[],
  userInterests: Map<string, number>,
  minSimilarity: number = 0.3,
  minSourceUsers: number = 5
): HiddenInterestCandidate[] {
  const candidates = new Map<string, { sum: number; count: number; sources: number }>();
  
  for (const { similarity, interests } of similarUsers) {
    if (similarity < minSimilarity) continue;
    
    for (const [topic, score] of interests) {
      // Skip if user already has this interest
      if (userInterests.has(topic) && (userInterests.get(topic) ?? 0) > 0.1) continue;
      
      const existing = candidates.get(topic) || { sum: 0, count: 0, sources: 0 };
      existing.sum += similarity * score;
      existing.count += similarity;
      existing.sources++;
      candidates.set(topic, existing);
    }
  }
  
  const results: HiddenInterestCandidate[] = [];
  for (const [topic, { sum, count, sources }] of candidates) {
    if (sources < minSourceUsers) continue;
    
    results.push({
      topic,
      predictedScore: sum / count,
      confidence: Math.min(1, sources / 20), // confidence increases with more sources
      sourceUsers: sources,
      correlatedWith: [], // would be filled by topic correlation analysis
    });
  }
  
  return results.sort((a, b) => b.predictedScore * b.confidence - a.predictedScore * a.confidence);
}

// ─────────────────────────────────────────────
// Seasonal Interest Prediction
// ─────────────────────────────────────────────
// S(t, topic) = base_score × (1 + amplitude × sin(2π(t - phase)/period))

export interface SeasonalPattern {
  topic: string;
  period: number;          // days (365 for yearly, 7 for weekly)
  phase: number;           // days offset
  amplitude: number;       // strength of seasonality [0, 1]
  baseScore: number;
}

export function computeSeasonalScore(
  pattern: SeasonalPattern,
  dayOfYear: number
): number {
  const { period, phase, amplitude, baseScore } = pattern;
  const cyclicFactor = 1 + amplitude * Math.sin(2 * Math.PI * (dayOfYear - phase) / period);
  return baseScore * cyclicFactor;
}

// ─────────────────────────────────────────────
// User Lifetime Value Prediction
// ─────────────────────────────────────────────
// LTV = Σₜ γᵗ × E[engagement(t)] × monetization_factor
// γ = discount rate

export function predictUserLTV(
  profile: UserBehaviorProfile,
  daysToProject: number = 365,
  discountRate: number = 0.995
): number {
  const dailyEngagementValue = 
    profile.avgDailySessions * profile.avgSessionDuration / 60 * // minutes per day
    (1 + profile.likeRate + profile.shareRate * 2 + profile.commentRate * 1.5) * // engagement multiplier
    0.001; // base monetization factor
  
  let ltv = 0;
  let retention = profile.retentionProbability;
  
  for (let t = 0; t < daysToProject; t++) {
    ltv += Math.pow(discountRate, t) * dailyEngagementValue * retention;
    retention *= 0.999; // slight decay in retention probability
  }
  
  return ltv;
}

// ─────────────────────────────────────────────
// Return Probability Models
// ─────────────────────────────────────────────

export interface RetentionPrediction {
  nextDay: number;      // P(return tomorrow)
  day7: number;         // P(return within 7 days)
  day30: number;        // P(return within 30 days)
  churnRisk: number;    // P(churn within 30 days)
}

// P(return_t+1) = σ(w·x) where x = [session_features, satisfaction, recency, frequency]
export function predictRetention(
  lastSessionHoursAgo: number,
  avgDailySessions: number,
  satisfactionScore: number,
  consecutiveActiveDays: number,
  totalLifetimeDays: number
): RetentionPrediction {
  // Features
  const recencyFactor = Math.exp(-0.05 * lastSessionHoursAgo);
  const frequencyFactor = Math.min(1, avgDailySessions / 3);
  const satisfactionFactor = satisfactionScore;
  const loyaltyFactor = Math.min(1, consecutiveActiveDays / 30);
  const maturityFactor = Math.min(1, totalLifetimeDays / 90);
  
  // Weighted combination (simulating learned weights)
  const baseScore = 
    0.25 * recencyFactor +
    0.20 * frequencyFactor +
    0.25 * satisfactionFactor +
    0.15 * loyaltyFactor +
    0.15 * maturityFactor;
  
  // Apply sigmoid with different scaling for each window
  const sigmoid = (x: number, k: number, x0: number) => 1 / (1 + Math.exp(-k * (x - x0)));
  
  return {
    nextDay: sigmoid(baseScore, 8, 0.4),
    day7: sigmoid(baseScore, 6, 0.3),
    day30: sigmoid(baseScore, 4, 0.2),
    churnRisk: 1 - sigmoid(baseScore, 5, 0.35),
  };
}
