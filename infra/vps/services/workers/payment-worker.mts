import type { Redis } from "ioredis";
import { createDomainWorker } from "./shared.mjs";

export function createPaymentWorkers(connection: Redis, logger: any) {
  return ["payments.confirmation", "payments.retry", "payments.reconciliation"].map((queueName) =>
    createDomainWorker({
      queueName,
      connection,
      logger,
      concurrency: queueName === "payments.confirmation" ? 2 : undefined,
      processor: async () => {
        throw new Error(`${queueName}_adapter_not_configured`);
      }
    })
  );
}
