const KEY_PART_RE = /[^a-zA-Z0-9:_-]/g;

export function sanitizeKeyPart(value) {
  return String(value).trim().replace(KEY_PART_RE, "_").slice(0, 160);
}

export function tenantKey(tenantId, ...parts) {
  if (!tenantId) throw new Error("tenantId is required for Redis keys");
  return ["tenant", sanitizeKeyPart(tenantId), ...parts.map(sanitizeKeyPart)].join(":");
}

export function tenantLockKey(tenantId, scope, resourceId) {
  return ["lock", "tenant", sanitizeKeyPart(tenantId), sanitizeKeyPart(scope), sanitizeKeyPart(resourceId)].join(":");
}

export function tenantRateLimitKey(tenantId, scope, identifier) {
  return tenantKey(tenantId, "rate-limit", scope, identifier);
}

export function tenantCacheKey(tenantId, scope, identifier) {
  return tenantKey(tenantId, "cache", scope, identifier);
}

export function tenantRealtimeKey(tenantId, scope, identifier) {
  return tenantKey(tenantId, "realtime", scope, identifier);
}

export function tenantIdFromJobData(data) {
  if (!data || typeof data !== "object") return "";
  return String(data.tenantId || data.restaurantId || "").trim();
}
