/**
 * ATLAS-RANK :: Deep Recommendation Models & Neural Rankers
 *
 * Implements standard Meta & TikTok production deep ranking architectures:
 *  1. DLRM (Deep Learning Recommendation Model - Meta standard)
 *  2. DeepFM (Factorization Machine + Deep Neural Network)
 *  3. DIN (Deep Interest Network - Local Activation Unit / Target Attention)
 *  4. DIEN (Deep Interest Evolution Network - GRU + AUGRU with Target Evolution)
 *  5. BST (Behavioral Sequence Transformer - Multi-Head Self-Attention + Target Attention)
 *  6. PLE (Progressive Layered Extraction - Multi-Task Learning beyond MMoE)
 *  7. LightGCN (Graph Neural Network for Collaborative Filtering)
 */

import { clamp, dot, l2normalize, sigmoid, softmax } from "../mathkit";

export const EMBEDDING_DIM = 16;

/* ========================================================================== */
/* 1. DLRM (Meta Architecture)                                               */
/* ========================================================================== */

export interface DLRMConfig {
  denseInDim: number;
  bottomMLPDims: number[];
  embeddingDim: number;
  numCategorical: number;
  topMLPDims: number[];
}

export interface DLRMWeights {
  bottomMLP: { W: number[][]; b: number[] }[];
  embeddingTables: number[][][]; // [cat_idx][vocab_size][embedding_dim]
  topMLP: { W: number[][]; b: number[] }[];
}

/**
 * DLRM Forward Pass:
 *  1. Dense features x_d -> Bottom MLP -> v_dense in R^D
 *  2. Sparse categorical indices -> Embedding Tables -> {v_1, ..., v_S} in R^D
 *  3. Explicit Feature Interaction: Compute dot product of all pairs in {v_dense, v_1, ..., v_S}
 *     Triangular interaction matrix has (S+1)*(S)/2 features.
 *  4. Concatenate [v_dense, interactions] -> Top MLP -> Prediction in [0, 1]
 */
export function dlrmForward(
  denseFeatures: number[],
  sparseIndices: number[],
  weights: DLRMWeights,
): { prediction: number; denseEmbedding: number[]; sparseEmbeddings: number[][]; interactions: number[] } {
  // 1. Bottom MLP for continuous features
  let vDense = denseFeatures.slice();
  for (const layer of weights.bottomMLP) {
    vDense = linearRelu(vDense, layer.W, layer.b);
  }

  // 2. Sparse feature embeddings
  const sparseEmbeddings: number[][] = [];
  for (let i = 0; i < sparseIndices.length; i++) {
    const table = weights.embeddingTables[i];
    const idx = sparseIndices[i] % (table?.length || 1);
    const emb = table?.[idx] ? table[idx].slice() : new Array(vDense.length).fill(0);
    sparseEmbeddings.push(emb);
  }

  // 3. Feature Dot-Product Interaction Layer
  const allVectors = [vDense, ...sparseEmbeddings];
  const interactions: number[] = [];
  for (let i = 0; i < allVectors.length; i++) {
    for (let j = i + 1; j < allVectors.length; j++) {
      interactions.push(dot(allVectors[i], allVectors[j]));
    }
  }

  // 4. Concatenate [vDense, interactions] -> Top MLP
  let topInput = [...vDense, ...interactions];
  for (let l = 0; l < weights.topMLP.length; l++) {
    const layer = weights.topMLP[l];
    const isLast = l === weights.topMLP.length - 1;
    topInput = isLast
      ? linearNoAct(topInput, layer.W, layer.b)
      : linearRelu(topInput, layer.W, layer.b);
  }

  const prediction = sigmoid(topInput[0] ?? 0);
  return { prediction, denseEmbedding: vDense, sparseEmbeddings, interactions };
}

/* ========================================================================== */
/* 2. DeepFM (Explicit FM 2nd-order Interaction + Deep MLP)                   */
/* ========================================================================== */

