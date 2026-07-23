import type { Redis } from "ioredis";
import { createDomainWorker } from "./shared.mjs";

export function createReservationWorkers(connection: Redis, logger: any) {
  return ["reservation.reminders", "reservation.expiry", "reservation.confirmation"].map((queueName) =>
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
