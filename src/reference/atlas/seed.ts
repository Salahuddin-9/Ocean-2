/**
 * ATLAS-RANK :: deterministic synthetic corpus generator.
 * Produces a statistically plausible slice of the platform so that the whole
 * pipeline (retrieval → ranking → cold start → virality → ads) is exercisable.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  banditArms,
  boostCampaigns,
  content,
  contentStats,
  creators,
  events,
  feedLogs,
  pipelineRuns,
  sessions,
  topicExposure,
  trustLedger,
  userContentExposure,
  userCreatorAffinity,
  userInterests,
  users,
} from "@/db/schema";
import { clamp, mulberry32, gaussian, lg } from "./mathkit";
import { COUNTRY_LANGUAGE, COUNTRY_TO_REGION, REGIONS, TOPICS, TOPIC_IDS } from "./taxonomy";
import { buildContentEmbedding, computeHookStrength, computeQualityVector, simhash64, tokenize } from "./content-model";
import { buildUserEmbedding, type InterestRow } from "./user-model";
import { DEFAULT_BASELINE, freshnessScore, momentumScore, viralPotential } from "./dynamics";

export interface SeedConfig {
  users: number;
  creators: number;
  content: number;
  campaigns: number;
  seed: number;
}

export const DEFAULT_SEED_CONFIG: SeedConfig = {
  users: 220,
  creators: 140,
  content: 1400,
  campaigns: 14,
  seed: 42,
};

const ALL_COUNTRIES = Object.keys(COUNTRY_TO_REGION);

const EDIT_STYLES = ["fast-cut", "talking-head", "standard", "cinematic", "montage"];
const AUDIO_TYPES = ["music", "speech", "ambient", "mixed"];

const CAPTION_BITS: Record<string, string[]> = {
  default: ["you won't believe", "step by step", "the truth about", "3 things", "how I", "why nobody tells you"],
};

function pick<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

export async function seedDatabase(cfgInput: Partial<SeedConfig> = {}) {
  const cfg: SeedConfig = { ...DEFAULT_SEED_CONFIG, seed: 42, ...cfgInput };
  const rnd = mulberry32(cfg.seed);
  const now = Date.now();

  /* ---------------- wipe ---------------- */
  await db.execute(sql`truncate table
    feed_logs, ad_impressions, pipeline_runs, trust_ledger, events,
    user_content_exposure, topic_exposure, bandit_arms, user_creator_affinity,
    user_interests, sessions, boost_campaigns, content_stats, content, creators, users
    restart identity cascade`);

  /* ---------------- creators ---------------- */
  const creatorRows: (typeof creators.$inferInsert)[] = [];
  for (let i = 0; i < cfg.creators; i++) {
    const country = pick(ALL_COUNTRIES, rnd);
    const region = COUNTRY_TO_REGION[country];
    const language = COUNTRY_LANGUAGE[country] ?? "en";
    const topic = pick(TOPIC_IDS, rnd);
    const ageDays = 5 + Math.floor(rnd() * 1600);
    const followers = Math.floor(Math.pow(10, 1.4 + rnd() * 5.2));
    const isNew = ageDays < 30 || followers < 500;
    const spamRisk = rnd() < 0.06 ? 0.55 + rnd() * 0.4 : rnd() * 0.12;
    const quality = clamp(0.28 + rnd() * 0.62 - spamRisk * 0.35);
    const consistency = clamp(0.2 + rnd() * 0.7);
    const satisfaction = clamp(0.25 + quality * 0.6 + rnd() * 0.2 - spamRisk * 0.4);
    const violationRisk = spamRisk > 0.5 ? 0.2 + rnd() * 0.5 : rnd() * 0.05;
    const trust = clamp(
      0.15 + 0.4 * quality + 0.2 * consistency + 0.2 * satisfaction + 0.12 * (lg(ageDays) / lg(1600)) - 0.7 * spamRisk,
    );
    creatorRows.push({
      id: `cr_${i.toString().padStart(4, "0")}`,
      handle: `@creator_${topic}_${i}`,
      language,
      country,
      region,
      primaryTopic: topic,
      followers,
      followersPrev: Math.floor(followers * (0.85 + rnd() * 0.2)),
      postCount: 3 + Math.floor(rnd() * 400),
      createdAt: new Date(now - ageDays * 86_400_000),
      trustScore: trust,
      qualityScore: quality,
      consistencyScore: consistency,
      audienceSatisfaction: satisfaction,
      retentionScore: clamp(0.6 * satisfaction + 0.4 * quality),
      growthVelocity: clamp(Math.tanh(gaussian(rnd) * 0.5), -1, 1),
      violationRisk,
      spamRisk,
      originalityScore: clamp(0.3 + rnd() * 0.65 - spamRisk * 0.5),
      strikes: violationRisk > 0.4 ? Math.floor(rnd() * 3) : 0,
      tier: isNew ? "new" : followers > 200_000 && trust > 0.7 ? "elite" : trust > 0.6 ? "established" : "emerging",
      historicalPerformance: clamp(0.2 + quality * 0.6 + gaussian(rnd) * 0.08),
      performanceVariance: clamp(0.05 + rnd() * 0.4),
      isNew,
    });
  }
  await db.insert(creators).values(creatorRows);

  /* ---------------- content ---------------- */
  const contentRows: (typeof content.$inferInsert)[] = [];
  const statRows: (typeof contentStats.$inferInsert)[] = [];

  for (let i = 0; i < cfg.content; i++) {
    const creator = creatorRows[Math.floor(rnd() * creatorRows.length)];
    const topicNode = rnd() < 0.72 ? TOPICS.find((t) => t.id === creator.primaryTopic)! : pick(TOPICS, rnd);
    const topic = topicNode.id;
    const ageHours = Math.pow(rnd(), 1.8) * 700 + 0.2;
    const publishedAt = new Date(now - ageHours * 3_600_000);
    const durationSec = [7, 11, 15, 21, 28, 34, 45, 58][Math.floor(rnd() * 8)];
    const subTopics = topicNode.subtopics.filter(() => rnd() < 0.55);
    const hashtags = [topic, ...subTopics, ...(rnd() < 0.3 ? ["fyp", "viral"] : [])].slice(0, 8);
    const caption = `${pick(CAPTION_BITS.default, rnd)} ${topic} ${subTopics.join(" ")}`.trim();
    const transcript = Array.from({ length: Math.floor(rnd() * 60) }, () => pick(topicNode.subtopics.concat([topic]), rnd)).join(" ");
    const ocrText = rnd() < 0.5 ? `${topic} tip ${Math.floor(rnd() * 10)}` : "";
    const motionIntensity = clamp(0.2 + rnd() * 0.75);
    const sceneChanges = Math.max(1, Math.round((durationSec / 4) * (0.4 + rnd() * 1.4)));
    const faceCount = Math.floor(rnd() * 4);
    const speechRatio = clamp(rnd());
    const audioId = `aud_${Math.floor(rnd() * 220)}`;
    const audioTrendScore = clamp(Math.pow(rnd(), 2.2));
    const isDuplicate = rnd() < 0.05;
    const editingStyle = pick(EDIT_STYLES, rnd);

    const qv = computeQualityVector({
      durationSec,
      sceneChanges,
      faceCount,
      motionIntensity,
      speechRatio,
      transcriptLen: transcript.length,
      hashtagCount: hashtags.length,
      captionLen: caption.length,
      originality: clamp(creator.originalityScore! + gaussian(rnd) * 0.15),
      creatorQuality: creator.qualityScore!,
      isDuplicate,
    });

    const embedding = buildContentEmbedding({
      topic,
      subTopics,
      keywords: tokenize(caption).slice(0, 8),
      hashtags,
      transcript,
      ocrText,
      caption,
      title: caption,
      audioId,
      audioType: pick(AUDIO_TYPES, rnd),
      language: creator.language!,
    });

    const hookStrength = computeHookStrength({
      motionIntensity,
      faceCount,
      ocrLen: ocrText.length,
      audioTrendScore,
      editingStyle,
    });

    const country = rnd() < 0.82 ? creator.country! : pick(ALL_COUNTRIES, rnd);
    const id = `ct_${i.toString().padStart(5, "0")}`;

    // Simulate accumulated performance driven by latent quality.
    const latentAppeal = clamp(0.45 * qv.quality + 0.3 * hookStrength + 0.25 * creator.audienceSatisfaction! + gaussian(rnd) * 0.12);
    const maturity = clamp(1 - Math.pow(2, -ageHours / 26));
    const scale = Math.pow(10, 1.1 + latentAppeal * 3.9) * maturity;
    const impressions = Math.max(3, Math.floor(scale * (0.7 + rnd() * 0.7)));
    const views = Math.floor(impressions * clamp(0.55 + 0.4 * hookStrength));
    const watchRatio = clamp(0.18 + 0.62 * latentAppeal + gaussian(rnd) * 0.08, 0.03, 1.3);
    const watchTimeSec = views * durationSec * watchRatio;
    const q100 = Math.floor(views * clamp(watchRatio * 0.85, 0, 0.95));
    const likes = Math.floor(views * clamp(0.012 + 0.09 * latentAppeal + gaussian(rnd) * 0.01, 0, 0.35));
    const comments = Math.floor(likes * clamp(0.06 + rnd() * 0.16));
    const shares = Math.floor(views * clamp(0.001 + 0.035 * Math.pow(latentAppeal, 2.1), 0, 0.12));
    const saves = Math.floor(views * clamp(0.002 + 0.04 * latentAppeal * (qv.educational + 0.3), 0, 0.14));
    const follows = Math.floor(views * clamp(0.0004 + 0.008 * latentAppeal, 0, 0.03));
    const negatives = Math.floor(impressions * clamp(0.02 * (1 - latentAppeal) + (creator.spamRisk! > 0.4 ? 0.03 : 0), 0, 0.15));
    const rewatches = Math.floor(views * clamp(0.01 + 0.11 * latentAppeal * (durationSec < 20 ? 1.4 : 0.6), 0, 0.4));

    const vViews = (views / Math.max(1, ageHours)) * (0.4 + 1.6 * Math.pow(rnd(), 2));
    const vShares = shares / Math.max(1, ageHours);
    const vSaves = saves / Math.max(1, ageHours);
    const vComments = comments / Math.max(1, ageHours);
    const vFollows = follows / Math.max(1, ageHours);
    const vWatch = watchTimeSec / Math.max(1, ageHours);
    const vViewsPrev = vViews * (0.5 + rnd() * 0.9);

    const regionsReached = [COUNTRY_TO_REGION[country]];
    if (latentAppeal > 0.6) regionsReached.push(...(REGIONS[COUNTRY_TO_REGION[country]]?.neighbors ?? []).slice(0, 2));

    const spamProbability = clamp(creator.spamRisk! * 0.7 + (isDuplicate ? 0.2 : 0) + rnd() * 0.05);
    const botProbability = clamp(creator.spamRisk! * 0.5 + rnd() * 0.05);
    const negativeRate = negatives / Math.max(1, impressions);

    const dyn = {
      ageHours, topic, impressions, views, watchTimeSec, durationSec,
      completions: q100, rewatches, likes, comments, shares, saves, follows, negatives,
      vViews, vWatch, vShares, vSaves, vComments, vFollows, vViewsPrev,
      regionsReached: regionsReached.length, totalRegions: 7, baseline: DEFAULT_BASELINE,
    };
    const fresh = freshnessScore(dyn);
    const mom = momentumScore(dyn);
    const viral = viralPotential(dyn, { spamProbability, botProbability, negativeRate });

    let phase = impressions < 50 ? 1 : impressions < 500 ? 2 : impressions < 5000 ? 3 : impressions < 50_000 ? 4 : impressions < 500_000 ? 5 : 6;
    // ~14% of the corpus is deliberately left one phase behind its accrued
    // impressions, i.e. sitting AT its distribution cap awaiting a promotion
    // decision. This is the realistic steady state: the ladder always has a
    // backlog of posts pending evaluation.
    if (phase > 1 && rnd() < 0.14) phase -= 1;

    contentRows.push({
      id,
      creatorId: creator.id!,
      kind: durationSec > 40 ? "short" : "reel",
      surface: "reels",
      topic,
      subTopics,
      language: creator.language!,
      country,
      region: COUNTRY_TO_REGION[country],
      durationSec,
      publishedAt,
      title: caption.slice(0, 60),
      caption,
      hashtags,
      ocrText,
      transcript,
      keywords: tokenize(caption).slice(0, 8),
      textSentiment: clamp(gaussian(rnd) * 0.4, -1, 1),
      sceneChanges,
      objectTags: subTopics,
      faceCount,
      emotionValence: clamp(gaussian(rnd) * 0.4, -1, 1),
      emotionArousal: clamp(rnd()),
      motionIntensity,
      editingStyle,
      hookStrength,
      audioId,
      audioType: pick(AUDIO_TYPES, rnd),
      audioTrendScore,
      audioSentiment: clamp(gaussian(rnd) * 0.35, -1, 1),
      speechRatio,
      originalityScore: qv.originality,
      qualityScore: qv.quality,
      productionScore: qv.production,
      clarityScore: qv.clarity,
      educationalScore: qv.educational,
      entertainmentScore: qv.entertainment,
      safetyLabel: creator.violationRisk! > 0.5 && rnd() < 0.25 ? "borderline" : "safe",
      integrityScore: clamp(1 - spamProbability * 0.7),
      isEligible: true,
      isRecommendable: creator.violationRisk! < 0.6,
      status: "live",
      duplicateOf: null,
      simhash: simhash64(tokenize(`${caption} ${transcript}`)),
      embedding,
      coldStartPhase: phase,
      coldStartCap: [50, 500, 5000, 50_000, 500_000, 2_000_000_000][phase - 1],
      coldStartUpdatedAt: publishedAt,
      isBoosted: false,
    });

    statRows.push({
      contentId: id,
      impressions, views, uniqueViewers: Math.floor(views * 0.94),
      watchTimeSec,
      ret1s: Math.floor(views * 0.92), ret3s: Math.floor(views * clamp(0.4 + hookStrength * 0.55)),
      ret5s: Math.floor(views * clamp(0.3 + hookStrength * 0.5)), ret10s: Math.floor(views * clamp(0.2 + hookStrength * 0.45)),
      q25: Math.floor(views * clamp(watchRatio * 1.6, 0, 0.98)), q50: Math.floor(views * clamp(watchRatio * 1.25, 0, 0.96)),
      q75: Math.floor(views * clamp(watchRatio * 1.05, 0, 0.94)), q100,
      rewatches, likes, comments, shares, saves, follows,
      profileVisits: Math.floor(follows * 4.2), audioReuse: Math.floor(shares * 0.12),
      skips: Math.floor(impressions * clamp(0.25 * (1 - hookStrength) + 0.05)),
      fastScrolls: Math.floor(impressions * clamp(0.14 * (1 - hookStrength))),
      notInterested: Math.floor(negatives * 0.5), hides: Math.floor(negatives * 0.32),
      reports: Math.floor(negatives * 0.06), mutes: Math.floor(negatives * 0.12),
      sessionExits: Math.floor(views * 0.05),
      vViews, vWatch, vShares, vSaves, vComments, vFollows, vViewsPrev,
      acceleration: mom.acceleration,
      freshnessScore: fresh, momentumScore: mom.score, viralScore: viral.score,
      regionSpread: regionsReached.length / 7, regionsReached,
      spamProbability, botProbability, negativeRate,
      satisfactionScore: clamp(0.2 + latentAppeal * 0.7),
      updatedAt: new Date(now - rnd() * 3_600_000),
    });
  }

  for (let i = 0; i < contentRows.length; i += 400) {
    await db.insert(content).values(contentRows.slice(i, i + 400));
    await db.insert(contentStats).values(statRows.slice(i, i + 400));
  }

  /* ---------------- users + interest graphs ---------------- */
  const userRows: (typeof users.$inferInsert)[] = [];
  const interestRows: (typeof userInterests.$inferInsert)[] = [];
  const affinityRows: (typeof userCreatorAffinity.$inferInsert)[] = [];
  const banditRows: (typeof banditArms.$inferInsert)[] = [];
  const topicExpRows: (typeof topicExposure.$inferInsert)[] = [];

  for (let i = 0; i < cfg.users; i++) {
    const country = pick(ALL_COUNTRIES, rnd);
    const region = COUNTRY_TO_REGION[country];
    const language = COUNTRY_LANGUAGE[country] ?? "en";
    const id = `us_${i.toString().padStart(4, "0")}`;
    const ageDays = 1 + Math.floor(Math.pow(rnd(), 1.5) * 900);
    const isBotLike = rnd() < 0.05;

    // 3–7 primary interests with a power-law affinity profile
    const nInterests = 3 + Math.floor(rnd() * 5);
    const chosen = new Set<string>();
    const primary = pick(TOPIC_IDS, rnd);
    chosen.add(primary);
    while (chosen.size < nInterests) chosen.add(pick(TOPIC_IDS, rnd));

    const rows: InterestRow[] = [];
    let rank = 0;
    for (const topic of chosen) {
      const affinity = clamp(0.92 * Math.pow(0.82, rank) + gaussian(rnd) * 0.06, 0.05, 0.98);
      const longTerm = clamp(affinity * (0.6 + rnd() * 0.4));
      const shortTerm = clamp(affinity * (0.7 + rnd() * 0.6));
      const exposures = Math.floor(10 + rnd() * 400);
      const engagements = Math.floor(exposures * clamp(affinity * 0.35 + rnd() * 0.08));
      const momentum = clamp(gaussian(rnd) * 0.35, -1, 1.5);
      rows.push({
        topic, affinity, shortTerm, longTerm, momentum,
        confidence: clamp(engagements / Math.max(1, exposures)),
        exposures, engagements, negatives: Math.floor(exposures * 0.02),
        kind: momentum > 0.35 ? "growing" : momentum < -0.3 ? "declining" : longTerm > 0.55 ? "permanent" : "stable",
        latent: false,
        lastEventAt: new Date(now - rnd() * 72 * 3_600_000),
      });
      rank++;
    }

    const embedding = buildUserEmbedding(rows);

    for (const r of rows) {
      interestRows.push({
        userId: id, topic: r.topic, affinity: r.affinity, shortTerm: r.shortTerm,
        longTerm: r.longTerm, momentum: r.momentum, confidence: r.confidence,
        exposures: r.exposures, engagements: r.engagements, negatives: r.negatives,
        kind: r.kind, latent: false, lastEventAt: r.lastEventAt, updatedAt: new Date(),
      });
      banditRows.push({
        userId: id, armType: "topic", armKey: r.topic,
        alpha: 1 + r.engagements * 0.05, beta: 1 + (r.exposures - r.engagements) * 0.02,
        pulls: r.exposures, reward: r.engagements * 0.05,
      });
      topicExpRows.push({
        userId: id, topic: r.topic,
        windowImpressions: Math.floor(rnd() * 14),
        windowEngagements: Math.floor(rnd() * 5),
        consecutive: Math.floor(rnd() * 3),
        engagementDecline: clamp(rnd() * 0.5),
        fatigue: clamp(rnd() * 0.4),
        updatedAt: new Date(now - rnd() * 24 * 3_600_000),
      });
    }

    // follows: 5–40 creators skewed to matching topics
    const matching = creatorRows.filter((c) => chosen.has(c.primaryTopic!));
    const nFollows = Math.min(matching.length, 3 + Math.floor(rnd() * 24));
    const followed = new Set<string>();
    for (let k = 0; k < nFollows; k++) {
      const c = matching[Math.floor(rnd() * matching.length)];
      if (!c || followed.has(c.id!)) continue;
      followed.add(c.id!);
      affinityRows.push({
        userId: id, creatorId: c.id!,
        affinity: clamp(0.25 + rnd() * 0.7),
        isFollowing: true, isMuted: rnd() < 0.02, isBlocked: rnd() < 0.008,
        watchedCount: Math.floor(rnd() * 60), engagedCount: Math.floor(rnd() * 22),
        negativeCount: Math.floor(rnd() * 3),
        lastSeenAt: new Date(now - rnd() * 168 * 3_600_000),
      });
    }

    const satisfaction = clamp(0.35 + rnd() * 0.55 - (isBotLike ? 0.3 : 0));
    userRows.push({
      id,
      handle: `@user_${i}`,
      language, country, region,
      timezoneOffset: [-480, -300, -180, 0, 60, 180, 330, 420, 540][Math.floor(rnd() * 9)],
      deviceClass: pick(["low", "mid", "high"], rnd),
      networkClass: pick(["cell", "wifi"], rnd),
      createdAt: new Date(now - ageDays * 86_400_000),
      lastActiveAt: new Date(now - rnd() * 48 * 3_600_000),
      activityLevel: clamp(0.15 + rnd() * 0.8),
      avgSessionSec: 120 + rnd() * 1200,
      sessionsPerDay: 1 + rnd() * 9,
      avgWatchRatio: clamp(0.2 + rnd() * 0.6),
      skipRate: clamp(0.15 + rnd() * 0.5),
      engagementRate: clamp(0.01 + rnd() * 0.12),
      noveltyAppetite: clamp(rnd()),
      satisfactionScore: satisfaction,
      retentionD1: clamp(0.3 + satisfaction * 0.6),
      retentionD7: clamp(0.15 + satisfaction * 0.55),
      retentionD30: clamp(0.05 + satisfaction * 0.45),
      ltvScore: clamp(satisfaction * 0.7 + rnd() * 0.3),
      trustScore: isBotLike ? clamp(0.05 + rnd() * 0.25) : clamp(0.6 + rnd() * 0.4),
      botProbability: isBotLike ? clamp(0.6 + rnd() * 0.38) : clamp(rnd() * 0.1),
      isSynthetic: true,
      embedding,
    });
  }

  for (let i = 0; i < userRows.length; i += 200) await db.insert(users).values(userRows.slice(i, i + 200));
  for (let i = 0; i < interestRows.length; i += 400) await db.insert(userInterests).values(interestRows.slice(i, i + 400));
  for (let i = 0; i < affinityRows.length; i += 400) await db.insert(userCreatorAffinity).values(affinityRows.slice(i, i + 400));
  for (let i = 0; i < banditRows.length; i += 400) await db.insert(banditArms).values(banditRows.slice(i, i + 400));
  for (let i = 0; i < topicExpRows.length; i += 400) await db.insert(topicExposure).values(topicExpRows.slice(i, i + 400));

  /* ---------------- boosted campaigns ---------------- */
  const campaignRows: (typeof boostCampaigns.$inferInsert)[] = [];
  for (let i = 0; i < cfg.campaigns; i++) {
    const ct = contentRows[Math.floor(rnd() * contentRows.length)];
    const objective = pick(["reach", "engagement", "traffic", "conversion", "follows"], rnd);
    campaignRows.push({
      id: `bp_${i.toString().padStart(3, "0")}`,
      contentId: ct.id!,
      advertiserId: `adv_${Math.floor(rnd() * 40)}`,
      objective,
      bidType: "oCPM",
      bidValue: 1.5 + rnd() * 14,
      dailyBudget: 20 + rnd() * 480,
      totalBudget: 500 + rnd() * 9000,
      spentToday: rnd() * 120,
      spentTotal: rnd() * 2400,
      startAt: new Date(now - rnd() * 10 * 86_400_000),
      endAt: new Date(now + (2 + rnd() * 40) * 86_400_000),
      targetTopics: rnd() < 0.75 ? [ct.topic!] : [],
      targetCountries: rnd() < 0.6 ? [ct.country!] : [],
      targetLanguages: rnd() < 0.6 ? [ct.language!] : [],
      frequencyCapPerDay: 2 + Math.floor(rnd() * 4),
      adQualityScore: clamp(0.25 + rnd() * 0.7),
      adRelevanceScore: clamp(0.3 + rnd() * 0.6),
      negativeFeedbackRate: clamp(rnd() * 0.055),
      pacingMultiplier: 1,
      status: "active",
    });
  }
  await db.insert(boostCampaigns).values(campaignRows);
  await db
    .update(content)
    .set({ isBoosted: true })
    .where(sql`${content.id} in ${sql.raw(`(${campaignRows.map((c) => `'${c.contentId}'`).join(",")})`)}`);

  /* ---------------- sessions + historical events ---------------- */
  const sessionRows: (typeof sessions.$inferInsert)[] = [];
  const eventRows: (typeof events.$inferInsert)[] = [];
  for (let i = 0; i < Math.min(cfg.users, 160); i++) {
    const u = userRows[i];
    const nSess = 1 + Math.floor(rnd() * 6);
    for (let s = 0; s < nSess; s++) {
      const sid = `se_${i}_${s}`;
      const startedAt = new Date(now - rnd() * 14 * 86_400_000);
      const items = 4 + Math.floor(rnd() * 30);
      const dur = items * (8 + rnd() * 22);
      sessionRows.push({
        id: sid, userId: u.id!, startedAt,
        endedAt: new Date(startedAt.getTime() + dur * 1000),
        durationSec: dur, itemsServed: items,
        itemsWatched: Math.floor(items * 0.8), itemsEngaged: Math.floor(items * 0.14),
        itemsSkipped: Math.floor(items * 0.3), totalWatchSec: dur * 0.75,
        satisfaction: clamp(u.satisfactionScore ?? 0.5), surface: "reels",
      });
      for (let k = 0; k < Math.min(items, 8); k++) {
        const ct = contentRows[Math.floor(rnd() * contentRows.length)];
        const watchMs = Math.floor(ct.durationSec! * 1000 * clamp(rnd() * 1.1));
        eventRows.push({
          eventId: `ev_${i}_${s}_${k}`, userId: u.id!, sessionId: sid,
          contentId: ct.id!, creatorId: ct.creatorId!, requestId: null,
          eventType: "watch_progress", surface: "reels", position: k, value: 1,
          watchMs, durationMs: ct.durationSec! * 1000, replays: rnd() < 0.1 ? 1 : 0,
          dwellMs: watchMs, clientTs: startedAt, createdAt: startedAt, context: {},
        });
        if (rnd() < 0.1) {
          eventRows.push({
            eventId: `ev_${i}_${s}_${k}_l`, userId: u.id!, sessionId: sid,
            contentId: ct.id!, creatorId: ct.creatorId!, requestId: null,
            eventType: "like", surface: "reels", position: k, value: 1,
            watchMs: 0, durationMs: 0, replays: 0, dwellMs: 0,
            clientTs: startedAt, createdAt: startedAt, context: {},
          });
        }
      }
    }
  }
  for (let i = 0; i < sessionRows.length; i += 400) await db.insert(sessions).values(sessionRows.slice(i, i + 400));
  for (let i = 0; i < eventRows.length; i += 500) await db.insert(events).values(eventRows.slice(i, i + 500));

  /* ---------------- integrity ledger samples ---------------- */
  const suspicious = creatorRows.filter((c) => (c.spamRisk ?? 0) > 0.5).slice(0, 30);
  if (suspicious.length) {
    await db.insert(trustLedger).values(
      suspicious.map((c) => ({
        entityType: "creator",
        entityId: c.id!,
        detector: pick(["burst", "pod", "farm", "coordination", "duplicate"], rnd),
        signalValue: clamp(0.5 + rnd() * 0.5),
        weight: 1,
        verdict: "suspect",
        evidence: { spamRisk: c.spamRisk, followers: c.followers },
      })),
    );
  }

  void feedLogs;
  void pipelineRuns;
  void userContentExposure;

  return {
    users: userRows.length,
    creators: creatorRows.length,
    content: contentRows.length,
    interests: interestRows.length,
    follows: affinityRows.length,
    campaigns: campaignRows.length,
    sessions: sessionRows.length,
    events: eventRows.length,
  };
}