export interface DeepFMWeights {
  firstOrderBias: number;
  firstOrderWeights: number[];
  embeddingTables: number[][][]; // [field_idx][vocab_size][embedding_dim]
  dnnLayers: { W: number[][]; b: number[] }[];
  outW: number[];
  outB: number;
}

/**
 * DeepFM Forward Pass:
 *  FM component:
 *    y_FM = <w, x> + 1/2 * sum_{f=1}^k [ (sum_{i=1}^d v_{i,f} x_i)^2 - sum_{i=1}^d v_{i,f}^2 x_i^2 ]
 *  Deep component:
 *    y_DNN = MLP(concat(e_1, ..., e_m))
 *  y = sigmoid(y_FM + y_DNN)
 */
export function deepfmForward(
  featureIndices: number[],
  weights: DeepFMWeights,
): { prediction: number; fmFirstOrder: number; fmSecondOrder: number; dnnOutput: number } {
  // 1st order linear term
  let fmFirstOrder = weights.firstOrderBias;
  for (let i = 0; i < featureIndices.length; i++) {
    const idx = featureIndices[i];
    fmFirstOrder += weights.firstOrderWeights[idx % weights.firstOrderWeights.length] ?? 0;
  }

  // 2nd order Factorization Machine interaction
  const fieldEmbs: number[][] = [];
  for (let i = 0; i < featureIndices.length; i++) {
    const table = weights.embeddingTables[i];
    const idx = featureIndices[i] % (table?.length || 1);
    fieldEmbs.push(table?.[idx] ? table[idx].slice() : new Array(EMBEDDING_DIM).fill(0));
  }

  const embDim = fieldEmbs[0]?.length || EMBEDDING_DIM;
  let fmSecondOrder = 0;
  for (let f = 0; f < embDim; f++) {
    let sumVal = 0;
    let sumSqVal = 0;
    for (let i = 0; i < fieldEmbs.length; i++) {
      const v_if = fieldEmbs[i][f];
      sumVal += v_if;
      sumSqVal += v_if * v_if;
    }
    fmSecondOrder += 0.5 * (sumVal * sumVal - sumSqVal);
  }

  // Deep DNN component
  let dnnIn = fieldEmbs.flat();
  for (let l = 0; l < weights.dnnLayers.length; l++) {
    const layer = weights.dnnLayers[l];
    dnnIn = linearRelu(dnnIn, layer.W, layer.b);
  }
  let dnnOutput = weights.outB;
  for (let i = 0; i < dnnIn.length; i++) {
    dnnOutput += (weights.outW[i] ?? 0) * dnnIn[i];
  }

  const logitVal = fmFirstOrder + fmSecondOrder + dnnOutput;
  const prediction = sigmoid(logitVal);
  return { prediction, fmFirstOrder, fmSecondOrder, dnnOutput };
}

/* ========================================================================== */
/* 3. DIN (Deep Interest Network - Target Activation Unit)                    */
/* ========================================================================== */

export interface DINWeights {
  activationMLP: { W: number[][]; b: number[] }[];
  finalMLP: { W: number[][]; b: number[] }[];
}

/**
 * Local Activation Unit (Target Attention):
 *  Given historical behavior item embeddings {e_1, ..., e_T} and candidate item embedding e_candidate,
 *  compute attention weight a(e_t, e_candidate) = MLP([e_t, e_candidate, e_t - e_candidate, e_t * e_candidate])
 *  User Representation U_c = sum_{t=1}^T a(e_t, e_candidate) * e_t
 */
export function dinAttentionUnit(
  histEmb: number[],
  targetEmb: number[],
  mlp: { W: number[][]; b: number[] }[],
): number {
  const diff = histEmb.map((h, i) => h - (targetEmb[i] ?? 0));
  const prod = histEmb.map((h, i) => h * (targetEmb[i] ?? 0));
  let actInput = [...histEmb, ...targetEmb, ...diff, ...prod];

  for (let l = 0; l < mlp.length; l++) {
    const layer = mlp[l];
    const isLast = l === mlp.length - 1;
    actInput = isLast ? linearNoAct(actInput, layer.W, layer.b) : linearRelu(actInput, layer.W, layer.b);
  }
  return actInput[0] ?? 0; // unnormalized or sigmoid activation weight
}

