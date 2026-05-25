import { queueNames, servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { startQueueMetricsCollector } from "../shared/queue-metrics.js";
import { failedJobs, queueSummary } from "../shared/queues.js";
import { createRedisConnection, redisServerSnapshot } from "../shared/redis.js";
import { createAiWorkers } from "./ai-worker.mjs";
import { createAnalyticsWorkers } from "./analytics-worker.mjs";
import { createInventoryWorkers } from "./inventory-worker.mjs";
import { createNotificationWorkers } from "./notification-worker.mjs";
import { createOrderWorkers } from "./order-worker.mjs";
import { createPaymentWorkers } from "./payment-worker.mjs";
import { createReservationWorkers } from "./reservation-worker.mjs";
import { createStaffWorkers } from "./staff-worker.mjs";
import { startOperationalOutboxRelay } from "./outbox-relay-worker.mjs";
import { startSlaScanner } from "./sla-scanner.mjs";

const logger = createLogger("worker");
const connection = createRedisConnection("worker");
await connection.connect();

const workers = [
  ...createNotificationWorkers(connection, logger),
  ...createOrderWorkers(connection, logger),
  ...createPaymentWorkers(connection, logger),
  ...createAiWorkers(connection, logger),
  ...createReservationWorkers(connection, logger),
  ...createInventoryWorkers(connection, logger),
  ...createStaffWorkers(connection, logger),
  ...createAnalyticsWorkers(connection, logger)
];
const stopQueueMetrics = startQueueMetricsCollector({ logger });
const stopOperationalOutboxRelay = startOperationalOutboxRelay({ logger });
const stopSlaScanner = startSlaScanner({ logger });

const app = createHttpApp({ logger, serviceName: "worker" });

app.get("/ready", async (_req, res) => {
  res.json({
    ok: true,
    workers: workers.length,
    queues: workers.map((worker) => worker.name)
  });
});

app.get("/redis", requireInternalApiKey, async (_req, res, next) => {
  try {
    res.json({ ok: true, redis: await redisServerSnapshot(connection) });
  } catch (error) {
    next(error);
  }
});

app.get("/queues", requireInternalApiKey, async (_req, res, next) => {
  try {
    res.json({ ok: true, queues: await queueSummary() });
  } catch (error) {
    next(error);
  }
});

app.get("/queues/failed", requireInternalApiKey, async (req, res, next) => {
  try {
    const queueName = String(req.query.queueName || queueNames[0]);
    const limit = Number(req.query.limit || 25);
    res.json({ ok: true, queueName, jobs: await failedJobs({ queueName, limit }) });
  } catch (error) {
    next(error);
  }
});

const shutdown = async () => {
  logger.info("closing workers");
  stopOperationalOutboxRelay();
  stopSlaScanner();
  stopQueueMetrics();
  await Promise.all(workers.map((worker) => worker.close()));
  await connection.quit();
  process.exit(0);
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

listen(app, servicePort(3500), logger);
