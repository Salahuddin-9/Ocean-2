/**
 * ATLAS-RANK :: FTRL-Proximal Streaming Online Learning
 *
 * Implements Google / Meta production FTRL-Proximal (McMahan et al.):
 * Solves streaming logistic regression with exact L1 sparsity and per-coordinate adaptive learning rates.
 *
 * Update Equation for coordinate i:
 * If |z_i| <= lambda_1:
 *   w_i = 0  (Exact Sparsity)
 * Else:
 *   w_i = - sgn(z_i) / ( (beta + sqrt(n_i)) / alpha + lambda_2 ) * ( |z_i| - lambda_1 )
 *
 * Per-step Gradient Update:
 *   g_i = (sigma(w^T x) - y) * x_i
 *   sigma_i = 1/alpha * ( sqrt(n_i + g_i^2) - sqrt(n_i) )
 *   z_i <- z_i + g_i - sigma_i * w_i
 *   n_i <- n_i + g_i^2
 */

import { clamp, sigmoid } from "../mathkit";

export interface FTRLCoordinate {
  z: number; // accumulated gradient - learning rate adjustment
  n: number; // accumulated squared gradients
  w: number; // current sparse weight
  lastSeenStep: number;
}

export interface FTRLModelConfig {
  alpha: number; // global learning rate
  beta: number; // smoothing parameter
  lambda1: number; // L1 regularization (drives exact zeros)
  lambda2: number; // L2 regularization (drives weight shrinkage)
  maxFeatures: number; // memory bound for dynamic hash table
}

export class FTRLProximalModel {
  public config: FTRLModelConfig;
  public coordinates: Map<number, FTRLCoordinate>;
  public totalSteps: number;
  public biasZ: number;
  public biasN: number;
  public biasW: number;

  constructor(cfg: Partial<FTRLModelConfig> = {}) {
    this.config = {
      alpha: cfg.alpha ?? 0.05,
      beta: cfg.beta ?? 1.0,
      lambda1: cfg.lambda1 ?? 0.01,
      lambda2: cfg.lambda2 ?? 0.001,
      maxFeatures: cfg.maxFeatures ?? 50000,
    };
    this.coordinates = new Map();
    this.totalSteps = 0;
    this.biasZ = 0;
    this.biasN = 0;
    this.biasW = 0;
  }

  /**
   * Compute the sparse weight w_i on-the-fly for coordinate i:
   */
  public getWeight(featureHash: number): number {
    const coord = this.coordinates.get(featureHash);
    if (!coord) return 0;

    const z = coord.z;
    const n = coord.n;
    if (Math.abs(z) <= this.config.lambda1) {
      coord.w = 0;
      return 0;
    }

    const sign = z > 0 ? 1 : -1;
    const denom = (this.config.beta + Math.sqrt(n)) / this.config.alpha + this.config.lambda2;
    const w = -sign * ((Math.abs(z) - this.config.lambda1) / denom);
    coord.w = w;
    return w;
  }

  /**
   * Predict probability P(y=1 | x):
   */
  public predict(sparseIndices: number[], values?: number[]): number {
    let logit = this.biasW;
    for (let i = 0; i < sparseIndices.length; i++) {
      const idx = sparseIndices[i];
      const val = values ? values[i] : 1.0;
      const w = this.getWeight(idx);
      logit += w * val;
    }
    return sigmoid(logit);
  }

  /**
   * Streaming update step on single example (x, y):
   */
  public update(
    sparseIndices: number[],
    label: number,
    values?: number[],
    importanceWeight = 1.0,
  ): { p: number; loss: number; activeNonZeroWeights: number } {
    this.totalSteps++;
    const p = this.predict(sparseIndices, values);
    const gradBase = (p - clamp(label)) * importanceWeight;
    const loss = -(label * Math.log(Math.max(1e-7, p)) + (1 - label) * Math.log(Math.max(1e-7, 1 - p))) * importanceWeight;

    // Update bias (with unregularized FTRL, lambda1=0)
    const gBias = gradBase;
    const sigmaBias = (Math.sqrt(this.biasN + gBias * gBias) - Math.sqrt(this.biasN)) / this.config.alpha;
    this.biasZ += gBias - sigmaBias * this.biasW;
    this.biasN += gBias * gBias;
    this.biasW = -this.biasZ / ((this.config.beta + Math.sqrt(this.biasN)) / this.config.alpha + this.config.lambda2);

    // Update feature coordinates
    let nonZero = 0;
    for (let i = 0; i < sparseIndices.length; i++) {
      const idx = sparseIndices[i];
      const val = values ? values[i] : 1.0;
      const gi = gradBase * val;

      let coord = this.coordinates.get(idx);
      if (!coord) {
        // Enforce memory bounds with LRU eviction if full
        if (this.coordinates.size >= this.config.maxFeatures) {
          this.evictStaleFeatures();
        }
        coord = { z: 0, n: 0, w: 0, lastSeenStep: this.totalSteps };
        this.coordinates.set(idx, coord);
      }

      const wi = coord.w;
      const sigma_i = (Math.sqrt(coord.n + gi * gi) - Math.sqrt(coord.n)) / this.config.alpha;
      coord.z += gi - sigma_i * wi;
      coord.n += gi * gi;
      coord.lastSeenStep = this.totalSteps;

      // Recompute weight with L1 soft-thresholding
      const updatedW = this.getWeight(idx);
      if (Math.abs(updatedW) > 1e-6) nonZero++;
    }

    return { p, loss, activeNonZeroWeights: nonZero };
  }

  private evictStaleFeatures(): void {
    let oldestStep = Infinity;
    let oldestKey = -1;
    for (const [key, coord] of this.coordinates.entries()) {
      if (coord.w === 0 && coord.lastSeenStep < oldestStep) {
        oldestStep = coord.lastSeenStep;
        oldestKey = key;
      }
    }
    if (oldestKey !== -1) {
      this.coordinates.delete(oldestKey);
    }
  }
}
