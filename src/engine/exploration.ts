// ============================================================
// EXPLORATION VS EXPLOITATION ENGINE
// Thompson Sampling, Multi-Armed Bandits, Contextual Bandits
// ============================================================

import { clamp } from './math';

// ─────────────────────────────────────────────
// Exploration-Exploitation Balance
// ─────────────────────────────────────────────
// Target: 80% Known Interests, 20% Discovery
// Discovery: 10% Similar, 5% Trending, 5% Pure Exploration

export interface ExplorationConfig {
  exploitationRatio: number;      // 0.80 - known interests
  similarExplorationRatio: number; // 0.10 - similar to interests
  trendingExplorationRatio: number; // 0.05 - trending content
  pureExplorationRatio: number;   // 0.05 - random exploration
  
  // Thompson Sampling parameters
  priorAlpha: number;             // Beta prior α (successes + 1)
  priorBeta: number;              // Beta prior β (failures + 1)
  
  // Exploration decay
  explorationDecayRate: number;   // reduce exploration for engaged users
  newUserExplorationBoost: number; // increase for new users
}

export const DEFAULT_EXPLORATION_CONFIG: ExplorationConfig = {
  exploitationRatio: 0.80,
  similarExplorationRatio: 0.10,
  trendingExplorationRatio: 0.05,
  pureExplorationRatio: 0.05,
  priorAlpha: 1,
  priorBeta: 1,
  explorationDecayRate: 0.01,
  newUserExplorationBoost: 1.5,
};

// ─────────────────────────────────────────────
// Multi-Armed Bandit for Content Selection
// ─────────────────────────────────────────────
// Each "arm" is a content category or topic
// Reward = engagement (like, share, complete, etc.)

export interface BanditArm {
  armId: string;                  // category/topic ID
  name: string;
  successes: number;              // engagement count
  trials: number;                 // impression count
  lastUpdated: number;
}

export interface BanditState {
  arms: Map<string, BanditArm>;
  totalTrials: number;
  lastDecay: number;
}

// Thompson Sampling: Sample from Beta(α + successes, β + failures)
export function thompsonSample(arm: BanditArm, config: ExplorationConfig): number {
  const alpha = config.priorAlpha + arm.successes;
  const beta = config.priorBeta + (arm.trials - arm.successes);
  
  // Beta distribution sampling using gamma functions
  // X ~ Gamma(α, 1), Y ~ Gamma(β, 1), then X/(X+Y) ~ Beta(α, β)
  const x = gammaRandom(alpha, 1);
  const y = gammaRandom(beta, 1);
  
  return x / (x + y);
}

