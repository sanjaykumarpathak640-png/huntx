import "server-only";
import { HttpError } from "./http";

/**
 * Sliding-window in-memory limiter. On serverless (Vercel) each instance has
 * its own memory, so this is a best-effort first line of defence. The
 * critical limits (GPS retry interval, attempts per clue, one submission per
 * clue) are ALSO enforced in the database, which is authoritative.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - arr[0])) / 1000);
    throw new HttpError(429, `Too many requests. Try again in ${retryAfter}s.`, { retry_after_s: retryAfter });
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
}
