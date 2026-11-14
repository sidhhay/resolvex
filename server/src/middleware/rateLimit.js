/**
 * In-process rate limiting (fixed window).
 *
 * Enough to blunt credential stuffing and complaint spam on a single-instance
 * deployment. It is per-process by design and deliberately dependency-free —
 * behind more than one instance, swap the `hits` map for Redis; the middleware
 * signature does not change.
 */
import { TooManyRequestsError } from '../domain/errors.js';
import { config } from '../config/env.js';

/** @type {Map<string, { count: number, resetAt: number }>} */
const hits = new Map();

// Windows expire; without a sweep the map would grow with every distinct IP.
const SWEEP_INTERVAL_MS = 60_000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}, SWEEP_INTERVAL_MS);
// Never hold the event loop open on account of the cleaner.
sweeper.unref?.();

/**
 * @param {{ max: number, windowMs?: number, keyPrefix: string, message?: string }} options
 * @returns {import('express').RequestHandler}
 */
export function rateLimit(options) {
  const windowMs = options.windowMs ?? config.rateLimit.windowMs;

  return (req, res, next) => {
    // Authenticated callers are limited per account; anonymous ones per IP.
    const identity = req.user?.id ? `u${req.user.id}` : req.ip ?? 'unknown';
    const key = `${options.keyPrefix}:${identity}`;
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, options.max - entry.count);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((entry.resetAt - now) / 1000)));

    if (entry.count > options.max) {
      return next(
        new TooManyRequestsError(
          options.message ?? 'Too many requests, please try again shortly',
          Math.ceil((entry.resetAt - now) / 1000),
        ),
      );
    }
    return next();
  };
}

/** Clears all counters. Test affordance. */
export function resetRateLimits() {
  hits.clear();
}
