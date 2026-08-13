/**
 * Stream API-key manager (adapted from manus-omegle-stream/server/apiManager.ts).
 *
 * The original was DB-backed (drizzle + `streamApis` table). This version keeps
 * the same behavior — per-key concurrency limits, lifetime-minute budgets,
 * auto-switch when a key is exhausted, and per-user call caps — but reads the
 * keys from the environment (STREAM_API_KEY/_2/_3 + secrets) and tracks usage
 * in memory instead of a database.
 */

export interface StreamApi {
  id: number;
  label: string;
  apiKey: string;
  apiSecret: string;
  maxConcurrentCalls: number;
  lifetimeMinutes: number;
  minutesUsed: number;
  minutesRemaining: number;
  currentConcurrentCalls: number;
  status: 'active' | 'inactive';
  canUse: boolean;
}

export interface StreamApiManagerConfig {
  maxConcurrentCalls?: number;
  lifetimeMinutes?: number;
  perUserCallCap?: number;
}

const DEFAULT_MAX_CONCURRENT = 8;
const DEFAULT_LIFETIME_MINUTES = 60 * 24 * 30; // 30 days
const DEFAULT_PER_USER_CALL_CAP = 100;

/**
 * Builds the API pool from environment variables. Each entry maps to a
 * STREAM_API_KEY / STREAM_SECRET_KEY pair (plus _2, _3 …).
 */
export function buildApiPoolFromEnv(cfg: StreamApiManagerConfig = {}): StreamApi[] {
  const maxConcurrentCalls = cfg.maxConcurrentCalls ?? DEFAULT_MAX_CONCURRENT;
  const lifetimeMinutes = cfg.lifetimeMinutes ?? DEFAULT_LIFETIME_MINUTES;

  const candidates: Array<[string | undefined, string | undefined]> = [
    [process.env.STREAM_API_KEY, process.env.STREAM_SECRET_KEY],
    [process.env.STREAM_API_KEY_2, process.env.STREAM_SECRET_KEY_2],
    [process.env.STREAM_API_KEY_3, process.env.STREAM_SECRET_KEY_3],
  ];

  const pool: StreamApi[] = [];
  candidates.forEach(([key, secret], i) => {
    if (!key || !secret) return;
    pool.push({
      id: i,
      label: `key-${i + 1}`,
      apiKey: key,
      apiSecret: secret,
      maxConcurrentCalls,
      lifetimeMinutes,
      minutesUsed: 0,
      minutesRemaining: lifetimeMinutes,
      currentConcurrentCalls: 0,
      status: 'active',
      canUse: true,
    });
  });
  return pool;
}

/**
 * In-memory API manager with concurrency + lifetime + per-user tracking.
 */
export class StreamApiManager {
  private pool: StreamApi[] = [];
  private perUserCalls = new Map<string, number>();
  private readonly perUserCallCap: number;

  constructor(pool: StreamApi[], perUserCallCap: number = DEFAULT_PER_USER_CALL_CAP) {
    this.pool = pool;
    this.perUserCallCap = perUserCallCap;
  }

  static fromEnv(cfg: StreamApiManagerConfig = {}): StreamApiManager {
    return new StreamApiManager(buildApiPoolFromEnv(cfg), cfg.perUserCallCap);
  }

  /** List the pool with live usage stats. */
  list(): StreamApi[] {
    return this.pool.map((api) => ({
      ...api,
      minutesRemaining: Math.max(0, api.lifetimeMinutes - api.minutesUsed),
      canUse:
        api.status === 'active' &&
        api.lifetimeMinutes - api.minutesUsed > 0 &&
        api.currentConcurrentCalls < api.maxConcurrentCalls,
    }));
  }

  get size(): number {
    return this.pool.length;
  }

  /**
   * Pick the next API key that can be used. Prefers the least-loaded active key
   * (lowest concurrency), and auto-switches to the next key when the current one
   * is exhausted (at its concurrent cap or out of minutes). Returns null when no
   * key can serve a call.
   */
  getNextAvailableApi(): StreamApi | null {
    const usable = this.list().filter((api) => api.canUse);
    if (usable.length === 0) return null;
    usable.sort((a, b) => a.currentConcurrentCalls - b.currentConcurrentCalls);
    const chosen = this.pool.find((api) => api.id === usable[0].id)!;
    chosen.currentConcurrentCalls++;
    return chosen;
  }

  /** Record that a call finished on a key so its concurrency slot frees up. */
  trackCallEnd(apiId: number): void {
    const api = this.pool.find((a) => a.id === apiId);
    if (api) {
      api.currentConcurrentCalls = Math.max(0, api.currentConcurrentCalls - 1);
      // Charge a nominal fraction of a minute for billing the lifetime budget.
      api.minutesUsed += 0.5;
    }
  }

  /** Record a call start for a user; enforces the per-user cap. */
  canUserCall(userId: string): boolean {
    const used = this.perUserCalls.get(userId) || 0;
    if (used >= this.perUserCallCap) return false;
    this.perUserCalls.set(userId, used + 1);
    return true;
  }

  resetUserCalls(userId: string): void {
    this.perUserCalls.delete(userId);
  }
}