// Gamma distribution sampling (shape-scale parameterization)
function gammaRandom(shape: number, scale: number): number {
  // Marsaglia and Tsang's method
  if (shape < 1) {
    return gammaRandom(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
  }
  
  const d = shape - 1/3;
  const c = 1 / Math.sqrt(9 * d);
  
  while (true) {
    let x: number;
    let v: number;
    
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    
    v = v * v * v;
    const u = Math.random();
    
    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale;
    }
    
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

// Standard normal random using Box-Muller
function normalRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Select arm using Thompson Sampling
export function selectArmThompson(
  state: BanditState,
  config: ExplorationConfig,
  excludeArms: Set<string> = new Set()
): BanditArm | null {
  let bestArm: BanditArm | null = null;
  let bestSample = -1;
  
  for (const [armId, arm] of state.arms) {
    if (excludeArms.has(armId)) continue;
    
    const sample = thompsonSample(arm, config);
    if (sample > bestSample) {
      bestSample = sample;
      bestArm = arm;
    }
  }
  
  return bestArm;
}

// UCB1 (Upper Confidence Bound) alternative
export function ucb1Score(arm: BanditArm, totalTrials: number): number {
  if (arm.trials === 0) return Infinity; // explore unvisited arms
  
  const avgReward = arm.successes / arm.trials;
  const exploration = Math.sqrt(2 * Math.log(totalTrials) / arm.trials);
  
  return avgReward + exploration;
}

// ─────────────────────────────────────────────
// Contextual Bandit for Personalized Exploration
// ─────────────────────────────────────────────
// Context: user features, time, session state
// Action: which category/topic to show
// Reward: engagement signal

export interface ContextFeatures {
  userId: string;
  
  // User context
  userEmbedding: Float32Array;
  sessionPosition: number;
  sessionDuration: number;
  timeOfDay: number;              // 0-23
  dayOfWeek: number;              // 0-6
  recentEngagementRate: number;
  
  // Historical
  categoryHistory: Map<string, number>;  // category → engagement rate
  explorationHistory: number;            // how often user engages with new content
}

export interface ContextualBanditModel {
  // Linear model: reward = θᵀx + ε
  weights: Map<string, Float32Array>;  // arm → weight vector
  biases: Map<string, number>;
  learningRate: number;
}

// Predict reward for context-arm pair
export function predictContextualReward(
  context: ContextFeatures,
  armId: string,
  model: ContextualBanditModel
): number {
  const weights = model.weights.get(armId);
  const bias = model.biases.get(armId) || 0;
  
  if (!weights) return 0.5; // default for unknown arm
  
  // Simple linear model: dot product + bias
  let score = bias;
  const contextVector = contextToVector(context);
  
  for (let i = 0; i < Math.min(weights.length, contextVector.length); i++) {
    score += weights[i] * contextVector[i];
  }
  
  return clamp(score, 0, 1);
}

function contextToVector(context: ContextFeatures): number[] {
  return [
    context.sessionPosition / 100,
    context.sessionDuration / 3600,
    context.timeOfDay / 24,
    context.dayOfWeek / 7,
    context.recentEngagementRate,
    context.explorationHistory,
    // Add user embedding components (first 10)
    ...(Array.from(context.userEmbedding.slice(0, 10)))
  ];
}

// ─────────────────────────────────────────────
// Exploration Allocation
// ─────────────────────────────────────────────
// Decides how many slots to allocate to each exploration type

export interface ExplorationAllocation {
  exploitation: number;           // slots for known interests
  similarExploration: number;     // slots for similar content
  trendingExploration: number;    // slots for trending
  pureExploration: number;        // slots for random
}

export function computeExplorationAllocation(
  feedSize: number,
  userMaturity: number,           // 0-1, how established the user is
  recentSatisfaction: number,     // 0-1, recent session satisfaction
  config: ExplorationConfig
): ExplorationAllocation {
  // Adjust exploration based on user maturity
  // New users get more exploration
  const maturityFactor = 1 - userMaturity * config.explorationDecayRate * 10;
  const adjustedExplorationRatio = (1 - config.exploitationRatio) * maturityFactor;
  
  // If user is satisfied, explore a bit more
  const satisfactionBonus = recentSatisfaction > 0.7 ? 0.05 : 0;
  
  const totalExploration = clamp(adjustedExplorationRatio + satisfactionBonus, 0.1, 0.4);
  const exploitation = 1 - totalExploration;
  
  // Split exploration budget
  const similar = totalExploration * 0.50;
  const trending = totalExploration * 0.25;
  const pure = totalExploration * 0.25;
  
  return {
    exploitation: Math.round(feedSize * exploitation),
    similarExploration: Math.round(feedSize * similar),
    trendingExploration: Math.round(feedSize * trending),
    pureExploration: Math.round(feedSize * pure),
  };
}

// ─────────────────────────────────────────────
// Interest Discovery via Exploration
// ─────────────────────────────────────────────

export interface DiscoveryCandidate {
  topicId: string;
  topicName: string;
  explorationScore: number;       // Thompson sample or UCB score
  expectedReward: number;         // predicted engagement
  userSimilarity: number;         // how similar to user's known interests
  trendingScore: number;          // is this topic trending
}

export function rankDiscoveryCandidates(
  candidates: DiscoveryCandidate[],
  explorationWeight: number = 0.3
): DiscoveryCandidate[] {
  // Combine exploration score with expected reward
  const scored = candidates.map(c => ({
    ...c,
    combinedScore: 
      (1 - explorationWeight) * c.expectedReward +
      explorationWeight * c.explorationScore +
      0.1 * c.trendingScore +
      0.1 * c.userSimilarity,
  }));
  
  return scored.sort((a, b) => b.combinedScore - a.combinedScore);
}

// ─────────────────────────────────────────────
// Reinforcement Learning Value Function
// ─────────────────────────────────────────────
// Q(s, a) = immediate_reward + γ × max_a' Q(s', a')
// Simplified for content recommendation

export interface RLState {
  userId: string;
  sessionEngagementRate: number;
  contentExposureCounts: Map<string, number>;
  lastReward: number;
  cumulativeReward: number;
  episodeStep: number;
}

export interface RLAction {
  contentId: string;
  category: string;
  isExploration: boolean;
}

export interface RLReward {
  immediate: number;              // engagement on this content
  satisfaction: number;           // predicted satisfaction
  retention: number;              // predicted return probability
  total: number;                  // weighted combination
}

export function computeRLReward(
  liked: boolean,
  shared: boolean,
  completed: boolean,
  sessionContinued: boolean,
  satisfactionDelta: number
): RLReward {
  const immediate = 
    (liked ? 0.2 : 0) +
    (shared ? 0.3 : 0) +
    (completed ? 0.3 : 0) +
    (sessionContinued ? 0.2 : 0);
  
  const satisfaction = clamp(0.5 + satisfactionDelta, 0, 1);
  const retention = sessionContinued ? 0.8 : 0.3;
  
  // Long-term weighted more heavily
  const total = 0.4 * immediate + 0.3 * satisfaction + 0.3 * retention;
  
  return { immediate, satisfaction, retention, total };
}

// Epsilon-greedy action selection
export function epsilonGreedySelect(
  actions: { action: RLAction; qValue: number }[],
  epsilon: number = 0.1
): RLAction {
  if (Math.random() < epsilon) {
    // Random exploration
    const idx = Math.floor(Math.random() * actions.length);
    return actions[idx].action;
  }
  
  // Greedy selection
  let best = actions[0];
  for (const a of actions) {
    if (a.qValue > best.qValue) {
      best = a;
    }
  }
  return best.action;
}
