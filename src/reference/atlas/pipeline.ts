/**
 * ATLAS-RANK :: Multi-Stage Recommendation Pipeline (spec §9).
 *
 *  ┌───────────────────────────────────────────────────────────────────────┐
 *  │ STAGE 1  CANDIDATE GENERATION      ~1,200 items from 9 parallel pools │
 *  │ STAGE 2  ELIGIBILITY FILTERING     hard, cheap, non-negotiable        │
 *  │ STAGE 3  QUALITY FILTERING         cohort floors + integrity ladder   │
 *  │ STAGE 4  ENGAGEMENT PREDICTION     6 binary heads                     │
 *  │ STAGE 5  WATCH-TIME PREDICTION     regression + completion/rewatch    │
 *  │ STAGE 6  SATISFACTION PREDICTION   satisfaction + retention heads     │
 *  │ STAGE 7  RE-RANKING                master feed score + exploration    │
 *  │ STAGE 8  DIVERSITY INJECTION       MMR + slot constraints             │
 *  │ STAGE 9  FRESHNESS BALANCING       temporal portfolio quotas          │
 *  │ STAGE 10 FINAL FEED GENERATION     slot allocation + ad auction + log │
 *  └───────────────────────────────────────────────────────────────────────┘
 *
 * Latency budget (p99, 1,200 candidates → 20 slots):
 *   S1 retrieval 22ms · S2/S3 filter 3ms · S4-S6 scoring 9ms · S7 2ms
 *   S8 MMR 6ms · S9 1ms · S10 auction 4ms · logging (async) 0ms
 *   total in-request ≈ 47ms, budget 100ms.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { content, contentStats, events, feedLogs, pipelineRuns, sessions } from "@/db/schema";
import {
  clamp,
  cosine,
  hoursBetween,
  lg,
  mulberry32,
  normalizedEntropy,
} from "./mathkit";
import { COUNTRY_TO_REGION, REGIONS, TOPIC_INDEX } from "./taxonomy";
import { topicLifecyclePosition } from "./content-model";
import {
  decayInterest,
  discoverLatentInterests,
  interestDrift,
  retrievalTopicSet,
  type InterestRow,
} from "./user-model";
import {
  engagementDecline,
  explorationBudget,
  localeMultiplier,
  temporalContext,
  thompsonSelect,
  topicFatigue,
  type Arm,
} from "./context";
import {
  buildFeatureVector,
  diffusedAffinity,
  explainFeatures,
  type FeatureContextContent,
  type FeatureContextUser,
} from "./features";
import { predictAll, type ModelBank, type Predictions } from "./models";
import { contentTrust, enforcement } from "./integrity";
import {
  adSlots,
  ageBucket,
  diversityRerank,
  freshnessQuotaMultiplier,
  masterFeedScore,
  slotAllocation,
  type DiversityCandidate,
  type ScoreBreakdown,
} from "./ranker";
import {
  evaluateAd,
  organicOpportunityCost,
  runAuction,
  type AdCandidate,
  type AdUserContext,
} from "./ads";
import {
  DEFAULT_TOPIC_BASELINE,
  fetchCandidatesByIds,
  getBanditArms,
  getCreatorAffinities,
  getInterests,
  getRecentExposure,
  getTopicExposure,
  getUser,
  loadModelBank,
  loadTopicBaselines,
  retrieve,
  type JoinedCandidate,
  type TopicBaselineRow,
} from "./store";

export type CandidateSource =
  | "following"
  | "interest_match"
  | "similar_users"
  | "similar_content"
  | "trending_global"
  | "trending_regional"
  | "creator_expansion"
  | "exploration"
  | "cold_start_seed";

export interface FeedItem {
  rank: number;
  contentId: string;
  creatorId: string;
  topic: string;
  language: string;
  country: string;
  durationSec: number;
  ageHours: number;
  source: CandidateSource | "sponsored";
  slotType: "organic" | "recommended" | "sponsored";
  finalScore: number;
  breakdown: ScoreBreakdown;
  predictions: Predictions;
  explorationBonus: number;
  coldStartPhase: number;
  viralBand: string;
  cohortLift: number;
  topContributions: { feature: string; value: number; weight: number; contribution: number }[];
  ad?: { campaignId: string; price: number; ecpm: number; relevance: number };
}

export interface FeedResponse {
  requestId: string;
  userId: string;
  generatedAt: string;
  items: FeedItem[];
  telemetry: {
    totalMs: number;
    stageMs: Record<string, number>;
    stageCounts: Record<string, number>;
    sourceMix: Record<string, number>;
    slotMix: Record<string, number>;
    explorationBudget: number;
    interestDrift: number;
    meanFatigue: number;
    diversityEntropy: number;
    latentInterests: { topic: string; predicted: number; source: string }[];
    modelVersions: Record<string, number>;
  };
  filtered: {
    retrieved: number;
    afterEligibility: number;
    afterQuality: number;
    droppedReasons: Record<string, number>;
  };
}

export interface FeedOptions {
  userId: string;
  pageSize?: number;
  surface?: string;
  sessionId?: string;
  sessionDepth?: number;
  includeAds?: boolean;
  seed?: number;
  persist?: boolean;
  explain?: boolean;
}

const CANDIDATE_BUDGET: Record<CandidateSource, number> = {
  following: 220,
  interest_match: 320,
  similar_users: 160,
  similar_content: 160,
  trending_global: 120,
  trending_regional: 140,
  creator_expansion: 100,
  exploration: 120,
  cold_start_seed: 80,
};

export async function generateFeed(opts: FeedOptions): Promise<FeedResponse> {
  const t0 = performance.now();
  const stageMs: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  const mark = (name: string, start: number) => {
    stageMs[name] = Math.round((performance.now() - start) * 100) / 100;
  };

  const pageSize = opts.pageSize ?? 20;
  const requestId = randomUUID();
  const now = new Date();
  const rnd = mulberry32(opts.seed ?? (Date.now() & 0xffffffff));

  /* ===================== STAGE 0: CONTEXT HYDRATION ===================== */
  const s0 = performance.now();
  const [user, bank, baselines] = await Promise.all([
    getUser(opts.userId),
    loadModelBank(),
    loadTopicBaselines(),
  ]);
  if (!user) throw new Error(`unknown user: ${opts.userId}`);

  const [interestRows, creatorAff, exposureRows, topicExpRows, armRows] = await Promise.all([
    getInterests(user.id),
    getCreatorAffinities(user.id),
    getRecentExposure(user.id, 336),
    getTopicExposure(user.id),
    getBanditArms(user.id),
  ]);

  const interests: InterestRow[] = interestRows.map((r) =>
    decayInterest(
      {
        topic: r.topic,
        affinity: r.affinity,
        shortTerm: r.shortTerm,
        longTerm: r.longTerm,
        momentum: r.momentum,
        confidence: r.confidence,
        exposures: r.exposures,
        engagements: r.engagements,
        negatives: r.negatives,
        kind: r.kind,
        latent: r.latent,
        lastEventAt: r.lastEventAt,
      },
      now,
      clamp(user.activityLevel),
    ),
  );

  const interestMap = new Map(interests.map((r) => [r.topic, { affinity: r.affinity, momentum: r.momentum }]));
  const creatorAffMap = new Map(
    creatorAff.map((r) => [r.creatorId, { affinity: r.affinity, isFollowing: r.isFollowing }]),
  );
  const followedCreators = creatorAff.filter((r) => r.isFollowing && !r.isMuted && !r.isBlocked).map((r) => r.creatorId);
  const blockedCreators = new Set(creatorAff.filter((r) => r.isBlocked || r.isMuted).map((r) => r.creatorId));
  const exposureMap = new Map(exposureRows.map((r) => [r.contentId, r]));
  const topicExpMap = new Map(topicExpRows.map((r) => [r.topic, r]));

  // recent consumption for novelty + short-term audio affinity
  const recentEvents = await db
    .select({
      contentId: events.contentId,
      createdAt: events.createdAt,
      eventType: events.eventType,
    })
    .from(events)
    .where(and(eq(events.userId, user.id), gte(events.createdAt, new Date(now.getTime() - 72 * 3_600_000))))
    .orderBy(desc(events.createdAt))
    .limit(120);

  const recentContentIds = [...new Set(recentEvents.map((e) => e.contentId).filter(Boolean))] as string[];
  const recentContent = recentContentIds.length
    ? await db
        .select({
          id: content.id,
          creatorId: content.creatorId,
          embedding: content.embedding,
          audioId: content.audioId,
          topic: content.topic,
        })
        .from(content)
        .where(inArray(content.id, recentContentIds.slice(0, 40)))
    : [];

  const recentEmbeddings = recentContent.map((r) => r.embedding as number[]).filter((v) => v.length > 0);
  const recentAudioIds = new Set(recentContent.map((r) => r.audioId).filter(Boolean));
  const consecutiveTopics = recentContent.map((r) => r.topic);

  // Creator repetition in the trailing consumption window → creator fatigue.
  const creatorRecentCount = new Map<string, number>();
  for (const r of recentContent) {
    creatorRecentCount.set(r.creatorId, (creatorRecentCount.get(r.creatorId) ?? 0) + 1);
  }

  const temporal = temporalContext(now, user.timezoneOffset);
  const drift = interestDrift(interests);
  const latent = discoverLatentInterests(interests);
  mark("s0_context", s0);

  /* ===================== STAGE 1: CANDIDATE GENERATION ================== */
  const s1 = performance.now();
  const retrievalTopics = retrievalTopicSet(interests, 12);
  const topTopics = retrievalTopics.slice(0, 10).map((t) => t.topic);
  const userRegion = user.region || COUNTRY_TO_REGION[user.country] || "NA";
  const neighborRegions = REGIONS[userRegion]?.neighbors ?? [];

  // Thompson-sampled exploration topics (bandit over the topic arm space)
  const arms: Arm[] = armRows.map((a) => ({
    key: a.armKey,
    alpha: a.alpha,
    beta: a.beta,
    pulls: a.pulls,
    reward: a.reward,
  }));
  const seedArms: Arm[] =
    arms.length > 0
      ? arms
      : Object.keys(TOPIC_INDEX).map((t) => ({ key: t, alpha: 1, beta: 1, pulls: 0, reward: 0 }));
  const exploreTopics = thompsonSelect(seedArms, 6, rnd).map((a) => a.key);
  const latentTopics = latent.map((l) => l.topic);

  const pools = await Promise.all([
    followedCreators.length
      ? retrieve({ limit: CANDIDATE_BUDGET.following, creatorIds: followedCreators, maxAgeHours: 336, orderBy: "recent" })
      : Promise.resolve([]),
    retrieve({
      limit: CANDIDATE_BUDGET.interest_match,
      topics: topTopics,
      languages: [user.language, "en"],
      maxAgeHours: 720,
      orderBy: "quality",
    }),
    retrieve({
      limit: CANDIDATE_BUDGET.similar_users,
      topics: topTopics,
      countries: [user.country],
      maxAgeHours: 336,
      orderBy: "momentum",
    }),
    retrieve({
      limit: CANDIDATE_BUDGET.similar_content,
      topics: [...new Set([...topTopics, ...latentTopics])],
      maxAgeHours: 720,
      orderBy: "viral",
    }),
    retrieve({ limit: CANDIDATE_BUDGET.trending_global, maxAgeHours: 96, orderBy: "viral" }),
    retrieve({
      limit: CANDIDATE_BUDGET.trending_regional,
      regions: [userRegion, ...neighborRegions],
      maxAgeHours: 168,
      orderBy: "momentum",
    }),
    retrieve({
      limit: CANDIDATE_BUDGET.creator_expansion,
      topics: topTopics,
      maxAgeHours: 504,
      orderBy: "quality",
    }),
    retrieve({
      limit: CANDIDATE_BUDGET.exploration,
      topics: [...new Set([...exploreTopics, ...latentTopics])],
      maxAgeHours: 504,
      orderBy: "random",
    }),
    retrieve({ limit: CANDIDATE_BUDGET.cold_start_seed, maxAgeHours: 48, orderBy: "recent" }),
  ]);

  const SOURCE_ORDER: CandidateSource[] = [
    "following",
    "interest_match",
    "similar_users",
    "similar_content",
    "trending_global",
    "trending_regional",
    "creator_expansion",
    "exploration",
    "cold_start_seed",
  ];

  const candidates = new Map<string, { row: JoinedCandidate; source: CandidateSource; sources: Set<string> }>();
  pools.forEach((pool, i) => {
    const source = SOURCE_ORDER[i];
    for (const row of pool) {
      const existing = candidates.get(row.content.id);
      if (existing) {
        existing.sources.add(source);
        continue;
      }
      candidates.set(row.content.id, { row, source, sources: new Set([source]) });
    }
  });

  const retrievedCount = candidates.size;
  stageCounts.s1_retrieved = retrievedCount;
  mark("s1_candidate_generation", s1);

  /* ===================== STAGE 2: ELIGIBILITY FILTERING ================= */
  const s2 = performance.now();
  const dropped: Record<string, number> = {};
  const drop = (reason: string) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };

  const eligible: typeof candidates = new Map();
  for (const [id, c] of candidates) {
    const { content: ct, creator } = c.row;
    if (ct.creatorId === user.id) { drop("self_content"); continue; }
    if (!ct.isEligible || ct.status !== "live") { drop("not_live"); continue; }
    if (!ct.isRecommendable && !followedCreators.includes(ct.creatorId)) { drop("not_recommendable"); continue; }
    if (blockedCreators.has(ct.creatorId)) { drop("blocked_or_muted"); continue; }
    if (ct.safetyLabel === "violating" || ct.safetyLabel === "restricted") { drop("safety"); continue; }
    if (creator.violationRisk > 0.85) { drop("creator_violation"); continue; }
    const exp = exposureMap.get(id);
    if (exp && exp.impressions >= 3) { drop("frequency_cap"); continue; }
    if (exp && hoursBetween(now, exp.lastSeenAt) < 6) { drop("recency_dedupe"); continue; }
    // Cold-start distribution cap: a phase-k post cannot exceed its impression cap.
    if (c.row.stats.impressions >= ct.coldStartCap && ct.coldStartPhase < 6) { drop("cold_start_cap"); continue; }
    eligible.set(id, c);
  }
  stageCounts.s2_eligible = eligible.size;
  mark("s2_eligibility", s2);

  /* ===================== STAGE 3: QUALITY FILTERING ===================== */
  const s3 = performance.now();
  const quality: typeof candidates = new Map();
  for (const [id, c] of eligible) {
    const { content: ct, stats, creator } = c.row;
    const base = baselines.get(ct.topic) ?? DEFAULT_TOPIC_BASELINE;
    const verdict = enforcement(stats.spamProbability, stats.botProbability, creator.violationRisk);
    if (verdict.action === "remove" || verdict.action === "review") { drop(`integrity_${verdict.reason}`); continue; }

    const negRate = stats.impressions > 200 ? (stats.notInterested + stats.hides + stats.reports) / stats.impressions : 0;
    if (negRate > 4 * base.negativeRate && stats.impressions > 500) { drop("negative_rate"); continue; }
    if (ct.qualityScore < 0.14) { drop("quality_floor"); continue; }
    if (ct.duplicateOf) { drop("duplicate"); continue; }
    if (creator.spamRisk > 0.75) { drop("creator_spam_risk"); continue; }
    quality.set(id, c);
  }
  stageCounts.s3_quality = quality.size;
  mark("s3_quality", s3);

  /* ============ STAGES 4-6: PREDICTION (shared trunk, 15 heads) ========= */
  const s4 = performance.now();

  const meanFatigueAcc: number[] = [];
  const featureUser: FeatureContextUser = {
    embedding: (user.embedding as number[]) ?? [],
    interests: interestMap,
    creatorAffinity: creatorAffMap,
    activityLevel: user.activityLevel,
    avgWatchRatio: user.avgWatchRatio,
    skipRate: user.skipRate,
    noveltyAppetite: user.noveltyAppetite,
    language: user.language,
    country: user.country,
    region: userRegion,
    sessionDepth: opts.sessionDepth ?? 1,
    recentEmbeddings,
    recentAudioIds,
    temporal,
  };

  interface Scored {
    id: string;
    row: JoinedCandidate;
    source: CandidateSource;
    phi: number[];
    pred: Predictions;
    breakdown: ScoreBreakdown;
    fatigue: number;
    explorationBonus: number;
    ageHours: number;
    cohortLift: number;
  }

  const scored: Scored[] = [];
  const fairnessBoost = 1;
  const epsilon = explorationBudget({
    drift,
    meanFatigue: 0,
    noveltyAppetite: user.noveltyAppetite,
    interactionCount: interests.reduce((a, r) => a + r.exposures, 0),
    fairnessBoost,
  });

  for (const [id, c] of quality) {
    const { content: ct, stats, creator } = c.row;
    const ageHours = hoursBetween(now, ct.publishedAt);
    const cohort = baselines.get(ct.topic) ?? DEFAULT_TOPIC_BASELINE;

    const locale = localeMultiplier(
      { language: user.language, country: user.country, region: userRegion },
      {
        language: ct.language,
        country: ct.country,
        region: ct.region,
        languageAgnostic: ["music", "dance", "pets", "art", "photography"].includes(ct.topic),
      },
    );

    const texp = topicExpMap.get(ct.topic);
    const longRunRate =
      (interestMap.get(ct.topic)?.affinity ?? 0.1) * 0.25 + 0.05;
    const recentRate = texp ? texp.windowEngagements / Math.max(1, texp.windowImpressions) : longRunRate;
    const consecutive = countTrailing(consecutiveTopics, ct.topic);
    const creatorImpressions = creatorRecentCount.get(ct.creatorId) ?? 0;

    const fat = topicFatigue({
      windowImpressions: texp?.windowImpressions ?? 0,
      windowEngagements: texp?.windowEngagements ?? 0,
      consecutive,
      engagementDecline: engagementDecline(recentRate, longRunRate),
      creatorImpressions,
      hoursSinceLast: texp ? hoursBetween(now, texp.updatedAt) : 72,
    });
    meanFatigueAcc.push(fat.fatigue);

    const featureContent: FeatureContextContent = {
      id: ct.id,
      creatorId: ct.creatorId,
      topic: ct.topic,
      subTopics: ct.subTopics as string[],
      language: ct.language,
      country: ct.country,
      region: ct.region,
      durationSec: ct.durationSec,
      ageHours,
      embedding: (ct.embedding as number[]) ?? [],
      audioId: ct.audioId,
      audioTrendScore: ct.audioTrendScore,
      qualityScore: ct.qualityScore,
      originalityScore: ct.originalityScore,
      productionScore: ct.productionScore,
      clarityScore: ct.clarityScore,
      educationalScore: ct.educationalScore,
      entertainmentScore: ct.entertainmentScore,
      hookStrength: ct.hookStrength,
      motionIntensity: ct.motionIntensity,
      lifecyclePosition: topicLifecyclePosition(ct.topic, ageHours),
      stats: {
        impressions: stats.impressions,
        views: stats.views,
        likes: stats.likes,
        comments: stats.comments,
        shares: stats.shares,
        saves: stats.saves,
        follows: stats.follows,
        completions: stats.q100,
        rewatches: stats.rewatches,
        watchTimeSec: stats.watchTimeSec,
        negativeRate: stats.negativeRate,
        spamProbability: stats.spamProbability,
        freshnessScore: stats.freshnessScore,
        momentumScore: stats.momentumScore,
        viralScore: stats.viralScore,
        acceleration: stats.acceleration,
      },
      creator: { trustScore: creator.trustScore, qualityScore: creator.qualityScore, region: creator.region },
    };

    const phi = buildFeatureVector(featureUser, featureContent, {
      topicFatigue: fat.fatigue,
      creatorFatigue: clamp(creatorImpressions / 6),
      priorImpressions: exposureMap.get(id)?.impressions ?? 0,
      hoursSinceTopic: texp ? hoursBetween(now, texp.updatedAt) : 72,
      localeLm: locale.lm,
      localeCm: locale.cm,
      localeRm: locale.rm,
      localeMultiplier: locale.multiplier,
      diffusedAffinity: diffusedAffinity(interestMap, ct.topic),
    });

    const pred = predictAll(bank, phi, ct.durationSec);

    /* ---- exploration bonus: Thompson posterior + UCB novelty ---- */
    const arm = seedArms.find((a) => a.key === ct.topic);
    const armPulls = arm?.pulls ?? 0;
    const uncertainty = 1 / Math.sqrt(1 + armPulls);
    const isNewCreator = creator.isNew || creator.tier === "new";
    const coldItem = ct.coldStartPhase <= 2;
    const explorationBonus =
      epsilon *
      (0.55 * uncertainty +
        0.25 * (coldItem ? 1 : 0) +
        0.2 * (isNewCreator ? 1 : 0)) *
      (0.6 + 0.4 * rnd());

    const emergingLift = isNewCreator ? 0.6 : creator.tier === "emerging" ? 0.3 : 0;
    const novelty = clamp(1 - Math.max(0, ...recentEmbeddings.map((r) => cosine(r, (ct.embedding as number[]) ?? []))));

    const breakdown = masterFeedScore({
      pred,
      durationSec: ct.durationSec,
      contentQuality: ct.qualityScore,
      creatorTrust: creator.trustScore,
      freshness: stats.freshnessScore,
      momentum: stats.momentumScore,
      viral: stats.viralScore,
      novelty,
      serendipity: clamp(pred.p_satisfaction * (1 - clamp(interestMap.get(ct.topic)?.affinity ?? 0)) * 1.4),
      emergingCreatorLift: emergingLift,
      spamProbability: stats.spamProbability,
      botProbability: stats.botProbability,
      integrityScore: ct.integrityScore,
      localeMultiplier: locale.multiplier,
      topicFatigue: fat.fatigue,
      creatorFatigue: clamp(creatorImpressions / 6),
      priorImpressions: exposureMap.get(id)?.impressions ?? 0,
      explorationBonus,
    });

    // Cohort-relative lift: how far above/below its topic cohort this item is
    // performing. Used only for telemetry + the emerging-creator fairness view.
    const cohortLift =
      stats.views > 0
        ? clamp(
            stats.watchTimeSec / (stats.views * Math.max(1, ct.durationSec)) /
              Math.max(1e-6, cohort.watchRatio),
            0,
            3,
          )
        : 1;
    scored.push({
      id, row: c.row, source: c.source, phi, pred, breakdown,
      fatigue: fat.fatigue, explorationBonus, ageHours, cohortLift,
    });
  }
  stageCounts.s4_scored = scored.length;
  mark("s4_engagement_prediction", s4);
  stageMs.s5_watchtime_prediction = 0; // fused into the shared trunk pass
  stageMs.s6_satisfaction_prediction = 0;

  /* ===================== STAGE 7: RE-RANKING ============================ */
  const s7 = performance.now();
  scored.sort((a, b) => b.breakdown.final - a.breakdown.final);
  const reranked = scored.slice(0, Math.max(pageSize * 12, 240));
  mark("s7_reranking", s7);

  /* ===================== STAGE 8: DIVERSITY INJECTION =================== */
  const s8 = performance.now();
  const divCandidates: DiversityCandidate[] = reranked.map((s) => ({
    contentId: s.id,
    creatorId: s.row.content.creatorId,
    topic: s.row.content.topic,
    vertical: TOPIC_INDEX[s.row.content.topic]?.vertical ?? "other",
    score: s.breakdown.final,
    embedding: (s.row.content.embedding as number[]) ?? [],
    coldStartPhase: s.row.content.coldStartPhase,
    pNegative: s.pred.p_negative,
    source: s.source,
  }));
  const { picked } = diversityRerank(divCandidates, Math.min(pageSize * 3, divCandidates.length), cosine);
  mark("s8_diversity", s8);

  /* ===================== STAGE 9: FRESHNESS BALANCING =================== */
  const s9 = performance.now();
  const scoredById = new Map(reranked.map((s) => [s.id, s]));
  const bucketCounts: Record<string, number> = {};
  const balanced: typeof reranked = [];
  const pool = picked.slice();

  while (balanced.length < Math.min(pageSize * 2, pool.length + balanced.length) && pool.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const s = scoredById.get(pool[i].contentId);
      if (!s) continue;
      const bucket = ageBucket(s.ageHours);
      const q = freshnessQuotaMultiplier(bucket, bucketCounts, balanced.length);
      const val = pool[i].score * q;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    const chosen = pool.splice(bestIdx, 1)[0];
    const s = scoredById.get(chosen.contentId);
    if (!s) continue;
    const bucket = ageBucket(s.ageHours);
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1;
    balanced.push(s);
  }
  mark("s9_freshness_balancing", s9);

  /* ===================== STAGE 10: FINAL FEED GENERATION ================ */
  const s10 = performance.now();
  const meanFatigue = meanFatigueAcc.length
    ? meanFatigueAcc.reduce((a, b) => a + b, 0) / meanFatigueAcc.length
    : 0;
  const daysSinceSignup = Math.max(0, (now.getTime() - user.createdAt.getTime()) / 86_400_000);
  const followingSupply = balanced.filter((s) => creatorAffMap.get(s.row.content.creatorId)?.isFollowing).length;
  const allocation = slotAllocation({
    satisfaction: user.satisfactionScore,
    meanFatigue,
    sessionDepth: opts.sessionDepth ?? 1,
    daysSinceSignup,
    followingSupplyRatio: clamp(followingSupply / Math.max(1, pageSize * 0.7), 0.4, 1.15),
    pageSize,
  });

  const items: FeedItem[] = [];
  const organicPicks = balanced.slice(0, pageSize);

  for (let i = 0; i < organicPicks.length; i++) {
    const s = organicPicks[i];
    const isFollowing = creatorAffMap.get(s.row.content.creatorId)?.isFollowing ?? false;
    items.push({
      rank: i,
      contentId: s.id,
      creatorId: s.row.content.creatorId,
      topic: s.row.content.topic,
      language: s.row.content.language,
      country: s.row.content.country,
      durationSec: s.row.content.durationSec,
      ageHours: Math.round(s.ageHours * 10) / 10,
      source: s.source,
      slotType: isFollowing ? "organic" : "recommended",
      finalScore: s.breakdown.final,
      breakdown: s.breakdown,
      predictions: s.pred,
      explorationBonus: s.explorationBonus,
      coldStartPhase: s.row.content.coldStartPhase,
      viralBand: viralBandOf(s.row.stats.viralScore),
      cohortLift: Number(s.cohortLift.toFixed(4)),
      topContributions: opts.explain === false ? [] : explainFeatures(s.phi, bank.p_satisfaction.weights, 6),
    });
  }

  /* ---- ad auction for the sponsored slots ---- */
  if (opts.includeAds !== false && allocation.sponsored > 0) {
    const adPositions = adSlots(pageSize, allocation.sponsored);
    const topOrganic = items[0]?.finalScore ?? 1;
    const marginalOrganic = items[items.length - 1]?.finalScore ?? topOrganic;
    const adUserCtx: AdUserContext = {
      topics: topTopics,
      country: user.country,
      language: user.language,
      satisfaction: user.satisfactionScore,
      adLoadRatio: allocation.sponsored / pageSize,
    };
    const winners = await runAdAuctions(
      user.id,
      adUserCtx,
      adPositions.length,
      temporal.hour,
      organicOpportunityCost(marginalOrganic, topOrganic),
      bank,
      featureUser,
      baselines,
      now,
    );
    winners.forEach((w, idx) => {
      const pos = Math.min(adPositions[idx] ?? pageSize - 1, items.length);
      items.splice(pos, 0, w);
    });
    while (items.length > pageSize) items.pop();
    items.forEach((it, i) => (it.rank = i));
  }

  /* ---- telemetry ---- */
  const sourceMix: Record<string, number> = {};
  const slotMix: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};
  for (const it of items) {
    sourceMix[it.source] = (sourceMix[it.source] ?? 0) + 1;
    slotMix[it.slotType] = (slotMix[it.slotType] ?? 0) + 1;
    topicCounts[it.topic] = (topicCounts[it.topic] ?? 0) + 1;
  }
  const diversityEntropy = normalizedEntropy(Object.values(topicCounts));
  mark("s10_final_assembly", s10);

  const totalMs = Math.round((performance.now() - t0) * 100) / 100;

  /* ---- logging (fire-and-forget in production via Kafka) ---- */
  if (opts.persist !== false) {
    try {
      await persistFeedLogs(requestId, user.id, items, scoredById, epsilon);
      await db.insert(pipelineRuns).values({
        requestId,
        userId: user.id,
        surface: opts.surface ?? "reels",
        totalMs,
        stageMs,
        stageCounts,
        sourceMix,
        slotMix,
      });
      if (opts.sessionId) {
        await db
          .update(sessions)
          .set({ itemsServed: sql`${sessions.itemsServed} + ${items.length}` })
          .where(eq(sessions.id, opts.sessionId));
      }
    } catch {
      /* logging must never fail a feed request */
    }
  }

  return {
    requestId,
    userId: user.id,
    generatedAt: now.toISOString(),
    items,
    telemetry: {
      totalMs,
      stageMs,
      stageCounts,
      sourceMix,
      slotMix,
      explorationBudget: epsilon,
      interestDrift: drift,
      meanFatigue,
      diversityEntropy,
      latentInterests: latent,
      modelVersions: Object.fromEntries(Object.entries(bank).map(([k, v]) => [k, v.version])),
    },
    filtered: {
      retrieved: retrievedCount,
      afterEligibility: eligible.size,
      afterQuality: quality.size,
      droppedReasons: dropped,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function countTrailing(seq: string[], value: string): number {
  let n = 0;
  for (const v of seq) {
    if (v === value) n++;
    else break;
  }
  return n;
}

function viralBandOf(score: number): string {
  return score >= 0.86 ? "mega" : score >= 0.72 ? "viral" : score >= 0.55 ? "hot" : score >= 0.35 ? "rising" : "normal";
}

async function persistFeedLogs(
  requestId: string,
  userId: string,
  items: FeedItem[],
  scoredById: Map<string, { phi: number[] }>,
  epsilon: number,
): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((it) => ({
    requestId,
    userId,
    contentId: it.contentId,
    rank: it.rank,
    source: it.source,
    slotType: it.slotType,
    finalScore: it.finalScore,
    features: scoredById.get(it.contentId)?.phi ?? [],
    predictions: it.predictions as unknown as Record<string, number>,
    labels: {},
    labeled: false,
    explorationBonus: it.explorationBonus,
    // inverse-propensity weight base: position-discounted softmax share
    propensity: clamp(1 / (1 + it.rank * 0.12) - epsilon * 0.05, 0.05, 1),
  }));
  await db.insert(feedLogs).values(rows);

  // exposure counters (dedupe + fatigue)
  for (const it of items) {
    await db.execute(sql`
      insert into user_content_exposure (user_id, content_id, impressions, last_seen_at)
      values (${userId}, ${it.contentId}, 1, now())
      on conflict (user_id, content_id)
      do update set impressions = user_content_exposure.impressions + 1, last_seen_at = now()
    `);
  }
  await db
    .update(contentStats)
    .set({ impressions: sql`${contentStats.impressions} + 1`, updatedAt: new Date() })
    .where(inArray(contentStats.contentId, items.map((i) => i.contentId)));
}

async function runAdAuctions(
  userId: string,
  adUserCtx: AdUserContext,
  slots: number,
  hourLocal: number,
  organicCost: number,
  bank: ModelBank,
  featureUser: FeatureContextUser,
  baselines: Map<string, TopicBaselineRow>,
  now: Date,
): Promise<FeedItem[]> {
  if (slots <= 0) return [];
  const { boostCampaigns, adImpressions } = await import("@/db/schema");

  const campaigns = await db
    .select({ campaign: boostCampaigns, content, stats: contentStats })
    .from(boostCampaigns)
    .innerJoin(content, eq(content.id, boostCampaigns.contentId))
    .innerJoin(contentStats, eq(contentStats.contentId, content.id))
    .where(and(eq(boostCampaigns.status, "active"), gte(boostCampaigns.endAt, now)))
    .limit(60);

  if (campaigns.length === 0) return [];

  const todayStart = new Date(now.getTime() - 24 * 3_600_000);
  const impCounts = await db
    .select({ campaignId: adImpressions.campaignId, n: sql<number>`count(*)::int` })
    .from(adImpressions)
    .where(and(eq(adImpressions.userId, userId), gte(adImpressions.createdAt, todayStart)))
    .groupBy(adImpressions.campaignId);
  const impMap = new Map(impCounts.map((r) => [r.campaignId, Number(r.n)]));

  const entries = campaigns.map((c) => {
    const semantic = cosine(featureUser.embedding, (c.content.embedding as number[]) ?? []);
    const affinity = featureUser.interests.get(c.content.topic)?.affinity ?? 0;
    const pClick = clamp(0.06 + 0.22 * clamp(semantic) + 0.14 * clamp(affinity));
    const pSat = clamp(0.35 + 0.4 * c.content.qualityScore + 0.2 * clamp(semantic));
    const cand: AdCandidate = {
      campaignId: c.campaign.id,
      contentId: c.content.id,
      advertiserId: c.campaign.advertiserId,
      objective: c.campaign.objective,
      bidValue: c.campaign.bidValue,
      dailyBudget: c.campaign.dailyBudget,
      spentToday: c.campaign.spentToday,
      frequencyCapPerDay: c.campaign.frequencyCapPerDay,
      impressionsToday: impMap.get(c.campaign.id) ?? 0,
      adQualityScore: c.campaign.adQualityScore,
      adRelevanceScore: c.campaign.adRelevanceScore,
      negativeFeedbackRate: c.campaign.negativeFeedbackRate,
      targetTopics: c.campaign.targetTopics as string[],
      targetCountries: c.campaign.targetCountries as string[],
      targetLanguages: c.campaign.targetLanguages as string[],
    };
    const relevanceGuess = clamp(0.5 * clamp(semantic) + 0.5 * clamp(affinity));
    return evaluateAd(
      cand,
      adUserCtx,
      {
        pClick,
        pConversion: clamp(pClick * 0.28 * (0.6 + 0.4 * relevanceGuess)),
        pSatisfaction: pSat,
        pPositiveEngagement: clamp(pClick * 1.4),
        pNegativeFeedback: clamp(0.02 + 0.06 * (1 - c.content.qualityScore)),
      },
      semantic,
      hourLocal,
    );
  });

  const winners: FeedItem[] = [];
  const used = new Set<string>();
  for (let i = 0; i < slots; i++) {
    const pool = entries.filter((e) => !used.has(e.candidate.campaignId));
    const result = runAuction(pool, organicCost);
    if (!result.winner) break;
    used.add(result.winner.candidate.campaignId);

    const c = campaigns.find((x) => x.campaign.id === result.winner!.candidate.campaignId);
    if (!c) continue;

    const ecpm = result.price * 1000 * result.winner.predictions.pConversion;
    void baselines;
    void bank;

    winners.push({
      rank: 0,
      contentId: c.content.id,
      creatorId: c.content.creatorId,
      topic: c.content.topic,
      language: c.content.language,
      country: c.content.country,
      durationSec: c.content.durationSec,
      ageHours: Math.round(hoursBetween(now, c.content.publishedAt) * 10) / 10,
      source: "sponsored",
      slotType: "sponsored",
      finalScore: result.winner.totalValue,
      breakdown: {
        uShort: 0, uLong: 0, uEco: 0, penalty: 0, base: result.winner.totalValue,
        localeGate: 1, fatigueGate: 1, trustGate: 1, gates: 1, explorationBonus: 0,
        final: result.winner.totalValue,
        terms: {
          advertiser_value: result.winner.advertiserValue,
          user_value: result.winner.userValue,
          quality_adjustment: result.winner.qualityAdjustment,
          pacing: result.winner.pacing,
          reserve: result.reservePrice,
        },
      },
      predictions: {
        p_like: result.winner.predictions.pPositiveEngagement,
        p_comment: 0, p_share: 0, p_save: 0, p_follow: 0, p_profile_visit: 0,
        watch_time: c.content.durationSec * 0.4, watch_ratio: 0.4,
        p_complete: 0.3, p_rewatch: 0.02,
        p_session_extend: 0.5,
        p_satisfaction: result.winner.predictions.pSatisfaction,
        p_return_tomorrow: 0.5, p_retention_7d: 0.35,
        p_negative: result.winner.predictions.pNegativeFeedback,
        p_viral: 0,
      },
      explorationBonus: 0,
      coldStartPhase: c.content.coldStartPhase,
      viralBand: "normal",
      cohortLift: 1,
      topContributions: [],
      ad: {
        campaignId: result.winner.candidate.campaignId,
        price: result.price,
        ecpm,
        relevance: result.winner.relevance,
      },
    });

    try {
      await db.insert(adImpressions).values({
        campaignId: result.winner.candidate.campaignId,
        userId,
        contentId: c.content.id,
        requestId: randomUUID(),
        ecpm,
        price: result.price,
        pClick: result.winner.predictions.pClick,
        pConversion: result.winner.predictions.pConversion,
        qualityAdjust: result.winner.qualityAdjustment,
        wonAuction: true,
      });
      await db
        .update(boostCampaigns)
        .set({
          spentToday: sql`${boostCampaigns.spentToday} + ${result.price}`,
          spentTotal: sql`${boostCampaigns.spentTotal} + ${result.price}`,
          pacingMultiplier: result.winner.pacing,
        })
        .where(eq(boostCampaigns.id, result.winner.candidate.campaignId));
    } catch {
      /* non-fatal */
    }
  }
  return winners;
}

export const _internal = { countTrailing, viralBandOf, lg };
