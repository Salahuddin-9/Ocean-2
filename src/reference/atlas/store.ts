/**
 * ATLAS-RANK :: serving-side data access.
 * In production these reads hit Redis/RocksDB feature stores with a Postgres
 * fallback; here they hit Postgres directly through Drizzle.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  banditArms,
  content,
  contentStats,
  creators,
  modelWeights,
  topicExposure,
  userContentExposure,
  userCreatorAffinity,
  userInterests,
  users,
} from "@/db/schema";
import { defaultModelBank, HEADS, type Head, type ModelBank } from "./models";
import { FEATURE_DIM } from "./features";

/* -------------------------------------------------------------------------- */
/* Model bank (hot-cached, refreshed every 30s — mirrors the etcd pointer swap) */
/* -------------------------------------------------------------------------- */

type BankCache = { bank: ModelBank; loadedAt: number };
const g = globalThis as typeof globalThis & { __atlasBank?: BankCache };
const BANK_TTL_MS = 30_000;

export async function loadModelBank(force = false): Promise<ModelBank> {
  const cached = g.__atlasBank;
  if (!force && cached && Date.now() - cached.loadedAt < BANK_TTL_MS) return cached.bank;

  const bank = defaultModelBank();
  try {
    const rows = await db.select().from(modelWeights);
    for (const r of rows) {
      const head = r.head as Head;
      if (!bank[head]) continue;
      if (Array.isArray(r.weights) && r.weights.length === FEATURE_DIM) {
        bank[head] = {
          ...bank[head],
          weights: r.weights as number[],
          bias: r.bias,
          calibA: r.calibA,
          calibB: r.calibB,
          learningRate: r.learningRate,
          l2: r.l2,
          samplesSeen: r.samplesSeen,
          trainLoss: r.trainLoss,
          validAuc: r.validAuc,
          version: r.version,
        };
      }
    }
  } catch {
    /* table may not exist yet during bootstrap */
  }
  g.__atlasBank = { bank, loadedAt: Date.now() };
  return bank;
}

export function invalidateModelBank(): void {
  g.__atlasBank = undefined;
}

export async function persistModelBank(bank: ModelBank): Promise<void> {
  for (const head of HEADS) {
    const m = bank[head];
    await db
      .insert(modelWeights)
      .values({
        head,
        version: m.version,
        weights: m.weights,
        bias: m.bias,
        calibA: m.calibA,
        calibB: m.calibB,
        lossType: head === "watch_time" ? "huber" : "logloss",
        learningRate: m.learningRate,
        l2: m.l2,
        samplesSeen: m.samplesSeen,
        trainLoss: m.trainLoss,
        validAuc: m.validAuc,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: modelWeights.head,
        set: {
          version: m.version,
          weights: m.weights,
          bias: m.bias,
          calibA: m.calibA,
          calibB: m.calibB,
          samplesSeen: m.samplesSeen,
          trainLoss: m.trainLoss,
          validAuc: m.validAuc,
          updatedAt: new Date(),
        },
      });
  }
  invalidateModelBank();
}

/* -------------------------------------------------------------------------- */
/* User-side reads                                                            */
/* -------------------------------------------------------------------------- */

