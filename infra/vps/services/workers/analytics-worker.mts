import type { Redis } from "ioredis";
import { createDomainWorker } from "./shared.mjs";

export function createAnalyticsWorkers(_connection: Redis, _logger: any) {
  return [];
}
