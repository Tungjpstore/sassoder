import { Queue } from "bullmq";
import { bullMqPrefix, legacyQueueAliases, priorityValues, queueNames } from "./env.js";
import { createRedisConnection } from "./redis.js";
import { tenantIdFromJobData, tenantKey } from "./redis-keys.js";

const OPERATIONAL_EVENTS_KEY = "events:operational";
const EVENT_STREAM_MAXLEN = 10_000;

export const queueDefinitions = {
  "telegram.notifications": queueConfig("notifications", { attempts: 8, delay: 3000, priority: "high", timeoutMs: 20_000 }),
  "platform.telegram.notifications": queueConfig("notifications", { attempts: 8, delay: 3000, priority: "critical", timeoutMs: 20_000 }),
  "push.notifications": queueConfig("notifications", { attempts: 5, delay: 2000, priority: "normal", timeoutMs: 10_000 }),
  "email.notifications": queueConfig("notifications", { attempts: 5, delay: 5000, priority: "low", timeoutMs: 30_000 }),
  "orders.processing": queueConfig("orders", { attempts: 5, delay: 2000, priority: "high", timeoutMs: 20_000 }),
  "orders.sla": queueConfig("orders", { attempts: 3, delay: 1000, priority: "critical", timeoutMs: 10_000 }),
  "orders.retry": queueConfig("orders", { attempts: 8, delay: 5000, priority: "normal", timeoutMs: 30_000 }),
  "payments.confirmation": queueConfig("payments", { attempts: 10, delay: 1500, priority: "critical", timeoutMs: 20_000 }),
  "payments.retry": queueConfig("payments", { attempts: 10, delay: 5000, priority: "critical", timeoutMs: 30_000 }),
  "payments.reconciliation": queueConfig("payments", { attempts: 6, delay: 10_000, priority: "high", timeoutMs: 60_000 }),
  "ai.analytics": queueConfig("ai", { attempts: 3, delay: 5000, priority: "background", timeoutMs: 120_000 }),
  "ai.summary": queueConfig("ai", { attempts: 4, delay: 5000, priority: "low", timeoutMs: 90_000 }),
  "ai.reports": queueConfig("ai", { attempts: 4, delay: 10_000, priority: "background", timeoutMs: 180_000 }),
  "ai.chat": queueConfig("ai", { attempts: 3, delay: 2000, priority: "normal", timeoutMs: 60_000 }),
  "reservation.reminders": queueConfig("reservation", { attempts: 5, delay: 3000, priority: "high", timeoutMs: 20_000 }),
  "reservation.expiry": queueConfig("reservation", { attempts: 4, delay: 3000, priority: "high", timeoutMs: 15_000 }),
  "reservation.confirmation": queueConfig("reservation", { attempts: 5, delay: 2000, priority: "high", timeoutMs: 20_000 }),
  "inventory.sync": queueConfig("inventory", { attempts: 6, delay: 5000, priority: "normal", timeoutMs: 45_000 }),
  "inventory.alerts": queueConfig("inventory", { attempts: 5, delay: 3000, priority: "high", timeoutMs: 15_000 }),
  "staff.attendance": queueConfig("staff", { attempts: 5, delay: 2000, priority: "high", timeoutMs: 20_000 }),
  "staff.notifications": queueConfig("staff", { attempts: 5, delay: 3000, priority: "normal", timeoutMs: 15_000 }),
  "staff.requests": queueConfig("staff", { attempts: 5, delay: 3000, priority: "normal", timeoutMs: 20_000 })
};

