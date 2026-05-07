import "server-only";

import { createHash } from "node:crypto";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getAiCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setAiCache<T>(key: string, value: T, ttlMs: number) {
  if (ttlMs <= 0) return;
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

export async function createStableAiCacheKey(parts: unknown[]) {
  const payload = JSON.stringify(parts);
  return createHash("sha256").update(payload).digest("hex");
}
