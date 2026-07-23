import type { Redis } from "ioredis";
import { createDomainWorker } from "./shared.mjs";

export function createInventoryWorkers(connection: Redis, logger: any) {
  return ["inventory.sync", "inventory.alerts"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      processor: async () => {
        throw new Error(`${queueName}_adapter_not_configured`);
      }
    })
  );
}
