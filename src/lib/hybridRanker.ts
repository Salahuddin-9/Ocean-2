/**
 * HybridRanker — adapter that feeds the app's loose post/reel objects into the
 * ported hybrid-engine ranking pipeline (src/engine/, from hybrid-engine(algo)).
 *
 * The ported engine is fully typed (UserProfile / PostCandidate /
 * UserPostInteraction), so this adapter maps the app's loose objects onto those
 * shapes and exposes a `rankItems(items, ctx, kind)` interface compatible with
 * the app's existing `turtleRankingEngine.rankItems` call sites.
 *
 * ── CONNECTED SIGNALS (from the client Turtle engine, persisted in localStorage) ──
 *   · Facebook Boost Post  -> boostedIds → PostCandidate.isBoosted + BoostConfig
 *                             → computeBoostMultiplier (up to 2.5×, quality-gated)
 *   · Facebook Interested / Not Interested -> feedback → computeFeedbackScore
 *                             (Not Interested carries the heavy β₋ = −3.0 penalty)
 *   · Personal engagement (like / save / comment / share / follow / watch-time)
 *                             -> UserPostInteraction used by the master formula
 *
 * The 50% Instagram / 25% YouTube / 25% TikTok blend is the engine config's
 * platformWeights (src/engine/config.ts) — engagement is weighted per-platform
 * via PLATFORM_ENGAGEMENT_MULTIPLIERS inside computeEngagementScore.
 */
import { computeScore } from '../engine/scoring';
import { DEFAULT_ENGINE_CONFIG } from '../engine/config';
import type { UserProfile, PostCandidate, UserPostInteraction, BoostConfig } from '../engine/types';
import { turtleRankingEngine } from '../turtleRankingEngine';
import type { ItemStats } from '../turtleRankingEngine';

export interface HybridRankContext {
  userId?: string;
  language?: string;
  country?: string;
  followingIds?: string[];
  savedIds?: string[];
  interests?: string[];                                    // explicit interests (fallback for topInterests)
  boostedIds?: string[];                                   // Facebook Boost Post ids
  feedback?: Record<string, 'interested' | 'not_interested'>;
  topInterests?: string[];                                 // learned keyword interests
  statsProvider?: (id: string) => Partial<ItemStats> | undefined; // per-item personal signals
}

interface LooseItem {
  id?: string;
  postId?: string;
  authorId?: string;
  creatorId?: string;
  userId?: string;
  language?: string;
  country?: string;
  category?: string;
  title?: string;
  caption?: string;
  text?: string;
  content?: string;
  videoLength?: number;
  createdAt?: number;
  createdTime?: number;
  timestamp?: number;
  date?: string;
  views?: number;
  viewsCount?: number;
  likes?: number;
  likedBy?: unknown[];
  likedByUsers?: unknown[];
  comments?: unknown[];
  commentsCount?: number;
  repostsCount?: number;
  sharesCount?: number;
  savesCount?: number;
  rewatchCount?: number;
  isBoosted?: boolean;
  boosted?: boolean;
  engagementPercentile?: number;
  creator?: { id?: string; name?: string; avatarUrl?: string; countryCode?: string };
  [key: string]: unknown;
}

/**
 * Build a full hybrid-ranking context from the client Turtle engine's persisted
 * state (boosted posts, interested/not-interested feedback, learned interests,
 * per-item personal engagement stats) plus the app-level user context.
 */
export function buildHybridContext(
  partial: Omit<HybridRankContext, 'boostedIds' | 'feedback' | 'statsProvider' | 'topInterests'> &
    Partial<Pick<HybridRankContext, 'boostedIds' | 'feedback' | 'topInterests'>> = {},
): HybridRankContext {
  return {
    ...partial,
    boostedIds: partial.boostedIds ?? turtleRankingEngine.getBoosted(),
    feedback: partial.feedback ?? turtleRankingEngine.getFeedback(),
    topInterests: partial.topInterests ?? partial.interests ?? turtleRankingEngine.getInterests(),
    statsProvider: (id: string) =>
      id && turtleRankingEngine.hasStats(id) ? turtleRankingEngine.getStats(id) : undefined,
  };
}

