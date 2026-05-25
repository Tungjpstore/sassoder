import type { Redis } from "ioredis";
import { createDomainWorker, resourceId, withTenantResourceLock } from "./shared.mjs";

export function createStaffWorkers(connection: Redis, logger: any) {
  return ["staff.attendance", "staff.notifications", "staff.requests"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      processor: async (job) => {
        const serviceRequest =
          typeof job.data.serviceRequest === "object" && job.data.serviceRequest ? (job.data.serviceRequest as Record<string, unknown>) : {};
        return withTenantResourceLock(connection, job, "staff", resourceId(job, serviceRequest.id, job.data.staffId, job.data.userId), async () => ({
          processed: true,
          queueName,
          tenantId: job.data.tenantId
        }));
      }
    })
  );
}
