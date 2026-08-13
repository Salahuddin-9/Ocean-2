// ============================================================
// DATABASE & EVENT TRACKING SCHEMAS
// Production-Ready Data Models
// ============================================================

// ─────────────────────────────────────────────
// Core Entity Schemas
// ─────────────────────────────────────────────

export interface UserSchema {
  // Primary key
  user_id: string;
  
  // Account info
  username: string;
  email: string;
  phone_number: string | null;
  created_at: number;
  updated_at: number;
  
  // Demographics
  language: string;
  country: string;
  region: string | null;
  timezone: string;
  birth_year: number | null;
  gender: 'male' | 'female' | 'other' | 'unspecified';
  
  // Verification
  email_verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  verification_level: number;
  
  // Status
  account_status: 'active' | 'suspended' | 'deleted' | 'deactivated';
  trust_score: number;
  trust_tier: string;
  
  // Computed
  follower_count: number;
  following_count: number;
  post_count: number;
  lifetime_value: number;
}

export interface ContentSchema {
  // Primary key
  content_id: string;
  
  // Relationships
  creator_id: string;
  
  // Content info
  content_type: 'video' | 'image' | 'carousel' | 'story' | 'reel';
  title: string | null;
  description: string | null;
  hashtags: string[];
  mentions: string[];
  
  // Media
  media_url: string;
  thumbnail_url: string;
  duration_seconds: number | null;
  aspect_ratio: number;
  
  // Metadata
  language: string;
  country: string;
  category: string;
  subcategory: string | null;
  
  // Quality scores
  quality_score: number;
  hook_score: number;
  originality_score: number;
  
  // Safety
  is_safe: boolean;
  safety_score: number;
  content_warning: string | null;
  
  // Status
  status: 'processing' | 'active' | 'removed' | 'archived';
  visibility: 'public' | 'private' | 'followers_only';
  
  // Timestamps
  created_at: number;
  published_at: number | null;
  updated_at: number;
  
  // Embedding (stored separately, reference only)
  embedding_version: string;
}

export interface CreatorSchema {
  // Primary key (same as user_id)
  creator_id: string;
  
  // Creator-specific metrics
  total_views: number;
  total_likes: number;
  total_shares: number;
  total_comments: number;
  total_saves: number;
  
  // Quality metrics
  creator_quality_score: number;
  consistency_score: number;
  audience_satisfaction_score: number;
  
  // Performance
  avg_views_per_post: number;
  avg_engagement_rate: number;
  avg_completion_rate: number;
  viral_post_count: number;
  
  // Trust
  creator_trust_score: number;
  violation_count: number;
  strike_count: number;
  
  // Monetization
  is_monetized: boolean;
  monetization_tier: string | null;
  
  // Distribution
  distribution_tier: string;
  reach_multiplier: number;
  
  // Timestamps
  became_creator_at: number;
  last_post_at: number | null;
}

// ─────────────────────────────────────────────
// Engagement Schemas
// ─────────────────────────────────────────────

export interface ViewEventSchema {
  // Event ID
  event_id: string;
  
  // References
  user_id: string;
  content_id: string;
  creator_id: string;
  session_id: string;
  
  // View metrics
  watch_duration_ms: number;
  video_duration_ms: number;
  watch_ratio: number;
  completion_percentage: number;
  
  // Rewatch
  is_rewatch: boolean;
  rewatch_count: number;
  
  // Context
  feed_type: string;
  feed_position: number;
  source: string;
  
  // Device
  device_type: string;
  device_model: string;
  os_version: string;
  app_version: string;
  
  // Network
  connection_type: string;
  
  // Timestamps
  started_at: number;
  ended_at: number;
  
  // Quality
  playback_quality: string;
  buffering_time_ms: number;
  
  // Partitioning
  event_date: string;  // YYYY-MM-DD for partitioning
}

export interface EngagementEventSchema {
  // Event ID
  event_id: string;
  
  // References
  user_id: string;
  content_id: string;
  creator_id: string;
  session_id: string;
  
  // Engagement type
  engagement_type: 'like' | 'unlike' | 'share' | 'comment' | 'save' | 'unsave' | 'follow' | 'unfollow' | 'profile_visit';
  
  // Engagement-specific data
  comment_id: string | null;
  comment_text: string | null;
  share_destination: string | null;
  
  // Context
  feed_type: string;
  feed_position: number;
  time_since_view_ms: number;
  
  // Device
  device_type: string;
  platform: string;
  
