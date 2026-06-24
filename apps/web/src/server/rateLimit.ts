/**
 * In-memory token-bucket rate limiter (M-2). PER-INSTANCE on serverless — it
 * throttles a sustained burst on one warm instance, not a global limit. The
 * checkRateLimit seam isolates a future swap to a durable store (Vercel KV /
 * Upstash). Keyed by owner id at the generation routes (cost control).
 */
const CAPACITY = 20;
const REFILL_MS = 60_000; // full bucket per minute

interface Bucket {
  tokens: number;
  updated: number;
}
const buckets = new Map<string, Bucket>();

export function resetRateLimitForTests(): void {
  buckets.clear();
}

export function checkRateLimit(
  key: string,
  opts?: { now?: number },
): { ok: boolean; retryAfterMs: number } {
  const now = opts?.now ?? Date.now();
  const refillRate = CAPACITY / REFILL_MS; // tokens per ms
  const b = buckets.get(key) ?? { tokens: CAPACITY, updated: now };
  const elapsed = Math.max(0, now - b.updated);
  const tokens = Math.min(CAPACITY, b.tokens + elapsed * refillRate);
  if (tokens < 1) {
    buckets.set(key, { tokens, updated: now });
    return { ok: false, retryAfterMs: Math.ceil((1 - tokens) / refillRate) };
  }
  buckets.set(key, { tokens: tokens - 1, updated: now });
  return { ok: true, retryAfterMs: 0 };
}
