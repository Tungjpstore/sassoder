import type { Redis } from "ioredis";
import { createDomainWorker } from "./shared.mjs";

export function createStaffWorkers(connection: Redis, logger: any) {
  return ["staff.attendance", "staff.notifications", "staff.requests"].map((queueName) =>
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
