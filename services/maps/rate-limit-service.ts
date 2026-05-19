import { createHash } from "node:crypto";

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  tier: "redis" | "memory";
};

type RedisResponse<T> = {
  result?: T;
  error?: string;
};

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function redisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim() || "";
}

function redisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || "";
}

function redisEnabled() {
  return process.env.MAPS_RATE_LIMIT_REDIS_ENABLED !== "false" && Boolean(redisUrl() && redisToken());
}

function rateLimitNamespace() {
  return process.env.MAPS_RATE_LIMIT_NAMESPACE?.trim() || "logivn:maps:rate-limit:v1";
}

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function windowKey(key: string, windowMs: number, now = Date.now()) {
  const safeWindowMs = Math.max(1000, windowMs);
  const windowId = Math.floor(now / safeWindowMs);
  return {
    key: `${rateLimitNamespace()}:${hashKey(key)}:${windowId}`,
    resetAt: (windowId + 1) * safeWindowMs
  };
}

async function redisCommand<T>(command: unknown[]) {
  if (!redisEnabled()) return null;

  try {
    const response = await fetch(redisUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command),
      cache: "no-store"
    });

    if (!response.ok) return null;
    const json = (await response.json()) as RedisResponse<T>;
    if (json.error) return null;
    return json.result ?? null;
  } catch {
    return null;
  }
}

function checkMemoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: Math.max(0, limit - 1), resetAt, tier: "memory" };
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    tier: "memory"
  };
}

async function checkRedisRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const window = windowKey(key, windowMs);
  const rawCount = await redisCommand<number | string>(["INCR", window.key]);
  if (rawCount === null || rawCount === undefined) return null;

  const count = Number(rawCount);
  if (!Number.isFinite(count)) return null;

  const ttlSeconds = Math.max(1, Math.ceil((window.resetAt - Date.now()) / 1000));
  await redisCommand(["EXPIRE", window.key, ttlSeconds]);

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: window.resetAt,
    tier: "redis"
  };
}

export async function checkMapRateLimit(key: string, limit = 24, windowMs = 60_000): Promise<RateLimitResult> {
  const safeLimit = Math.max(1, Math.round(limit));
  const safeWindowMs = Math.max(1000, Math.round(windowMs));
  const redisResult = await checkRedisRateLimit(key, safeLimit, safeWindowMs);
  return redisResult ?? checkMemoryRateLimit(key, safeLimit, safeWindowMs);
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000))
  };
}
