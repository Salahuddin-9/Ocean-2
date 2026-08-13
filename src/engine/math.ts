// ============================================================
// Mathematical Utility Functions
// ============================================================

/**
 * Sigmoid activation function: σ(k(x - x₀))
 * Maps any real number to (0, 1) range
 * Used for: watch time ratio, rewatch count, velocity scoring
 * 
 * Formula: σ(x) = 1 / (1 + e^(-k(x - x₀)))
 */
export function sigmoid(x: number, steepness: number = 1, midpoint: number = 0): number {
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
}

/**
 * Logarithmic scaling with base: log_b(x + 1)
 * Prevents zero-log and dampens exponential growth
 * Used for: view counts, velocity metrics
 */
export function logScale(x: number, base: number = 10): number {
  return Math.log(x + 1) / Math.log(base);
}

/**
 * Exponential decay function for recency
 * Formula: e^(-λt) where λ = ln(2) / halfLife
 * 
 * @param ageHours - Age of content in hours
 * @param halfLifeHours - Half-life period in hours
 */
export function exponentialDecay(ageHours: number, halfLifeHours: number): number {
  const lambda = Math.LN2 / halfLifeHours;
  return Math.exp(-lambda * ageHours);
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Min-Max normalization to [0, 1]
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

/**
 * Weighted geometric mean
 * Used for combining platform scores
 */
export function weightedGeometricMean(values: number[], weights: number[]): number {
  let logSum = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i++) {
    const safeVal = Math.max(values[i], 1e-10); // prevent log(0)
    logSum += weights[i] * Math.log(safeVal);
    weightSum += weights[i];
  }
  return Math.exp(logSum / weightSum);
}

/**
 * Softmax normalization for score distribution
 * Converts raw scores to probability distribution
 */
export function softmax(scores: number[], temperature: number = 1.0): number[] {
  const maxScore = Math.max(...scores);
  const exps = scores.map(s => Math.exp((s - maxScore) / temperature));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sumExps);
}

/**
 * ReLU (Rectified Linear Unit) - floors negative values to 0
 */
export function relu(x: number): number {
  return Math.max(0, x);
}

/**
 * Smooth penalty function for bounce detection
 * Returns 1.0 for good watch ratios, drops sharply below threshold
 * Uses smooth step function to avoid hard cutoffs
 */
export function bouncePenalty(watchRatio: number, threshold: number = 0.1): number {
  if (watchRatio >= threshold * 3) return 1.0;
  if (watchRatio < threshold) return 0.05; // severe penalty but not zero
  // Smooth interpolation in the transition zone
  const t = (watchRatio - threshold) / (threshold * 2);
  return 0.05 + 0.95 * (3 * t * t - 2 * t * t * t); // smoothstep
}
