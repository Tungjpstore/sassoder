import type { Redis } from "ioredis";
import { createDomainWorker, resourceId, withTenantResourceLock } from "./shared.mjs";

export function createOrderWorkers(connection: Redis, logger: any) {
  return ["orders.processing", "orders.sla", "orders.retry"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      processor: async (job) => {
        const order = typeof job.data.order === "object" && job.data.order ? (job.data.order as Record<string, unknown>) : {};
        return withTenantResourceLock(connection, job, "order", resourceId(job, order.id, job.data.orderId), async () => ({
          processed: true,
          queueName,
          eventType: job.data.type ?? job.name,
          tenantId: job.data.tenantId
        }));
      }
    })
  );
}
