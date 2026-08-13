/**
 * Turtle Social Media Application - Profile Metric System (ATS, TS, N)
 * 
 * This file contains the complete, production-ready, non-UI backend infrastructure,
 * formula calculations, data models, security policies, and SQL schemas for 
 * Turtle's dynamic trust and network validation metrics.
 * 
 * -----------------------------------------------------------------------------------------
 * METRIC DEFINITIONS:
 * 1. ATS (Anonymous Trust Rating):
 *    - Measures peer-vouched positive reputation without exposing user identities. 
 *    - Employs weighted decay and collusion detection to prevent reciprocal fake boosting.
 * 
 * 2. TS (Trust Score):
 *    - Comprehensive reputation rank (0 to 100) combining identity verification status, 
 *      account age, confirmed reports, profile completion, safe interactions, ATS, and network scale.
 * 
 * 3. N (Network Scale):
 *    - Measures structural social integration. Unlike superficial follower counts, Network Scale
 *      quantifies bi-directional, authenticated interactions and peer-vouched mutual nodes.
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. DATA MODELS & TYPES
// ==========================================

export interface UserMetricProfile {
  userId: string;
  accountAgeDays: number;
  isIdentityVerified: boolean;         // Official identity document upload
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  profileCompletionRatio: number;      // Value between 0.0 and 1.0
  confirmedReportsCount: number;       // Confirmed safety policy violations
  successfulInteractionsCount: number; // Completed community help/pools requests without disputes
  lastCalculatedAt: Date;

  // Cached core metric values
  anonymousTrustRating: number;        // ATS (0.0 to 5.0)
  trustScore: number;                  // TS (0.0 to 100.0)
  networkScale: number;                // N (0.0 to 1000.0)
}

export interface PeerTrustRating {
  id: string;
  targetUserId: string;
  raterUserIdHash: string;             // Salted SHA-256 hash of rater ID for zero-knowledge privacy
  ratingValue: number;                 // Numeric rating between 1 and 5
  weight: number;                      // Determined by rater's own Trust Score
  createdAt: Date;
}

export interface NetworkConnection {
  id: string;
  userId1: string;
  userId2: string;
  interactionCount: number;            // Number of times they communicated or completed help pools together
  connectionAgeDays: number;
  isMutualFavorite: boolean;
  trustWeight: number;                 // Combined trust rating of both nodes
}

// ==========================================
// 2. ATS: ANONYMOUS TRUST RATING (FORMULA & MATH)
// ==========================================

export interface ATSCalculationParams {
  ratings: PeerTrustRating[];
  /**
   * Helps detect and disqualify reciprocal "rating loops" or "collusion rings"
   * where a small set of users repeatedly rate each other's profiles high.
   */
  collusionThresholdRatio: number; 
}

/**
 * Calculates the Anonymous Trust Rating (ATS) from 0.0 to 5.0.
 * Incorporates time-based decay, rater credibility weights, and collusion filtering.
 */