  // Timestamp
  timestamp: number;
  event_date: string;
}

export interface FeedbackEventSchema {
  // Event ID
  event_id: string;
  
  // References
  user_id: string;
  content_id: string;
  creator_id: string;
  
  // Feedback type
  feedback_type: 'not_interested' | 'see_less' | 'hide' | 'report' | 'mute_creator' | 'block_creator';
  
  // Reason (if provided)
  reason_category: string | null;
  reason_text: string | null;
  
  // Context
  feed_type: string;
  feed_position: number;
  watch_ratio_before_feedback: number;
  
  // Timestamp
  timestamp: number;
  event_date: string;
}

// ─────────────────────────────────────────────
// Session Schemas
// ─────────────────────────────────────────────

export interface SessionSchema {
  // Session ID
  session_id: string;
  
  // User
  user_id: string;
  
  // Session metrics
  start_time: number;
  end_time: number | null;
  duration_seconds: number;
  
  // Content consumption
  content_viewed: number;
  content_engaged: number;
  total_watch_time_seconds: number;
  
  // Engagement
  likes_count: number;
  shares_count: number;
  comments_count: number;
  saves_count: number;
  follows_count: number;
  
  // Quality
  avg_watch_ratio: number;
  completion_rate: number;
  
  // Exit signals
  exit_content_id: string | null;
  exit_reason: string | null;
  
  // Device
  device_type: string;
  platform: string;
  app_version: string;
  
  // Network
  connection_type: string;
  
  // Location (approximate)
  country: string;
  region: string | null;
  
  // Date partition
  session_date: string;
}

// ─────────────────────────────────────────────
// Aggregation Schemas (Materialized Views)
// ─────────────────────────────────────────────

export interface ContentStatsHourlySchema {
  // Primary key
  content_id: string;
  hour_timestamp: number;
  
  // Counts
  view_count: number;
  unique_viewer_count: number;
  like_count: number;
  share_count: number;
  comment_count: number;
  save_count: number;
  
  // Watch metrics
  total_watch_time_seconds: number;
  avg_watch_ratio: number;
  completion_count: number;
  completion_rate: number;
  
  // Velocity
  view_velocity: number;
  engagement_velocity: number;
  
  // Feedback
  not_interested_count: number;
  report_count: number;
}

export interface UserInterestSchema {
  // Primary key
  user_id: string;
  topic: string;
  
  // Interest score
  score: number;
  raw_score: number;
  confidence: number;
  
  // Engagement stats
  engagement_count: number;
  last_engagement_at: number;
  first_engagement_at: number;
  
  // Classification
  interest_type: 'permanent' | 'temporary' | 'seasonal' | 'latent';
  trend: 'rising' | 'stable' | 'declining' | 'dormant';
  
  // Timestamps
  updated_at: number;
}

export interface FollowRelationSchema {
  // Composite key
  follower_id: string;
  following_id: string;
  
  // Relationship
  followed_at: number;
  unfollowed_at: number | null;
  is_active: boolean;
  
  // Engagement
  engagement_count: number;
  last_engagement_at: number | null;
  
  // Notifications
  notifications_enabled: boolean;
}

// ─────────────────────────────────────────────
// ML Feature Store Schemas
// ─────────────────────────────────────────────

export interface UserFeatureStoreSchema {
  // Primary key
  user_id: string;
  feature_timestamp: number;
  
  // Session features (rolling 7d)
  session_count_7d: number;
  total_watch_time_7d: number;
  avg_session_duration_7d: number;
  avg_engagement_rate_7d: number;
  
  // Engagement features (rolling 7d)
  like_count_7d: number;
  share_count_7d: number;
  comment_count_7d: number;
  save_count_7d: number;
  follow_count_7d: number;
  
  // Consumption features
  content_viewed_7d: number;
  categories_viewed_7d: string[];
  creators_viewed_7d: number;
  
  // Satisfaction features
  satisfaction_score: number;
  completion_rate_7d: number;
  avg_watch_ratio_7d: number;
  
  // Retention features
  days_active_7d: number;
  days_active_30d: number;
  return_probability: number;
  
  // Embedding (stored as bytes)
  interest_embedding: number[];
}

export interface ContentFeatureStoreSchema {
  // Primary key
  content_id: string;
  feature_timestamp: number;
  
  // Static features
  duration_seconds: number;
  category: string;
  language: string;
  creator_id: string;
  
  // Quality features
  quality_score: number;
  hook_score: number;
  originality_score: number;
  
