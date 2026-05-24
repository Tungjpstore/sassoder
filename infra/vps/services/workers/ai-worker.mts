import type { Redis } from "ioredis";
import { chatWithFallback } from "../shared/ai-providers.js";
import { createDomainWorker } from "./shared.mjs";

export function createAiWorkers(connection: Redis, logger: any) {
  return [
    createDomainWorker({
      queueName: "ai.chat",
      connection,
      logger,
      concurrency: 3,
      processor: async (job) => {
        const result = await chatWithFallback(job.data, logger);
        return { provider: result.provider, model: result.model, content: result.content };
      }
    }),
    ...["ai.analytics", "ai.summary", "ai.reports"].map((queueName) =>
      createDomainWorker({
        queueName,
        connection,
        logger,
        concurrency: 2,
        processor: async () => {
          throw new Error(`${queueName}_adapter_not_configured`);
        }
      })
    )
  ];
}
