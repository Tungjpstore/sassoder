import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { priorityNames, queueNames, readEnv, servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { acquireLock, releaseLock } from "../shared/locks.js";
import { createLogger } from "../shared/logger.js";
import {
  deadLetterQueueName,
  failedJobs,
  enqueueJob,
  getQueue,
  publishOperationalEvent,
  queueSummary,
  recentOperationalEvents,
  retryFailedJob
} from "../shared/queues.js";
import { checkRedisRateLimit } from "../shared/rate-limit.js";
import { getTenantCache, invalidateTenantCache, setTenantCache } from "../shared/cache.js";
import { createRedisConnection, redisServerSnapshot } from "../shared/redis.js";
import { tenantRateLimitKey } from "../shared/redis-keys.js";
import { getRealtimeState, listRealtimeState, setRealtimeState } from "../shared/realtime-state.js";
import { hasSupabaseConfig, supabaseAdmin } from "../shared/supabase.js";

const logger = createLogger("gateway");
const app = createHttpApp({ logger, serviceName: "gateway" });
const controlRedis = createRedisConnection("gateway-control");
installQueueDashboard();
const isoDateTimeSchema = z.string().datetime({ offset: true });

const enqueueSchema = z.object({
  queueName: z.enum(queueNames),
  name: z.string().min(1).max(120),
  data: z.record(z.string(), z.unknown()).and(z.object({ tenantId: z.string().min(1).optional(), restaurantId: z.string().min(1).optional() })),
  priority: z.enum(priorityNames).optional(),
  opts: z.record(z.string(), z.unknown()).optional()
});

const queueControlNames = queueNames.map((name) => `${name}.dlq`).concat(queueNames);
const retryQueueJobSchema = z.object({
  queueName: z.enum(queueControlNames),
  jobId: z.union([z.string().min(1).max(180), z.number().int().nonnegative()]).transform(String),
  actor: z.string().min(1).max(160).optional()
});

const eventSchema = z
  .object({
    type: z.enum([
      "order.created",
      "order.confirmed",
      "order.completed",
      "order.cancelled",
      "order.delivery_status_changed",
      "payment.received",
      "payment.waiting_confirm",
      "reservation.created",
      "reservation.deposit_submitted",
      "reservation.confirmed",
      "reservation.rejected",
      "reservation.cancelled",
      "reservation.checked_in",
      "reservation.seated",
      "reservation.no_show",
      "reservation.rescheduled",
      "inventory.low",
      "menu.item_availability_suggested",
      "staff.checked_in",
      "staff.request_created",
      "staff.request_reviewed",
      "service_request.created",
      "service_request.resolved",
      "platform.alert",
      "sla.warning"
    ]),
    eventId: z.string().min(8).max(180),
    tenantId: z.string().min(1).optional(),
    restaurantId: z.string().uuid().optional(),
    branchId: z.string().min(1).nullable().optional(),
    occurredAt: isoDateTimeSchema.optional()
  })
  .passthrough()
  .superRefine((payload, ctx) => {
    if (payload.type !== "platform.alert" && !payload.restaurantId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["restaurantId"], message: "restaurantId is required for tenant operational events" });
    }
  })
  .transform((payload) => {
    if (payload.type !== "platform.alert") return payload;
    return { ...payload, tenantId: payload.tenantId ?? payload.restaurantId ?? "platform" };
  });

const lockAcquireSchema = z.object({
  key: z.string().min(8).max(240).regex(/^lock:/),
  tenantId: z.string().min(1),
  ttlMs: z.number().int().min(1000).max(120_000).default(30_000)
});

const lockReleaseSchema = z.object({
  key: z.string().min(8).max(240).regex(/^lock:/),
  token: z.string().min(16).max(160)
});

const rateLimitSchema = z.object({
  tenantId: z.string().min(1),
  scope: z.string().min(1).max(80),
  identifier: z.string().min(1).max(160),
  limit: z.number().int().min(1).max(10_000),
  windowMs: z.number().int().min(1000).max(86_400_000)
});

