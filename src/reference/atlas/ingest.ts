/**
 * ATLAS-RANK :: Real-Time Feedback Loop / Online Learning (spec §20).
 *
 * Production topology:
 *   client SDK ──► Edge collector ──► Kafka `events.raw` (partition = user_id)
 *        ├──► Flink "user-state"   : interest graph, session state, fatigue   (p99 350 ms)
 *        ├──► Flink "content-state": counters, velocities, freshness/momentum (p99 800 ms)
 *        ├──► Flink "label-joiner" : joins events to `feed_logs` on
 *        │                            (request_id, content_id) with a 30-min
 *        │                            watermark → emits training examples
 *        ├──► Flink "integrity"    : burst/pod/farm detectors
 *        └──► Online trainer       : streaming SGD, model push every 60 s
 *
 * This module implements all five consumers synchronously against Postgres.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  banditArms,
  content,
  contentStats,
  creators,
  events,
  feedLogs,
  sessions,
  topicExposure,
  userCreatorAffinity,
  userInterests,
  users,
} from "@/db/schema";
import { clamp, halfLifeDecay, hoursBetween, lg } from "./mathkit";
import { interestSignal, SIGNALS, watchReward, type EventType } from "./signals";
import { updateInterest, buildUserEmbedding, type InterestRow } from "./user-model";
import { DEFAULT_BASELINE, freshnessScore, momentumScore, updateVelocity, viralPotential } from "./dynamics";
import { evaluateColdStart } from "./coldstart";
import { satisfactionScore } from "./context";
import { loadModelBank, persistModelBank, loadTopicBaselines, DEFAULT_TOPIC_BASELINE } from "./store";
import { HEADS, sgdStep, type Head, type ModelBank } from "./models";

export interface IncomingEvent {
  userId: string;
  sessionId?: string;
  contentId?: string;
  requestId?: string;
  eventType: EventType;
  watchMs?: number;
  durationMs?: number;
  replays?: number;
  dwellMs?: number;
  position?: number;
  surface?: string;
  value?: number;
  context?: Record<string, unknown>;
}

export interface IngestResult {
  accepted: number;
  interestUpdates: { topic: string; before: number; after: number; delta: number }[];
  contentUpdated: string[];
  coldStartTransitions: { contentId: string; from: number; to: number; decision: string; reason: string }[];
  onlineLearning: { examples: number; heads: Record<string, number> };
  banditUpdates: number;
}

/** Head → label extraction from a set of events on the same (request, content). */
function labelsFromEvents(
  evts: IncomingEvent[],
  durationSec: number,
): Partial<Record<Head, number>> {
  const has = (t: EventType) => evts.some((e) => e.eventType === t);
  const watchSec = Math.max(...evts.map((e) => (e.watchMs ?? 0) / 1000), 0);
  const replays = Math.max(...evts.map((e) => e.replays ?? 0), 0);
  const negative =
    has("not_interested") || has("hide") || has("report") || has("mute_creator") || has("block_creator");

  return {
    p_like: has("like") || has("love") ? 1 : 0,
    p_comment: has("comment") ? 1 : 0,
    p_share: has("share") || has("dm_share") ? 1 : 0,
    p_save: has("save") || has("playlist_add") ? 1 : 0,
    p_follow: has("follow") || has("subscribe") ? 1 : 0,
    p_profile_visit: has("profile_visit") ? 1 : 0,
    watch_time: watchSec,
    p_complete: watchSec >= 0.95 * durationSec ? 1 : 0,
    p_rewatch: replays > 0 || has("replay") || has("rewatch") ? 1 : 0,
    p_session_extend: has("session_exit") ? 0 : 1,
    p_negative: negative ? 1 : 0,
  };
}