export function dinForward(
  userHistEmbs: number[][],
  targetItemEmb: number[],
  otherFeatures: number[],
  weights: DINWeights,
): { prediction: number; userRepresentation: number[]; attentionWeights: number[] } {
  const attentionWeights = userHistEmbs.map((h) => dinAttentionUnit(h, targetItemEmb, weights.activationMLP));
  const normWeights = softmax(attentionWeights, 1.0);

  const dim = targetItemEmb.length;
  const userRepresentation = new Array<number>(dim).fill(0);
  for (let t = 0; t < userHistEmbs.length; t++) {
    const w = normWeights[t];
    for (let d = 0; d < dim; d++) {
      userRepresentation[d] += w * userHistEmbs[t][d];
    }
  }

  let finalIn = [...userRepresentation, ...targetItemEmb, ...otherFeatures];
  for (let l = 0; l < weights.finalMLP.length; l++) {
    const layer = weights.finalMLP[l];
    const isLast = l === weights.finalMLP.length - 1;
    finalIn = isLast ? linearNoAct(finalIn, layer.W, layer.b) : linearRelu(finalIn, layer.W, layer.b);
  }

  const prediction = sigmoid(finalIn[0] ?? 0);
  return { prediction, userRepresentation, attentionWeights: normWeights };
}

/* ========================================================================== */
/* 4. DIEN (Deep Interest Evolution Network - GRU + AUGRU)                   */
/* ========================================================================== */

export interface GRUCellWeights {
  Wz: number[][]; Uz: number[][]; bz: number[];
  Wr: number[][]; Ur: number[][]; br: number[];
  Wh: number[][]; Uh: number[][]; bh: number[];
}

/**
 * Standard GRU Step:
 *  z_t = sigma(W_z x_t + U_z h_{t-1} + b_z)
 *  r_t = sigma(W_r x_t + U_r h_{t-1} + b_r)
 *  ~h_t = tanh(W_h x_t + U_h (r_t * h_{t-1}) + b_h)
 *  h_t = (1 - z_t) * h_{t-1} + z_t * ~h_t
 */
export function gruStep(xt: number[], htPrev: number[], w: GRUCellWeights): number[] {
  const hiddenDim = htPrev.length;
  const z = sigmoidVec(linearComb(xt, w.Wz, htPrev, w.Uz, w.bz));
  const r = sigmoidVec(linearComb(xt, w.Wr, htPrev, w.Ur, w.br));

  const r_ht = htPrev.map((h, i) => h * r[i]);
  const hTilde = tanhVec(linearComb(xt, w.Wh, r_ht, w.Uh, w.bh));

  const ht = new Array<number>(hiddenDim);
  for (let i = 0; i < hiddenDim; i++) {
    ht[i] = (1 - z[i]) * htPrev[i] + z[i] * hTilde[i];
  }
  return ht;
}

/**
 * AUGRU Step (Attentional Update Gate GRU):
 *  z'_t = a_t * z_t
 *  h_t = (1 - z'_t) * h_{t-1} + z'_t * ~h_t
 */
export function augruStep(xt: number[], htPrev: number[], at: number, w: GRUCellWeights): number[] {
  const hiddenDim = htPrev.length;
  const z = sigmoidVec(linearComb(xt, w.Wz, htPrev, w.Uz, w.bz));
  const r = sigmoidVec(linearComb(xt, w.Wr, htPrev, w.Ur, w.br));

  const r_ht = htPrev.map((h, i) => h * r[i]);
  const hTilde = tanhVec(linearComb(xt, w.Wh, r_ht, w.Uh, w.bh));

  const zPrime = z.map((zi) => zi * at);
  const ht = new Array<number>(hiddenDim);
  for (let i = 0; i < hiddenDim; i++) {
    ht[i] = (1 - zPrime[i]) * htPrev[i] + zPrime[i] * hTilde[i];
  }
  return ht;
}