const tenantCacheQuerySchema = z.object({
  tenantId: z.string().min(1),
  scope: z.string().min(1).max(120),
  identifier: z.string().min(1).max(180)
});

const tenantCacheWriteSchema = tenantCacheQuerySchema.extend({
  value: z.unknown(),
  ttlSeconds: z.number().int().min(1).max(3600).default(30)
});

const tenantCacheInvalidateSchema = z.object({
  tenantId: z.string().min(1),
  scope: z.string().min(1).max(120),
  identifier: z.string().min(1).max(180).default("*")
});

const realtimeStateSchema = z.object({
  tenantId: z.string().min(1),
  scope: z.enum(["tables", "staff-online", "kitchen", "active-orders", "dashboards"]),
  identifier: z.string().min(1).max(160),
  value: z.record(z.string(), z.unknown()),
  ttlSeconds: z.number().int().min(5).max(86_400).default(300)
});

const alertmanagerSchema = z.object({
  status: z.string().optional(),
  receiver: z.string().optional(),
  alerts: z
    .array(
      z.object({
        status: z.string().optional(),
        labels: z.record(z.string(), z.string()).default({}),
        annotations: z.record(z.string(), z.string()).default({}),
        startsAt: z.string().optional(),
        endsAt: z.string().optional()
      })
    )
    .default([])
});

app.get("/ready", async (_req, res) => {
  const checks = {
    supabaseConfigured: hasSupabaseConfig(),
    supabaseReachable: false,
    redisReachable: false
  };

  if (checks.supabaseConfigured) {
    const { error } = await supabaseAdmin().from("restaurants").select("id", { count: "exact", head: true }).limit(1);
    checks.supabaseReachable = !error;
    if (error) logger.warn({ error }, "Supabase readiness probe failed");
  }

  try {
    checks.redisReachable = (await controlRedis.ping()) === "PONG";
  } catch (error) {
    logger.warn({ error }, "Redis readiness probe failed");
  }

  const ready = checks.supabaseConfigured && checks.supabaseReachable && checks.redisReachable;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    checks
  });
});

app.post("/events", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = eventSchema.parse(req.body);
    const jobs = await publishOperationalEvent(payload);
    res.status(202).json({ ok: true, eventId: payload.eventId, type: payload.type, jobs });
  } catch (error) {
    next(error);
  }
});

app.get("/events/recent", requireInternalApiKey, async (req, res, next) => {
  try {
    const query = z
      .object({
        tenantId: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50)
      })
      .parse(req.query);
    res.json({ ok: true, events: await recentOperationalEvents(query) });
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
    const queueName = z
      .enum(queueNames.map((name) => `${name}.dlq`).concat(queueNames))
      .parse(req.query.queueName || queueNames[0]);
    const limit = z.coerce.number().int().min(1).max(100).default(25).parse(req.query.limit);
    res.json({ ok: true, queueName, jobs: await failedJobs({ queueName, limit }) });
  } catch (error) {
    next(error);
  }
});

app.post("/queues/jobs", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = enqueueSchema.parse(req.body);
    const job = await enqueueJob(payload);
    res.status(202).json({ ok: true, jobId: job.id, queueName: payload.queueName });
  } catch (error) {
    next(error);
  }
});

app.post("/queues/retry", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = retryQueueJobSchema.parse(req.body);
    const result = await retryFailedJob(payload);
    res.status(202).json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});

app.post("/locks/acquire", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = lockAcquireSchema.parse(req.body);
    const lock = await acquireLock(controlRedis, payload);
    res.status(lock.acquired ? 200 : 423).json(lock);
  } catch (error) {
    next(error);
  }
});

app.post("/locks/release", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = lockReleaseSchema.parse(req.body);
    res.json({ ok: true, released: await releaseLock(controlRedis, payload) });
  } catch (error) {
    next(error);
  }
});

