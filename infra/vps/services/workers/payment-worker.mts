import type { Redis } from "ioredis";
import { createDomainWorker, resourceId, withTenantResourceLock } from "./shared.mjs";

export function createPaymentWorkers(connection: Redis, logger: any) {
  return ["payments.confirmation", "payments.retry", "payments.reconciliation"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      concurrency: queueName === "payments.confirmation" ? 2 : undefined,
      processor: async (job) => {
        const payment = typeof job.data.payment === "object" && job.data.payment ? (job.data.payment as Record<string, unknown>) : {};
        const id = resourceId(job, payment.orderId, payment.invoiceId, job.data.orderId, job.data.invoiceId);
        return withTenantResourceLock(connection, job, "payment", id, async () => ({
          processed: true,
          queueName,
          paymentId: id,
          eventType: job.data.type ?? job.name,
          tenantId: job.data.tenantId
        }));
      }
    })
  );
}