export interface DIENWeights {
  interestExtractorGRU: GRUCellWeights;
  interestEvolutionAUGRU: GRUCellWeights;
  attMLP: { W: number[][]; b: number[] }[];
  finalMLP: { W: number[][]; b: number[] }[];
}

export function dienForward(
  behaviorSequence: number[][],
  targetItemEmb: number[],
  otherFeatures: number[],
  weights: DIENWeights,
): { prediction: number; evolvedInterest: number[]; attentionScores: number[] } {
  const hiddenDim = targetItemEmb.length;

  // Layer 1: Interest Extractor GRU
  let hExt = new Array<number>(hiddenDim).fill(0);
  const extractedInterests: number[][] = [];
  for (const itemEmb of behaviorSequence) {
    hExt = gruStep(itemEmb, hExt, weights.interestExtractorGRU);
    extractedInterests.push(hExt.slice());
  }

  // Attention scores over extracted interests relative to target item
  const attScores = extractedInterests.map((h) =>
    sigmoid(dinAttentionUnit(h, targetItemEmb, weights.attMLP)),
  );

  // Layer 2: Interest Evolution AUGRU
  let hEvol = new Array<number>(hiddenDim).fill(0);
  for (let t = 0; t < extractedInterests.length; t++) {
    hEvol = augruStep(extractedInterests[t], hEvol, attScores[t], weights.interestEvolutionAUGRU);
  }

  let finalIn = [...hEvol, ...targetItemEmb, ...otherFeatures];
  for (let l = 0; l < weights.finalMLP.length; l++) {
    const layer = weights.finalMLP[l];
    const isLast = l === weights.finalMLP.length - 1;
    finalIn = isLast ? linearNoAct(finalIn, layer.W, layer.b) : linearRelu(finalIn, layer.W, layer.b);
  }

  const prediction = sigmoid(finalIn[0] ?? 0);
  return { prediction, evolvedInterest: hEvol, attentionScores: attScores };
}

/* ========================================================================== */
/* 5. BST (Behavioral Sequence Transformer - Alibaba/TikTok Architecture)     */
/* ========================================================================== */

export interface TransformerLayerWeights {
  Wq: number[][];
  Wk: number[][];
  Wv: number[][];
  Wo: number[][];
  ffnW1: number[][]; ffnB1: number[];
  ffnW2: number[][]; ffnB2: number[];
}

export interface BSTWeights {
  positionEmbeddings: number[][]; // [max_seq_len][d_model]
  transformerLayer: TransformerLayerWeights;
  targetAttMLP: { W: number[][]; b: number[] }[];
  topMLP: { W: number[][]; b: number[] }[];
}

/**
 * Single-Head / Multi-Head Self-Attention over sequence:
 *  Q = S W_q, K = S W_k, V = S W_v
 *  Attention(Q, K, V) = softmax(Q K^T / sqrt(d)) V
 */
export function transformerBlock(
  seq: number[][],
  w: TransformerLayerWeights,
): number[][] {
  const len = seq.length;
  const dim = seq[0]?.length || EMBEDDING_DIM;
  const scale = 1 / Math.sqrt(dim);

  const Q = seq.map((x) => matVecMul(w.Wq, x));
  const K = seq.map((x) => matVecMul(w.Wk, x));
  const V = seq.map((x) => matVecMul(w.Wv, x));

  const attnOut: number[][] = [];
  for (let i = 0; i < len; i++) {
    const scores: number[] = [];
    for (let j = 0; j < len; j++) {
      scores.push(dot(Q[i], K[j]) * scale);
    }
    const weights = softmax(scores);
    const context = new Array<number>(dim).fill(0);
    for (let j = 0; j < len; j++) {
      for (let d = 0; d < dim; d++) {
        context[d] += weights[j] * V[j][d];
      }
    }
    // Residual + projection
    const projected = matVecMul(w.Wo, context);
    const postSelf = projected.map((p, d) => p + seq[i][d]);

    // Feed-forward Network: FFN(x) = W2(relu(W1 x + b1)) + b2
    const ffn1 = linearRelu(postSelf, w.ffnW1, w.ffnB1);
    const ffn2 = linearNoAct(ffn1, w.ffnW2, w.ffnB2);
    attnOut.push(ffn2.map((f, d) => f + postSelf[d]));
  }
  return attnOut;
}

