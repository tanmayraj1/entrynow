import "server-only";

import Redis from "ioredis";

/**
 * Redis holds OTP challenges, rate-limit counters and the hold-expiry backstop
 * — everything that is short-lived and must not survive a restart as truth.
 * Durable state belongs in Postgres.
 */

const globalForRedis = globalThis as unknown as { redis?: Redis };

function createClient() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set — copy .env.example to .env");
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    // Fail fast in a request path rather than hanging a page render.
    connectTimeout: 3000,
    lazyConnect: false,
  });
}

export const redis = globalForRedis.redis ?? createClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/**
 * Fixed-window counter. Returns the count after incrementing.
 * Used for the OTP send and verify limits in spec A3.
 */
export async function incrementWithExpiry(
  key: string,
  windowSeconds: number,
): Promise<number> {
  const count = await redis.incr(key);
  // Only set the TTL on the first hit, so the window does not slide forward
  // with every request and effectively never expire.
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
}

/** Seconds until a key expires, or 0 when it has none. */
export async function ttl(key: string): Promise<number> {
  const t = await redis.ttl(key);
  return t > 0 ? t : 0;
}