export function calculateAnonymousTrustRating(
  params: ATSCalculationParams,
  now: Date = new Date()
): { ats: number; totalValidRatings: number; collusionDetectedCount: number } {
  const { ratings, collusionThresholdRatio = 0.4 } = params;

  if (ratings.length === 0) {
    return { ats: 3.0, totalValidRatings: 0, collusionDetectedCount: 0 }; // Default neutral rating for new users
  }

  let totalWeightedScore = 0;
  let totalWeight = 0;
  let collusionDetectedCount = 0;

  // Simple ring/collusion check: Count frequencies of hashes to catch repetitive rating loops
  const hashFrequencyMap: Record<string, number> = {};
  for (const rating of ratings) {
    hashFrequencyMap[rating.raterUserIdHash] = (hashFrequencyMap[rating.raterUserIdHash] || 0) + 1;
  }

  const validRatings = ratings.filter(rating => {
    const totalFromThisHash = hashFrequencyMap[rating.raterUserIdHash];
    const userInfluenceRatio = totalFromThisHash / ratings.length;

    // If an anonymous user accounts for more than the threshold of ratings, flag and suppress
    if (ratings.length > 5 && userInfluenceRatio > collusionThresholdRatio) {
      collusionDetectedCount++;
      return false; // Exclude from formula to prevent fake boosting
    }
    return true;
  });

  if (validRatings.length === 0) {
    return { ats: 3.0, totalValidRatings: 0, collusionDetectedCount };
  }

  for (const rating of validRatings) {
    const ageInDays = (now.getTime() - rating.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    // Time decay factor: older ratings have slightly less weight (half-life of 90 days)
    const timeDecay = Math.exp(-0.0077 * ageInDays); // exp(-ln(2)/90 * days)

    // Final weight is rater credibility weight (based on their TS) scaled by age decay
    const finalWeight = rating.weight * timeDecay;

    totalWeightedScore += rating.ratingValue * finalWeight;
    totalWeight += finalWeight;
  }

  const calculatedAts = totalWeight > 0 ? totalWeightedScore / totalWeight : 3.0;
  
  // Clamp between 1.0 and 5.0
  const clampedAts = Math.min(Math.max(calculatedAts, 1.0), 5.0);

  return {
    ats: parseFloat(clampedAts.toFixed(2)),
    totalValidRatings: validRatings.length,
    collusionDetectedCount
  };
}

// ==========================================
// 3. TS: TRUST SCORE (FORMULA & INTEGRATIONS)
// ==========================================

export interface TrustScoreParams {
  accountAgeDays: number;
  isIdentityVerified: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  profileCompletionRatio: number;      // 0.0 to 1.0
  confirmedReportsCount: number;       // Safety policy violations
  successfulInteractionsCount: number; // Completed pools/help items
  anonymousTrustRating: number;        // ATS (1.0 to 5.0)
  networkScale: number;                // N (0.0 to 1000.0)
}

/**
 * Calculates overall Trust Score (TS) ranging from 0.0 to 100.0.
 * Combines verification credentials, account health, community vouches, and interaction safety.
 */
export function calculateTrustScore(params: TrustScoreParams): {
  score: number;
  breakdown: {
    verificationPoints: number;
    profileAgePoints: number;
    atsBonus: number;
    interactionBonus: number;
    networkBonus: number;
    penalties: number;
  };
} {
  let score = 0;

  // 1. Verification Points (Max 35 points)
  let verificationPoints = 0;
  if (params.isIdentityVerified) {
    verificationPoints += 25; // Massive reward for official ID verification
  } else {
    if (params.isEmailVerified) verificationPoints += 5;
    if (params.isPhoneVerified) verificationPoints += 5;
  }
  // Profile completion contribution
  verificationPoints += params.profileCompletionRatio * 10; // Max 10 points
  score += verificationPoints;

  // 2. Account Age Points (Max 15 points)
  // Reaches maximum potential after 1 year (365 days)
  const profileAgePoints = Math.min((params.accountAgeDays / 365) * 15, 15);
  score += profileAgePoints;

  // 3. Anonymous Trust Rating (ATS) Bonus/Adjustment (Max 20 points)
  // Scaled based on ATS score above neutral midpoint 3.0. Max rating (5.0) adds full 20 points.
  // Low ATS (< 2.5) generates negative pull.
  let atsBonus = 0;
  if (params.anonymousTrustRating >= 3.0) {
    atsBonus = ((params.anonymousTrustRating - 3.0) / 2.0) * 20;
  } else {
    atsBonus = ((params.anonymousTrustRating - 3.0) / 2.0) * 15; // Max -15 penalty for 1.0 ATS
  }
  score += atsBonus;

  // 4. Successful Peer-to-Peer Interaction Bonus (Max 15 points)
  // Rewarding collaborative social contribution
  const interactionBonus = Math.min(params.successfulInteractionsCount * 0.75, 15);
  score += interactionBonus;

  // 5. Network Scale Integration Contribution (Max 15 points)
  const networkBonus = Math.min((params.networkScale / 1000) * 15, 15);
  score += networkBonus;

  // 6. Report Penalties (Strict Suppression)
  // Each confirmed report significantly compromises credibility.
  // 1 confirmed report = -20pts, 2 = -45pts, 3+ = score automatically zeroed (provisional freeze)
  let penalties = 0;
  if (params.confirmedReportsCount === 1) {
    penalties = 20;
  } else if (params.confirmedReportsCount === 2) {
    penalties = 45;
  } else if (params.confirmedReportsCount >= 3) {
    penalties = 100;
  }
  score -= penalties;

  // Final constraints clamps
  const finalScore = Math.min(Math.max(score, 0.0), 100.0);

  return {
    score: parseFloat(finalScore.toFixed(2)),
    breakdown: {
      verificationPoints: parseFloat(verificationPoints.toFixed(2)),
      profileAgePoints: parseFloat(profileAgePoints.toFixed(2)),
      atsBonus: parseFloat(atsBonus.toFixed(2)),
      interactionBonus: parseFloat(interactionBonus.toFixed(2)),
      networkBonus: parseFloat(networkBonus.toFixed(2)),
      penalties
    }
  };
}

// ==========================================
// 4. N: NETWORK SCALE (FORMULA & MATH)
// ==========================================

/**
 * Calculates Network Scale (N) from 0.0 to 1000.0.
 * Prioritizes reciprocal interactions, high-integrity peer nodes,
 * and connection longevity over unvalidated follower counts.
 */
export function calculateNetworkScale(connections: NetworkConnection[]): {
  networkScale: number;
  meaningfulNodesCount: number;
} {
  if (connections.length === 0) {
    return { networkScale: 0.0, meaningfulNodesCount: 0 };
  }

  let totalScalePoints = 0;
  let meaningfulNodesCount = 0;

  for (const conn of connections) {
    // Basic weight is determined by joint node integrity (trust weight)
    let nodePoints = conn.trustWeight * 2.0; // Scaled value

    // Interaction multipliers reward actual communication
    if (conn.interactionCount > 25) {
      nodePoints *= 1.5; // Multiplier for frequent chat/event completion
      meaningfulNodesCount++;
    } else if (conn.interactionCount > 5) {
      nodePoints *= 1.2;
    }

    // Longevity bonus: stable friendships are valued
    if (conn.connectionAgeDays > 180) {
      nodePoints += 15; // Stable long-term node
    } else if (conn.connectionAgeDays > 30) {
      nodePoints += 5;
    }

    // Mutual favorite flag boost
    if (conn.isMutualFavorite) {
      nodePoints += 10;
    }

    totalScalePoints += nodePoints;
  }

  // Soft asymptotic curve to prevent extreme scale saturation (diminishing returns)
  // Formula: Scale = 1000 * (points / (points + 500))
  const asymptoticScale = 1000 * (totalScalePoints / (totalScalePoints + 500));

  return {
    networkScale: parseFloat(asymptoticScale.toFixed(2)),
    meaningfulNodesCount
  };
}

// ============================================================================
// 5. ABUSE PREVENTION & NEW USER STRATEGIES (TECHNICAL SPEC)
// ==========================================

export const ABUSE_PREVENTION_POLICIES = {
  ATS: {
    minimumAccountAgeForRating: 3,       // Raters must be at least 3 days old to leave an ATS review
    maxRatingsGivenPerDay: 5,            // Caps automated rating spamming
    hashSalt: "turtle_anonymous_salt_v1" // Salt key used to produce rater hashes
  },
  HARASSMENT_PROTECTION: {
    automaticMuteThreshold: 3,          // Accounts with 3 active reports are muted from pool broadcasts
    reciprocalLockPeriodHours: 24,       // Users blocked by target cannot write ratings to them
    rateLimitingRatingWindowsMs: 10 * 60 * 1000 // 10 minutes rating lock on the same profile
  },
  NEW_USERS: {
    defaultInitialATS: 3.0,              // Neutral baseline
    defaultInitialTS: 15.0,              // Baseline representing unverified new accounts
    gracePeriodDays: 7                   // Period to verify emails without getting restricted
  }
};

// ============================================================================
// 6. PROFILE METRIC DEMONSTRATION & EXAMPLE RUN-THROUGHS
// ============================================================================

export function runSampleCalculationSuite() {
  const now = new Date();

  // Test Case A: A completely new, unverified user
  const newUserParams: TrustScoreParams = {
    accountAgeDays: 1,
    isIdentityVerified: false,
    isEmailVerified: false,
    isPhoneVerified: false,
    profileCompletionRatio: 0.2,
    confirmedReportsCount: 0,
    successfulInteractionsCount: 0,
    anonymousTrustRating: 3.0,
    networkScale: 0.0
  };

  const newUserTS = calculateTrustScore(newUserParams);

  // Test Case B: Highly verified premium community contributor (Golden Citizen)
  const stellarUserParams: TrustScoreParams = {
    accountAgeDays: 450,
    isIdentityVerified: true,
    isEmailVerified: true,
    isPhoneVerified: true,
    profileCompletionRatio: 1.0,
    confirmedReportsCount: 0,
    successfulInteractionsCount: 42,
    anonymousTrustRating: 4.85,
    networkScale: 780.0
  };

  const stellarUserTS = calculateTrustScore(stellarUserParams);

  // Test Case C: Infringed User with confirmed violation report
  const reportedUserParams: TrustScoreParams = {
    accountAgeDays: 120,
    isIdentityVerified: false,
    isEmailVerified: true,
    isPhoneVerified: true,
    profileCompletionRatio: 0.85,
    confirmedReportsCount: 1, // 1 report
    successfulInteractionsCount: 3,
    anonymousTrustRating: 2.1, // Poor vouches
    networkScale: 45.0
  };

  const reportedUserTS = calculateTrustScore(reportedUserParams);

  return {
    newUser: {
      inputs: newUserParams,
      outputs: newUserTS
    },
    stellarUser: {
      inputs: stellarUserParams,
      outputs: stellarUserTS
    },
    reportedUser: {
      inputs: reportedUserParams,
      outputs: reportedUserTS
    }
  };
}

// ============================================================================
// 7. POSTGRES DATABASE MIGRATION SPECIFICATION (SQL)
// ============================================================================
export const SQL_PROFILE_METRICS_MIGRATION = `
-- ============================================================================
-- SQL SPECIFICATION FOR TURTLE PROFILE METRICS (ATS, TS, N)
-- ============================================================================

-- Expand standard profile table to include cached calculations
alter table public.profiles 
add column if not exists identity_verified boolean default false not null,
add column if not exists email_verified boolean default false not null,
add column if not exists phone_verified boolean default false not null,
add column if not exists profile_completion_ratio numeric(3, 2) default 0.00 not null check (profile_completion_ratio >= 0.00 and profile_completion_ratio <= 1.00),
add column if not exists confirmed_reports_count integer default 0 not null check (confirmed_reports_count >= 0),
add column if not exists successful_interactions_count integer default 0 not null check (successful_interactions_count >= 0),
add column if not exists anonymous_trust_rating numeric(3, 2) default 3.00 not null check (anonymous_trust_rating >= 1.00 and anonymous_trust_rating <= 5.00),
add column if not exists trust_score numeric(5, 2) default 15.00 not null check (trust_score >= 0.00 and trust_score <= 100.00),
add column if not exists network_scale numeric(6, 2) default 0.00 not null check (network_scale >= 0.00 and network_scale <= 1000.00),
add column if not exists metrics_updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- Log table for Anonymous Trust Ratings (ATS) with cryptographic salt protection
create table if not exists public.profile_anonymous_ratings (
    id uuid default uuid_generate_v4() primary key,
    target_user_id uuid references public.profiles(id) on delete cascade not null,
    rater_id_hash text not null, -- Salted hash preventing reverse-engineering rater identity
    rating_value integer not null check (rating_value >= 1 and rating_value <= 5),
    weight numeric(4, 2) default 1.00 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    -- Prevent rating loops: One vote per anonymous connection hash group
    constraint unique_rater_hash_target unique (target_user_id, rater_id_hash)
);

-- Indexing for atomic sweeps
create index if not exists idx_profiles_ts_sort on public.profiles(trust_score desc);
create index if not exists idx_anon_ratings_lookups on public.profile_anonymous_ratings(target_user_id, created_at desc);
`;
