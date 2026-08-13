/**
 * ATLAS-RANK :: Geo/Language personalisation (§16), Topic Fatigue (§ fatigue),
 * Exploration vs Exploitation (§15), Satisfaction model (§ satisfaction).
 */
import { COUNTRY_TO_REGION, REGIONS } from "./taxonomy";
import { clamp, halfLifeDecay, lg, sampleBeta, sigmoid, ucb1, linUcbBonus } from "./mathkit";

/* ========================================================================== */
/* GEO / LANGUAGE                                                             */
/* ========================================================================== */

export interface GeoUser {
  language: string;
  secondaryLanguages?: string[];
  country: string;
  region: string;
}

export interface GeoContent {
  language: string;
  country: string;
  region: string;
  /** Set true for language-agnostic content (music, dance, pets, visual). */
  languageAgnostic?: boolean;
}

/**
 * LANGUAGE MATCH
 *   LM = 1.00                       exact primary language
 *      = 0.82                       secondary/declared language
 *      = 0.70                       language-agnostic content (visual-first)
 *      = 0.34·mutualIntel(l_u,l_c)  mutually intelligible / same family
 *      = 0.08                       otherwise
 *
 * Language mismatch is a *multiplicative* penalty, not additive: no amount of
 * predicted engagement should surface content the user cannot understand.
 */
const LANG_FAMILY: Record<string, string> = {
  en: "germanic", de: "germanic",
  es: "romance", pt: "romance", fr: "romance", it: "romance",
  hi: "indic", bn: "indic", ur: "indic",
  id: "austronesian", ms: "austronesian",
  ar: "semitic",
  ja: "japonic", ko: "koreanic", tr: "turkic",
};

export function languageMatchScore(u: GeoUser, c: GeoContent): number {
  if (u.language === c.language) return 1;
  if ((u.secondaryLanguages ?? []).includes(c.language)) return 0.82;
  if (c.languageAgnostic) return 0.7;
  const fu = LANG_FAMILY[u.language];
  const fc = LANG_FAMILY[c.language];
  if (fu && fc && fu === fc) return 0.34;
  return 0.08;
}

/**
 * COUNTRY MATCH
 *   CM = 1.00 same country
 *      = 0.62 same region
 *      = 0.34 neighbouring region
 *      = 0.15 global
 */
export function countryMatchScore(u: GeoUser, c: GeoContent): number {
  if (u.country === c.country) return 1;
  const ur = u.region || COUNTRY_TO_REGION[u.country] || "NA";
  const cr = c.region || COUNTRY_TO_REGION[c.country] || "NA";
  if (ur === cr) return 0.62;
  if ((REGIONS[ur]?.neighbors ?? []).includes(cr)) return 0.34;
  return 0.15;
}

/**
 * REGION MATCH — separate from country because "region" captures the cultural
 * cluster (LATAM, SEA, MENA...) which correlates with humour, music, format.
 *   RM = 1.0 same, 0.55 neighbouring, 0.2 distant
 */
export function regionMatchScore(u: GeoUser, c: GeoContent): number {
  const ur = u.region || COUNTRY_TO_REGION[u.country] || "NA";
  const cr = c.region || COUNTRY_TO_REGION[c.country] || "NA";
  if (ur === cr) return 1;
  if ((REGIONS[ur]?.neighbors ?? []).includes(cr)) return 0.55;
  return 0.2;
}

/**
 * Aggregate locale multiplier applied at re-ranking:
 *   Λ(u,c) = LM^1.35 · (0.55 + 0.30·CM + 0.15·RM)
 * Exponent 1.35 on language makes the language gate dominant while still
 * allowing exceptional global content (very high LM-independent quality) to
 * cross borders.
 */
export function localeMultiplier(u: GeoUser, c: GeoContent): {
  lm: number; cm: number; rm: number; multiplier: number;
} {
  const lm = languageMatchScore(u, c);
  const cm = countryMatchScore(u, c);
  const rm = regionMatchScore(u, c);
  return { lm, cm, rm, multiplier: clamp(Math.pow(lm, 1.35) * (0.55 + 0.3 * cm + 0.15 * rm), 0, 1.2) };
}

/* ========================================================================== */
/* TOPIC FATIGUE ENGINE                                                       */
/* ========================================================================== */

export interface FatigueInput {
  /** impressions of this topic in the trailing window (decay-weighted) */
  windowImpressions: number;
  /** engagements of this topic in the trailing window */
  windowEngagements: number;
  /** consecutive items of this topic immediately preceding the slot */
  consecutive: number;
  /** engagement rate now vs the user's own historical rate for that topic */
  engagementDecline: number;
  /** creator-level repetition in the same window */
  creatorImpressions: number;
  /** hours since the topic was last shown */
  hoursSinceLast: number;
}

