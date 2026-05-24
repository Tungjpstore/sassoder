import type { Redis } from "ioredis";
import { createDomainWorker, resourceId, withTenantResourceLock } from "./shared.mjs";

export function createStaffWorkers(connection: Redis, logger: any) {
  return ["staff.attendance", "staff.notifications", "staff.requests"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      processor: async (job) =>
        withTenantResourceLock(connection, job, "staff", resourceId(job, job.data.staffId, job.data.userId), async () => ({
          processed: true,
          queueName,
          tenantId: job.data.tenantId
        }))
    })
  );
}
