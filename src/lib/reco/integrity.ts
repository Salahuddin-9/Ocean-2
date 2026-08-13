/**
 * ATLAS-RANK :: Anti-Spam (§18) + Trust Layer (§19).
 *
 * Three-tier detection:
 *   T1  Rule/velocity detectors      (streaming, <5ms, Flink CEP)
 *   T2  Statistical anomaly          (per-entity z-scores vs cohort, 1-min)
 *   T3  Graph / coordination         (GNN on the user↔content bipartite graph,
 *                                     hourly batch, label propagation)
 *
 * Outputs: SpamProbability(c), BotProbability(u), TrustScore(u|c|creator).
 * Trust enters ranking BOTH as a multiplicative discount and as a weight on
 * every training label — a bot's "like" must not teach the model anything.
 */
import { clamp, entropy, lg, normalizedEntropy, sigmoid, stddev, zscore } from "./mathkit";

/* -------------------------------------------------------------------------- */
/* BOT PROBABILITY (per user)                                                 */
/* -------------------------------------------------------------------------- */

export interface BotFeatures {
  /** actions per minute in the busiest 5-minute window */
  peakActionRate: number;
  /** coefficient of variation of inter-action intervals (humans ≈ 0.6–1.4) */
  intervalCV: number;
  /** fraction of sessions with identical length (±2s) */
  sessionLengthUniformity: number;
  /** engagement rate; farms are either ~0 or ~1 */
  engagementRate: number;
  /** mean watch ratio; view-farms hover at the minimum billable threshold */
  meanWatchRatio: number;
  /** entropy of consumed topics (normalised) */
  topicEntropy: number;
  /** distinct devices / IP ASN churn */
  deviceChurn: number;
  /** account age in days */
  accountAgeDays: number;
  /** fraction of followed accounts that are themselves low-trust */
  suspiciousFollowRatio: number;
  /** was the account created in a burst cluster? */
  registrationBurstScore: number;
  /** completed a challenge (captcha/phone) */
  verified: boolean;
}

/**
 *  BotProbability
 *    z = 1.9·rateAnomaly + 1.7·(1 − intervalCVFit) + 1.4·uniformity
 *      + 1.6·engagementExtremity + 1.3·watchThresholdHugging
 *      + 1.2·(1 − topicEntropy) + 1.1·deviceChurn
 *      + 1.5·suspiciousFollowRatio + 1.3·registrationBurst
 *      − 1.0·log1p(accountAgeDays)/log1p(365) − 1.6·verified − 3.4
 *    B(u) = σ(z)
 */
export function botProbability(f: BotFeatures): { probability: number; parts: Record<string, number> } {
  const rateAnomaly = clamp(zscore(f.peakActionRate, 6, 5) / 4); // humans ≈ 6 apm
  const intervalCVFit = clamp(1 - Math.abs(f.intervalCV - 1.0) / 1.0);
  const uniformity = clamp(f.sessionLengthUniformity);
  const engagementExtremity = clamp(Math.abs(f.engagementRate - 0.07) / 0.5);
  const watchThresholdHugging = clamp(1 - Math.abs(f.meanWatchRatio - 0.12) / 0.12) * 0.9;
  const topicEnt = clamp(f.topicEntropy);
  const parts = {
    rateAnomaly,
    intervalCVFit,
    uniformity,
    engagementExtremity,
    watchThresholdHugging,
    topicEntropy: topicEnt,
    deviceChurn: clamp(f.deviceChurn),
    suspiciousFollowRatio: clamp(f.suspiciousFollowRatio),
    registrationBurstScore: clamp(f.registrationBurstScore),
  };
  const z =
    1.9 * rateAnomaly +
    1.7 * (1 - intervalCVFit) +
    1.4 * uniformity +
    1.6 * engagementExtremity +
    1.3 * watchThresholdHugging +
    1.2 * (1 - topicEnt) +
    1.1 * clamp(f.deviceChurn) +
    1.5 * clamp(f.suspiciousFollowRatio) +
    1.3 * clamp(f.registrationBurstScore) -
    1.0 * (lg(f.accountAgeDays) / lg(365)) -
    (f.verified ? 1.6 : 0) -
    3.4;
  return { probability: clamp(sigmoid(z)), parts };
}

