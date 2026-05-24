import { tenantRealtimeKey } from "./redis-keys.js";

export async function setRealtimeState(connection, { tenantId, scope, identifier, value, ttlSeconds = 300 }) {
  const key = tenantRealtimeKey(tenantId, scope, identifier);
  await connection.set(
    key,
    JSON.stringify({
      ...value,
      tenantId,
      scope,
      identifier,
      updatedAt: new Date().toISOString()
    }),
    "EX",
    ttlSeconds
  );
  return { key, ttlSeconds };
}

export async function getRealtimeState(connection, { tenantId, scope, identifier }) {
  const raw = await connection.get(tenantRealtimeKey(tenantId, scope, identifier));
  return raw ? JSON.parse(raw) : null;
}

export async function listRealtimeState(connection, { tenantId, scope, limit = 100 }) {
  const pattern = tenantRealtimeKey(tenantId, scope, "*");
  const stream = connection.scanStream({ match: pattern, count: Math.min(limit, 500) });
  const rows = [];

  for await (const keys of stream) {
    if (rows.length >= limit) break;
    if (keys.length === 0) continue;
    const values = await connection.mget(...keys);
    for (const value of values) {
      if (!value || rows.length >= limit) continue;
      rows.push(JSON.parse(value));
    }
  }

  return rows;
}
