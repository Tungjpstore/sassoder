import type { Redis } from "ioredis";
import { createDomainWorker, resourceId, withTenantResourceLock } from "./shared.mjs";

export function createReservationWorkers(connection: Redis, logger: any) {
  return ["reservation.reminders", "reservation.expiry", "reservation.confirmation"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      processor: async (job) => {
        const reservation =
          typeof job.data.reservation === "object" && job.data.reservation ? (job.data.reservation as Record<string, unknown>) : {};
        const id = resourceId(job, reservation.id, job.data.reservationId);
        return withTenantResourceLock(connection, job, "reservation", id, async () => ({
          processed: true,
          queueName,
          reservationId: id,
          tenantId: job.data.tenantId
        }));
      }
    })
  );
}