export async function getUser(userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getInterests(userId: string) {
  return db
    .select()
    .from(userInterests)
    .where(eq(userInterests.userId, userId))
    .orderBy(desc(userInterests.affinity))
    .limit(80);
}

export async function getCreatorAffinities(userId: string) {
  return db
    .select()
    .from(userCreatorAffinity)
    .where(eq(userCreatorAffinity.userId, userId))
    .orderBy(desc(userCreatorAffinity.affinity))
    .limit(400);
}

export async function getRecentExposure(userId: string, sinceHours = 168) {
  const since = new Date(Date.now() - sinceHours * 3_600_000);
  return db
    .select()
    .from(userContentExposure)
    .where(and(eq(userContentExposure.userId, userId), gte(userContentExposure.lastSeenAt, since)))
    .limit(3000);
}

export async function getTopicExposure(userId: string) {
  return db.select().from(topicExposure).where(eq(topicExposure.userId, userId));
}

export async function getBanditArms(userId: string) {
  return db.select().from(banditArms).where(eq(banditArms.userId, userId));
}

/* -------------------------------------------------------------------------- */
/* Content-side reads                                                         */
/* -------------------------------------------------------------------------- */

export type ContentRow = typeof content.$inferSelect;
export type StatsRow = typeof contentStats.$inferSelect;
export type CreatorRow = typeof creators.$inferSelect;

export interface JoinedCandidate {
  content: ContentRow;
  stats: StatsRow;
  creator: CreatorRow;
}

const CANDIDATE_COLUMNS = {
  content,
  stats: contentStats,
  creator: creators,
};

export async function fetchCandidatesByIds(ids: string[]): Promise<JoinedCandidate[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(CANDIDATE_COLUMNS)
    .from(content)
    .innerJoin(contentStats, eq(contentStats.contentId, content.id))
    .innerJoin(creators, eq(creators.id, content.creatorId))
    .where(inArray(content.id, ids));
  return rows as JoinedCandidate[];
}

export interface RetrievalOptions {
  limit: number;
  topics?: string[];
  languages?: string[];
  countries?: string[];
  regions?: string[];
  creatorIds?: string[];
  maxAgeHours?: number;
  minPhase?: number;
  orderBy?: "recent" | "momentum" | "viral" | "quality" | "random";
  excludeIds?: string[];
}

export async function retrieve(opts: RetrievalOptions): Promise<JoinedCandidate[]> {
  const conds = [eq(content.isEligible, true), eq(content.status, "live")];
  if (opts.topics && opts.topics.length) conds.push(inArray(content.topic, opts.topics));
  if (opts.languages && opts.languages.length) conds.push(inArray(content.language, opts.languages));
  if (opts.countries && opts.countries.length) conds.push(inArray(content.country, opts.countries));
  if (opts.regions && opts.regions.length) conds.push(inArray(content.region, opts.regions));
  if (opts.creatorIds && opts.creatorIds.length) conds.push(inArray(content.creatorId, opts.creatorIds));
  if (opts.maxAgeHours) {
    conds.push(gte(content.publishedAt, new Date(Date.now() - opts.maxAgeHours * 3_600_000)));
  }

  const order =
    opts.orderBy === "momentum"
      ? desc(contentStats.momentumScore)
      : opts.orderBy === "viral"
        ? desc(contentStats.viralScore)
        : opts.orderBy === "quality"
          ? desc(content.qualityScore)
          : opts.orderBy === "random"
            ? sql`random()`
            : desc(content.publishedAt);

  const rows = await db
    .select(CANDIDATE_COLUMNS)
    .from(content)
    .innerJoin(contentStats, eq(contentStats.contentId, content.id))
    .innerJoin(creators, eq(creators.id, content.creatorId))
    .where(and(...conds))
    .orderBy(order)
    .limit(opts.limit);

  return rows as JoinedCandidate[];
}

/** Topic cohort baselines used by cold start + z-normalisation. */
export interface TopicBaselineRow {
  topic: string;
  watchRatio: number;
  completionRate: number;
  engagementNorm: number;
  negativeRate: number;
  viewVelocityMu: number;
  viewVelocitySd: number;
}

const baselineCache = globalThis as typeof globalThis & {
  __atlasBaselines?: { at: number; data: Map<string, TopicBaselineRow> };
};

export async function loadTopicBaselines(): Promise<Map<string, TopicBaselineRow>> {
  const c = baselineCache.__atlasBaselines;
  if (c && Date.now() - c.at < 60_000) return c.data;

  const map = new Map<string, TopicBaselineRow>();
  try {
    const rows = await db
      .select({
        topic: content.topic,
        watchRatio: sql<number>`coalesce(avg(${contentStats.watchTimeSec} / greatest(1, ${contentStats.views} * ${content.durationSec})), 0.42)`,
        completionRate: sql<number>`coalesce(avg(${contentStats.q100}::real / greatest(1, ${contentStats.views})), 0.3)`,
        engagementNorm: sql<number>`coalesce(avg((3.0*${contentStats.shares} + 2.2*${contentStats.saves} + 1.4*${contentStats.likes} + 2.6*${contentStats.follows}) / greatest(1, ${contentStats.views})), 0.12)`,
        negativeRate: sql<number>`coalesce(avg((${contentStats.notInterested} + ${contentStats.hides} + ${contentStats.reports})::real / greatest(1, ${contentStats.impressions})), 0.01)`,
        viewVelocityMu: sql<number>`coalesce(avg(${contentStats.vViews}), 30)`,
        viewVelocitySd: sql<number>`coalesce(stddev_samp(${contentStats.vViews}), 60)`,
      })
      .from(content)
      .innerJoin(contentStats, eq(contentStats.contentId, content.id))
      .groupBy(content.topic);

    for (const r of rows) {
      map.set(r.topic, {
        topic: r.topic,
        watchRatio: Number(r.watchRatio) || 0.42,
        completionRate: Number(r.completionRate) || 0.3,
        engagementNorm: Number(r.engagementNorm) || 0.12,
        negativeRate: Number(r.negativeRate) || 0.01,
        viewVelocityMu: Number(r.viewVelocityMu) || 30,
        viewVelocitySd: Number(r.viewVelocitySd) || 60,
      });
    }
  } catch {
    /* empty database */
  }
  baselineCache.__atlasBaselines = { at: Date.now(), data: map };
  return map;
}

export const DEFAULT_TOPIC_BASELINE: TopicBaselineRow = {
  topic: "_default",
  watchRatio: 0.42,
  completionRate: 0.3,
  engagementNorm: 0.12,
  negativeRate: 0.012,
  viewVelocityMu: 30,
  viewVelocitySd: 60,
};
