/**
 * API Manager: Handles rate limiting, API switching, and lifetime minute tracking.
 * - Tracks concurrent calls per API
 * - Tracks lifetime minutes per API
 * - Auto-switches to next available API when limits are hit
 * - Tracks per-user call count (max 100 calls per session)
 */

import { getDb } from "./db";
import { streamApis, apiConcurrentCalls, apiUsageSessions } from "../drizzle/schema";
import { eq, and, lt, desc } from "drizzle-orm";

export interface ApiWithUsage {
  id: number;
  apiKey: string;
  apiSecret: string;
  appId: string;
  maxConcurrentCalls: number;
  lifetimeMinutes: number;
  minutesUsed: number;
  minutesRemaining: number;
  currentConcurrentCalls: number;
  status: "active" | "inactive";
  label: string | null;
  canUse: boolean; // true if API is active, has minutes left, and under concurrent limit
}

/**
 * Get all APIs with current usage stats
 */
export async function getAllApis(): Promise<ApiWithUsage[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const apis = await db.select().from(streamApis).orderBy(streamApis.createdAt);

    const result: ApiWithUsage[] = [];

    for (const api of apis) {
      // Count current concurrent calls
      const concurrentCalls = await db
        .select()
        .from(apiConcurrentCalls)
        .where(eq(apiConcurrentCalls.apiId, api.id));

      const minutesRemaining = api.lifetimeMinutes - api.minutesUsed;
      const currentConcurrent = concurrentCalls.length;
      const canUse =
        api.status === "active" &&
        minutesRemaining > 0 &&
        currentConcurrent < api.maxConcurrentCalls;

      result.push({
        id: api.id,
        apiKey: api.apiKey,
        apiSecret: api.apiSecret,
        appId: api.appId,
        maxConcurrentCalls: api.maxConcurrentCalls,
        lifetimeMinutes: api.lifetimeMinutes,
        minutesUsed: api.minutesUsed,
        minutesRemaining,
        currentConcurrentCalls: currentConcurrent,
        status: api.status,
        label: api.label,
        canUse,
      });
    }

    return result;
  } catch (err) {
    console.error("[apiManager] getAllApis error:", err);
    return [];
  }
}

/**
 * Get the next available API for a new call.
 * Priority: active API with minutes remaining and under concurrent limit.
 * Returns null if no API is available.
 */
export async function getAvailableApi(): Promise<ApiWithUsage | null> {
  const apis = await getAllApis();
  const available = apis.filter(a => a.canUse);

  if (available.length === 0) return null;

  // Prefer API with most minutes remaining
  return available.reduce((best, current) =>
    current.minutesRemaining > best.minutesRemaining ? current : best
  );
}

/**
 * Register a new concurrent call for an API.
 * Returns the call ID if successful, null if API limit reached.
 */
export async function registerConcurrentCall(
  apiId: number,
  callId: string,
  userId?: number,
  sessionId?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const api = await db.select().from(streamApis).where(eq(streamApis.id, apiId)).limit(1);
    if (api.length === 0) return false;

    const concurrentCount = await db
      .select()
      .from(apiConcurrentCalls)
      .where(eq(apiConcurrentCalls.apiId, apiId));

    if (concurrentCount.length >= api[0].maxConcurrentCalls) {
      return false; // API at concurrent limit
    }

    await db.insert(apiConcurrentCalls).values({
      apiId,
      callId,
      userId: userId || null,
      sessionId: sessionId || null,
    });

    return true;
  } catch (err) {
    console.error("[apiManager] registerConcurrentCall error:", err);
    return false;
  }
}

/**
 * Unregister a concurrent call (when call ends).
 */
export async function unregisterConcurrentCall(callId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.delete(apiConcurrentCalls).where(eq(apiConcurrentCalls.callId, callId));
  } catch (err) {
    console.error("[apiManager] unregisterConcurrentCall error:", err);
  }
}

/**
 * Record API usage: deduct minutes and increment call count.
 */
export async function recordApiUsage(
  apiId: number,
  userId: number,
  minutesUsed: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Update API minutes used
    const api = await db.select().from(streamApis).where(eq(streamApis.id, apiId)).limit(1);
    if (api.length > 0) {
      await db
        .update(streamApis)
        .set({
          minutesUsed: api[0].minutesUsed + minutesUsed,
          updatedAt: new Date(),
        })
        .where(eq(streamApis.id, apiId));
    }

    // Update user session usage
    const session = await db
      .select()
      .from(apiUsageSessions)
      .where(eq(apiUsageSessions.userId, userId))
      .limit(1);

    if (session.length > 0) {
      await db
        .update(apiUsageSessions)
        .set({
          callsUsed: session[0].callsUsed + 1,
          minutesConsumed: session[0].minutesConsumed + minutesUsed,
          currentApiId: apiId,
          updatedAt: new Date(),
        })
        .where(eq(apiUsageSessions.userId, userId));
    } else {
      await db.insert(apiUsageSessions).values({
        userId,
        currentApiId: apiId,
        callsUsed: 1,
        minutesConsumed: minutesUsed,
      });
    }
  } catch (err) {
    console.error("[apiManager] recordApiUsage error:", err);
  }
}

/**
 * Check if a user has exceeded their 100-call limit.
 */
export async function hasUserExceededCallLimit(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const session = await db
      .select()
      .from(apiUsageSessions)
      .where(eq(apiUsageSessions.userId, userId))
      .limit(1);

    if (session.length === 0) return false;
    return session[0].callsUsed >= 100;
  } catch (err) {
    console.error("[apiManager] hasUserExceededCallLimit error:", err);
    return false;
  }
}

/**
 * Get user's remaining calls.
 */
export async function getUserRemainingCalls(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 100;

  try {
    const session = await db
      .select()
      .from(apiUsageSessions)
      .where(eq(apiUsageSessions.userId, userId))
      .limit(1);

    if (session.length === 0) return 100;
    return Math.max(0, 100 - session[0].callsUsed);
  } catch (err) {
    console.error("[apiManager] getUserRemainingCalls error:", err);
    return 100;
  }
}

/**
 * Create a new API (admin only).
 */
export async function createApi(
  apiKey: string,
  apiSecret: string,
  appId: string,
  lifetimeMinutes: number,
  maxConcurrentCalls: number = 50,
  label?: string
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    await db.insert(streamApis).values({
      apiKey,
      apiSecret,
      appId,
      lifetimeMinutes,
      maxConcurrentCalls,
      label: label || null,
      status: "active",
    });

    // Fetch the newly created API to get its ID
    const created = await db
      .select()
      .from(streamApis)
      .where(eq(streamApis.apiKey, apiKey))
      .limit(1);

    return created.length > 0 ? created[0].id : null;
  } catch (err) {
    console.error("[apiManager] createApi error:", err);
    return null;
  }
}

/**
 * Update an API (admin only).
 */
export async function updateApi(
  apiId: number,
  updates: {
    apiKey?: string;
    apiSecret?: string;
    appId?: string;
    maxConcurrentCalls?: number;
    lifetimeMinutes?: number;
    status?: "active" | "inactive";
    label?: string;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(streamApis)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(streamApis.id, apiId));

    return true;
  } catch (err) {
    console.error("[apiManager] updateApi error:", err);
    return false;
  }
}

/**
 * Delete an API (admin only).
 */
export async function deleteApi(apiId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.delete(streamApis).where(eq(streamApis.id, apiId));
    return true;
  } catch (err) {
    console.error("[apiManager] deleteApi error:", err);
    return false;
  }
}
