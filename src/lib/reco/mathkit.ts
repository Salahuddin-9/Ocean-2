/**
 * ATLAS-RANK :: numerical kernel.
 * Every formula in the specification is implemented here exactly once so that
 * offline training, online serving and the documentation cannot drift apart.
 */

export const EPS = 1e-9;

export const clamp = (x: number, lo = 0, hi = 1): number =>
  Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo;

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-clamp(z, -30, 30)));

export const logit = (p: number): number => {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
};

export const softplus = (z: number): number => (z > 20 ? z : Math.log1p(Math.exp(z)));

export const tanh = (z: number): number => Math.tanh(clamp(z, -30, 30));

export const relu = (z: number): number => (z > 0 ? z : 0);

/** log1p on counts — used everywhere to tame heavy-tailed engagement counts. */
export const lg = (x: number): number => Math.log1p(Math.max(0, x));

/** Exponential half-life decay: D(Δt) = 2^(-Δt / H). */
export const halfLifeDecay = (deltaHours: number, halfLifeHours: number): number =>
  Math.pow(2, -Math.max(0, deltaHours) / Math.max(EPS, halfLifeHours));

/** Exponentially weighted moving average. */
export const ewma = (prev: number, obs: number, alpha: number): number =>
  (1 - alpha) * prev + alpha * obs;

/** Time-aware EWMA: alpha adapts to the elapsed time vs the nominal period. */
export const ewmaTimed = (
  prev: number,
  obs: number,
  deltaHours: number,
  halfLifeHours: number,
): number => {
  const w = halfLifeDecay(deltaHours, halfLifeHours);
  return w * prev + (1 - w) * obs;
};

/** Wilson lower bound of a Bernoulli rate — smoothing for low-traffic content. */
export const wilsonLower = (successes: number, trials: number, z = 1.96): number => {
  if (trials <= 0) return 0;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return clamp((centre - margin) / denom);
};

/** Bayesian smoothed rate with a global prior (empirical Bayes). */
export const smoothRate = (successes: number, trials: number, prior: number, strength = 50): number =>
  (successes + prior * strength) / (trials + strength);

export const dot = (a: readonly number[], b: readonly number[]): number => {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

export const norm = (a: readonly number[]): number => Math.sqrt(dot(a, a));

export const cosine = (a: readonly number[], b: readonly number[]): number => {
  const na = norm(a);
  const nb = norm(b);
  if (na < EPS || nb < EPS) return 0;
  return clamp(dot(a, b) / (na * nb), -1, 1);
};

export const l2normalize = (a: readonly number[]): number[] => {
  const n = norm(a);
  if (n < EPS) return a.slice();
  return a.map((x) => x / n);
};

export const addScaled = (a: number[], b: readonly number[], s: number): number[] => {
  const out = a.slice();
  for (let i = 0; i < Math.min(out.length, b.length); i++) out[i] += s * b[i];
  return out;
};

export const softmax = (xs: readonly number[], temperature = 1): number[] => {
  if (xs.length === 0) return [];
  const t = Math.max(EPS, temperature);
  const m = Math.max(...xs);
  const ex = xs.map((x) => Math.exp((x - m) / t));
  const s = ex.reduce((a, b) => a + b, 0) + EPS;
  return ex.map((e) => e / s);
};

/** Deterministic PRNG (mulberry32) — reproducible simulations & seeding. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal. */
export function gaussian(rnd: () => number): number {
  const u = Math.max(EPS, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape,1) via Marsaglia–Tsang; used for Beta sampling. */
export function sampleGamma(shape: number, rnd: () => number): number {
  if (shape < 1) {
    const u = Math.max(EPS, rnd());
    return sampleGamma(1 + shape, rnd) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let v = 0;
    do {
      x = gaussian(rnd);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(EPS, rnd());
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(α,β) sample — the core of Thompson Sampling. */
export function sampleBeta(alpha: number, beta: number, rnd: () => number): number {
  const a = sampleGamma(Math.max(EPS, alpha), rnd);
  const b = sampleGamma(Math.max(EPS, beta), rnd);
  return clamp(a / (a + b + EPS));
}

/** UCB1 exploration bonus. */
export const ucb1 = (meanReward: number, pulls: number, totalPulls: number, c = 1.4): number =>
  meanReward + c * Math.sqrt(Math.log(Math.max(2, totalPulls)) / Math.max(1, pulls));

/** LinUCB-style bonus given the inverse design matrix diagonal approximation. */
export const linUcbBonus = (x: readonly number[], aInvDiag: readonly number[], alpha: number): number => {
  let s = 0;
  for (let i = 0; i < Math.min(x.length, aInvDiag.length); i++) s += x[i] * x[i] * aInvDiag[i];
  return alpha * Math.sqrt(Math.max(0, s));
};

/** Platt scaling: p' = σ(a·logit(p) + b). */
export const calibrate = (p: number, a: number, b: number): number => sigmoid(a * logit(p) + b);

/** Area under ROC — O(n log n) rank based. */
export function auc(scores: readonly number[], labels: readonly number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] > 0.5 ? 1 : 0 }));
  pairs.sort((p, q) => p.s - q.s);
  let rankSumPos = 0;
  let nPos = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].s === pairs[i].s) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (pairs[k].y === 1) {
        rankSumPos += avgRank;
        nPos++;
      }
    }
    i = j + 1;
  }
  const nNeg = pairs.length - nPos;
  if (nPos === 0 || nNeg === 0) return 0.5;
  return clamp((rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg));
}

export const logLoss = (p: number, y: number): number => {
  const q = clamp(p, 1e-7, 1 - 1e-7);
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
};

/** Shannon entropy of a distribution — feed diversity measurement. */
export function entropy(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h;
}

/** Normalised entropy in [0,1]. */
export const normalizedEntropy = (counts: readonly number[]): number => {
  const k = counts.filter((c) => c > 0).length;
  if (k <= 1) return 0;
  return clamp(entropy(counts) / Math.log(k));
};

/** Gini impurity — used for creator-concentration checks. */
export function gini(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const xs = values.slice().sort((a, b) => a - b);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (sum <= EPS) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * xs[i];
  return clamp((2 * cum) / (n * sum) - (n + 1) / n);
}

/** 32-bit FNV-1a — deterministic feature hashing / simhash bucketing. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Hash a token into a signed unit in a d-dimensional space (hashing trick). */
export function hashToVector(token: string, dim: number, weight = 1): number[] {
  const v = new Array<number>(dim).fill(0);
  const h = fnv1a(token);
  const idx = h % dim;
  const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
  v[idx] = sign * weight;
  return v;
}

export const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export const variance = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
};

export const stddev = (xs: readonly number[]): number => Math.sqrt(variance(xs));

/** Robust z-score with MAD fallback. */
export const zscore = (x: number, mu: number, sigma: number): number =>
  (x - mu) / Math.max(0.05, sigma);

/** Hours between two dates. */
export const hoursBetween = (a: Date | number, b: Date | number): number =>
  Math.abs((+a - +b) / 3_600_000);

export const nowUtc = (): Date => new Date();