export async function ingestEvents(incoming: IncomingEvent[]): Promise<IngestResult> {
  const now = new Date();
  const result: IngestResult = {
    accepted: 0,
    interestUpdates: [],
    contentUpdated: [],
    coldStartTransitions: [],
    onlineLearning: { examples: 0, heads: {} },
    banditUpdates: 0,
  };
  if (incoming.length === 0) return result;

  const userId = incoming[0].userId;
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error(`unknown user ${userId}`);

  /* ---------- 0. append to the event log (Kafka landing table) ---------- */
  const contentIds = [...new Set(incoming.map((e) => e.contentId).filter(Boolean))] as string[];
  const contentRows = contentIds.length
    ? await db.select().from(content).where(inArray(content.id, contentIds))
    : [];
  const contentMap = new Map(contentRows.map((c) => [c.id, c]));

  await db.insert(events).values(
    incoming.map((e) => ({
      eventId: `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
      userId: e.userId,
      sessionId: e.sessionId ?? "sess-adhoc",
      contentId: e.contentId ?? null,
      creatorId: e.contentId ? (contentMap.get(e.contentId)?.creatorId ?? null) : null,
      requestId: e.requestId ?? null,
      eventType: e.eventType,
      surface: e.surface ?? "reels",
      position: e.position ?? 0,
      value: e.value ?? 1,
      watchMs: e.watchMs ?? 0,
      durationMs: e.durationMs ?? 0,
      replays: e.replays ?? 0,
      dwellMs: e.dwellMs ?? 0,
      clientTs: now,
      context: e.context ?? {},
    })),
  );
  result.accepted = incoming.length;

  /* ---------- 1. USER STATE: interest graph + creator affinity ---------- */
  const trust = user.trustScore;
  const existing = await db.select().from(userInterests).where(eq(userInterests.userId, userId));
  const rowByTopic = new Map(existing.map((r) => [r.topic, r]));
  const touchedTopics = new Set<string>();
  const creatorDeltas = new Map<string, { watch: number; engage: number; neg: number; follow: boolean }>();

  for (const e of incoming) {
    const c = e.contentId ? contentMap.get(e.contentId) : undefined;
    if (!c) continue;
    const durationSec = Math.max(1, (e.durationMs ?? c.durationSec * 1000) / 1000);
    const watchRatio = (e.watchMs ?? 0) / 1000 / durationSec;
    const signal = interestSignal(e.eventType, trust, watchRatio);
    if (Math.abs(signal) < 1e-4) continue;

    const prev = rowByTopic.get(c.topic);
    const base: InterestRow = prev
      ? {
          topic: prev.topic,
          affinity: prev.affinity,
          shortTerm: prev.shortTerm,
          longTerm: prev.longTerm,
          momentum: prev.momentum,
          confidence: prev.confidence,
          exposures: prev.exposures,
          engagements: prev.engagements,
          negatives: prev.negatives,
          kind: prev.kind,
          latent: prev.latent,
          lastEventAt: prev.lastEventAt,
        }
      : {
          topic: c.topic,
          affinity: 0, shortTerm: 0, longTerm: 0, momentum: 0, confidence: 0,
          exposures: 0, engagements: 0, negatives: 0, kind: "emerging", latent: false,
          lastEventAt: now,
        };

    const before = base.affinity;
    const upd = updateInterest(base, signal, now, clamp(user.activityLevel));
    result.interestUpdates.push({ topic: c.topic, before, after: upd.affinity, delta: upd.delta });
    touchedTopics.add(c.topic);

    rowByTopic.set(c.topic, {
      ...(prev ?? {
        id: 0, userId, topic: c.topic, seasonalPhase: 0, updatedAt: now,
      }),
      userId,
      topic: c.topic,
      affinity: upd.affinity,
      shortTerm: upd.shortTerm,
      longTerm: upd.longTerm,
      momentum: upd.momentum,
      confidence: upd.confidence,
      exposures: upd.exposures,
      engagements: upd.engagements,
      negatives: upd.negatives,
      kind: upd.kind,
      latent: false,
      lastEventAt: now,
      updatedAt: now,
    } as typeof existing[number]);

    const cd = creatorDeltas.get(c.creatorId) ?? { watch: 0, engage: 0, neg: 0, follow: false };
    if (watchRatio > 0.3) cd.watch += 1;
    if (signal > 0.2) cd.engage += 1;
    if (signal < 0) cd.neg += 1;
    if (e.eventType === "follow" || e.eventType === "subscribe") cd.follow = true;
    creatorDeltas.set(c.creatorId, cd);
  }

  for (const [topic, row] of rowByTopic) {
    if (!touchedTopics.has(topic)) continue;
    await db
      .insert(userInterests)
      .values({
        userId,
        topic,
        affinity: row.affinity,
        shortTerm: row.shortTerm,
        longTerm: row.longTerm,
        momentum: row.momentum,
        confidence: row.confidence,
        exposures: row.exposures,
        engagements: row.engagements,
        negatives: row.negatives,
        kind: row.kind,
        latent: false,
        lastEventAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userInterests.userId, userInterests.topic],
        set: {
          affinity: row.affinity,
          shortTerm: row.shortTerm,
          longTerm: row.longTerm,
          momentum: row.momentum,
          confidence: row.confidence,
          exposures: row.exposures,
          engagements: row.engagements,
          negatives: row.negatives,
          kind: row.kind,
          lastEventAt: now,
          updatedAt: now,
        },
      });
  }

  for (const [creatorId, d] of creatorDeltas) {
    await db.execute(sql`
      insert into user_creator_affinity (user_id, creator_id, affinity, is_following, watched_count, engaged_count, negative_count, last_seen_at)
      values (${userId}, ${creatorId}, ${clamp(0.18 * d.engage - 0.25 * d.neg + 0.05 * d.watch, -1, 1)}, ${d.follow}, ${d.watch}, ${d.engage}, ${d.neg}, now())
      on conflict (user_id, creator_id) do update set
        affinity = greatest(-1, least(1, user_creator_affinity.affinity * 0.92 + ${0.18 * d.engage - 0.25 * d.neg + 0.05 * d.watch})),
        is_following = user_creator_affinity.is_following or ${d.follow},
        watched_count = user_creator_affinity.watched_count + ${d.watch},
        engaged_count = user_creator_affinity.engaged_count + ${d.engage},
        negative_count = user_creator_affinity.negative_count + ${d.neg},
        last_seen_at = now()
    `);
  }

  /* ---------- 2. topic exposure window (fatigue engine) ---------- */
  for (const topic of touchedTopics) {
    const engaged = incoming.filter((e) => {
      const c = e.contentId ? contentMap.get(e.contentId) : undefined;
      return c?.topic === topic && !SIGNALS[e.eventType]?.negative && SIGNALS[e.eventType]?.wReward > 0.5;
    }).length;
    const impressions = incoming.filter((e) => {
      const c = e.contentId ? contentMap.get(e.contentId) : undefined;
      return c?.topic === topic;
    }).length;
    await db.execute(sql`
      insert into topic_exposure (user_id, topic, window_impressions, window_engagements, consecutive, updated_at)
      values (${userId}, ${topic}, ${impressions}, ${engaged}, ${impressions}, now())
      on conflict (user_id, topic) do update set
        window_impressions = topic_exposure.window_impressions * 0.85 + ${impressions},
        window_engagements = topic_exposure.window_engagements * 0.85 + ${engaged},
        consecutive = case when ${engaged} > 0 then 0 else topic_exposure.consecutive + ${impressions} end,
        updated_at = now()
    `);
  }

  /* ---------- 3. CONTENT STATE: counters, velocity, dynamics ---------- */
  const baselines = await loadTopicBaselines();
  for (const cid of contentIds) {
    const c = contentMap.get(cid);
    if (!c) continue;
    const evts = incoming.filter((e) => e.contentId === cid);

    const inc = {
      views: evts.filter((e) => e.eventType === "view_start").length,
      watchTimeSec: evts.reduce((a, e) => a + (e.watchMs ?? 0) / 1000, 0),
      likes: evts.filter((e) => e.eventType === "like" || e.eventType === "love").length,
      comments: evts.filter((e) => e.eventType === "comment").length,
      shares: evts.filter((e) => e.eventType === "share" || e.eventType === "dm_share").length,
      saves: evts.filter((e) => e.eventType === "save" || e.eventType === "playlist_add").length,
      follows: evts.filter((e) => e.eventType === "follow" || e.eventType === "subscribe").length,
      profileVisits: evts.filter((e) => e.eventType === "profile_visit").length,
      rewatches: evts.reduce((a, e) => a + (e.replays ?? 0), 0),
      skips: evts.filter((e) => e.eventType === "skip" || e.eventType === "fast_scroll").length,
      notInterested: evts.filter((e) => e.eventType === "not_interested").length,
      hides: evts.filter((e) => e.eventType === "hide").length,
      reports: evts.filter((e) => e.eventType === "report").length,
      sessionExits: evts.filter((e) => e.eventType === "session_exit").length,
    };

    const maxRatio = Math.max(
      0,
      ...evts.map((e) => (e.watchMs ?? 0) / 1000 / Math.max(1, c.durationSec)),
    );
    const q = {
      ret1: maxRatio * c.durationSec >= 1 ? 1 : 0,
      ret3: maxRatio * c.durationSec >= 3 ? 1 : 0,
      ret5: maxRatio * c.durationSec >= 5 ? 1 : 0,
      ret10: maxRatio * c.durationSec >= 10 ? 1 : 0,
      q25: maxRatio >= 0.25 ? 1 : 0,
      q50: maxRatio >= 0.5 ? 1 : 0,
      q75: maxRatio >= 0.75 ? 1 : 0,
      q100: maxRatio >= 0.95 ? 1 : 0,
    };

    const statRows = await db.select().from(contentStats).where(eq(contentStats.contentId, cid)).limit(1);
    const prev = statRows[0];
    if (!prev) continue;

    const dtH = Math.max(1 / 60, hoursBetween(now, prev.updatedAt));
    const vViews = updateVelocity(prev.vViews, inc.views, dtH);
    const vWatch = updateVelocity(prev.vWatch, inc.watchTimeSec, dtH);
    const vShares = updateVelocity(prev.vShares, inc.shares, dtH);
    const vSaves = updateVelocity(prev.vSaves, inc.saves, dtH);
    const vComments = updateVelocity(prev.vComments, inc.comments, dtH);
    const vFollows = updateVelocity(prev.vFollows, inc.follows, dtH);

    const merged = {
      impressions: prev.impressions,
      views: prev.views + inc.views,
      watchTimeSec: prev.watchTimeSec + inc.watchTimeSec,
      likes: prev.likes + inc.likes,
      comments: prev.comments + inc.comments,
      shares: prev.shares + inc.shares,
      saves: prev.saves + inc.saves,
      follows: prev.follows + inc.follows,
      completions: prev.q100 + q.q100,
      rewatches: prev.rewatches + inc.rewatches,
      negatives: prev.notInterested + prev.hides + prev.reports + inc.notInterested + inc.hides + inc.reports,
    };

    const base = baselines.get(c.topic) ?? DEFAULT_TOPIC_BASELINE;
    const dyn = {
      ageHours: hoursBetween(now, c.publishedAt),
      topic: c.topic,
      impressions: merged.impressions,
      views: merged.views,
      watchTimeSec: merged.watchTimeSec,
      durationSec: c.durationSec,
      completions: merged.completions,
      rewatches: merged.rewatches,
      likes: merged.likes,
      comments: merged.comments,
      shares: merged.shares,
      saves: merged.saves,
      follows: merged.follows,
      negatives: merged.negatives,
      vViews, vWatch, vShares, vSaves, vComments, vFollows,
      vViewsPrev: prev.vViews,
      regionsReached: (prev.regionsReached as string[]).length || 1,
      totalRegions: 7,
      baseline: {
        ...DEFAULT_BASELINE,
        muViewVelocity: base.viewVelocityMu,
        sdViewVelocity: Math.max(5, base.viewVelocitySd),
        muCompletion: base.completionRate,
        muWatchRatio: base.watchRatio,
      },
    };

    const fresh = freshnessScore(dyn);
    const mom = momentumScore(dyn);
    const negativeRate = merged.negatives / Math.max(1, merged.impressions);
    const viral = viralPotential(dyn, {
      spamProbability: prev.spamProbability,
      botProbability: prev.botProbability,
      negativeRate,
    });

    const regions = new Set(prev.regionsReached as string[]);
    regions.add(user.region);

    await db
      .update(contentStats)
      .set({
        views: merged.views,
        watchTimeSec: merged.watchTimeSec,
        likes: merged.likes,
        comments: merged.comments,
        shares: merged.shares,
        saves: merged.saves,
        follows: merged.follows,
        profileVisits: prev.profileVisits + inc.profileVisits,
        rewatches: merged.rewatches,
        skips: prev.skips + inc.skips,
        notInterested: prev.notInterested + inc.notInterested,
        hides: prev.hides + inc.hides,
        reports: prev.reports + inc.reports,
        sessionExits: prev.sessionExits + inc.sessionExits,
        ret1s: prev.ret1s + q.ret1,
        ret3s: prev.ret3s + q.ret3,
        ret5s: prev.ret5s + q.ret5,
        ret10s: prev.ret10s + q.ret10,
        q25: prev.q25 + q.q25,
        q50: prev.q50 + q.q50,
        q75: prev.q75 + q.q75,
        q100: prev.q100 + q.q100,
        vViews, vWatch, vShares, vSaves, vComments, vFollows,
        vViewsPrev: prev.vViews,
        acceleration: mom.acceleration,
        freshnessScore: fresh,
        momentumScore: mom.score,
        viralScore: viral.score,
        negativeRate,
        regionsReached: [...regions],
        regionSpread: regions.size / 7,
        updatedAt: now,
      })
      .where(eq(contentStats.contentId, cid));

    result.contentUpdated.push(cid);

    /* ---------- 4. COLD START LADDER ---------- */
    if (c.coldStartPhase < 6) {
      const creatorRow = await db.select().from(creators).where(eq(creators.id, c.creatorId)).limit(1);
      const multiplier = clamp(
        0.75 + 0.55 * (creatorRow[0]?.trustScore ?? 0.5) + 0.2 * (lg(creatorRow[0]?.followers ?? 0) / lg(1e7)),
        0.25,
        1.9,
      );
      const decision = evaluateColdStart(
        {
          phase: c.coldStartPhase,
          impressions: merged.impressions,
          views: merged.views,
          watchTimeSec: merged.watchTimeSec,
          durationSec: c.durationSec,
          completions: merged.completions,
          likes: merged.likes,
          shares: merged.shares,
          saves: merged.saves,
          follows: merged.follows,
          negatives: merged.negatives,
          spamProbability: prev.spamProbability,
          botProbability: prev.botProbability,
          violationRisk: creatorRow[0]?.violationRisk ?? 0.02,
        },
        {
          watchRatio: base.watchRatio,
          completionRate: base.completionRate,
          engagementNorm: base.engagementNorm,
          negativeRate: Math.max(0.004, base.negativeRate),
        },
        multiplier,
        viral.distributionMultiplier,
      );

      if (decision.decision === "promote" || decision.decision === "accelerate") {
        await db
          .update(content)
          .set({
            coldStartPhase: decision.nextPhase,
            coldStartCap: decision.nextCap,
            coldStartUpdatedAt: now,
            graduatedAt: decision.nextPhase >= 6 ? now : null,
          })
          .where(eq(content.id, cid));
        result.coldStartTransitions.push({
          contentId: cid, from: c.coldStartPhase, to: decision.nextPhase,
          decision: decision.decision, reason: decision.reason,
        });
      } else if (decision.decision === "freeze") {
        await db
          .update(content)
          .set({ coldStartCap: decision.nextCap, coldStartUpdatedAt: now })
          .where(eq(content.id, cid));
        result.coldStartTransitions.push({
          contentId: cid, from: c.coldStartPhase, to: c.coldStartPhase,
          decision: "freeze", reason: decision.reason,
        });
      }
    }
  }

  /* ---------- 5. BANDIT POSTERIOR UPDATE ---------- */
  for (const topic of touchedTopics) {
    const evts = incoming.filter((e) => {
      const c = e.contentId ? contentMap.get(e.contentId) : undefined;
      return c?.topic === topic;
    });
    const reward = clamp(
      evts.reduce((a, e) => {
        const spec = SIGNALS[e.eventType];
        if (!spec) return a;
        const c = e.contentId ? contentMap.get(e.contentId) : undefined;
        const w = e.watchMs ? watchReward(e.watchMs / 1000, c?.durationSec ?? 20) : 0;
        return a + clamp(spec.wSatisfaction / 3, -1, 1) + 0.4 * w;
      }, 0) / Math.max(1, evts.length),
    );
    await db.execute(sql`
      insert into bandit_arms (user_id, arm_type, arm_key, alpha, beta, pulls, reward, updated_at)
      values (${userId}, 'topic', ${topic}, ${1 + reward}, ${2 - reward}, 1, ${reward}, now())
      on conflict (user_id, arm_type, arm_key) do update set
        alpha = bandit_arms.alpha + ${reward},
        beta  = bandit_arms.beta  + ${1 - reward},
        pulls = bandit_arms.pulls + 1,
        reward = bandit_arms.reward + ${reward},
        updated_at = now()
    `);
    result.banditUpdates++;
  }

  /* ---------- 6. LABEL JOIN + STREAMING SGD ---------- */
  const learn = await onlineLearn(userId, incoming, contentMap, user.trustScore);
  result.onlineLearning = learn;

  /* ---------- 7. USER AGGREGATES + EMBEDDING REFRESH ---------- */
  await refreshUserState(userId, now);

  return result;
}

/** Join events to the logged features and take streaming SGD steps. */
async function onlineLearn(
  userId: string,
  incoming: IncomingEvent[],
  contentMap: Map<string, typeof content.$inferSelect>,
  userTrustScore: number,
): Promise<{ examples: number; heads: Record<string, number> }> {
  const withReq = incoming.filter((e) => e.requestId && e.contentId);
  if (withReq.length === 0) return { examples: 0, heads: {} };

  const requestIds = [...new Set(withReq.map((e) => e.requestId!))];
  const logs = await db
    .select()
    .from(feedLogs)
    .where(and(eq(feedLogs.userId, userId), inArray(feedLogs.requestId, requestIds)))
    .limit(500);
  if (logs.length === 0) return { examples: 0, heads: {} };

  const bank: ModelBank = { ...(await loadModelBank(true)) };
  const headLoss: Record<string, number> = {};
  let examples = 0;

  for (const log of logs) {
    const evts = withReq.filter((e) => e.requestId === log.requestId && e.contentId === log.contentId);
    if (evts.length === 0) continue;
    const c = contentMap.get(log.contentId);
    const durationSec = c?.durationSec ?? 20;
    const phi = log.features as number[];
    if (!phi || phi.length === 0) continue;

    const labels = labelsFromEvents(evts, durationSec);
    const satisfaction = satisfactionScore({
      meanWatchRatio: (labels.watch_time ?? 0) / Math.max(1, durationSec),
      completionRate: labels.p_complete ?? 0,
      deepEngagementRate: ((labels.p_save ?? 0) + (labels.p_share ?? 0) + (labels.p_follow ?? 0)) / 3,
      negativeRate: labels.p_negative ?? 0,
      sessionLengthRatio: 1,
      returnGapHours: 6,
      surveyPositive: evts.filter((e) => e.eventType === "survey_positive").length,
      surveyNegative: evts.filter((e) => e.eventType === "survey_negative").length,
      skipRate: evts.some((e) => e.eventType === "skip") ? 1 : 0,
      diversityEntropy: 0.6,
    });
    const full: Partial<Record<Head, number>> = {
      ...labels,
      p_satisfaction: satisfaction,
      p_return_tomorrow: satisfaction > 0.5 ? 1 : 0,
      p_retention_7d: satisfaction > 0.62 ? 1 : 0,
      p_viral: (labels.p_share ?? 0) > 0 && (labels.p_complete ?? 0) > 0 ? 1 : 0,
    };

    for (const head of HEADS) {
      const y = full[head];
      if (y === undefined) continue;
      const r = sgdStep(bank[head], phi, y, {
        trustWeight: userTrustScore,
        propensity: log.propensity,
        durationSec,
      });
      bank[head] = r.updated;
      headLoss[head] = (headLoss[head] ?? 0) + r.loss;
    }
    examples++;

    await db
      .update(feedLogs)
      .set({ labels: full as Record<string, number>, labeled: true })
      .where(eq(feedLogs.id, log.id));
  }

  if (examples > 0) {
    for (const k of Object.keys(headLoss)) headLoss[k] = headLoss[k] / examples;
    await persistModelBank(bank);
  }
  return { examples, heads: headLoss };
}

/** Recompute user-level aggregates + refresh the two-tower user embedding. */
export async function refreshUserState(userId: string, now = new Date()): Promise<void> {
  const rows = await db.select().from(userInterests).where(eq(userInterests.userId, userId));
  const interests: InterestRow[] = rows.map((r) => ({
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
  }));

  const recent = await db
    .select({ embedding: content.embedding, createdAt: events.createdAt })
    .from(events)
    .innerJoin(content, eq(content.id, events.contentId))
    .where(
      and(
        eq(events.userId, userId),
        gte(events.createdAt, new Date(now.getTime() - 168 * 3_600_000)),
        inArray(events.eventType, ["like", "love", "save", "share", "follow", "video_complete"]),
      ),
    )
    .limit(60);

  const embedding = buildUserEmbedding(
    interests,
    recent.map((r) => ({ vec: r.embedding as number[], ageHours: hoursBetween(now, r.createdAt) })),
  );

  const agg = await db
    .select({
      n: sql<number>`count(*)::int`,
      watch: sql<number>`coalesce(sum(${events.watchMs}), 0)::double precision`,
      dur: sql<number>`coalesce(sum(${events.durationMs}), 1)::double precision`,
      skips: sql<number>`count(*) filter (where ${events.eventType} in ('skip','fast_scroll','swipe_away'))::int`,
      pos: sql<number>`count(*) filter (where ${events.eventType} in ('like','love','save','share','comment','follow'))::int`,
    })
    .from(events)
    .where(and(eq(events.userId, userId), gte(events.createdAt, new Date(now.getTime() - 336 * 3_600_000))));

  const a = agg[0];
  const n = Math.max(1, Number(a?.n ?? 0));
  const avgWatchRatio = clamp(Number(a?.watch ?? 0) / Math.max(1, Number(a?.dur ?? 1)), 0, 2);
  const skipRate = clamp(Number(a?.skips ?? 0) / n);
  const engagementRate = clamp(Number(a?.pos ?? 0) / n);

  const sess = await db
    .select({
      cnt: sql<number>`count(*)::int`,
      avgDur: sql<number>`coalesce(avg(${sessions.durationSec}), 300)::double precision`,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gte(sessions.startedAt, new Date(now.getTime() - 168 * 3_600_000))));

  const sessions7d = Number(sess[0]?.cnt ?? 0);
  const satisfaction = satisfactionScore({
    meanWatchRatio: avgWatchRatio,
    completionRate: clamp(avgWatchRatio),
    deepEngagementRate: engagementRate,
    negativeRate: clamp(1 - engagementRate - avgWatchRatio * 0.5, 0, 0.4),
    sessionLengthRatio: 1,
    returnGapHours: 12,
    surveyPositive: 0,
    surveyNegative: 0,
    skipRate,
    diversityEntropy: 0.6,
  });

  await db
    .update(users)
    .set({
      embedding,
      avgWatchRatio,
      skipRate,
      engagementRate,
      satisfactionScore: satisfaction,
      sessionsPerDay: sessions7d / 7,
      activityLevel: clamp(lg(n) / lg(400)),
      retentionD1: clamp(0.3 + 0.6 * satisfaction),
      retentionD7: clamp(0.15 + 0.6 * satisfaction * halfLifeDecay(1, 14)),
      lastActiveAt: now,
    })
    .where(eq(users.id, userId));
}

/** Periodic (hourly) decay job for velocities + freshness on the whole corpus. */
export async function decayCorpus(): Promise<{ updated: number }> {
  const res = await db.execute(sql`
    update content_stats set
      v_views_prev = v_views,
      v_views = v_views * 0.72,
      v_watch = v_watch * 0.72,
      v_shares = v_shares * 0.72,
      v_saves = v_saves * 0.72,
      v_comments = v_comments * 0.72,
      v_follows = v_follows * 0.72,
      freshness_score = greatest(0, freshness_score * 0.94),
      updated_at = now()
    where updated_at < now() - interval '1 hour'
  `);
  return { updated: (res as unknown as { rowCount?: number }).rowCount ?? 0 };
}

export const _ingestInternals = { labelsFromEvents, banditArms, topicExposure, userCreatorAffinity };