export const eventRoutes = {
  "order.created": [
    route("orders.processing", "order.created", "high"),
    route("telegram.notifications", "order.created", "high")
  ],
  "order.confirmed": [
    route("orders.processing", "order.confirmed", "high"),
    route("telegram.notifications", "order.confirmed", "high")
  ],
  "order.completed": [
    route("orders.processing", "order.completed", "normal"),
    route("telegram.notifications", "order.completed", "normal")
  ],
  "order.cancelled": [
    route("orders.processing", "order.cancelled", "high"),
    route("telegram.notifications", "order.cancelled", "high")
  ],
  "order.delivery_status_changed": [
    route("orders.processing", "order.delivery_status_changed", "high"),
    route("telegram.notifications", "order.delivery_status_changed", "high")
  ],
  "payment.received": [
    route("payments.confirmation", "payment.received", "critical"),
    route("telegram.notifications", "payment.received", "critical")
  ],
  "payment.waiting_confirm": [
    route("payments.confirmation", "payment.waiting_confirm", "critical"),
    route("telegram.notifications", "payment.waiting_confirm", "critical")
  ],
  "reservation.created": [
    route("reservation.confirmation", "reservation.created", "high"),
    route("telegram.notifications", "reservation.created", "high")
  ],
  "reservation.deposit_submitted": [
    route("reservation.confirmation", "reservation.deposit_submitted", "critical"),
    route("telegram.notifications", "reservation.deposit_submitted", "critical")
  ],
  "reservation.confirmed": [
    route("reservation.confirmation", "reservation.confirmed", "high"),
    route("telegram.notifications", "reservation.confirmed", "normal")
  ],
  "reservation.rejected": [
    route("reservation.confirmation", "reservation.rejected", "high"),
    route("telegram.notifications", "reservation.rejected", "normal")
  ],
  "reservation.cancelled": [
    route("reservation.confirmation", "reservation.cancelled", "high"),
    route("telegram.notifications", "reservation.cancelled", "normal")
  ],
  "reservation.checked_in": [
    route("reservation.confirmation", "reservation.checked_in", "normal"),
    route("telegram.notifications", "reservation.checked_in", "normal")
  ],
  "reservation.seated": [
    route("reservation.confirmation", "reservation.seated", "normal"),
    route("telegram.notifications", "reservation.seated", "normal")
  ],
  "reservation.no_show": [
    route("reservation.confirmation", "reservation.no_show", "high"),
    route("telegram.notifications", "reservation.no_show", "high")
  ],
  "reservation.rescheduled": [
    route("reservation.confirmation", "reservation.rescheduled", "high"),
    route("telegram.notifications", "reservation.rescheduled", "normal")
  ],
  "inventory.low": [
    route("inventory.alerts", "inventory.low", "high"),
    route("telegram.notifications", "inventory.low", "high")
  ],
  "menu.item_availability_suggested": [
    route("inventory.alerts", "menu.item_availability_suggested", "high"),
    route("telegram.notifications", "menu.item_availability_suggested", "high")
  ],
  "staff.checked_in": [
    route("staff.attendance", "staff.checked_in", "normal"),
    route("staff.notifications", "staff.checked_in", "low"),
    route("telegram.notifications", "staff.checked_in", "low")
  ],
  "staff.request_created": [
    route("staff.requests", "staff.request_created", "high"),
    route("telegram.notifications", "staff.request_created", "high")
  ],
  "staff.request_reviewed": [
    route("staff.notifications", "staff.request_reviewed", "normal"),
    route("telegram.notifications", "staff.request_reviewed", "low")
  ],
  "sla.warning": [
    route("orders.sla", "sla.warning", "critical"),
    route("telegram.notifications", "sla.warning", "critical")
  ],
  "service_request.created": [
    route("staff.requests", "service_request.created", "critical"),
    route("telegram.notifications", "service_request.created", "critical")
  ],
  "service_request.resolved": [
    route("staff.requests", "service_request.resolved", "normal"),
    route("telegram.notifications", "service_request.resolved", "low")
  ],
  "platform.alert": [
    route("platform.telegram.notifications", "platform.alert", "critical")
  ]
};

const queueConnection = createRedisConnection("logivn-queue-client");
const queues = new Map();

export function resolveQueueName(name) {
  return legacyQueueAliases[name] ?? name;
}

