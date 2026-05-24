import IORedis from "ioredis";
import { redisUrl } from "./env.js";

export function createRedisConnection(serviceName) {
  return new IORedis(redisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName: serviceName,
    commandTimeout: 10_000,
    keepAlive: 60_000,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
    reconnectOnError(error) {
      const message = error.message.toLowerCase();
      return message.includes("readonly") || message.includes("connection");
    }
  });
}

export async function assertRedisHealthy(connection) {
  const pong = await connection.ping();
  if (pong !== "PONG") {
    throw new Error(`Redis health check failed: ${pong}`);
  }
}

export async function redisServerSnapshot(connection) {
  const [info, slowlogLength] = await Promise.all([connection.info(), connection.slowlog("LEN")]);
  const fields = Object.fromEntries(
    info
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes(":"))
      .map((line) => {
        const [key, ...value] = line.split(":");
        return [key, value.join(":")];
      })
  );

  return {
    redisVersion: fields.redis_version,
    role: fields.role,
    connectedClients: Number(fields.connected_clients ?? 0),
    usedMemory: Number(fields.used_memory ?? 0),
    usedMemoryHuman: fields.used_memory_human,
    maxMemory: Number(fields.maxmemory ?? 0),
    maxMemoryHuman: fields.maxmemory_human,
    memFragmentationRatio: Number(fields.mem_fragmentation_ratio ?? 0),
    instantaneousOpsPerSec: Number(fields.instantaneous_ops_per_sec ?? 0),
    aofEnabled: fields.aof_enabled === "1",
    aofRewriteInProgress: fields.aof_rewrite_in_progress === "1",
    rdbBgsaveInProgress: fields.rdb_bgsave_in_progress === "1",
    slowlogLength: Number(slowlogLength ?? 0)
  };
}