export function bstForward(
  behaviorSequence: number[][],
  targetItemEmb: number[],
  denseFeatures: number[],
  weights: BSTWeights,
): { prediction: number; transformerOutput: number[][]; targetAttentionOutput: number[] } {
  // Add position embeddings: E_seq = item_emb + pos_emb
  const seqWithPos = behaviorSequence.map((item, i) => {
    const pos = weights.positionEmbeddings[i] || new Array(item.length).fill(0);
    return item.map((v, d) => v + (pos[d] ?? 0));
  });

  // Self-attention transformer layer
  const transformerOutput = transformerBlock(seqWithPos, weights.transformerLayer);

  // Target-attention over Transformer output
  const targetWeights = softmax(
    transformerOutput.map((h) => dot(h, targetItemEmb) / Math.sqrt(targetItemEmb.length)),
  );
  const targetAttentionOutput = new Array<number>(targetItemEmb.length).fill(0);
  for (let i = 0; i < transformerOutput.length; i++) {
    for (let d = 0; d < targetItemEmb.length; d++) {
      targetAttentionOutput[d] += targetWeights[i] * transformerOutput[i][d];
    }
  }

  let topInput = [...targetAttentionOutput, ...targetItemEmb, ...denseFeatures];
  for (let l = 0; l < weights.topMLP.length; l++) {
    const layer = weights.topMLP[l];
    const isLast = l === weights.topMLP.length - 1;
    topInput = isLast ? linearNoAct(topInput, layer.W, layer.b) : linearRelu(topInput, layer.W, layer.b);
  }

  const prediction = sigmoid(topInput[0] ?? 0);
  return { prediction, transformerOutput, targetAttentionOutput };
}

/* ========================================================================== */
/* 6. PLE (Progressive Layered Extraction - Multi-Task Architecture)          */
/* ========================================================================== */

export interface PLELayerWeights {
  taskSpecificExperts: { W: number[][]; b: number[] }[][]; // [task_idx][expert_idx]
  sharedExperts: { W: number[][]; b: number[] }[];
  taskGates: { W: number[][]; b: number[] }[]; // [task_idx]
  sharedGate?: { W: number[][]; b: number[] };
}

export interface PLEWeights {
  layers: PLELayerWeights[];
  taskTowers: { W: number[][]; b: number[] }[][]; // [task_idx][layer_idx]
}

/**
 * PLE (Progressive Layered Extraction - Tencent / TikTok multi-task SOTA):
 * Solves negative transfer and seesaw phenomenon in multi-objective ranking.
 * Explicitly separates Task-Specific Experts and Shared Experts at each layer.
 */
