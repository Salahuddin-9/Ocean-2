/**
 * ATLAS-RANK :: Boosted Post System (spec §17).
 *
 * Facebook-grade unified auction. The central invariant: an ad competes in the
 * SAME value currency as organic content, so a boosted post only wins a slot if
 * its total value (advertiser value + user value) beats the organic candidate
 * it displaces. This is what prevents ad load from destroying retention.
 *
 * ── TOTAL VALUE ─────────────────────────────────────────────────────────────
 *
 *   TotalValue(a,u) = AdvertiserValue + UserValue + QualityAdjustment
 *
 *   AdvertiserValue = bid · P(action | a,u) · pacing(a)
 *   UserValue       = ν · ( 0.45·p_satisfaction + 0.30·relevance
 *                          + 0.25·p_positive_engagement )
 *   QualityAdj      = −κ · ( 1.6·negativeFeedbackRate + 0.9·(1 − adQuality)
 *                           + 1.2·frequencyPenalty )
 *
 *   ν = 3.2 (USD-equivalent per unit of user value; the "user value exchange
 *   rate", re-estimated quarterly from long-run retention → revenue elasticity)
 *   κ = 4.0
 *
 * ── PRICING (generalised second price w/ quality) ───────────────────────────
 *
 *   price_1 = ( TotalValue_2 − UserValue_1 − QualityAdj_1 )
 *             / ( P(action|a₁,u) · pacing(a₁) )         + $0.01
 *
 *   i.e. the winner pays the minimum bid that would still have won, expressed
 *   back in bid space — the classic VCG-flavoured GSP used across the industry.
 *
 * ── BUDGET PACING ───────────────────────────────────────────────────────────
 *
 *   Dual-control (PID on spend + probabilistic throttling):
 *     targetSpend(t)  = dailyBudget · Φ(t)         Φ = diurnal spend curve CDF
 *     error(t)        = (spentToday − targetSpend(t)) / dailyBudget
 *     pacing          = clamp( exp(−2.4·error) , 0.05 , 2.0 )
 *   Under-delivery (error < 0) ⇒ pacing > 1 ⇒ more aggressive bidding.
 *   Over-delivery  (error > 0) ⇒ pacing < 1 ⇒ throttled.
 *
 * ── FREQUENCY CAPPING ───────────────────────────────────────────────────────
 *
 *   freqPenalty = 1 − exp(−impressionsToday / cap)
 *   Hard block at impressionsToday ≥ cap. Also a global per-user ad-load cap:
 *   ≤ 16% of items in any 50-item rolling window.
 */
import { clamp, sigmoid } from "./mathkit";

export const NU_USER_VALUE = 3.2;
export const KAPPA_QUALITY = 4.0;

export interface AdCandidate {
  campaignId: string;
  contentId: string;
  advertiserId: string;
  objective: string;
  bidValue: number;
  dailyBudget: number;
  spentToday: number;
  frequencyCapPerDay: number;
  impressionsToday: number;
  adQualityScore: number;
  adRelevanceScore: number;
  negativeFeedbackRate: number;
  targetTopics: string[];
  targetCountries: string[];
  targetLanguages: string[];
}

export interface AdUserContext {
  topics: string[];
  country: string;
  language: string;
  satisfaction: number;
  adLoadRatio: number; // ads / items in the last 50-item window
}

export interface AdPredictions {
  pClick: number;
  pConversion: number;
  pSatisfaction: number;
  pPositiveEngagement: number;
  pNegativeFeedback: number;
}

export interface AuctionEntry {
  candidate: AdCandidate;
  predictions: AdPredictions;
  relevance: number;
  pacing: number;
  advertiserValue: number;
  userValue: number;
  qualityAdjustment: number;
  totalValue: number;
  eligible: boolean;
  ineligibleReason?: string;
}

/** Diurnal spend curve: fraction of the day's budget that "should" be spent. */
export function diurnalSpendFraction(hourLocal: number): number {
  // Empirical two-peak curve (lunch + prime time), normalised CDF.
  const pdf = (h: number) =>
    0.55 * Math.exp(-Math.pow(h - 13, 2) / 12) + 1.0 * Math.exp(-Math.pow(h - 21, 2) / 8) + 0.18;
  let total = 0;
  let upto = 0;
  for (let h = 0; h < 24; h += 0.25) {
    const v = pdf(h) * 0.25;
    total += v;
    if (h <= hourLocal) upto += v;
  }
  return clamp(upto / Math.max(1e-6, total));
}

/** PID-style pacing multiplier. */
export function pacingMultiplier(spentToday: number, dailyBudget: number, hourLocal: number): number {
  if (dailyBudget <= 0) return 0;
  const target = dailyBudget * diurnalSpendFraction(hourLocal);
  const error = (spentToday - target) / dailyBudget;
  return clamp(Math.exp(-2.4 * error), 0.05, 2.0);
}

/** Ad relevance: topic overlap × locale × semantic affinity. */
export function adRelevance(c: AdCandidate, u: AdUserContext, semanticAffinity: number): number {
  const topicHit = c.targetTopics.length === 0 ? 0.5 : c.targetTopics.some((t) => u.topics.includes(t)) ? 1 : 0.15;
  const geoHit = c.targetCountries.length === 0 ? 0.7 : c.targetCountries.includes(u.country) ? 1 : 0;
  const langHit = c.targetLanguages.length === 0 ? 0.7 : c.targetLanguages.includes(u.language) ? 1 : 0.1;
  return clamp(0.4 * topicHit + 0.2 * geoHit + 0.15 * langHit + 0.25 * clamp(semanticAffinity));
}

