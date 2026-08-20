import { HttpError } from "../utils/http.js";

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export class MemoryRateLimiter {
  constructor(options = {}) {
    this.limit = positiveInteger(options.limit, 60);
    this.windowMs = positiveInteger(options.windowMs, 60_000);
    this.buckets = new Map();
    this.operations = 0;
  }

  consume(key, now = Date.now()) {
    const normalizedKey = String(key || "unknown").slice(0, 240);
    let bucket = this.buckets.get(normalizedKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(normalizedKey, bucket);
    }
    bucket.count += 1;
    this.operations += 1;
    if (this.operations % 500 === 0) this.cleanup(now);
    const remaining = Math.max(0, this.limit - bucket.count);
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: bucket.count <= this.limit,
      limit: this.limit,
      remaining,
      retryAfter,
      resetAt: bucket.resetAt,
    };
  }

  cleanup(now = Date.now()) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export function enforceRateLimit(res, limiter, key, code = "rate_limit_exceeded") {
  const result = limiter.consume(key);
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfter));
    throw new HttpError(429, code, "请求过于频繁，请稍后重试。", {
      retry_after_seconds: result.retryAfter,
    });
  }
  return result;
}

export function createRateLimiters(env) {
  return Object.freeze({
    general: new MemoryRateLimiter({
      limit: env?.number?.("API_RATE_LIMIT_PER_MIN", 240) || 240,
      windowMs: 60_000,
    }),
    write: new MemoryRateLimiter({
      limit: env?.number?.("API_WRITE_RATE_LIMIT_PER_MIN", 90) || 90,
      windowMs: 60_000,
    }),
    paid: new MemoryRateLimiter({
      limit: env?.number?.("API_PAID_RATE_LIMIT_PER_MIN", 30) || 30,
      windowMs: 60_000,
    }),
    auth: new MemoryRateLimiter({
      limit: env?.number?.("AUTH_RATE_LIMIT_PER_15_MIN", 20) || 20,
      windowMs: 15 * 60_000,
    }),
  });
}
