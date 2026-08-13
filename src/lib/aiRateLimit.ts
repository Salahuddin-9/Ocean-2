/**
 * Ocean — Shared AI endpoint rate limiter (per-user sliding window).
 *
 * Protects the paid LLM / Imagen / transcription upstreams from runaway loops
 * and abuse. Extracted from the original implementation in server.ts so every
 * AI-consuming route (inline + module backends) shares ONE limiter with the
 * same semantics: 20 requests per 60s window, keyed by authenticated userId
 * (falling back to client IP for anonymous callers). Exhaustion returns 429
 * with a Retry-After header. Idle buckets are evicted periodically so the map
 * cannot grow unbounded.
 */

import type { Request, Response, NextFunction } from 'express';

const aiRateBuckets = new Map<string, { timestamps: number[] }>();
const AI_RATE_LIMIT = 20;          // requests per window
const AI_RATE_WINDOW_MS = 60_000;  // per minute

export function aiRateLimit(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const key = user ? user.id : (req.ip || 'anon');
  const now = Date.now();
  let bucket = aiRateBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    aiRateBuckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < AI_RATE_WINDOW_MS);
  if (bucket.timestamps.length >= AI_RATE_LIMIT) {
    const oldest = bucket.timestamps[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldest + AI_RATE_WINDOW_MS - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `AI request limit reached. Please wait ${retryAfter}s.`, retryAfter });
  }
  bucket.timestamps.push(now);
  next();
}

// Periodically evict idle buckets so the map cannot grow unbounded.
(setInterval(() => {
  const now = Date.now();
  for (const [k, b] of aiRateBuckets) {
    if (!b.timestamps.some((t) => now - t < AI_RATE_WINDOW_MS)) aiRateBuckets.delete(k);
  }
}, 5 * 60_000) as any).unref?.();