function resolveId(item: LooseItem): string {
  return String(item.id || item.postId || '');
}

function resolveCreatorId(item: LooseItem): string {
  return String(item.creatorId || item.authorId || item.userId || item.creator?.id || '');
}

function toPostCandidate(item: LooseItem, ctx: HybridRankContext, kind: 'post' | 'reel'): PostCandidate {
  const now = Date.now();
  const id = resolveId(item);

  let createdAt =
    (typeof item.createdTime === 'number' ? item.createdTime : 0) ||
    (typeof item.timestamp === 'number' ? item.timestamp : 0) ||
    (typeof item.createdAt === 'number' ? item.createdAt : 0);
  // Fall back to the post-id timestamp (posts are created as `post-<ms>`)
  if (!createdAt) {
    const m = id.match(/post-(\d+)/);
    if (m) createdAt = Number(m[1]);
  }
  if (!createdAt && item.date) createdAt = Date.parse(String(item.date)) || 0;
  if (!createdAt || isNaN(createdAt) || createdAt <= 0) createdAt = now - 86_400_000;

  const totalViews = Number(item.viewsCount ?? item.views ?? 0) || 0;
  const ageHours = Math.max(0.25, (now - createdAt) / 3_600_000);
  const likes = Number(item.likes ?? (Array.isArray(item.likedBy) ? item.likedBy.length : Array.isArray(item.likedByUsers) ? item.likedByUsers.length : 0));
  const comments = Number(Array.isArray(item.comments) ? item.comments.length : item.commentsCount ?? 0);
  const shares = Number(item.repostsCount ?? item.sharesCount ?? 0);

  const isBoosted = !!(item.isBoosted || item.boosted) || (ctx.boostedIds || []).includes(id);
  const boostConfig: BoostConfig | undefined = isBoosted
    ? {
        dailyBudget: 100,
        totalBudget: 1000,
        bidAmount: 1.5,
        bidStrategy: 'lowest_cost',
        targetDemographics: {
          languages: [ctx.language || 'en'],
          countries: [ctx.country || 'US'],
          ageRange: [18, 45],
          interests: [],
        },
        qualityScore: 7,
        spent: 0,
        impressions: 0,
      }
    : undefined;

  return {
    postId: id,
    creatorId: resolveCreatorId(item),
    language: item.language || ctx.language || 'en',
    country: item.country || item.creator?.countryCode || ctx.country || 'US',
    category: item.category || (kind === 'reel' ? 'video' : 'general'),
    videoLength: Number(item.videoLength ?? (kind === 'reel' ? 30 : 0)),
    createdAt,
    totalViews,
    viewVelocity: totalViews / ageHours,
    isBoosted,
    boostConfig,
    globalLikes: likes,
    globalShares: shares,
    globalComments: comments,
    globalSaves: Number(item.savesCount ?? 0),
    globalFollows: 0,
    globalProfileVisits: 0,
    engagementPercentile: Number(item.engagementPercentile ?? 50),
  };
}

