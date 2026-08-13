// ============================================================
// ONLINE LEARNING SYSTEM
// Real-Time Model Updates, Streaming Features, Continuous Learning
// ============================================================

// ─────────────────────────────────────────────
// Event Streaming Architecture
// ─────────────────────────────────────────────

export interface StreamingEvent {
  eventId: string;
  eventType: EventType;
  timestamp: number;
  userId: string;
  contentId: string;
  creatorId: string;
  sessionId: string;
  payload: EventPayload;
  context: EventContext;
}

export type EventType = 
  | 'impression'
  | 'view_start'
  | 'view_progress'
  | 'view_complete'
  | 'like'
  | 'unlike'
  | 'share'
  | 'comment'
  | 'save'
  | 'unsave'
  | 'follow'
  | 'unfollow'
  | 'profile_visit'
  | 'not_interested'
  | 'report'
  | 'hide'
  | 'session_start'
  | 'session_end';

export interface EventPayload {
  // View events
  watchDurationMs?: number;
  watchRatio?: number;
  rewatchCount?: number;
  
  // Engagement events
  engagementType?: string;
  commentText?: string;
  shareDestination?: string;
  
  // Feedback events
  feedbackReason?: string;
  reportCategory?: string;
}

export interface EventContext {
  deviceType: 'mobile' | 'tablet' | 'desktop';
  platform: 'ios' | 'android' | 'web';
  appVersion: string;
  connectionType: 'wifi' | 'cellular' | 'unknown';
  feedPosition: number;
  feedType: 'home' | 'explore' | 'search' | 'profile' | 'hashtag';
  experimentIds: string[];
  locale: string;
  timezone: string;
}

// ─────────────────────────────────────────────
// Feature Store Architecture
// ─────────────────────────────────────────────

export interface FeatureStore {
  // User features (updated on every session)
  userFeatures: Map<string, UserFeatureVector>;
  
  // Content features (updated on engagement)
  contentFeatures: Map<string, ContentFeatureVector>;
  
  // Real-time aggregates (sliding windows)
  realtimeAggregates: Map<string, RealtimeAggregate>;
  
  // Cross-features (user-content interactions)
  crossFeatures: Map<string, CrossFeatureVector>;
}

export interface UserFeatureVector {
  userId: string;
  lastUpdated: number;
  
  // Static features
  accountAgeDays: number;
  verificationLevel: number;
  
  // Rolling aggregates
  avgSessionDuration7d: number;
  avgEngagementRate7d: number;
  avgWatchRatio7d: number;
  totalSessions7d: number;
  
  // Interest embedding (updated incrementally)
  interestEmbedding: Float32Array;
  
  // Behavioral features
  preferredCategories: string[];
  activeHours: number[];
  devicePreference: string;
}

export interface ContentFeatureVector {
  contentId: string;
  lastUpdated: number;
  
  // Static features (from upload)
  duration: number;
  category: string;
  language: string;
  creatorId: string;
  uploadTime: number;
  
  // Content embedding
  contentEmbedding: Float32Array;
  
  // Rolling engagement metrics
  views1h: number;
  views24h: number;
  likes1h: number;
  likes24h: number;
  shares1h: number;
  shares24h: number;
  completionRate1h: number;
  completionRate24h: number;
  
  // Velocity features
  viewVelocity: number;
  engagementVelocity: number;
  accelerating: boolean;
}

export interface RealtimeAggregate {
  key: string;  // e.g., "content:12345:views:1h"
  value: number;
  windowStart: number;
  windowEnd: number;
  count: number;
}

export interface CrossFeatureVector {
  userId: string;
  contentId: string;
  
  // User-content affinity
  creatorFollowed: boolean;
  previousCreatorEngagements: number;
  categoryAffinity: number;
  
  // Freshness for this user
  hoursSinceLastSeen: number;
  timesSeenBefore: number;
}

// ─────────────────────────────────────────────
// Incremental Model Updates
// ─────────────────────────────────────────────

export interface ModelUpdate {
  modelId: string;
  updateType: 'gradient' | 'weight' | 'embedding';
  timestamp: number;
  
  // For gradient updates
  gradients?: Map<string, number>;
  learningRate?: number;
  
