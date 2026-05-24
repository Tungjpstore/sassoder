import { tenantCacheKey } from "./redis-keys.js";

export async function getTenantCache(connection, { tenantId, scope, identifier }) {
  const raw = await connection.get(tenantCacheKey(tenantId, scope, identifier));
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function setTenantCache(connection, { tenantId, scope, identifier, value, ttlSeconds }) {
  const key = tenantCacheKey(tenantId, scope, identifier);
  await connection.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return { key, ttlSeconds };
}

export async function invalidateTenantCache(connection, { tenantId, scope, identifier = "*" }) {
  const pattern = tenantCacheKey(tenantId, scope, identifier);
  const stream = connection.scanStream({ match: pattern, count: 100 });
  let deleted = 0;

  for await (const keys of stream) {
    if (keys.length === 0) continue;
    deleted += await connection.del(...keys);
  }

  return { pattern, deleted };
}