app.post("/rate-limits/check", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = rateLimitSchema.parse(req.body);
    const result = await checkRedisRateLimit(controlRedis, {
      key: tenantRateLimitKey(payload.tenantId, payload.scope, payload.identifier),
      limit: payload.limit,
      windowMs: payload.windowMs
    });
    res.status(result.allowed ? 200 : 429).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.get("/cache", requireInternalApiKey, async (req, res, next) => {
  try {
    const query = tenantCacheQuerySchema.parse(req.query);
    const value = await getTenantCache(controlRedis, query);
    res.json({ ok: true, hit: value !== null, value });
  } catch (error) {
    next(error);
  }
});

app.post("/cache", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = tenantCacheWriteSchema.parse(req.body);
    const result = await setTenantCache(controlRedis, payload);
    res.status(202).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.delete("/cache", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = tenantCacheInvalidateSchema.parse(req.body ?? {});
    const result = await invalidateTenantCache(controlRedis, payload);
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.post("/alerts", async (req, res, next) => {
  try {
    const payload = alertmanagerSchema.parse(req.body);
    const platformEvent = alertmanagerToPlatformAlert(payload);
    logger.warn(
      {
        status: payload.status,
        receiver: payload.receiver,
        alerts: payload.alerts.map((alert) => ({
          status: alert.status,
          alertname: alert.labels.alertname,
          severity: alert.labels.severity,
          summary: alert.annotations.summary
        }))
      },
      "alertmanager notification received"
    );
    const jobs = await publishOperationalEvent(platformEvent);
    await forwardAlertmanagerPayload(payload);
    res.json({ ok: true, eventId: platformEvent.eventId, jobs });
  } catch (error) {
    next(error);
  }
});

app.post("/realtime/state", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = realtimeStateSchema.parse(req.body);
    const result = await setRealtimeState(controlRedis, payload);
    res.status(202).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.get("/realtime/state", requireInternalApiKey, async (req, res, next) => {
  try {
    const query = z
      .object({
        tenantId: z.string().min(1),
        scope: realtimeStateSchema.shape.scope,
        identifier: z.string().min(1).max(160).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100)
      })
      .parse(req.query);
    const state = query.identifier
      ? await getRealtimeState(controlRedis, query)
      : await listRealtimeState(controlRedis, query);
    res.json({ ok: true, state });
  } catch (error) {
    next(error);
  }
});

app.get("/redis/health", requireInternalApiKey, async (_req, res, next) => {
  try {
    res.json({ ok: true, redis: await redisServerSnapshot(controlRedis) });
  } catch (error) {
    next(error);
  }
});

app.get("/config/public", (_req, res) => {
  res.json({
    ok: true,
    appUrl: readEnv("NEXT_PUBLIC_APP_URL", "https://logivn.com"),
    apiUrl: readEnv("LOGIVN_API_PUBLIC_URL", "https://api.logivn.com"),
    wsUrl: readEnv("LOGIVN_WS_PUBLIC_URL", "https://ws.logivn.com")
  });
});

app.use((error, _req, res, _next) => {
  logger.error({ error }, "gateway request failed");
  res.status(400).json({
    ok: false,
    error: error instanceof Error ? error.message : "request_failed"
  });
});

listen(app, servicePort(3100), logger);

function installQueueDashboard() {
  if (readEnv("BULL_BOARD_ENABLED", "false") !== "true") return;

  const username = readEnv("BULL_BOARD_USERNAME");
  const password = readEnv("BULL_BOARD_PASSWORD");
  if (!username || !password) {
    logger.warn("Bull Board is enabled but BULL_BOARD_USERNAME or BULL_BOARD_PASSWORD is missing");
    return;
  }

  const basePath = normalizeBasePath(readEnv("BULL_BOARD_BASE_PATH", "/queues/board"));
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);

  createBullBoard({
    queues: queueNames.concat(queueNames.map(deadLetterQueueName)).map((name) => new BullMQAdapter(getQueue(name))),
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: "LogiVN Queue Operations",
        boardLogo: {
          path: "https://logivn.com/favicon.ico",
          width: 32,
          height: 32
        }
      }
    }
  });

  app.use(basePath, requireBullBoardAuth({ username, password }), queueDashboardSecurityHeaders, serverAdapter.getRouter());
  logger.info({ basePath }, "Bull Board queue dashboard mounted");
}