  // For embedding updates
  embeddingId?: string;
  embeddingDelta?: Float32Array;
}

// Online gradient descent update
// θ_new = θ_old - η × ∇L
export function applyGradientUpdate(
  currentWeights: Map<string, number>,
  gradients: Map<string, number>,
  learningRate: number
): Map<string, number> {
  const newWeights = new Map(currentWeights);
  
  for (const [key, gradient] of gradients) {
    const current = currentWeights.get(key) || 0;
    newWeights.set(key, current - learningRate * gradient);
  }
  
  return newWeights;
}

// Incremental embedding update with momentum
// v = β × v_prev + (1-β) × ∇
// emb_new = emb_old - η × v
export function updateEmbeddingWithMomentum(
  embedding: Float32Array,
  gradient: Float32Array,
  momentum: Float32Array,
  learningRate: number,
  beta: number = 0.9
): { embedding: Float32Array; momentum: Float32Array } {
  const newEmbedding = new Float32Array(embedding.length);
  const newMomentum = new Float32Array(momentum.length);
  
  for (let i = 0; i < embedding.length; i++) {
    newMomentum[i] = beta * momentum[i] + (1 - beta) * gradient[i];
    newEmbedding[i] = embedding[i] - learningRate * newMomentum[i];
  }
  
  return { embedding: newEmbedding, momentum: newMomentum };
}

// ─────────────────────────────────────────────
// Feedback Loop Processing
// ─────────────────────────────────────────────

export interface FeedbackSignal {
  contentId: string;
  userId: string;
  timestamp: number;
  
  // What we predicted
  predictedEngagement: number;
  predictedWatchTime: number;
  predictedSatisfaction: number;
  
  // What actually happened
  actualEngaged: boolean;
  actualWatchRatio: number;
  actualSessionContinued: boolean;
  
  // For model training
  predictionError: number;
  lossValue: number;
}

export function computeFeedbackSignal(
  predictions: {
    engagement: number;
    watchTime: number;
    satisfaction: number;
  },
  actuals: {
    engaged: boolean;
    watchRatio: number;
    sessionContinued: boolean;
  }
): FeedbackSignal {
  // Compute prediction errors
  const engagementError = (actuals.engaged ? 1 : 0) - predictions.engagement;
  const watchTimeError = actuals.watchRatio - predictions.watchTime;
  const satisfactionProxy = actuals.sessionContinued ? 0.8 : 0.3;
  const satisfactionError = satisfactionProxy - predictions.satisfaction;
  
  // Overall loss (MSE)
  const lossValue = (
    Math.pow(engagementError, 2) +
    Math.pow(watchTimeError, 2) +
    Math.pow(satisfactionError, 2)
  ) / 3;
  
  return {
    contentId: '',
    userId: '',
    timestamp: Date.now(),
    predictedEngagement: predictions.engagement,
    predictedWatchTime: predictions.watchTime,
    predictedSatisfaction: predictions.satisfaction,
    actualEngaged: actuals.engaged,
    actualWatchRatio: actuals.watchRatio,
    actualSessionContinued: actuals.sessionContinued,
    predictionError: Math.sqrt(lossValue),
    lossValue,
  };
}

// ─────────────────────────────────────────────
// Interest Graph Update
// ─────────────────────────────────────────────
// Incremental update to user interest scores based on engagement

export interface InterestUpdate {
  topic: string;
  delta: number;
  decayFactor: number;
  confidence: number;
}

export function computeInterestUpdate(
  currentScore: number,
  engagementStrength: number,  // 0-1 based on action type
  isPositive: boolean,
  learningRate: number = 0.1
): InterestUpdate {
  // Delta based on engagement
  const direction = isPositive ? 1 : -1;
  const delta = direction * engagementStrength * learningRate;
  
  // Decay factor (interests decay if not reinforced)
  const decayFactor = 0.99; // 1% decay per update cycle
  
  // Confidence increases with more interactions
  const confidence = Math.min(1, currentScore + 0.05);
  
  return {
    topic: '',
    delta,
    decayFactor,
    confidence,
  };
}

