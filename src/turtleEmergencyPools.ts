/**
 * Turtle Social Media Application - Emergency Community Pools Logic & Backend Infrastructure
 * 
 * This file contains the complete, production-ready non-UI type definitions, validation rules,
 * safety disclaimers, spam/abuse prevention models, SQL schemas, and server-side Edge Function
 * simulation for the Emergency Community Pools system.
 * 
 * -----------------------------------------------------------------------------------------
 * SUPPORTED EMERGENCY COMMUNITY POOLS:
 * 1. Football Player Shortage (Urgent team fill-ins)
 * 2. Blood Needed (Critical donation assistance with medical disclaimers)
 * 3. Local Help (Physical/manual assistance, heavy lifting, local errands)
 * 4. Study Help (Urgent exam prep, academic resource sharing)
 * 5. Event Volunteer (Last-minute coordination support)
 * -----------------------------------------------------------------------------------------
 */

// ==========================================
// 1. PRODUCT RULES & CONSTANTS
// ==========================================

export const SYSTEM_POOLS = {
  FOOTBALL_PLAYER_SHORTAGE: {
    id: "pool-football-player-shortage",
    title: "Football Player Shortage",
    description: "Urgent notifications for sports clubs and friendly games needing players to fill spots immediately.",
    defaultRadiusKm: 15,
    maxUrgency: "medium"
  },
  BLOOD_NEEDED: {
    id: "pool-blood-needed",
    title: "Blood Needed",
    description: "Voluntary assistance alerts for blood donations. Note: This service does not replace standard emergency numbers.",
    defaultRadiusKm: 50,
    maxUrgency: "critical"
  },
  LOCAL_HELP: {
    id: "pool-local-help",
    title: "Local Help",
    description: "Assisting neighbors with immediate physical tasks, neighborhood errands, or local emergencies.",
    defaultRadiusKm: 10,
    maxUrgency: "high"
  },
  STUDY_HELP: {
    id: "pool-study-help",
    title: "Study Help",
    description: "Connecting students for urgent exam support, proofreading, or study material assistance.",
    defaultRadiusKm: 5,
    maxUrgency: "low"
  },
  EVENT_VOLUNTEER: {
    id: "pool-event-volunteer",
    title: "Event Volunteer",
    description: "Rapid deployment of volunteer helpers for local non-profit and community events.",
    defaultRadiusKm: 25,
    maxUrgency: "medium"
  }
} as const;

export type UrgencyLevel = "low" | "medium" | "high" | "critical";

// ==========================================
// 2. DISCLAIMERS & SAFETY TEXTS
// ==========================================

export const SAFETY_DISCLAIMERS = {
  BLOOD_NEEDED: `
=== MEDICAL SAFETY DISCLAIMER ===
1. This application (Turtle) is a volunteer matchmaking peer platform and does NOT provide medical services, professional evaluations, or medical advice.
2. If you are experiencing a life-threatening medical emergency or require immediate blood transfusions, PLEASE CALL YOUR LOCAL EMERGENCY SERVICES (911, 112, etc.) or go to the nearest hospital immediately.
3. Blood group designations entered by volunteers are strictly voluntary and self-reported. We make NO GUARANTEES of donor compatibility, cleanliness, or medical history.
4. All actual blood donations and transfusions MUST take place exclusively under the direct supervision of licensed medical professionals at authorized donation clinics or certified hospitals.
5. Users agree to release Turtle and its affiliates from any liability, illness, injury, or damages arising directly or indirectly from matching with voluntary donors.
  `.trim(),
  GENERAL: `
=== GENERAL SAFETY AGREEMENT ===
Ensure your physical safety when meeting community members for alerts. Always meet in public, well-lit spaces, or validated municipal facilities whenever possible. Report any suspicious, commercial, or fake alert listings instantly.
  `.trim()
};

// ==========================================
// 3. TYPES & DATA MODEL
// ==========================================

