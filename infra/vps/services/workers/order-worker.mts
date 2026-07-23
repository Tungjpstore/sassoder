import type { Redis } from "ioredis";
import { createDomainWorker } from "./shared.mjs";

export function createOrderWorkers(connection: Redis, logger: any) {
  return ["orders.processing", "orders.sla", "orders.retry"].map((queueName) =>
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
