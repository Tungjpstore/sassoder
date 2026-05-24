import type { Redis } from "ioredis";
import { createDomainWorker, resourceId, withTenantResourceLock } from "./shared.mjs";

export function createInventoryWorkers(connection: Redis, logger: any) {
  return ["inventory.sync", "inventory.alerts"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      processor: async (job) =>
        withTenantResourceLock(connection, job, "inventory", resourceId(job, job.data.itemId, job.data.eventId), async () => ({
          processed: true,
          queueName,
          tenantId: job.data.tenantId
        }))
    })
  );
}
