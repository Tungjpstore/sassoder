import { randomUUID } from "node:crypto";

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export async function acquireLock(connection, { key, ttlMs, token = randomUUID() }) {
  if (!key?.startsWith("lock:")) throw new Error("lock key must start with lock:");
  const result = await connection.set(key, token, "PX", ttlMs, "NX");
  return result === "OK" ? { acquired: true, token, key, ttlMs } : { acquired: false, key, ttlMs };
}

export async function releaseLock(connection, { key, token }) {
  if (!key || !token) return false;
  const released = await connection.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
  return released === 1;
}

export async function withRedisLock(connection, lockInput, fn) {
  const lock = await acquireLock(connection, lockInput);
  if (!lock.acquired) {
    const error = new Error(`lock_not_acquired:${lockInput.key}`);
    error.code = "LOCK_NOT_ACQUIRED";
    throw error;
  }

  try {
    return await fn(lock);
  } finally {
    await releaseLock(connection, lock).catch(() => undefined);
  }
}