  // Rolling engagement (1h window)
  views_1h: number;
  likes_1h: number;
  shares_1h: number;
  completion_rate_1h: number;
  
  // Rolling engagement (24h window)
  views_24h: number;
  likes_24h: number;
  shares_24h: number;
  completion_rate_24h: number;
  
  // Velocity features
  view_velocity: number;
  engagement_velocity: number;
  view_acceleration: number;
  
  // Trending features
  trending_score: number;
  viral_potential: number;
  percentile_rank: number;
  
  // Embedding (stored as bytes)
  content_embedding: number[];
}

// ─────────────────────────────────────────────
// Ranking Log Schema (for training)
// ─────────────────────────────────────────────

export interface RankingLogSchema {
  // Request ID
  request_id: string;
  
  // User
  user_id: string;
  session_id: string;
  
  // Request context
  feed_type: string;
  request_timestamp: number;
  device_type: string;
  
  // Candidate info
  content_id: string;
  creator_id: string;
  candidate_source: string;
  
  // Predictions (at ranking time)
  predicted_like_prob: number;
  predicted_share_prob: number;
  predicted_watch_time: number;
  predicted_satisfaction: number;
  
  // Scores
  engagement_score: number;
  watch_time_score: number;
  freshness_score: number;
  trending_score: number;
  final_score: number;
  
  // Ranking result
  rank_position: number;
  was_shown: boolean;
  
  // Outcome (filled in later)
  actual_watched: boolean | null;
  actual_watch_ratio: number | null;
  actual_liked: boolean | null;
  actual_shared: boolean | null;
  actual_saved: boolean | null;
  
  // Labels for training
  label_engaged: boolean | null;
  label_satisfied: boolean | null;
  
  // Date partition
  log_date: string;
}

// ─────────────────────────────────────────────
// Boost/Ad Campaign Schemas
// ─────────────────────────────────────────────

export interface CampaignSchema {
  // Primary key
  campaign_id: string;
  
  // Advertiser
  advertiser_id: string;
  
  // Content
  content_id: string;
  
  // Budget
  total_budget: number;
  daily_budget: number;
  spent: number;
  
  // Bidding
  bid_strategy: string;
  bid_amount: number;
  
  // Targeting (JSON)
  targeting_config: string;
  
  // Quality
  quality_score: number;
  relevance_score: number;
  
  // Performance
  impressions: number;
  clicks: number;
  conversions: number;
  
  // Status
  status: string;
  start_time: number;
  end_time: number;
  
  // Timestamps
  created_at: number;
  updated_at: number;
}

export interface ImpressionLogSchema {
  // Event ID
  impression_id: string;
  
  // References
  campaign_id: string;
  content_id: string;
  user_id: string;
  session_id: string;
  
  // Auction
  auction_rank: number;
  effective_bid: number;
  actual_cost: number;
  
  // Quality
  relevance_score: number;
  predicted_engagement: number;
  
  // Context
  feed_position: number;
  device_type: string;
  
  // Outcome
  clicked: boolean;
  engaged: boolean;
  converted: boolean;
  
  // Timestamp
  timestamp: number;
  log_date: string;
}

// ─────────────────────────────────────────────
// Scaling: Partitioning & Indexing Strategy
// ─────────────────────────────────────────────

export const PARTITIONING_STRATEGY = {
  // Time-based partitioning for event tables
  events: {
    partitionKey: 'event_date',
    partitionType: 'daily',
    retentionDays: 90,
  },
  
  // Hash partitioning for user tables
  users: {
    partitionKey: 'user_id',
    partitionCount: 256,
    shardingStrategy: 'consistent_hash',
  },
  
  // Composite partitioning for content
  content: {
    primaryPartition: 'created_date',
    secondaryPartition: 'category',
    retentionDays: 365,
  },
  
  // Feature store
  features: {
    partitionKey: 'feature_timestamp',
    partitionType: 'hourly',
    retentionHours: 168, // 7 days
  },
};

export const INDEXING_STRATEGY = {
  users: ['user_id', 'country', 'created_at', 'trust_tier'],
  content: ['content_id', 'creator_id', 'category', 'published_at', 'status'],
  views: ['content_id', 'user_id', 'started_at'],
  engagements: ['content_id', 'user_id', 'engagement_type', 'timestamp'],
  sessions: ['user_id', 'start_time'],
  campaigns: ['advertiser_id', 'status', 'start_time'],
};