export function deadLetterQueueName(name) {
  return `${resolveQueueName(name)}.dlq`;
}

export function isSupportedQueue(name) {
  const resolved = resolveQueueName(name);
  return queueNames.includes(resolved) || resolved.endsWith(".dlq");
}

export function queueDefinition(name) {
  const resolved = resolveQueueName(name);
  const baseName = resolved.endsWith(".dlq") ? resolved.replace(/\.dlq$/, "") : resolved;
  const definition = queueDefinitions[baseName];
  if (!definition) throw new Error(`Unsupported queue: ${name}`);
  return definition;
}

export function getQueue(name) {
  const resolved = resolveQueueName(name);
  if (!isSupportedQueue(resolved)) {
    throw new Error(`Unsupported queue: ${name}`);
  }

  if (!queues.has(resolved)) {
    const definition = queueDefinition(resolved);
    queues.set(
      resolved,
      new Queue(resolved, {
        connection: queueConnection,
        prefix: bullMqPrefix(),
        defaultJobOptions: {
          attempts: definition.attempts,
          backoff: backoffForQueue(resolved, definition),
          priority: priorityValues[definition.priority],
          removeOnComplete: { age: 86_400, count: 2000 },
          removeOnFail: { age: 604_800, count: 10_000 },
          keepLogs: 50,
          stackTraceLimit: 20,
          sizeLimit: 262_144
        }
      })
    );
  }

  return queues.get(resolved);
}

export async function enqueueJob({ queueName, name, data, opts = {}, priority }) {
  const resolvedQueueName = resolveQueueName(queueName);
  const normalizedData = normalizeJobData(resolvedQueueName, data);
  const queue = getQueue(resolvedQueueName);
  const definition = queueDefinition(resolvedQueueName);
  const jobPriority = normalizePriority(priority ?? opts.priorityLabel ?? definition.priority);
  const jobId = opts.jobId ? jobIdForParts(opts.jobId) : buildJobId({ queueName: resolvedQueueName, name, data: normalizedData });

  return queue.add(name, normalizedData, {
    ...opts,
    jobId,
    priority: typeof opts.priority === "number" ? opts.priority : jobPriority,
    attempts: opts.attempts ?? definition.attempts,
    backoff: opts.backoff ?? backoffForQueue(resolvedQueueName, definition),
    removeOnComplete: opts.removeOnComplete ?? { age: 86_400, count: 2000 },
    removeOnFail: opts.removeOnFail ?? { age: 604_800, count: 10_000 }
  });
}

export async function publishOperationalEvent(event) {
  const routes = eventRoutes[event.type];
  if (!routes?.length) throw new Error(`Unsupported operational event: ${event.type}`);

  const tenantId = operationalTenantId(event);
  if (!tenantId) throw new Error("Operational events must include tenantId or restaurantId");
  const eventRecord = {
    ...event,
    tenantId,
    occurredAt: event.occurredAt ?? new Date().toISOString()
  };

  await recordOperationalEvent(eventRecord);

  return Promise.all(
    routes.map((target) =>
      enqueueJob({
        queueName: target.queueName,
        name: target.jobName,
        data: eventRecord,
        priority: target.priority,
        opts: {
          jobId: jobIdForParts(target.queueName, event.type, event.eventId ?? Date.now())
        }
      }).then((job) => ({
        queueName: target.queueName,
        jobId: job.id,
        name: target.jobName
      }))
    )
  );
}