/**
 * TOPIC FATIGUE
 *   Exposure saturation:  E = 1 − exp(−windowImpressions / K),  K = 7
 *   Streak penalty:       S = 1 − exp(−consecutive / 2)
 *   Boredom:              B = clamp(engagementDecline)         (0..1)
 *   Creator repetition:   C = 1 − exp(−creatorImpressions / 3)
 *   Recovery:             R = 2^(−hoursSinceLast / 8)
 *
 *   Fatigue Φ = clamp( (0.34·E + 0.28·S + 0.24·B + 0.14·C) · R )
 *
 * Applied as a multiplicative discount on the master score:
 *   penalty = (1 − Φ)^τ ,  τ = 1.45
 */
export function topicFatigue(x: FatigueInput): { fatigue: number; penalty: number; parts: Record<string, number> } {
  const E = 1 - Math.exp(-Math.max(0, x.windowImpressions) / 7);
  const S = 1 - Math.exp(-Math.max(0, x.consecutive) / 2);
  const B = clamp(x.engagementDecline);
  const C = 1 - Math.exp(-Math.max(0, x.creatorImpressions) / 3);
  const R = halfLifeDecay(x.hoursSinceLast, 8);
  const fatigue = clamp((0.34 * E + 0.28 * S + 0.24 * B + 0.14 * C) * R);
  return { fatigue, penalty: Math.pow(1 - fatigue, 1.45), parts: { E, S, B, C, R } };
}

/**
 * Engagement-decline estimator: compares the user's recent engagement rate on a
 * topic against their long-run rate.  δ = clamp(1 − recentRate/(longRate+ε))
 */
export const engagementDecline = (recentRate: number, longRunRate: number): number =>
  clamp(1 - recentRate / (longRunRate + 1e-3));

/* ========================================================================== */
/* EXPLORATION VS EXPLOITATION                                                */
/* ========================================================================== */

export interface Arm {
  key: string;
  alpha: number;
  beta: number;
  pulls: number;
  reward: number;
}

/**
 * Adaptive exploration budget.
 *   ε(u) = ε₀ · (1 + 0.9·drift) · (1 + 0.6·fatigue̅) · (1 + 0.5·noveltyAppetite)
 *          · coldStartBoost(u) · fairnessBoost
 *   clipped to [0.08, 0.45];  ε₀ = 0.20  (the "80/20" target)
 */
export function explorationBudget(x: {
  drift: number;
  meanFatigue: number;
  noveltyAppetite: number;
  interactionCount: number;
  fairnessBoost: number;
}): number {
  const coldStartBoost = 1 + 1.4 * halfLifeDecay(x.interactionCount, 40);
  const eps =
    0.2 *
    (1 + 0.9 * clamp(x.drift)) *
    (1 + 0.6 * clamp(x.meanFatigue)) *
    (1 + 0.5 * clamp(x.noveltyAppetite)) *
    coldStartBoost *
    x.fairnessBoost;
  return clamp(eps, 0.08, 0.45);
}

/**
 * Thompson Sampling over topic arms.
 * Posterior:  θ_a ~ Beta(α_a, β_a),  α = 1 + successes, β = 1 + failures.
 * Reward is the *satisfaction-weighted* engagement, not raw clicks, so the
 * bandit converges to long-term value rather than clickbait.
 */
export function thompsonSelect(arms: Arm[], k: number, rnd: () => number): { key: string; theta: number }[] {
  return arms
    .map((a) => ({ key: a.key, theta: sampleBeta(a.alpha, a.beta, rnd) }))
    .sort((x, y) => y.theta - x.theta)
    .slice(0, k);
}

