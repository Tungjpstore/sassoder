export async function checkRedisRateLimit(connection, { key, limit, windowMs }) {
  if (!key) throw new Error("rate limit key is required");
  const count = await connection.incr(key);
  if (count === 1) {
    await connection.pexpire(key, windowMs);
  }

  const ttlMs = await connection.pttl(key);
  return {
    allowed: count <= limit,
    count,
    limit,
    resetInMs: Math.max(ttlMs, 0)
  };
}