export async function recordOperationalEvent(event) {
  const tenantId = operationalTenantId(event);
  if (!tenantId) throw new Error("Operational events must include tenantId or restaurantId");

  const payload = JSON.stringify(event);
  const fields = [
    "tenantId",
    tenantId,
    "type",
    String(event.type),
    "eventId",
    String(event.eventId ?? ""),
    "occurredAt",
    String(event.occurredAt ?? new Date().toISOString()),
    "payload",
    payload
  ];

  const tenantEventKey = tenantKey(tenantId, "events");
  const [globalId, tenantIdEntry] = await Promise.all([
    queueConnection.xadd(OPERATIONAL_EVENTS_KEY, "MAXLEN", "~", EVENT_STREAM_MAXLEN, "*", ...fields),
    queueConnection.xadd(tenantEventKey, "MAXLEN", "~", EVENT_STREAM_MAXLEN, "*", ...fields)
  ]);

  return { globalId, tenantId: tenantIdEntry, key: tenantEventKey };
}

export async function recentOperationalEvents({ tenantId, limit = 50 } = {}) {
  const key = tenantId ? tenantKey(tenantId, "events") : OPERATIONAL_EVENTS_KEY;
  const rows = await queueConnection.xrevrange(key, "+", "-", "COUNT", Math.min(Math.max(limit, 1), 200));
  return rows.map(([id, values]) => {
    const fields = toObject(values);
    return {
      id,
      tenantId: fields.tenantId,
      type: fields.type,
      eventId: fields.eventId,
      occurredAt: fields.occurredAt,
      payload: parseJson(fields.payload)
    };
  });
}

export async function enqueueDeadLetterJob({ failedQueueName, job, error }) {
  const queueName = deadLetterQueueName(failedQueueName);
  const queue = getQueue(queueName);
  const tenantId = tenantIdFromJobData(job.data) || "unknown";
  return queue.add(
    "dead-letter",
    {
      tenantId,
      failedQueueName: resolveQueueName(failedQueueName),
      failedJobId: job.id,
      failedJobName: job.name,
      attemptsMade: job.attemptsMade,
      failedReason: error instanceof Error ? error.message : String(error),
      data: job.data,
      failedAt: new Date().toISOString()
    },
    {
      jobId: jobIdForParts(queueName, job.id ?? Date.now()),
      attempts: 1,
      priority: priorityValues.critical,
      removeOnComplete: false,
      removeOnFail: { age: 2_592_000, count: 50_000 }
    }
  );
}

export async function queueSummary({ includeDeadLetters = true } = {}) {
  const names = includeDeadLetters ? [...queueNames, ...queueNames.map(deadLetterQueueName)] : queueNames;
  const entries = await Promise.all(
    names.map(async (name) => {
      const queue = getQueue(name);
      const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
      return [name, counts];
    })
  );
  return Object.fromEntries(entries);
}

export async function failedJobs({ queueName, limit = 25 }) {
  const queue = getQueue(queueName);
  const jobs = queueName.endsWith(".dlq") ? await deadLetterJobs(queue, limit) : await queue.getFailed(0, Math.max(0, limit - 1));
  return Promise.all(jobs.map(serializeQueueJob));
}

export async function retryFailedJob({ queueName, jobId, actor = "system" }) {
  const resolvedQueueName = resolveQueueName(queueName);
  if (!isSupportedQueue(resolvedQueueName)) throw new Error(`Unsupported queue: ${queueName}`);
  if (!jobId) throw new Error("queue_job_id_required");

  const queue = getQueue(resolvedQueueName);
  const job = await queue.getJob(String(jobId));
  if (!job) throw new Error("queue_job_not_found");

  const state = await job.getState();
  if (resolvedQueueName.endsWith(".dlq")) return replayDeadLetterJob({ queueName: resolvedQueueName, job, state, actor });
  if (state !== "failed") throw new Error(`queue_job_not_failed:${state}`);

  await job.retry("failed");
  return {
    mode: "retry",
    queueName: resolvedQueueName,
    jobId: String(job.id),
    name: job.name,
    previousState: state
  };
}

