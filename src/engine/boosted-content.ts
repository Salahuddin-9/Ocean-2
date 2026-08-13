// ============================================================
// BOOSTED CONTENT / SPONSORED CONTENT SYSTEM
// Facebook-Grade Ad Delivery with Quality Gates
// ============================================================

import { sigmoid, clamp } from './math';

// ─────────────────────────────────────────────
// Ad Campaign Configuration
// ─────────────────────────────────────────────

export interface AdCampaign {
  campaignId: string;
  advertiserId: string;
  contentId: string;
  
  // Budget
  totalBudget: number;
  dailyBudget: number;
  spent: number;
  dailySpent: number;
  
  // Bidding
  bidStrategy: BidStrategy;
  bidAmount: number;              // max bid
  
  // Targeting
  targeting: AdTargeting;
  
  // Quality
  qualityScore: number;           // 0-10, creative quality
  relevanceScore: number;         // 0-10, audience match
  
  // Performance
  impressions: number;
  clicks: number;
  conversions: number;
  
  // Constraints
  frequencyCap: number;           // max impressions per user per day
  startTime: number;
  endTime: number;
  status: 'active' | 'paused' | 'completed' | 'depleted';
}

export type BidStrategy = 'cpm' | 'cpc' | 'cpa' | 'lowest_cost' | 'bid_cap' | 'cost_cap';

export interface AdTargeting {
  // Demographics
  languages: string[];
  countries: string[];
  regions: string[];
  ageRange: [number, number];
  genders: ('male' | 'female' | 'other')[];
  
  // Interests
  interests: string[];
  excludeInterests: string[];
  
  // Behaviors
  deviceTypes: ('mobile' | 'tablet' | 'desktop')[];
  connectionTypes: ('wifi' | 'cellular')[];
  
  // Custom
  customAudiences: string[];      // retargeting lists
  lookalikeAudiences: string[];
  
  // Exclusions
  excludedUsers: string[];        // users who opted out
}

// ─────────────────────────────────────────────
// User-Ad Match Scoring
// ─────────────────────────────────────────────
// M(user, ad) = targeting_match × interest_match × quality × recency

export interface UserAdContext {
  userId: string;
  language: string;
  country: string;
  region: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  interests: Map<string, number>;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  connectionType: 'wifi' | 'cellular' | 'unknown';
  recentAdExposure: Map<string, number>;  // campaignId → impressions today
}

export interface AdMatchScore {
  totalScore: number;
  targetingMatch: number;
  interestMatch: number;
  qualityScore: number;
  relevanceScore: number;
  frequencyPenalty: number;
  budgetFactor: number;
  eligible: boolean;
  ineligibilityReason?: string;
}

export function computeAdMatchScore(
  campaign: AdCampaign,
  user: UserAdContext
): AdMatchScore {
  // Check eligibility first
  const eligibility = checkAdEligibility(campaign, user);
  if (!eligibility.eligible) {
    return {
      totalScore: 0,
      targetingMatch: 0,
      interestMatch: 0,
      qualityScore: 0,
      relevanceScore: 0,
      frequencyPenalty: 1,
      budgetFactor: 0,
      eligible: false,
      ineligibilityReason: eligibility.reason,
    };
  }
  
  // Targeting match score
  const targetingMatch = computeTargetingMatch(campaign.targeting, user);
  
  // Interest match score
  const interestMatch = computeInterestMatch(campaign.targeting.interests, user.interests);
  
  // Quality and relevance (from campaign)
  const qualityScore = campaign.qualityScore / 10;
  const relevanceScore = campaign.relevanceScore / 10;
  
  // Frequency penalty
  const recentImpressions = user.recentAdExposure.get(campaign.campaignId) || 0;
  const frequencyPenalty = recentImpressions >= campaign.frequencyCap
    ? 0 // completely block
    : Math.exp(-0.3 * recentImpressions); // decay
  
  // Budget factor (pacing)
  const budgetRemaining = campaign.totalBudget - campaign.spent;
  const budgetRatio = budgetRemaining / campaign.totalBudget;
  const budgetFactor = clamp(budgetRatio * 1.5, 0.5, 1.5); // pace spending
  
  // Combine scores
  const totalScore = (
    0.25 * targetingMatch +
    0.25 * interestMatch +
    0.20 * qualityScore +
    0.15 * relevanceScore +
    0.15 * 1.0 // baseline
  ) * frequencyPenalty * budgetFactor;
  
  return {
    totalScore,
    targetingMatch,
    interestMatch,
    qualityScore,
    relevanceScore,
    frequencyPenalty,
    budgetFactor,
    eligible: true,
  };
}

