/**
 * ATLAS-RANK :: SlateQ Reinforcement Learning & Conservative Q-Learning (CQL)
 *
 * Implements Google / Meta Slate-Q recommendation architecture:
 *  1. Multinomial Logit (MNL) user choice model over ranked slates
 *  2. Slate Decomposition: Q_slate(s, A) = sum_{i in A} P(choose=i | s, A) [ R(s, i) + gamma * V(s') ]
 *  3. CQL (Conservative Q-Learning) offline policy penalty to prevent overestimation on unobserved action slates
 *  4. Long-horizon credit assignment with TD(lambda) and potential-based reward shaping
 */

import { clamp, dot, softmax } from "../mathkit";

export interface SlateQState {
  userId: string;
  userEmbedding: number[]; // s_t in R^D
  sessionDepth: number;
  fatigueScore: number;
  historicalSatisfaction: number;
}

export interface SlateCandidate {
  contentId: string;
  itemEmbedding: number[]; // a_i in R^D
  organicScore: number;
  quality: number;
  durationSec: number;
}

export interface UserChoiceDistribution {
  itemProbabilities: number[]; // P(choose=i | s, A)
  noChoiceProbability: number; // P(no_choice | s, A)
}

/**
 * Multinomial Logit (MNL) User Choice Model:
 *  Attraction score: u(s, a_i) = exp( <s, a_i> / tau + beta_q * Quality_i )
 *  No-choice attraction: u_0 = exp( gamma_fatigue * Fatigue + delta_depth * log1p(Depth) )
 *  P(choose=i | s, A) = u(s, a_i) / ( u_0 + sum_{j in A} u(s, a_j) )
 */
export function mnlUserChoiceModel(
  state: SlateQState,
  slate: SlateCandidate[],
  temperature = 0.5,
): UserChoiceDistribution {
  const attractions = slate.map((cand) => {
    const affinity = dot(state.userEmbedding, cand.itemEmbedding) / temperature;
    const qualityBoost = cand.quality * 1.5;
    return Math.exp(clamp(affinity + qualityBoost, -15, 15));
  });

  const noChoiceAttraction = Math.exp(
    clamp(1.2 * state.fatigueScore + 0.4 * Math.log1p(state.sessionDepth) - 1.0, -15, 15),
  );

  const totalSum = noChoiceAttraction + attractions.reduce((a, b) => a + b, 0);

  const itemProbabilities = attractions.map((u) => u / totalSum);
  const noChoiceProbability = noChoiceAttraction / totalSum;

  return { itemProbabilities, noChoiceProbability };
}

export interface ItemQNetwork {
  W: number[][];
  b: number[];
}

/**
 * Item-level Q-value prediction: Q(s, a_i) = W [s; a_i; s * a_i] + b
 */
export function itemQValue(
  state: SlateQState,
  item: SlateCandidate,
  qNet: ItemQNetwork,
): number {
  const diff = state.userEmbedding.map((u, i) => u - (item.itemEmbedding[i] ?? 0));
  const prod = state.userEmbedding.map((u, i) => u * (item.itemEmbedding[i] ?? 0));
  const feat = [...state.userEmbedding, ...item.itemEmbedding, ...diff, ...prod];

  let out = qNet.b[0] ?? 0;
  for (let i = 0; i < feat.length; i++) {
    out += (qNet.W[0]?.[i] ?? 0) * feat[i];
  }
  return out;
}

/**
 * Slate-level Expected Value Decomposition:
 *  Q(s, A) = sum_{i in A} P(choose=i | s, A) * Q(s, a_i) + P(no_choice) * Q(s, no_choice)
 */
export function slateQValue(
  state: SlateQState,
  slate: SlateCandidate[],
  qNet: ItemQNetwork,
): { totalSlateQ: number; choiceDistribution: UserChoiceDistribution; itemQValues: number[] } {
  const choiceDistribution = mnlUserChoiceModel(state, slate);
  const itemQValues = slate.map((item) => itemQValue(state, item, qNet));

  let totalSlateQ = 0;
  for (let i = 0; i < slate.length; i++) {
    totalSlateQ += choiceDistribution.itemProbabilities[i] * itemQValues[i];
  }
  // Penalize high no-choice probability (session termination hazard)
  totalSlateQ -= choiceDistribution.noChoiceProbability * 2.0;

  return { totalSlateQ, choiceDistribution, itemQValues };
}

/**
 * Conservative Q-Learning (CQL) Loss Component:
 * Penalizes Q-values on unobserved / out-of-distribution item slates while maximizing Q-values on logged actions:
 *  L_CQL(Q) = alpha * ( log sum_{a'} exp(Q(s, a')) - E_{a ~ pi_log} [ Q(s, a) ] ) + 1/2 * (Q(s, a) - y)^2
 */
export function cqlLoss(
  observedQ: number,
  unobservedQs: number[],
  targetTD: number,
  cqlAlpha = 2.0,
): { totalLoss: number; tdLoss: number; cqlPenalty: number } {
  const tdError = observedQ - targetTD;
  const tdLoss = 0.5 * tdError * tdError;

  // LogSumExp of candidate actions
  const maxQ = Math.max(...unobservedQs, observedQ);
  const sumExp = unobservedQs.reduce((acc, q) => acc + Math.exp(q - maxQ), 0) + Math.exp(observedQ - maxQ);
  const logSumExp = maxQ + Math.log(sumExp);

  const cqlPenalty = cqlAlpha * (logSumExp - observedQ);
  const totalLoss = tdLoss + cqlPenalty;

  return { totalLoss, tdLoss, cqlPenalty };
}

/**
 * Slate Re-ranking with RL residual bounded at [-22%, +22%]:
 */
export function slateRLRerank(
  state: SlateQState,
  candidates: SlateCandidate[],
  qNet: ItemQNetwork,
  rlWeight = 0.22,
): { candidate: SlateCandidate; originalScore: number; qValue: number; finalScore: number }[] {
  return candidates
    .map((c) => {
      const q = itemQValue(state, c, qNet);
      const boundedResidual = 1 + rlWeight * Math.tanh(q);
      const finalScore = c.organicScore * boundedResidual;
      return {
        candidate: c,
        originalScore: c.organicScore,
        qValue: q,
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