/* -------------------------------------------------------------------------- */
/* SPAM PROBABILITY (per content)                                             */
/* -------------------------------------------------------------------------- */

export interface SpamFeatures {
  /** share of engagements coming from accounts with trust < 0.35 */
  lowTrustEngagementShare: number;
  /** Gini of the engagement timestamp histogram (bursts are spiky) */
  engagementBurstiness: number;
  /** unique-engagers / total-engagements (pods reuse the same accounts) */
  engagerUniqueness: number;
  /** Jaccard overlap of engagers with the creator's previous posts (pods) */
  engagerOverlapPrev: number;
  /** like-rate ÷ watch-rate; real content earns watch before likes */
  likeWithoutWatchRatio: number;
  /** comment text duplication rate */
  commentDuplicationRate: number;
  /** near-duplicate content (simhash cluster size) */
  duplicateClusterSize: number;
  /** hashtag stuffing */
  hashtagCount: number;
  /** engagement geography entropy (farms cluster in one ASN/country) */
  geoEntropy: number;
  /** view-to-impression ratio far above cohort */
  viewImpressionAnomaly: number;
  reportRate: number;
}

/**
 *  SpamProbability
 *    z = 2.6·lowTrustShare + 1.9·burstiness + 1.7·(1 − uniqueness)
 *      + 1.8·podOverlap + 1.6·likeWithoutWatch + 1.5·commentDup
 *      + 1.2·log1p(dupCluster)/log1p(50) + 0.9·hashtagStuffing
 *      + 1.4·(1 − geoEntropy) + 1.3·viewAnomaly + 2.2·reportRate·100 − 4.1
 *    S(c) = σ(z)
 */
export function spamProbability(f: SpamFeatures): { probability: number; parts: Record<string, number> } {
  const hashtagStuffing = clamp(Math.max(0, f.hashtagCount - 8) / 15);
  const parts = {
    lowTrustEngagementShare: clamp(f.lowTrustEngagementShare),
    engagementBurstiness: clamp(f.engagementBurstiness),
    engagerUniqueness: clamp(f.engagerUniqueness),
    engagerOverlapPrev: clamp(f.engagerOverlapPrev),
    likeWithoutWatchRatio: clamp(f.likeWithoutWatchRatio),
    commentDuplicationRate: clamp(f.commentDuplicationRate),
    duplicateClusterSize: clamp(lg(f.duplicateClusterSize) / lg(50)),
    hashtagStuffing,
    geoEntropy: clamp(f.geoEntropy),
    viewImpressionAnomaly: clamp(f.viewImpressionAnomaly),
    reportRate: clamp(f.reportRate),
  };
  const z =
    2.6 * parts.lowTrustEngagementShare +
    1.9 * parts.engagementBurstiness +
    1.7 * (1 - parts.engagerUniqueness) +
    1.8 * parts.engagerOverlapPrev +
    1.6 * parts.likeWithoutWatchRatio +
    1.5 * parts.commentDuplicationRate +
    1.2 * parts.duplicateClusterSize +
    0.9 * hashtagStuffing +
    1.4 * (1 - parts.geoEntropy) +
    1.3 * parts.viewImpressionAnomaly +
    2.2 * clamp(f.reportRate * 100) -
    4.1;
  return { probability: clamp(sigmoid(z)), parts };
}

/* -------------------------------------------------------------------------- */
/* TRUST                                                                      */
/* -------------------------------------------------------------------------- */

/**
 *  User trust:  T(u) = (1 − B(u))^1.4 · (0.55 + 0.45·tenureFactor) · (1 − 0.6·strikeRate)
 *  Trust is used to weight (a) label contribution in training, (b) counter
 *  increments, (c) bandit reward, (d) the creator's follower-authenticity term.
 */
export function userTrust(botProb: number, accountAgeDays: number, strikes: number): number {
  const tenure = clamp(lg(accountAgeDays) / lg(365));
  return clamp(Math.pow(1 - botProb, 1.4) * (0.55 + 0.45 * tenure) * (1 - 0.6 * clamp(strikes / 5)));
}

/** Content trust used as a ranking multiplier. */
export function contentTrust(spamProb: number, creatorTrust: number, integrityScore: number): number {
  return clamp(Math.pow(1 - spamProb, 1.6) * (0.35 + 0.65 * creatorTrust) * integrityScore);
}

