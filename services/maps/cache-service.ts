import { createHash } from "node:crypto";

type CacheHit<T> = {
  hit: true;
  tier: "memory" | "redis";
  value: T;
};

type CacheMiss = {
  hit: false;
  tier: "none";
};

type RedisResponse<T> = {
  result?: T;
  error?: string;
};

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

function redisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim() || "";
}

function redisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || "";
}

function redisEnabled() {
  return Boolean(redisUrl() && redisToken());
}

function cacheNamespace() {
  return process.env.MAPS_CACHE_NAMESPACE?.trim() || "logivn:maps:v1";
}

function hashKey(namespace: string, key: string) {
  return `${cacheNamespace()}:${namespace}:${createHash("sha256").update(key).digest("hex")}`;
}

function readMemory<T>(key: string): CacheHit<T> | CacheMiss {
  const cached = memoryCache.get(key);
  if (!cached) return { hit: false, tier: "none" };
  if (cached.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return { hit: false, tier: "none" };
  }
  return { hit: true, tier: "memory", value: cached.value as T };
}

function writeMemory(key: string, value: unknown, ttlMs: number) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
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

export async function readSharedCache<T>(namespace: string, key: string): Promise<CacheHit<T> | CacheMiss> {
  const cacheKey = hashKey(namespace, key);
  const memoryHit = readMemory<T>(cacheKey);
  if (memoryHit.hit) return memoryHit;

  const redisValue = await redisCommand<string>(["GET", cacheKey]);
  if (!redisValue) return { hit: false, tier: "none" };

  try {
    const value = JSON.parse(redisValue) as T;
    writeMemory(cacheKey, value, 5_000);
    return { hit: true, tier: "redis", value };
  } catch {
    return { hit: false, tier: "none" };
  }
}

export async function writeSharedCache(namespace: string, key: string, value: unknown, ttlMs: number) {
  const cacheKey = hashKey(namespace, key);
  const safeTtlMs = Math.max(0, ttlMs);
  writeMemory(cacheKey, value, safeTtlMs);

  if (!redisEnabled() || safeTtlMs <= 0) return;
  const ttlSeconds = Math.max(1, Math.round(safeTtlMs / 1000));
  await redisCommand(["SET", cacheKey, JSON.stringify(value), "EX", ttlSeconds]);
}
