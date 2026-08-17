/**
 * Ocean — Shared per-IP sliding-window rate limiter factory.
 *
 * Used for abuse-prone public endpoints (e.g. POST /api/auth/signup: 5 requests
 * per 15 minutes per IP). Keyed by req.ip — under `app.set('trust proxy', 1)`
 * (enabled in production) req.ip resolves to the real client behind the reverse
 * proxy. Exhaustion returns 429 with a Retry-After header. Idle buckets are
 * pruned periodically so the map cannot grow unbounded.
 *
 * Under NODE_ENV=test the limiter is a no-op: the Vitest suite drives the
 * exported Express app in-process, so every request shares one synthetic IP and
 * a per-IP cap would break the existing auth tests (which sign up many users
 * per worker). The production behavior is verified at runtime instead.
 */

import type { Request, Response, NextFunction } from 'express';

const buckets = new Map<string, number[]>();

export interface IpRateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Maximum requests per window per IP. */
  max: number;
  /** Message returned with the 429 response. */
  message?: string;
}

export function createIpRateLimiter(opts: IpRateLimitOptions) {
  const { windowMs, max, message } = opts;
  const errorMessage = message || 'Too many requests. Please try again later.';

  // Vitest runs the app in-process against one synthetic IP per worker — a real
  // per-IP cap would 429 the auth/feed/chat test users. See file header.
  if (process.env.NODE_ENV === 'test') {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  return function ipRateLimit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let timestamps = buckets.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      const oldest = timestamps[0] || now;
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: errorMessage, retryAfter });
    }
    timestamps.push(now);
    buckets.set(key, timestamps);
    next();
  };
}

// Periodically evict idle buckets so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of buckets) {
    const live = timestamps.filter((t) => now - t < 24 * 60 * 60 * 1000); // keep ~1 day of history
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  }
}, 60_000).unref();
