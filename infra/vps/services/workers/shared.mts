import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { bullMqPrefix, queueConcurrency, readEnv } from "../shared/env.js";
import { withRedisLock } from "../shared/locks.js";
import { createCounter, createHistogram } from "../shared/metrics.js";
import { enqueueDeadLetterJob, queueDefinition } from "../shared/queues.js";
import { tenantIdFromJobData, tenantLockKey } from "../shared/redis-keys.js";

export type TenantJobData = {
  tenantId?: string;
  restaurantId?: string;
  eventId?: string;
  type?: string;
  [key: string]: unknown;
};

export type DomainProcessor = (job: Job<TenantJobData>) => Promise<unknown>;

type WorkerInput = {
  queueName: string;
  connection: Redis;
  logger: any;
  processor: DomainProcessor;
  concurrency?: number;
};

const completedCounter = createCounter({
  name: "logivn_worker_jobs_completed_total",
  help: "Completed BullMQ jobs",
  labelNames: ["queue", "name"] as const
});

const failedCounter = createCounter({
  name: "logivn_worker_jobs_failed_total",
  help: "Failed BullMQ jobs",
  labelNames: ["queue", "name", "final"] as const
});

const durationHistogram = createHistogram({
  name: "logivn_worker_job_duration_seconds",
  help: "BullMQ job processing duration",
  labelNames: ["queue", "name"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
});

export function createDomainWorker({ queueName, connection, logger, processor, concurrency }: WorkerInput) {
  const definition = queueDefinition(queueName);
  const worker = new Worker<TenantJobData>(
    queueName,
    async (job) => {
      const stopTimer = durationHistogram.startTimer({ queue: queueName, name: job.name });
      try {
        assertTenantJob(job);
        return await withTimeout(processor(job), definition.timeoutMs, queueName, job.name);
      } finally {
        stopTimer();
      }
    },
    {
      connection,
      prefix: bullMqPrefix(),
      name: `${readEnv("HOSTNAME", "logivn")}:${queueName}`,
      concurrency: concurrency ?? queueConcurrency(4),
      lockDuration: Math.max(definition.timeoutMs + 15_000, 30_000),
      maxStalledCount: 1,
      removeOnComplete: { age: 86_400, count: 2000 },
      removeOnFail: { age: 604_800, count: 10_000 },
      metrics: {
        maxDataPoints: 24 * 60
      }
    }
  );

  worker.on("completed", (job) => {
    completedCounter.inc({ queue: queueName, name: job.name });
    logger.info({ queueName, jobId: job.id, name: job.name }, "job completed");
  });

  worker.on("failed", (job, error) => {
    const attempts = Number(job?.opts.attempts ?? 1);
    const final = Boolean(job && job.attemptsMade >= attempts);
    failedCounter.inc({ queue: queueName, name: job?.name ?? "unknown", final: String(final) });
    logger.error({ queueName, jobId: job?.id, attemptsMade: job?.attemptsMade, final, error: serializeError(error) }, "job failed");

    if (job && final) {
      enqueueDeadLetterJob({ failedQueueName: queueName, job, error }).catch((dlqError) => {
        logger.error({ queueName, jobId: job.id, error: serializeError(dlqError) }, "dead-letter enqueue failed");
      });
    }
  });

  worker.on("error", (error) => {
    logger.error({ queueName, error: serializeError(error) }, "worker error");
  });

  return worker;
}

export function assertTenantJob(job: Job<TenantJobData>) {
  if (!tenantIdFromJobData(job.data)) {
    throw new Error(`tenant_missing:${job.queueName}:${job.id}`);
  }
}

export async function withTenantResourceLock<T>(
  connection: Redis,
  job: Job<TenantJobData>,
  scope: string,
  resourceId: string,
  fn: () => Promise<T>
) {
  const tenantId = tenantIdFromJobData(job.data);
  return withRedisLock(
    connection,
    {
      key: tenantLockKey(tenantId, scope, resourceId),
      ttlMs: Math.max(queueDefinition(job.queueName).timeoutMs + 10_000, 30_000)
    },
    fn
  );
}

export function resourceId(job: Job<TenantJobData>, ...candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (typeof job.data.eventId === "string") return job.data.eventId;
  return String(job.id);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, queueName: string, jobName: string) {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`job_timeout:${queueName}:${jobName}:${timeoutMs}`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: "code" in error ? (error as { code?: unknown }).code : undefined
    };
  }

  return error;
}