function toInteraction(item: LooseItem, ctx: HybridRankContext, creatorId: string): UserPostInteraction {
  const id = resolveId(item);
  const stats = (ctx.statsProvider && ctx.statsProvider(id)) || {};

  const itemLikes = Number(item.likes ?? (Array.isArray(item.likedBy) ? item.likedBy.length : Array.isArray(item.likedByUsers) ? item.likedByUsers.length : 0));
  const itemComments = Array.isArray(item.comments) ? item.comments.length : Number(item.commentsCount ?? 0);
  const itemShares = Number(item.repostsCount ?? item.sharesCount ?? 0);
  const itemRewatch = Number(item.rewatchCount ?? 0);

  const personalLikes = Number(stats.likes ?? 0);
  const personalComments = Number(stats.comments ?? 0);
  const personalShares = Number(stats.shares ?? 0);
  const personalSaves = Number(stats.saves ?? 0);
  const personalFollows = Number(stats.follows ?? 0);
  const watchSeconds = Number(stats.watchSeconds ?? 0);
  const watchSessions = Number(stats.watchSessions ?? 0);

  // Feedback state (Facebook-style): explicit interested / not_interested clicks
  // win over the historical counts so the user's latest choice is honoured.
  const fb = ctx.feedback?.[id];
  const feedbackPositive = fb === 'interested' || (Number(stats.interested ?? 0) > 0 && fb !== 'not_interested');
  const feedbackNegative = fb === 'not_interested' || (Number(stats.notInterested ?? 0) > 0 && fb !== 'interested');

  // Personal watch-time (from the immersive reel player) is the strongest signal;
  // fall back to a neutral 15s / 30s for items we have no watch data on.
  const avgWatch = watchSessions > 0 ? watchSeconds / watchSessions : 0;
  const videoLength = Number(item.videoLength ?? 30);
  const watchDuration = avgWatch > 0 ? Math.round(avgWatch) : Math.min(videoLength, 15);

  return {
    watchDuration,
    videoLength,
    rewatchCount: Number(stats.rewinds ?? 0) > 0 ? Number(stats.rewinds ?? 0) : itemRewatch,
    liked: personalLikes > 0 || itemLikes > 0,
    shared: personalShares > 0 || itemShares > 0,
    commented: personalComments > 0 || itemComments > 0,
    followed: personalFollows > 0 || (ctx.followingIds || []).includes(creatorId),
    saved: personalSaves > 0 || (ctx.savedIds || []).includes(id),
    profileVisited: Number(stats.visits ?? 0) > 0,
    feedbackPositive,
    feedbackNegative,
    appUsageTriggered: Number(stats.appUsesAfterWatch ?? 0) > 0,
  };
}

/**
 * Rank items using the ported hybrid-engine master scoring formula
 * (computeScore: watch-time + rewatch + engagement + feedback + recency +
 * velocity + conversion, with bounce penalty + boost multiplier).
 *
 * The platform blend (50% Instagram / 25% YouTube / 25% TikTok) comes from
 * DEFAULT_ENGINE_CONFIG.platformWeights; Facebook Boost Post and the
 * interested / not-interested feedback flow in through the context.
 */
export function hybridRankItems<T extends LooseItem>(
  items: T[],
  ctx: HybridRankContext = {},
  kind: 'post' | 'reel' = 'post',
): T[] {
  const user: UserProfile = {
    userId: ctx.userId || 'u0',
    language: ctx.language || 'en',
    country: ctx.country || 'US',
    interests: ctx.topInterests || ctx.interests || [],
    platformWeights: { instagram: 0.5, youtube: 0.25, tiktok: 0.25 },
    historicalEngagement: {
      avgWatchTimeRatio: 0.5,
      avgSessionDuration: 120,
      topCategories: [],
      engagementRate: 0.05,
    },
  };

  const now = Date.now();
  const scored = items.map((item) => {
    const post = toPostCandidate(item, ctx, kind);
    const interaction = toInteraction(item, ctx, post.creatorId);
    const breakdown = computeScore(user, post, interaction, DEFAULT_ENGINE_CONFIG, now);
    const creatorId = post.creatorId;
    return {
      item,
      score: breakdown.normalizedScore,
      breakdown,
      // Prefer content from followed creators (signal that the old engine used).
      follows: (ctx.followingIds || []).includes(creatorId) ? 0.1 : 0,
    };
  });

  scored.sort((a, b) => b.score + b.follows - (a.score + a.follows));

  return scored.map((s) => {
    const out = s.item as T & { rankingScore?: number; __rankScore?: number; __rankBreakdown?: unknown; __rankKind?: string };
    out.rankingScore = Number((s.score + s.follows).toFixed(4));
    out.__rankScore = out.rankingScore;
    out.__rankBreakdown = s.breakdown;
    out.__rankKind = kind;
    return out;
  });
}