function requireBullBoardAuth({ username, password }) {
  return (req, res, next) => {
    const authorization = req.header("authorization") || "";
    if (!authorization.startsWith("Basic ")) return requestBasicAuth(res);

    const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) return requestBasicAuth(res);

    const providedUsername = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);
    if (secureEqual(providedUsername, username) && secureEqual(providedPassword, password)) return next();

    return requestBasicAuth(res);
  };
}

function requestBasicAuth(res) {
  res.setHeader("WWW-Authenticate", 'Basic realm="LogiVN queues", charset="UTF-8"');
  return res.status(401).send("authentication_required");
}

function queueDashboardSecurityHeaders(_req, res, next) {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "font-src 'self' https://fonts.gstatic.com data:",
      "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://logivn.com",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'"
    ].join("; ")
  );
  next();
}

function secureEqual(left, right) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function normalizeBasePath(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function alertmanagerToPlatformAlert(payload) {
  const alerts = payload.alerts || [];
  const first = alerts[0];
  const activeAlerts = alerts.filter((alert) => alert.status !== "resolved");
  const alertCount = alerts.length;
  const severity = normalizeAlertSeverity(first?.labels?.severity);
  const title = first?.annotations?.summary || first?.labels?.alertname || `Alertmanager ${payload.status || "notification"}`;
  const summary = summarizeAlertmanagerPayload(payload, activeAlerts.length || alertCount);
  const eventSeed = `${payload.status || "unknown"}:${payload.receiver || "default"}:${alerts
    .map((alert) => alert.labels?.alertname || alert.annotations?.summary || alert.status || "alert")
    .join(",")}`;

  return {
    type: "platform.alert",
    tenantId: "platform",
    eventId: `alertmanager:${createHash("sha256").update(eventSeed).digest("hex").slice(0, 24)}:${Date.now()}`,
    occurredAt: new Date().toISOString(),
    source: "system",
    alert: {
      severity,
      title: truncateText(title, 160),
      summary: truncateText(summary, 900),
      area: inferAlertArea(first?.labels?.alertname, first?.annotations?.summary)
    }
  };
}

function normalizeAlertSeverity(severity) {
  if (severity === "critical") return "critical";
  if (severity === "warning" || severity === "warn") return "warning";
  return "info";
}

function summarizeAlertmanagerPayload(payload, count) {
  const lines = [`Status: ${payload.status || "unknown"}`, `Receiver: ${payload.receiver || "default"}`, `Alerts: ${count}`];
  for (const alert of (payload.alerts || []).slice(0, 4)) {
    const name = alert.labels?.alertname || "unnamed";
    const summary = alert.annotations?.summary || alert.annotations?.description || alert.status || "no summary";
    lines.push(`- ${name}: ${summary}`);
  }
  return lines.join("\n");
}

function inferAlertArea(alertName = "", summary = "") {
  const text = `${alertName} ${summary}`.toLowerCase();
  if (text.includes("redis") || text.includes("queue") || text.includes("bull")) return "queue";
  if (text.includes("postgres") || text.includes("database") || text.includes("supabase")) return "database";
  if (text.includes("telegram")) return "telegram";
  if (text.includes("api") || text.includes("gateway")) return "api";
  if (text.includes("web") || text.includes("vercel")) return "web";
  if (text.includes("billing") || text.includes("payment")) return "billing";
  if (text.includes("ai") || text.includes("openai") || text.includes("qwen")) return "ai";
  if (text.includes("security") || text.includes("auth")) return "security";
  return "other";
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

async function forwardAlertmanagerPayload(payload) {
  const forwardUrl = readEnv("ALERT_WEBHOOK_FORWARD_URL");
  if (!forwardUrl) return;

  const headers = { "content-type": "application/json" };
  const token = readEnv("ALERT_WEBHOOK_FORWARD_TOKEN");
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(forwardUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000)
  }).catch((error) => {
    logger.error({ error }, "alert forward failed");
    return null;
  });

  if (response && !response.ok) {
    logger.error({ status: response.status }, "alert forward rejected");
  }
}