export function pleForward(
  inputFeatures: number[],
  weights: PLEWeights,
  numTasks: number,
): Record<string, number> {
  let taskInputs: number[][] = Array.from({ length: numTasks }, () => inputFeatures.slice());
  let sharedInput: number[] = inputFeatures.slice();

  for (const layer of weights.layers) {
    const nextTaskInputs: number[][] = [];

    // Evaluate all shared experts
    const sharedExpertOutputs = layer.sharedExperts.map((exp) => linearRelu(sharedInput, exp.W, exp.b));

    // Evaluate task-specific experts
    const taskExpertOutputs: number[][][] = [];
    for (let t = 0; t < numTasks; t++) {
      const experts = layer.taskSpecificExperts[t] || [];
      taskExpertOutputs.push(experts.map((exp) => linearRelu(taskInputs[t], exp.W, exp.b)));
    }

    // Task gating: Gate selects from [Task_t_Experts, Shared_Experts]
    for (let t = 0; t < numTasks; t++) {
      const candidates = [...taskExpertOutputs[t], ...sharedExpertOutputs];
      const gateLogits = linearNoAct(taskInputs[t], layer.taskGates[t].W, layer.taskGates[t].b);
      const gateWeights = softmax(gateLogits.slice(0, candidates.length));

      const dim = candidates[0]?.length || 16;
      const routed = new Array<number>(dim).fill(0);
      for (let c = 0; c < candidates.length; c++) {
        for (let d = 0; d < dim; d++) {
          routed[d] += gateWeights[c] * candidates[c][d];
        }
      }
      nextTaskInputs.push(routed);
    }

    // Shared gating: Shared Gate selects from ALL [Task_1..K_Experts, Shared_Experts]
    if (layer.sharedGate) {
      const allExperts = [...taskExpertOutputs.flat(), ...sharedExpertOutputs];
      const sharedGateLogits = linearNoAct(sharedInput, layer.sharedGate.W, layer.sharedGate.b);
      const sharedGateWeights = softmax(sharedGateLogits.slice(0, allExperts.length));

      const dim = allExperts[0]?.length || 16;
      const nextShared = new Array<number>(dim).fill(0);
      for (let c = 0; c < allExperts.length; c++) {
        for (let d = 0; d < dim; d++) {
          nextShared[d] += sharedGateWeights[c] * allExperts[c][d];
        }
      }
      sharedInput = nextShared;
    }

    taskInputs = nextTaskInputs;
  }

  // Final Task Towers
  const predictions: Record<string, number> = {};
  for (let t = 0; t < numTasks; t++) {
    let towerOut = taskInputs[t];
    const tower = weights.taskTowers[t] || [];
    for (let l = 0; l < tower.length; l++) {
      const isLast = l === tower.length - 1;
      towerOut = isLast
        ? linearNoAct(towerOut, tower[l].W, tower[l].b)
        : linearRelu(towerOut, tower[l].W, tower[l].b);
    }
    predictions[`task_${t}`] = sigmoid(towerOut[0] ?? 0);
  }

  return predictions;
}

/* ========================================================================== */
/* 7. LightGCN (Graph Neural Network for Collaborative Filtering)             */
/* ========================================================================== */

export interface GraphAdjacency {
  userToItems: Map<number, number[]>;
  itemToUsers: Map<number, number[]>;
}

/**
 * LightGCN (Simplified GCN without nonlinearities or feature transforms):
 *  e_u^{(k+1)} = sum_{i in N(u)} 1 / sqrt(|N(u)| |N(i)|) * e_i^{(k)}
 *  e_i^{(k+1)} = sum_{u in N(i)} 1 / sqrt(|N(i)| |N(u)|) * e_u^{(k)}
 *  Final: e_u = sum_{k=0}^K alpha_k e_u^{(k)}
 */