function checkAdEligibility(
  campaign: AdCampaign,
  user: UserAdContext
): { eligible: boolean; reason?: string } {
  const now = Date.now();
  
  // Campaign status
  if (campaign.status !== 'active') {
    return { eligible: false, reason: `Campaign ${campaign.status}` };
  }
  
  // Time window
  if (now < campaign.startTime || now > campaign.endTime) {
    return { eligible: false, reason: 'Outside campaign time window' };
  }
  
  // Budget
  if (campaign.spent >= campaign.totalBudget) {
    return { eligible: false, reason: 'Budget depleted' };
  }
  if (campaign.dailySpent >= campaign.dailyBudget) {
    return { eligible: false, reason: 'Daily budget depleted' };
  }
  
  // Hard targeting constraints
  const t = campaign.targeting;
  
  if (t.languages.length > 0 && !t.languages.includes(user.language)) {
    return { eligible: false, reason: 'Language mismatch' };
  }
  
  if (t.countries.length > 0 && !t.countries.includes(user.country)) {
    return { eligible: false, reason: 'Country mismatch' };
  }
  
  if (t.excludedUsers.includes(user.userId)) {
    return { eligible: false, reason: 'User excluded' };
  }
  
  // Age range
  if (user.age < t.ageRange[0] || user.age > t.ageRange[1]) {
    return { eligible: false, reason: 'Age out of range' };
  }
  
  // Frequency cap
  const impressions = user.recentAdExposure.get(campaign.campaignId) || 0;
  if (impressions >= campaign.frequencyCap) {
    return { eligible: false, reason: 'Frequency cap reached' };
  }
  
  return { eligible: true };
}

function computeTargetingMatch(targeting: AdTargeting, user: UserAdContext): number {
  let score = 0;
  let factors = 0;
  
  // Language match
  if (targeting.languages.length > 0) {
    score += targeting.languages.includes(user.language) ? 1 : 0;
    factors++;
  }
  
  // Country match
  if (targeting.countries.length > 0) {
    score += targeting.countries.includes(user.country) ? 1 : 0;
    factors++;
  }
  
  // Region match
  if (targeting.regions.length > 0) {
    score += targeting.regions.includes(user.region) ? 1 : 0.5;
    factors++;
  }
  
  // Gender match
  if (targeting.genders.length > 0) {
    score += targeting.genders.includes(user.gender) ? 1 : 0;
    factors++;
  }
  
  // Device match
  if (targeting.deviceTypes.length > 0) {
    score += targeting.deviceTypes.includes(user.deviceType) ? 1 : 0.5;
    factors++;
  }
  
  return factors > 0 ? score / factors : 0.5;
}

function computeInterestMatch(
  targetInterests: string[],
  userInterests: Map<string, number>
): number {
  if (targetInterests.length === 0) return 0.5;
  
  let matchScore = 0;
  let matchCount = 0;
  
  for (const interest of targetInterests) {
    const userScore = userInterests.get(interest);
    if (userScore !== undefined) {
      matchScore += userScore;
      matchCount++;
    }
  }
  
  if (matchCount === 0) return 0.2; // no overlap
  
  const avgMatch = matchScore / matchCount;
  const coverageBonus = matchCount / targetInterests.length;
  
  return clamp(avgMatch * 0.7 + coverageBonus * 0.3, 0, 1);
}

