/**
 * Einfacher In-Memory-Token-Bucket pro Schlüssel (Benutzer + Bereich).
 * Für mehrere Instanzen durch eine Redis-Implementierung mit gleichem Interface ersetzen.
 */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitRule {
  /** maximale Anfragen im Burst */
  capacity: number;
  /** nachgefüllte Tokens pro Minute */
  refillPerMinute: number;
}

export const RATE_LIMITS = {
  default: { capacity: 120, refillPerMinute: 120 },
  chat: { capacity: 20, refillPerMinute: 20 },
  upload: { capacity: 20, refillPerMinute: 10 },
  auth: { capacity: 10, refillPerMinute: 10 },
} satisfies Record<string, RateLimitRule>;

export function checkRateLimit(key: string, rule: RateLimitRule, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key) ?? { tokens: rule.capacity, updatedAt: now };
  const elapsedMin = (now - b.updatedAt) / 60_000;
  b.tokens = Math.min(rule.capacity, b.tokens + elapsedMin * rule.refillPerMinute);
  b.updatedAt = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfterSec: Math.ceil(((1 - b.tokens) / rule.refillPerMinute) * 60) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now - v.updatedAt > 3_600_000) buckets.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