export interface UserPoolPreference {
  userId: string;
  poolId: string;
  isOptedIn: boolean;
  bloodGroupVoluntary?: string; // e.g. "O-", "A+", null
  isDonorVerified: boolean; // Verified via medical clinic code
  lastUpdated: Date;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export interface EmergencyAlert {
  id: string;
  poolId: string;
  senderId: string;
  title: string;
  messageContent: string;
  urgency: UrgencyLevel;
  locationLatitude: number;
  locationLongitude: number;
  radiusKm: number; // Max distance for notifications
  createdAt: Date;
  expiresAt: Date;
  isSpamFlagged: boolean;
  verifiedHospitalName?: string; // optional verified medical clinic anchor
  verificationReferenceCode?: string; // official donor request code
}

export interface FakeAlertReport {
  id: string;
  alertId: string;
  reporterId: string;
  reason: "fake_request" | "spam" | "medical_impersonation" | "commercial_advertising" | "other";
  details?: string;
  createdAt: Date;
}

// ==========================================
// 4. SPAM PREVENTION & RATE LIMITS
// ==========================================

const RECENT_ALERTS_WINDOW_MS = 15 * 60 * 1000; // 15 Minutes
const MAX_ALERTS_PER_WINDOW = 2; // Strict limit: 2 alerts per 15 minutes to prevent panic/noise

export interface RateLimitTracker {
  userId: string;
  alertTimestamps: number[];
}

/**
 * Checks whether a user exceeds standard emergency broadcast frequency limits
 */
export function isUserRateLimited(tracker: RateLimitTracker, nowMs: number): { limited: boolean; remainingSec: number } {
  // Clear timestamps older than the window
  const activeTimestamps = tracker.alertTimestamps.filter(ts => (nowMs - ts) < RECENT_ALERTS_WINDOW_MS);
  
  if (activeTimestamps.length >= MAX_ALERTS_PER_WINDOW) {
    const oldestInWindow = activeTimestamps[0];
    const remainingMs = RECENT_ALERTS_WINDOW_MS - (nowMs - oldestInWindow);
    return { limited: true, remainingSec: Math.ceil(remainingMs / 1000) };
  }
  
  return { limited: false, remainingSec: 0 };
}

// ==========================================
// 5. ALERT VALIDATION & CREATION FLOW
// ==========================================

export interface CreateAlertRequest {
  poolId: string;
  senderId: string;
  title: string;
  messageContent: string;
  urgency: UrgencyLevel;
  latitude: number;
  longitude: number;
  radiusKm?: number;
  expiresInMinutes?: number;
  bloodGroupNeeded?: string;
}

export function validateAndFormatAlert(
  req: CreateAlertRequest,
  rateLimitTracker: RateLimitTracker
): { success: boolean; error?: string; formattedAlert?: EmergencyAlert } {
  const now = new Date();

  // 1. Rate Limit Checks
  const limitCheck = isUserRateLimited(rateLimitTracker, now.getTime());
  if (limitCheck.limited) {
    return { success: false, error: `Rate limit exceeded. Please wait ${limitCheck.remainingSec}s before sending another alert.` };
  }

  // 2. Title & Message Validations
  if (!req.title || req.title.trim().length < 5) {
    return { success: false, error: "Alert title is required and must be at least 5 characters long." };
  }
  if (!req.messageContent || req.messageContent.trim().length < 15) {
    return { success: false, error: "Detailed message is required and must be at least 15 characters long." };
  }

  // 3. Urgency restrictions
  if (req.poolId === SYSTEM_POOLS.STUDY_HELP.id && req.urgency === "critical") {
    return { success: false, error: "Study Help cannot be classified as critical emergency level." };
  }

  // 4. Blood group validation
  if (req.poolId === SYSTEM_POOLS.BLOOD_NEEDED.id) {
    if (req.bloodGroupNeeded) {
      const validGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"];
      if (!validGroups.includes(req.bloodGroupNeeded.toUpperCase())) {
        return { success: false, error: "Specified blood group must be a valid type (e.g. O+, A-)." };
      }
    }
  }

  // 5. Radius clamp boundaries
  const defaultRadius = SYSTEM_POOLS[Object.keys(SYSTEM_POOLS).find(key => SYSTEM_POOLS[key as keyof typeof SYSTEM_POOLS].id === req.poolId) as keyof typeof SYSTEM_POOLS]?.defaultRadiusKm || 10;
  const radius = req.radiusKm ? Math.min(Math.max(req.radiusKm, 1), 100) : defaultRadius; // Allowed range: 1km to 100km

  // 6. Expiration calculate (Default to 4 hours, clamped between 30m and 48 hours)
  const durationMin = req.expiresInMinutes ? Math.min(Math.max(req.expiresInMinutes, 30), 2880) : 240;
  const expiresAt = new Date(now.getTime() + durationMin * 60000);

  const formattedAlert: EmergencyAlert = {
    id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    poolId: req.poolId,
    senderId: req.senderId,
    title: req.title,
    messageContent: req.messageContent,
    urgency: req.urgency,
    locationLatitude: req.latitude,
    locationLongitude: req.longitude,
    radiusKm: radius,
    createdAt: now,
    expiresAt,
    isSpamFlagged: false
  };

  return { success: true, formattedAlert };
}

// ==========================================
// 6. GEOLOCATION MATH (Haversine formula)
// ==========================================

/**
 * Calculates straight-line distance in kilometers between two points on the globe
 */
export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ==========================================
// 7. EDGE FUNCTION MATCHING & NOTIFICATION FLOW (Pseudocode / Spec)
// ==========================================

export interface RecipientCandidate {
  userId: string;
  latitude: number;
  longitude: number;
  isOptedIn: boolean;
}

/**
 * Simulates serverless scheduler finding matching nearby users to dispatch push notifications
 */
export function dispatchEmergencyNotifications(
  alert: EmergencyAlert,
  candidates: RecipientCandidate[]
): string[] {
  const notifiedUserIds: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.isOptedIn) continue;

