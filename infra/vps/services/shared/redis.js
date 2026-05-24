import IORedis from "ioredis";
import { redisUrl } from "./env.js";

export function createRedisConnection(serviceName) {
  return new IORedis(redisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName: serviceName,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    }
  });
}

export async function assertRedisHealthy(connection) {
  const pong = await connection.ping();
  if (pong !== "PONG") {
    throw new Error(`Redis health check failed: ${pong}`);
  }
}