export function lightGCNForward(
  userInitialEmbeddings: number[][],
  itemInitialEmbeddings: number[][],
  adj: GraphAdjacency,
  numLayers = 3,
): { userEmbeddings: number[][]; itemEmbeddings: number[][] } {
  const numUsers = userInitialEmbeddings.length;
  const numItems = itemInitialEmbeddings.length;
  const dim = userInitialEmbeddings[0]?.length || EMBEDDING_DIM;

  let uLayers: number[][][] = [userInitialEmbeddings.map((e) => e.slice())];
  let iLayers: number[][][] = [itemInitialEmbeddings.map((e) => e.slice())];

  for (let k = 0; k < numLayers; k++) {
    const uPrev = uLayers[k];
    const iPrev = iLayers[k];

    const uNext: number[][] = [];
    for (let u = 0; u < numUsers; u++) {
      const items = adj.userToItems.get(u) || [];
      const nu = items.length;
      const acc = new Array<number>(dim).fill(0);
      if (nu > 0) {
        for (const it of items) {
          const ni = adj.itemToUsers.get(it)?.length || 1;
          const norm = 1 / Math.sqrt(nu * ni);
          for (let d = 0; d < dim; d++) {
            acc[d] += norm * (iPrev[it]?.[d] ?? 0);
          }
        }
      }
      uNext.push(acc);
    }

    const iNext: number[][] = [];
    for (let i = 0; i < numItems; i++) {
      const users = adj.itemToUsers.get(i) || [];
      const ni = users.length;
      const acc = new Array<number>(dim).fill(0);
      if (ni > 0) {
        for (const u of users) {
          const nu = adj.userToItems.get(u)?.length || 1;
          const norm = 1 / Math.sqrt(ni * nu);
          for (let d = 0; d < dim; d++) {
            acc[d] += norm * (uPrev[u]?.[d] ?? 0);
          }
        }
      }
      iNext.push(acc);
    }

    uLayers.push(uNext);
    iLayers.push(iNext);
  }

  // Layer-wise combination: e_u = 1/(K+1) sum_{k=0}^K e_u^{(k)}
  const alpha = 1 / (numLayers + 1);
  const finalUsers: number[][] = [];
  for (let u = 0; u < numUsers; u++) {
    const combined = new Array<number>(dim).fill(0);
    for (let k = 0; k <= numLayers; k++) {
      for (let d = 0; d < dim; d++) {
        combined[d] += alpha * uLayers[k][u][d];
      }
    }
    finalUsers.push(l2normalize(combined));
  }

  const finalItems: number[][] = [];
  for (let i = 0; i < numItems; i++) {
    const combined = new Array<number>(dim).fill(0);
    for (let k = 0; k <= numLayers; k++) {
      for (let d = 0; d < dim; d++) {
        combined[d] += alpha * iLayers[k][i][d];
      }
    }
    finalItems.push(l2normalize(combined));
  }

  return { userEmbeddings: finalUsers, itemEmbeddings: finalItems };
}

/* ========================================================================== */
/* Neural Building Block Helpers                                              */
/* ========================================================================== */

function matVecMul(W: number[][], x: number[]): number[] {
  const outRows = W.length;
  const out = new Array<number>(outRows).fill(0);
  for (let r = 0; r < outRows; r++) {
    let sum = 0;
    const row = W[r];
    for (let c = 0; c < x.length; c++) {
      sum += (row[c] ?? 0) * x[c];
    }
    out[r] = sum;
  }
  return out;
}

function linearRelu(x: number[], W: number[][], b: number[]): number[] {
  const out = matVecMul(W, x);
  for (let i = 0; i < out.length; i++) {
    const v = out[i] + (b[i] ?? 0);
    out[i] = v > 0 ? v : 0;
  }
  return out;
}

function linearNoAct(x: number[], W: number[][], b: number[]): number[] {
  const out = matVecMul(W, x);
  for (let i = 0; i < out.length; i++) {
    out[i] += b[i] ?? 0;
  }
  return out;
}

function linearComb(x1: number[], W1: number[][], x2: number[], W2: number[][], b: number[]): number[] {
  const y1 = matVecMul(W1, x1);
  const y2 = matVecMul(W2, x2);
  const out = new Array<number>(y1.length);
  for (let i = 0; i < y1.length; i++) {
    out[i] = y1[i] + y2[i] + (b[i] ?? 0);
  }
  return out;
}

function sigmoidVec(xs: number[]): number[] {
  return xs.map((x) => sigmoid(x));
}

function tanhVec(xs: number[]): number[] {
  return xs.map((x) => Math.tanh(clamp(x, -20, 20)));
}