    // Skip notifying the sender themselves
    if (candidate.userId === alert.senderId) continue;

    const distance = calculateHaversineDistance(
      alert.locationLatitude,
      alert.locationLongitude,
      candidate.latitude,
      candidate.longitude
    );

    // If within radius parameters, candidate qualifies
    if (distance <= alert.radiusKm) {
      notifiedUserIds.push(candidate.userId);
    }
  }

  // Trigger push alerts (Apple APNS / Google FCM) under active background queues
  return notifiedUserIds;
}

// ============================================================================
// 8. SQL DATABASE SCHEMA MIGRATION FOR COMMUNITY POOLS SYSTEM
// ============================================================================
export const SQL_POOL_MIGRATION = `
-- ============================================================================
-- EMERGENCY COMMUNITY POOLS & BROADCAST SYSTEMS - SCHEMA SPECIFICATION
-- ============================================================================

-- Create table to handle user's pool subscriptions and voluntary blood groups
create table if not exists public.user_pool_preferences (
    user_id uuid references public.profiles(id) on delete cascade,
    pool_id text not null,
    is_opted_in boolean default false not null,
    blood_group_voluntary text,
    is_donor_verified boolean default false not null,
    last_updated timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (user_id, pool_id),
    constraint check_blood_group check (blood_group_voluntary in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'))
);

-- Active Geolocation locations database
create table if not exists public.user_locations (
    user_id uuid references public.profiles(id) on delete cascade primary key,
    latitude double precision not null,
    longitude double precision not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Active Emergency Broadcast Alert logs with Geo coordinates
create table if not exists public.pool_emergency_alerts (
    id uuid default uuid_generate_v4() primary key,
    pool_id text not null,
    sender_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    message_content text not null,
    urgency text default 'medium'::text not null,
    location_latitude double precision not null,
    location_longitude double precision not null,
    radius_km numeric(5, 2) default 15.00 not null check (radius_km > 0.00),
    is_spam_flagged boolean default false not null,
    verified_hospital_name text,
    verification_reference_code text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    expires_at timestamp with time zone not null,
    constraint check_urgency check (urgency in ('low', 'medium', 'high', 'critical'))
);

-- Fake Alert report auditing log
create table if not exists public.pool_alert_reports (
    id uuid default uuid_generate_v4() primary key,
    alert_id uuid references public.pool_emergency_alerts(id) on delete cascade not null,
    reporter_id uuid references public.profiles(id) on delete cascade not null,
    reason text not null,
    details text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint check_report_reason check (reason in ('fake_request', 'spam', 'medical_impersonation', 'commercial_advertising', 'other'))
);

-- Indexes for performance & geolocation matching
create index if not exists idx_user_locations_coords on public.user_locations (latitude, longitude);
create index if not exists idx_pool_alerts_active on public.pool_emergency_alerts (expires_at) where is_spam_flagged = false;
create index if not exists idx_pool_preferences_match on public.user_pool_preferences (pool_id, is_opted_in);
`;
