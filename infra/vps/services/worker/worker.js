import { Worker } from "bullmq";
import { chatWithFallback } from "../shared/ai-providers.js";
import { queueNames, servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { queueSummary } from "../shared/queues.js";
import { createRedisConnection } from "../shared/redis.js";

const logger = createLogger("worker");
const connection = createRedisConnection("worker");
await connection.connect();

const processors = {
  async "ai-jobs"(job) {
    const result = await chatWithFallback(job.data, logger);
    return { provider: result.provider, model: result.model, content: result.content };
  },
  async notifications(job) {
    logger.info({ jobId: job.id, data: job.data }, "notification job placeholder processed");
    return { delivered: false, reason: "provider_not_configured" };
  },
  async invoices(job) {
    logger.info({ jobId: job.id }, "invoice job placeholder processed");
    return { generated: false, reason: "template_not_configured" };
  },
  async "image-optimization"(job) {
    logger.info({ jobId: job.id }, "image optimization delegated to image-service");
    return { delegated: true };
  },
  async analytics(job) {
    logger.info({ jobId: job.id }, "analytics job placeholder processed");
    return { computed: false, reason: "analytics_adapter_not_configured" };
  },
  async "delivery-routing"(job) {
    logger.info({ jobId: job.id }, "delivery routing job placeholder processed");
    return { routed: false, reason: "routing_adapter_not_configured" };
  },
  async "cron-tasks"(job) {
    logger.info({ jobId: job.id, name: job.name }, "cron task placeholder processed");
    return { executed: false, reason: "cron_handler_not_configured" };
  }
};

const concurrency = Number(process.env.WORKER_CONCURRENCY || "4");
const workers = queueNames.map((queueName) => {
  const worker = new Worker(queueName, processors[queueName], {
    connection,
    concurrency
  });

  worker.on("completed", (job) => logger.info({ queueName, jobId: job.id }, "job completed"));
  worker.on("failed", (job, error) => logger.error({ queueName, jobId: job?.id, error }, "job failed"));
  return worker;
});

const app = createHttpApp({ logger, serviceName: "worker" });

app.get("/ready", async (_req, res) => {
  res.json({ ok: true, workers: workers.length, queues: queueNames });
});

app.get("/queues", requireInternalApiKey, async (_req, res, next) => {
  try {
    res.json({ ok: true, queues: await queueSummary() });
  } catch (error) {
    next(error);
  }
});

const shutdown = async () => {
  logger.info("closing workers");
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

listen(app, servicePort(3500), logger);