/** Conversion probability model (objective-aware). */
export function conversionProbability(
  objective: string,
  pClick: number,
  relevance: number,
  adQuality: number,
): number {
  const base: Record<string, number> = {
    reach: 1.0,
    engagement: 0.42,
    traffic: 0.18,
    conversion: 0.035,
    follows: 0.06,
  };
  const b = base[objective] ?? 0.2;
  return clamp(b * pClick * (0.5 + 0.5 * relevance) * (0.6 + 0.4 * adQuality) * 6);
}

export function evaluateAd(
  c: AdCandidate,
  u: AdUserContext,
  preds: AdPredictions,
  semanticAffinity: number,
  hourLocal: number,
): AuctionEntry {
  const relevance = adRelevance(c, u, semanticAffinity);

  let eligible = true;
  let reason: string | undefined;
  if (c.impressionsToday >= c.frequencyCapPerDay) {
    eligible = false;
    reason = "frequency_cap";
  } else if (c.spentToday >= c.dailyBudget) {
    eligible = false;
    reason = "budget_exhausted";
  } else if (relevance < 0.18) {
    eligible = false;
    reason = "below_relevance_floor";
  } else if (u.adLoadRatio > 0.16) {
    eligible = false;
    reason = "ad_load_cap";
  } else if (c.negativeFeedbackRate > 0.05) {
    eligible = false;
    reason = "negative_feedback_breach";
  }

  const pacing = pacingMultiplier(c.spentToday, c.dailyBudget, hourLocal);
  const pAction = c.objective === "reach" ? 1 : preds.pConversion;
  const advertiserValue = c.bidValue * pAction * pacing;

  const userValue =
    NU_USER_VALUE *
    (0.45 * preds.pSatisfaction + 0.3 * relevance + 0.25 * preds.pPositiveEngagement);

  const freqPenalty = 1 - Math.exp(-c.impressionsToday / Math.max(1, c.frequencyCapPerDay));
  const qualityAdjustment =
    -KAPPA_QUALITY *
    (1.6 * preds.pNegativeFeedback + 0.9 * (1 - c.adQualityScore) + 1.2 * freqPenalty);

  const totalValue = advertiserValue + userValue + qualityAdjustment;

  return {
    candidate: c,
    predictions: preds,
    relevance,
    pacing,
    advertiserValue,
    userValue,
    qualityAdjustment,
    totalValue,
    eligible,
    ineligibleReason: reason,
  };
}

export interface AuctionResult {
  winner: AuctionEntry | null;
  price: number;
  runnerUpValue: number;
  reservePrice: number;
  participants: number;
}

/** Reserve price expressed in total-value units (protects the organic slot). */
export const RESERVE_TOTAL_VALUE = 1.15;

export function runAuction(entries: AuctionEntry[], organicOpportunityCost: number): AuctionResult {
  const eligible = entries.filter((e) => e.eligible).sort((a, b) => b.totalValue - a.totalValue);
  const reserve = Math.max(RESERVE_TOTAL_VALUE, organicOpportunityCost);

  if (eligible.length === 0 || eligible[0].totalValue < reserve) {
    return {
      winner: null,
      price: 0,
      runnerUpValue: eligible[1]?.totalValue ?? 0,
      reservePrice: reserve,
      participants: eligible.length,
    };
  }

  const winner = eligible[0];
  const runnerUpValue = Math.max(eligible[1]?.totalValue ?? 0, reserve);
  const denom = Math.max(
    1e-4,
    (winner.candidate.objective === "reach" ? 1 : winner.predictions.pConversion) * winner.pacing,
  );
  const price = Math.max(
    0.01,
    (runnerUpValue - winner.userValue - winner.qualityAdjustment) / denom + 0.01,
  );

  return {
    winner,
    price: Math.min(price, winner.candidate.bidValue),
    runnerUpValue,
    reservePrice: reserve,
    participants: eligible.length,
  };
}

/**
 * Organic opportunity cost — the single most important line of the ads system.
 *
 * An ad does not displace the BEST organic item; it displaces the MARGINAL one
 * (the item that falls off the end of the page). The cost is therefore the user
 * value of that marginal item, expressed in auction currency:
 *
 *   OC = ν_slot · clip( S_marginal / S_top , 0 , 1.4 )
 *
 * ν_slot = 1.6 is the marginal user value of one organic slot (distinct from
 * ν = 3.2, which converts predicted satisfaction into currency). It is
 * re-estimated monthly from ad-load holdback experiments: the retention delta
 * per incremental ad slot, priced at platform ARPU.
 */
export const NU_SLOT_VALUE = 1.6;

export const organicOpportunityCost = (marginalOrganicScore: number, topOrganicScore: number): number =>
  NU_SLOT_VALUE * clamp(marginalOrganicScore / Math.max(1e-6, topOrganicScore), 0, 1.4);

/** Ad quality score (advertiser-facing 1–10, drives auction discount). */
export const adQualityScore = (
  pPositiveEngagement: number,
  negativeFeedbackRate: number,
  landingQuality: number,
): number =>
  clamp(sigmoid(4.2 * pPositiveEngagement - 40 * negativeFeedbackRate + 1.8 * landingQuality - 2.1));