async function replayDeadLetterJob({ queueName, job, state, actor }) {
  const data = job.data && typeof job.data === "object" ? job.data : {};
  if (data.replayedAt) throw new Error("dead_letter_already_replayed");

  const failedQueueName = resolveQueueName(String(data.failedQueueName ?? ""));
  if (!queueNames.includes(failedQueueName)) throw new Error("dead_letter_original_queue_invalid");

  const failedJobName = String(data.failedJobName || "dead-letter-replay").slice(0, 120);
  const failedData = data.data && typeof data.data === "object" ? data.data : {};
  const replayedAt = new Date().toISOString();
  const replayedJob = await enqueueJob({
    queueName: failedQueueName,
    name: failedJobName,
    data: failedData,
    priority: "critical",
    opts: {
      jobId: jobIdForParts(failedQueueName, "dlq-replay", job.id ?? Date.now(), Date.now()),
      attempts: queueDefinition(failedQueueName).attempts
    }
  });

  await job.updateData({
    ...data,
    replayedAt,
    replayedBy: String(actor).slice(0, 160),
    replayedQueueName: failedQueueName,
    replayedJobId: replayedJob.id
  });

  return {
    mode: "dead_letter_replay",
    queueName,
    jobId: String(job.id),
    name: job.name,
    previousState: state,
    replayed: {
      queueName: failedQueueName,
      jobId: String(replayedJob.id),
      name: failedJobName
    }
  };
}

async function deadLetterJobs(queue, limit) {
  const end = Math.max(0, limit - 1);
  const batches = await Promise.all([queue.getFailed(0, end), queue.getWaiting(0, end), queue.getDelayed(0, end)]);
  const seen = new Set();
  return batches
    .flat()
    .filter((job) => {
      const key = String(job.id ?? "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Number(right.timestamp ?? 0) - Number(left.timestamp ?? 0))
    .slice(0, Math.max(0, limit));
}

async function serializeQueueJob(job) {
  return {
    id: job.id,
    name: job.name,
    state: await job.getState(),
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    data: redactLargePayload(job.data)
  };
}

function queueConfig(domain, { attempts, delay, priority, timeoutMs }) {
  return {
    domain,
    attempts,
    backoffDelayMs: delay,
    priority,
    timeoutMs
  };
}

function route(queueName, jobName, priority) {
  return { queueName, jobName, priority };
}

function normalizePriority(priority) {
  if (typeof priority === "number") return priority;
  return priorityValues[priority] ?? priorityValues.normal;
}

function backoffForQueue(queueName, definition) {
  if (queueName === "telegram.notifications" || queueName === "platform.telegram.notifications") {
    return { type: "telegram-rate-limit", delay: definition.backoffDelayMs };
  }
  return { type: "exponential", delay: definition.backoffDelayMs };
}

function normalizeJobData(queueName, data) {
  const input = data && typeof data === "object" ? data : {};
  const tenantId = operationalTenantId(input);
  if (!tenantId && !queueName.endsWith(".dlq")) {
    throw new Error(`Queue jobs must include tenantId or restaurantId: ${queueName}`);
  }

  return {
    ...input,
    tenantId: tenantId || "unknown"
  };
}

function buildJobId({ queueName, name, data }) {
  const tenantId = operationalTenantId(data);
  const eventId = data.eventId || data.idempotencyKey || data.orderId || data.reservationId || data.invoiceId;
  if (tenantId && eventId) return jobIdForParts(queueName, tenantId, eventId);
  return undefined;
}

function operationalTenantId(data) {
  const tenantId = tenantIdFromJobData(data);
  if (tenantId) return tenantId;
  return data?.type === "platform.alert" ? "platform" : "";
}

function jobIdForParts(...parts) {
  return parts
    .map((part) =>
      String(part ?? "")
        .replace(/[^A-Za-z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 120)
    )
    .filter(Boolean)
    .join("-");
}

function redactLargePayload(data) {
  const json = JSON.stringify(data ?? {});
  if (json.length <= 4096) return data;
  return { redacted: true, bytes: Buffer.byteLength(json) };
}

function toObject(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 2) {
    output[values[index]] = values[index + 1];
  }
  return output;
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