/** UCB1 fallback for cold arms (deterministic, used in shadow evaluation). */
export function ucbSelect(arms: Arm[], k: number): { key: string; score: number }[] {
  const total = arms.reduce((a, b) => a + b.pulls, 0);
  return arms
    .map((a) => ({ key: a.key, score: ucb1(a.reward / Math.max(1, a.pulls), a.pulls, total) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}

/**
 * Contextual bandit (LinUCB, diagonal approximation for latency).
 *   score(a) = θ_aᵀx + α·sqrt(Σ_i x_i²·A⁻¹_ii)
 * α = 0.35 in production (tuned so that exploration regret ≤ 3% of reward).
 */
export function linUcbScore(
  x: readonly number[],
  theta: readonly number[],
  aInvDiag: readonly number[],
  alpha = 0.35,
): { mean: number; bonus: number; score: number } {
  let m = 0;
  for (let i = 0; i < Math.min(x.length, theta.length); i++) m += x[i] * theta[i];
  const bonus = linUcbBonus(x, aInvDiag, alpha);
  return { mean: m, bonus, score: m + bonus };
}

/** Beta posterior update with satisfaction-weighted reward r ∈ [0,1]. */
export function updateArm(arm: Arm, reward: number): Arm {
  const r = clamp(reward);
  return {
    ...arm,
    alpha: arm.alpha + r,
    beta: arm.beta + (1 - r),
    pulls: arm.pulls + 1,
    reward: arm.reward + r,
  };
}

/* ========================================================================== */
/* SATISFACTION MODEL                                                         */
/* ========================================================================== */

export interface SatisfactionInput {
  meanWatchRatio: number;
  completionRate: number;
  deepEngagementRate: number; // save + share + follow per view
  negativeRate: number;
  sessionLengthRatio: number; // session length / user's own median
  returnGapHours: number; // hours since previous session
  surveyPositive: number;
  surveyNegative: number;
  skipRate: number;
  diversityEntropy: number;
}

/**
 * IMPLICIT SATISFACTION (per-session), the label used to train `p_satisfaction`
 * when no survey exists:
 *
 *   Ŝ = σ( 1.7·watchRatio + 1.4·completionRate + 2.6·deepEngagement
 *         + 0.8·log1p(sessionLengthRatio) + 0.7·diversityEntropy
 *         − 3.1·negativeRate − 1.2·skipRate
 *         − 0.5·log1p(returnGapHours/24) − 1.1 )
 *
 * Where surveys exist they OVERRIDE with weight 0.65 (survey is ground truth,
 * but sparse: ~0.3% of sessions):
 *   S = 0.65·survey + 0.35·Ŝ
 */
export function satisfactionScore(x: SatisfactionInput): number {
  const implicit = sigmoid(
    1.7 * clamp(x.meanWatchRatio, 0, 1.5) +
      1.4 * clamp(x.completionRate) +
      2.6 * clamp(x.deepEngagementRate * 8) +
      0.8 * Math.log1p(clamp(x.sessionLengthRatio, 0, 4)) +
      0.7 * clamp(x.diversityEntropy) -
      3.1 * clamp(x.negativeRate * 6) -
      1.2 * clamp(x.skipRate) -
      0.5 * Math.log1p(Math.max(0, x.returnGapHours) / 24) -
      1.1,
  );
  const surveyN = x.surveyPositive + x.surveyNegative;
  if (surveyN <= 0) return clamp(implicit);
  const survey = x.surveyPositive / surveyN;
  return clamp(0.65 * survey + 0.35 * implicit);
}

/**
 * Retention head prior (D1/D7/D30). Discrete-time hazard with a satisfaction
 * covariate:
 *   h(d) = σ( β₀ + β₁·S + β₂·log1p(sessions7d) + β₃·watchMinutes7d/60
 *            − β₄·negRate − β₅·log1p(daysSinceLastSession) )
 *   P(return by day d) = 1 − Π_{k≤d} (1 − h(k))
 */
export function retentionPrior(x: {
  satisfaction: number;
  sessions7d: number;
  watchMinutes7d: number;
  negativeRate: number;
  daysSinceLast: number;
  horizonDays: 1 | 7 | 30;
}): number {
  const h = sigmoid(
    -0.35 +
      2.4 * x.satisfaction +
      0.55 * Math.log1p(x.sessions7d) +
      0.4 * (x.watchMinutes7d / 60) -
      2.2 * clamp(x.negativeRate * 5) -
      0.75 * Math.log1p(x.daysSinceLast),
  );
  const perDay = clamp(h, 0.01, 0.95);
  // survival across the horizon with mild hazard decay
  let survive = 1;
  for (let d = 1; d <= x.horizonDays; d++) {
    survive *= 1 - perDay * Math.pow(0.965, d - 1);
  }
  return clamp(1 - survive);
}

/** Session-extension probability: will the user watch at least one more item? */
export function sessionExtensionPrior(x: {
  itemsWatchedInSession: number;
  meanWatchRatioSession: number;
  recentSkipStreak: number;
  fatigue: number;
  medianSessionItems: number;
}): number {
  return clamp(
    sigmoid(
      1.9 * clamp(x.meanWatchRatioSession, 0, 1.5) -
        0.55 * x.recentSkipStreak -
        1.6 * clamp(x.fatigue) -
        0.9 * Math.log1p(x.itemsWatchedInSession / Math.max(3, x.medianSessionItems)) +
        0.9,
    ),
  );
}

/** Time-of-day / day-of-week context features (cyclic encoding). */
export function temporalContext(now: Date, tzOffsetMinutes: number) {
  const local = new Date(now.getTime() + tzOffsetMinutes * 60_000);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  const dow = local.getUTCDay();
  return {
    hour,
    dow,
    hourSin: Math.sin((2 * Math.PI * hour) / 24),
    hourCos: Math.cos((2 * Math.PI * hour) / 24),
    dowSin: Math.sin((2 * Math.PI * dow) / 7),
    dowCos: Math.cos((2 * Math.PI * dow) / 7),
    isPrimeTime: hour >= 19 && hour <= 23 ? 1 : 0,
    isCommute: (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 1 : 0,
  };
}

/** Novelty: 1 − max cosine similarity to the last-K consumed items. */
export const noveltyScore = (maxSimToRecent: number): number => clamp(1 - maxSimToRecent);

/** Serendipity: unexpected (low prior) but high predicted satisfaction. */
export const serendipity = (predictedSatisfaction: number, priorAffinity: number): number =>
  clamp(predictedSatisfaction * (1 - clamp(priorAffinity)) * 1.4);

export const audienceReachScore = (impressions: number): number => clamp(lg(impressions) / lg(1e6));
