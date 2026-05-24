import type { Redis } from "ioredis";
import { createDomainWorker, resourceId, withTenantResourceLock } from "./shared.mjs";

export function createOrderWorkers(connection: Redis, logger: any) {
  return ["orders.processing", "orders.sla", "orders.retry"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      processor: async (job) =>
        withTenantResourceLock(connection, job, "order", resourceId(job, job.data.orderId), async () => ({
          processed: true,
          queueName,
          eventType: job.data.type ?? job.name,
          tenantId: job.data.tenantId
        }))
    })
  );
}
