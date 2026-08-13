/**
 * ATLAS-RANK :: Point-in-Time Feature Store Architecture (Tecton/Feast style)
 *
 * Solves Lookahead Bias (Data Leakage) and Train/Serve Skew in Recommendation Systems.
 *
 * Mathematical & Architectural Core:
 *  Given an observation event at timestamp T_event (e.g. user clicked / skipped a video at 14:02:15):
 *  1. As-Of Join: Join features as they existed at exactly T_event - epsilon, NEVER at T_current or T_batch.
 *  2. Dual Storage Parity:
 *     - Online Store: Low-latency Key-Value (Redis / Aerospike) for real-time serving with TTL.
 *     - Offline Store: Time-partitioned Columnar (Parquet on S3 / Iceberg) for point-in-time training joins.
 *  3. Continuous Drift & Consistency Validation (PSI - Population Stability Index between Online & Offline distributions).
 */

export interface FeatureRecord {
  entityId: string;
  featureName: string;
  value: number | string | number[];
  timestamp: number; // Unix ms
}

export interface ObservationEvent {
  eventId: string;
  userId: string;
  contentId: string;
  timestamp: number;
  label: number;
}

/**
 * As-Of Join Engine:
 * For each observation (u, c, T_obs), find the latest feature record where timestamp <= T_obs
 */
export function pointInTimeAsOfJoin(
  observations: ObservationEvent[],
  userFeatureTimeline: Map<string, FeatureRecord[]>,
  contentFeatureTimeline: Map<string, FeatureRecord[]>,
): { observation: ObservationEvent; pointInTimeFeatures: Record<string, number | string | number[]> }[] {
  const trainingDataset: {
    observation: ObservationEvent;
    pointInTimeFeatures: Record<string, number | string | number[]>;
  }[] = [];

  for (const obs of observations) {
    const joinedFeatures: Record<string, number | string | number[]> = {};

    // As-Of Join User Features: latest record with timestamp <= obs.timestamp
    const uRecords = userFeatureTimeline.get(obs.userId) || [];
    const validUserRecords = uRecords
      .filter((r) => r.timestamp <= obs.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp);

    for (const r of validUserRecords) {
      if (!(r.featureName in joinedFeatures)) {
        joinedFeatures[`user_${r.featureName}`] = r.value;
      }
    }

    // As-Of Join Content Features: latest record with timestamp <= obs.timestamp
    const cRecords = contentFeatureTimeline.get(obs.contentId) || [];
    const validContentRecords = cRecords
      .filter((r) => r.timestamp <= obs.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp);

    for (const r of validContentRecords) {
      if (!(r.featureName in joinedFeatures)) {
        joinedFeatures[`content_${r.featureName}`] = r.value;
      }
    }

    trainingDataset.push({ observation: obs, pointInTimeFeatures: joinedFeatures });
  }

  return trainingDataset;
}

/**
 * Population Stability Index (PSI) between Online Serving and Offline Training Distributions:
 *  PSI = sum_{b=1}^B (Actual_b - Expected_b) * ln( Actual_b / Expected_b )
 *  PSI < 0.1  -> No significant drift
 *  0.1 <= PSI < 0.2 -> Moderate drift, schedule retraining
 *  PSI >= 0.2 -> Significant drift, alert and fall back to conservative model
 */
export function calculatePSI(
  onlineSamples: number[],
  offlineSamples: number[],
  numBuckets = 10,
): { psi: number; status: "clean" | "moderate_drift" | "critical_drift" } {
  if (onlineSamples.length === 0 || offlineSamples.length === 0) {
    return { psi: 0, status: "clean" };
  }

  const all = [...onlineSamples, ...offlineSamples].sort((a, b) => a - b);
  const minVal = all[0];
  const maxVal = all[all.length - 1] + 1e-6;
  const bucketWidth = (maxVal - minVal) / numBuckets;

  const onlineCounts = new Array(numBuckets).fill(0);
  for (const x of onlineSamples) {
    const b = Math.min(numBuckets - 1, Math.max(0, Math.floor((x - minVal) / bucketWidth)));
    onlineCounts[b]++;
  }

  const offlineCounts = new Array(numBuckets).fill(0);
  for (const x of offlineSamples) {
    const b = Math.min(numBuckets - 1, Math.max(0, Math.floor((x - minVal) / bucketWidth)));
    offlineCounts[b]++;
  }

  const nOn = onlineSamples.length;
  const nOff = offlineSamples.length;

  let psi = 0;
  for (let b = 0; b < numBuckets; b++) {
    const actual = (onlineCounts[b] + 1e-4) / nOn;
    const expected = (offlineCounts[b] + 1e-4) / nOff;
    psi += (actual - expected) * Math.log(actual / expected);
  }

  const status = psi >= 0.2 ? "critical_drift" : psi >= 0.1 ? "moderate_drift" : "clean";
  return { psi, status };
}