// ─────────────────────────────────────────────
// Ad Auction System
// ─────────────────────────────────────────────
// Generalized Second-Price (GSP) Auction

export interface AuctionBid {
  campaign: AdCampaign;
  matchScore: AdMatchScore;
  effectiveBid: number;           // bid × quality × relevance
  winProbability: number;
  expectedCost: number;
}

export function runAdAuction(
  eligibleCampaigns: { campaign: AdCampaign; matchScore: AdMatchScore }[],
  positions: number = 1
): AuctionBid[] {
  // Calculate effective bid for each campaign
  const bids: AuctionBid[] = eligibleCampaigns.map(({ campaign, matchScore }) => {
    // Effective bid = bid × quality × relevance (Facebook-style)
    const qualityFactor = (campaign.qualityScore + campaign.relevanceScore) / 20;
    const effectiveBid = campaign.bidAmount * qualityFactor * matchScore.totalScore;
    
    return {
      campaign,
      matchScore,
      effectiveBid,
      winProbability: 0,
      expectedCost: 0,
    };
  });
  
  // Sort by effective bid descending
  bids.sort((a, b) => b.effectiveBid - a.effectiveBid);
  
  // Calculate win probability and expected cost (GSP)
  const totalEffectiveBid = bids.reduce((sum, b) => sum + b.effectiveBid, 0);
  
  for (let i = 0; i < bids.length; i++) {
    // Win probability proportional to effective bid
    bids[i].winProbability = totalEffectiveBid > 0 
      ? bids[i].effectiveBid / totalEffectiveBid 
      : 0;
    
    // GSP: pay the next highest bid + 0.01
    const nextBid = i + 1 < bids.length ? bids[i + 1].effectiveBid : 0;
    bids[i].expectedCost = nextBid + 0.01;
  }
  
  // Return top N winners
  return bids.slice(0, positions);
}

// ─────────────────────────────────────────────
// Conversion Prediction
// ─────────────────────────────────────────────
// P(conversion | impression) for CPA bidding

export function predictConversion(
  campaign: AdCampaign,
  matchScore: AdMatchScore
): number {
  // Historical conversion rate
  const historicalRate = campaign.impressions > 0
    ? campaign.conversions / campaign.impressions
    : 0.01; // default 1%
  
  // Adjust by match quality
  const adjustedRate = historicalRate * (0.5 + matchScore.totalScore * 0.5);
  
  // Apply sigmoid to bound
  return sigmoid(adjustedRate * 10 - 0.5);
}

// ─────────────────────────────────────────────
// Feed Slot Allocation
// ─────────────────────────────────────────────
// 70% Organic, 20% Recommended, 10% Sponsored

export interface FeedSlotAllocation {
  organicSlots: number[];         // positions for organic content
  recommendedSlots: number[];     // positions for recommended
  sponsoredSlots: number[];       // positions for ads
}