// ─────────────────────────────────────────────
// Model Serving Architecture
// ─────────────────────────────────────────────

export interface ModelServingConfig {
  modelId: string;
  version: string;
  
  // Serving parameters
  batchSize: number;
  maxLatencyMs: number;
  
  // Update parameters
  updateFrequency: 'realtime' | 'hourly' | 'daily';
  minSamplesBeforeUpdate: number;
  
  // A/B testing
  trafficAllocation: number;  // % of traffic
  experimentId: string;
}

export interface ServingMetrics {
  modelId: string;
  timestamp: number;
  
  // Performance
  avgLatencyMs: number;
  p99LatencyMs: number;
  throughputQps: number;
  
  // Quality
  avgPredictionError: number;
  avgAucRoc: number;
  avgNdcg: number;
  
  // Health
  errorRate: number;
  cacheHitRate: number;
}

// ─────────────────────────────────────────────
// Training Pipeline Configuration
// ─────────────────────────────────────────────

export interface TrainingPipeline {
  pipelineId: string;
  
  // Data sources
  dataSources: DataSource[];
  
  // Feature engineering
  featureTransforms: FeatureTransform[];
  
  // Model configuration
  modelConfig: ModelConfig;
  
  // Training schedule
  schedule: TrainingSchedule;
  
  // Validation
  validationConfig: ValidationConfig;
}

export interface DataSource {
  sourceType: 'kafka' | 'bigquery' | 'feature_store' | 'logs';
  sourcePath: string;
  schema: Record<string, string>;
  samplingRate: number;
  lookbackDays: number;
}

export interface FeatureTransform {
  name: string;
  inputFeatures: string[];
  outputFeature: string;
  transformType: 'normalize' | 'bucketize' | 'embed' | 'cross' | 'hash';
  parameters: Record<string, unknown>;
}

export interface ModelConfig {
  architecture: 'dnn' | 'dcn' | 'transformer' | 'two_tower';
  layers: number[];
  activations: string[];
  embedDimension: number;
  dropoutRate: number;
  l2Regularization: number;
}

export interface TrainingSchedule {
  frequency: 'continuous' | 'hourly' | 'daily' | 'weekly';
  batchSize: number;
  epochs: number;
  warmStartFromPrevious: boolean;
}

export interface ValidationConfig {
  holdoutRatio: number;
  metrics: string[];
  minThresholds: Record<string, number>;
  comparisonBaseline: 'previous_version' | 'production' | 'fixed';
}

// ─────────────────────────────────────────────
// A/B Testing Framework
// ─────────────────────────────────────────────

export interface Experiment {
  experimentId: string;
  name: string;
  
  // Variants
  control: ExperimentVariant;
  treatments: ExperimentVariant[];
  
  // Allocation
  trafficAllocation: number;  // % of total traffic
  hashSalt: string;
  
  // Duration
  startTime: number;
  endTime: number;
  
  // Metrics
  primaryMetric: string;
  secondaryMetrics: string[];
  guardrailMetrics: string[];
  
  // Status
  status: 'draft' | 'running' | 'paused' | 'completed' | 'stopped';
  winningVariant?: string;
}

export interface ExperimentVariant {
  variantId: string;
  name: string;
  trafficRatio: number;  // within experiment
  modelId: string;
  parameters: Record<string, unknown>;
}

export function assignUserToVariant(
  userId: string,
  experiment: Experiment
): ExperimentVariant | null {
  // Consistent hashing for user assignment
  const hash = hashString(userId + experiment.hashSalt);
  const bucket = hash % 100;
  
  // Check if user is in experiment
  if (bucket >= experiment.trafficAllocation) {
    return null;  // not in experiment
  }
  
  // Assign to variant based on traffic ratios
  const variantBucket = hash % 1000 / 10;
  let cumulative = 0;
  
  // Check control first
  cumulative += experiment.control.trafficRatio * 100;
  if (variantBucket < cumulative) {
    return experiment.control;
  }
  
  // Check treatments
  for (const treatment of experiment.treatments) {
    cumulative += treatment.trafficRatio * 100;
    if (variantBucket < cumulative) {
      return treatment;
    }
  }
  
  return experiment.control;  // fallback
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
