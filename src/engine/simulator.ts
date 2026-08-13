// ============================================================
// Data Simulator - Generates synthetic posts & interactions
// for live demonstration of the scoring engine
// ============================================================

import { UserProfile, PostCandidate, UserPostInteraction } from './types';

const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'ar', 'hi', 'zh'];
const COUNTRIES = ['US', 'GB', 'CA', 'DE', 'FR', 'BR', 'JP', 'KR', 'IN', 'CN'];
const CATEGORIES = [
  'comedy', 'education', 'music', 'gaming', 'fitness',
  'cooking', 'tech', 'fashion', 'travel', 'news',
  'sports', 'art', 'science', 'lifestyle', 'business',
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomFloat(min, max + 1));
}

export function generateUser(overrides?: Partial<UserProfile>): UserProfile {
  return {
    userId: `user_${randomInt(1000, 9999)}`,
    language: 'en',
    country: 'US',
    interests: Array.from({ length: 3 }, () => randomChoice(CATEGORIES)),
    platformWeights: { instagram: 0.5, youtube: 0.25, tiktok: 0.25 },
    historicalEngagement: {
      avgWatchTimeRatio: randomFloat(0.3, 0.8),
      avgSessionDuration: randomFloat(300, 1800),
      topCategories: Array.from({ length: 3 }, () => randomChoice(CATEGORIES)),
      engagementRate: randomFloat(0.02, 0.15),
    },
    ...overrides,
  };
}

export function generatePost(index: number, overrides?: Partial<PostCandidate>): PostCandidate {
  const isBoosted = Math.random() < 0.2;
  const hoursAgo = randomFloat(0.5, 72);
  const now = Date.now();

  // Mix of matching and non-matching languages/countries
  const matchesLocale = Math.random() < 0.7;

  const post: PostCandidate = {
    postId: `post_${1000 + index}`,
    creatorId: `creator_${randomInt(100, 999)}`,
    language: matchesLocale ? 'en' : randomChoice(LANGUAGES),
    country: matchesLocale ? 'US' : randomChoice(COUNTRIES),
    category: randomChoice(CATEGORIES),
    videoLength: randomInt(15, 600),
    createdAt: now - hoursAgo * 3600 * 1000,
    totalViews: randomInt(100, 5000000),
    viewVelocity: randomFloat(10, 10000),
    isBoosted,
    globalLikes: randomInt(10, 500000),
    globalShares: randomInt(1, 100000),
    globalComments: randomInt(1, 50000),
    globalSaves: randomInt(1, 80000),
    globalFollows: randomInt(0, 10000),
    globalProfileVisits: randomInt(5, 30000),
    engagementPercentile: randomFloat(10, 100),
    ...overrides,
  };

  if (isBoosted && !overrides?.boostConfig) {
    const totalBudget = randomFloat(50, 10000);
    post.boostConfig = {
      dailyBudget: totalBudget / randomInt(3, 30),
      totalBudget,
      bidAmount: randomFloat(0.5, 15),
      bidStrategy: randomChoice(['cpm', 'cpc', 'cpa', 'lowest_cost'] as const),
      targetDemographics: {
        languages: ['en'],
        countries: ['US', 'GB', 'CA'],
        ageRange: [18, 45],
        interests: Array.from({ length: 2 }, () => randomChoice(CATEGORIES)),
      },
      qualityScore: randomFloat(1, 10),
      spent: randomFloat(0, totalBudget * 0.8),
      impressions: randomInt(100, 100000),
    };
  }

  return post;
}

export function generateInteraction(
  post: PostCandidate,
  scenario?: 'high_engagement' | 'bounce' | 'normal' | 'negative' | 'conversion'
): UserPostInteraction {
  const s = scenario || randomChoice(['high_engagement', 'bounce', 'normal', 'normal', 'normal', 'negative', 'conversion']);

  switch (s) {
    case 'high_engagement':
      return {
        watchDuration: post.videoLength * randomFloat(0.8, 2.5),
        videoLength: post.videoLength,
        rewatchCount: randomInt(1, 5),
        liked: true,
        shared: Math.random() < 0.6,
        commented: Math.random() < 0.4,
        followed: Math.random() < 0.3,
        saved: Math.random() < 0.5,
        profileVisited: Math.random() < 0.4,
        feedbackPositive: Math.random() < 0.3,
        feedbackNegative: false,
        appUsageTriggered: Math.random() < 0.2,
      };
    case 'bounce':
      return {
        watchDuration: post.videoLength * randomFloat(0.01, 0.08),
        videoLength: post.videoLength,
        rewatchCount: 0,
        liked: false,
        shared: false,
        commented: false,
        followed: false,
        saved: false,
        profileVisited: false,
        feedbackPositive: false,
        feedbackNegative: Math.random() < 0.3,
        appUsageTriggered: false,
      };
    case 'negative':
      return {
        watchDuration: post.videoLength * randomFloat(0.1, 0.4),
        videoLength: post.videoLength,
        rewatchCount: 0,
        liked: false,
        shared: false,
        commented: false,
        followed: false,
        saved: false,
        profileVisited: false,
        feedbackPositive: false,
        feedbackNegative: true,
        appUsageTriggered: false,
      };
    case 'conversion':
      return {
        watchDuration: post.videoLength * randomFloat(0.6, 1.5),
        videoLength: post.videoLength,
        rewatchCount: randomInt(0, 2),
        liked: true,
        shared: Math.random() < 0.3,
        commented: Math.random() < 0.2,
        followed: Math.random() < 0.2,
        saved: Math.random() < 0.4,
        profileVisited: Math.random() < 0.3,
        feedbackPositive: false,
        feedbackNegative: false,
        appUsageTriggered: true,
      };
    default: // normal
      return {
        watchDuration: post.videoLength * randomFloat(0.3, 0.7),
        videoLength: post.videoLength,
        rewatchCount: Math.random() < 0.2 ? 1 : 0,
        liked: Math.random() < 0.15,
        shared: Math.random() < 0.05,
        commented: Math.random() < 0.05,
        followed: Math.random() < 0.02,
        saved: Math.random() < 0.08,
        profileVisited: Math.random() < 0.05,
        feedbackPositive: false,
        feedbackNegative: false,
        appUsageTriggered: false,
      };
  }
}

export function generateDataset(count: number = 20): {
  user: UserProfile;
  posts: { post: PostCandidate; interaction: UserPostInteraction }[];
} {
  const user = generateUser();
  const posts = Array.from({ length: count }, (_, i) => {
    const post = generatePost(i);
    const interaction = generateInteraction(post);
    return { post, interaction };
  });
  return { user, posts };
}