export function computeSlotAllocation(
  feedSize: number,
  config: {
    organicRatio: number;         // 0.70
    recommendedRatio: number;     // 0.20
    sponsoredRatio: number;       // 0.10
    minGapBetweenAds: number;     // minimum positions between ads
  } = {
    organicRatio: 0.70,
    recommendedRatio: 0.20,
    sponsoredRatio: 0.10,
    minGapBetweenAds: 5,
  }
): FeedSlotAllocation {
  const organic: number[] = [];
  const recommended: number[] = [];
  const sponsored: number[] = [];
  
  const numSponsored = Math.floor(feedSize * config.sponsoredRatio);
  const numRecommended = Math.floor(feedSize * config.recommendedRatio);
  
  // Place sponsored slots with minimum gap
  let lastSponsoredPos = -config.minGapBetweenAds;
  for (let i = 0; i < numSponsored && lastSponsoredPos + config.minGapBetweenAds < feedSize; i++) {
    const pos = lastSponsoredPos + config.minGapBetweenAds + Math.floor(Math.random() * 3);
    if (pos < feedSize) {
      sponsored.push(pos);
      lastSponsoredPos = pos;
    }
  }
  
  // Place recommended slots
  const sponsoredSet = new Set(sponsored);
  let recommendedCount = 0;
  for (let i = 0; i < feedSize && recommendedCount < numRecommended; i++) {
    if (!sponsoredSet.has(i) && Math.random() < 0.3) { // spread out
      recommended.push(i);
      recommendedCount++;
    }
  }
  
  // Rest are organic
  const usedSlots = new Set([...sponsored, ...recommended]);
  for (let i = 0; i < feedSize; i++) {
    if (!usedSlots.has(i)) {
      organic.push(i);
    }
  }
  
  return { organicSlots: organic, recommendedSlots: recommended, sponsoredSlots: sponsored };
}

// ─────────────────────────────────────────────
// Ad Quality Gates
// ─────────────────────────────────────────────
// Minimum quality thresholds to prevent bad ad experience

export interface AdQualityGate {
  minQualityScore: number;        // 3.0 - minimum creative quality
  minRelevanceScore: number;      // 3.0 - minimum audience match
  minExpectedEngagement: number;  // 0.01 - 1% minimum expected engagement
  maxNegativeFeedbackRate: number; // 0.05 - 5% max hide/report rate
}

export const DEFAULT_QUALITY_GATE: AdQualityGate = {
  minQualityScore: 3.0,
  minRelevanceScore: 3.0,
  minExpectedEngagement: 0.01,
  maxNegativeFeedbackRate: 0.05,
};

export function passesQualityGate(
  campaign: AdCampaign,
  expectedEngagement: number,
  negativeFeedbackRate: number,
  gate: AdQualityGate = DEFAULT_QUALITY_GATE
): { passes: boolean; failures: string[] } {
  const failures: string[] = [];
  
  if (campaign.qualityScore < gate.minQualityScore) {
    failures.push(`Quality ${campaign.qualityScore} < ${gate.minQualityScore}`);
  }
  
  if (campaign.relevanceScore < gate.minRelevanceScore) {
    failures.push(`Relevance ${campaign.relevanceScore} < ${gate.minRelevanceScore}`);
  }
  
  if (expectedEngagement < gate.minExpectedEngagement) {
    failures.push(`Expected engagement ${(expectedEngagement * 100).toFixed(2)}% < ${(gate.minExpectedEngagement * 100)}%`);
  }
  
  if (negativeFeedbackRate > gate.maxNegativeFeedbackRate) {
    failures.push(`Negative feedback ${(negativeFeedbackRate * 100).toFixed(2)}% > ${(gate.maxNegativeFeedbackRate * 100)}%`);
  }
  
  return {
    passes: failures.length === 0,
    failures,
  };
}

// ─────────────────────────────────────────────
// Budget Pacing
// ─────────────────────────────────────────────
// Ensure budget is spent evenly across campaign duration

export function computePacingMultiplier(
  campaign: AdCampaign,
  nowMs: number
): number {
  const campaignDuration = campaign.endTime - campaign.startTime;
  const elapsed = nowMs - campaign.startTime;
  const remaining = campaign.endTime - nowMs;
  
  if (remaining <= 0) return 0;
  
  const expectedSpendRatio = elapsed / campaignDuration;
  const actualSpendRatio = campaign.spent / campaign.totalBudget;
  
  // If underspending, increase delivery
  // If overspending, decrease delivery
  const spendGap = expectedSpendRatio - actualSpendRatio;
  
  // Pacing multiplier: 0.5 to 2.0
  return clamp(1 + spendGap * 2, 0.5, 2.0);
}