/**
 * Coordination / engagement-pod detector.
 * Given the engager sets of a creator's last N posts, compute the mean pairwise
 * Jaccard. Genuine audiences overlap 5–18%; pods overlap > 45%.
 */
export function podOverlap(engagerSets: string[][]): number {
  if (engagerSets.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < engagerSets.length; i++) {
    for (let j = i + 1; j < engagerSets.length; j++) {
      const a = new Set(engagerSets[i]);
      const b = new Set(engagerSets[j]);
      if (a.size === 0 || b.size === 0) continue;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      sum += inter / (a.size + b.size - inter);
      n++;
    }
  }
  return n === 0 ? 0 : clamp(sum / n);
}

/**
 * Burstiness of an event timestamp series (ms). Fano-factor style:
 *   burstiness = (σ_gap − μ_gap) / (σ_gap + μ_gap) ∈ [−1, 1] → mapped to [0,1]
 * Poisson (human) ≈ 0; bursty (bot injection) → 1.
 */
export function burstiness(timestampsMs: number[]): number {
  if (timestampsMs.length < 4) return 0;
  const ts = timestampsMs.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  const mu = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = stddev(gaps);
  if (mu + sd === 0) return 0;
  return clamp((sd - mu) / (sd + mu) / 2 + 0.5);
}

/** Geographic entropy of engagement (normalised). */
export const geoEntropy = (countsByCountry: number[]): number => normalizedEntropy(countsByCountry);

/** Raw entropy helper re-export for detectors. */
export const rawEntropy = entropy;

/**
 * Label-propagation trust diffusion over the follow graph.
 *   T^(k+1)(u) = (1−α)·T^(0)(u) + α · Σ_{v∈N(u)} w_uv·T^(k)(v) / Σ w_uv
 * α = 0.35, 3 iterations. Bot clusters mutually reinforce low trust, while a
 * single low-trust follower cannot meaningfully drag down a real account.
 */
export function propagateTrust(
  seeds: Map<string, number>,
  edges: { from: string; to: string; weight: number }[],
  iterations = 3,
  alpha = 0.35,
): Map<string, number> {
  let cur = new Map(seeds);
  for (let k = 0; k < iterations; k++) {
    const acc = new Map<string, { num: number; den: number }>();
    for (const e of edges) {
      const tv = cur.get(e.to) ?? 0.5;
      const slot = acc.get(e.from) ?? { num: 0, den: 0 };
      slot.num += e.weight * tv;
      slot.den += e.weight;
      acc.set(e.from, slot);
    }
    const next = new Map<string, number>();
    for (const [id, base] of seeds) {
      const a = acc.get(id);
      const nbr = a && a.den > 0 ? a.num / a.den : base;
      next.set(id, clamp((1 - alpha) * base + alpha * nbr));
    }
    cur = next;
  }
  return cur;
}

/**
 * Fake-engagement discount applied to the raw counters BEFORE they feed
 * momentum/viral:  effective = raw · (1 − spamProb)^1.3 · trustWeightedShare
 */
export function discountCounters<T extends Record<string, number>>(
  counters: T,
  spamProb: number,
  trustWeightedShare: number,
): T {
  const f = clamp(Math.pow(1 - spamProb, 1.3) * clamp(trustWeightedShare, 0.05, 1));
  const out = {} as T;
  for (const k of Object.keys(counters) as (keyof T)[]) {
    out[k] = (counters[k] * f) as T[keyof T];
  }
  return out;
}

export interface IntegrityVerdict {
  action: "allow" | "demote" | "limit" | "review" | "remove";
  multiplier: number;
  reason: string;
}

/** Enforcement ladder — deterministic mapping from risk to distribution. */
export function enforcement(spamProb: number, botProb: number, violationRisk: number): IntegrityVerdict {
  const risk = Math.max(spamProb, botProb * 0.8, violationRisk);
  if (violationRisk > 0.85) return { action: "remove", multiplier: 0, reason: "policy_violation" };
  if (risk > 0.8) return { action: "review", multiplier: 0.05, reason: "high_integrity_risk" };
  if (risk > 0.6) return { action: "limit", multiplier: 0.2, reason: "suspected_inauthentic" };
  if (risk > 0.4) return { action: "demote", multiplier: 0.55, reason: "borderline_signals" };
  return { action: "allow", multiplier: 1, reason: "clean" };
}
