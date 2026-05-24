import { z } from "zod";
import { readEnv, servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { enqueueJob, queueSummary } from "../shared/queues.js";
import { hasSupabaseConfig, supabaseAdmin } from "../shared/supabase.js";

const logger = createLogger("gateway");
const app = createHttpApp({ logger, serviceName: "gateway" });

const enqueueSchema = z.object({
  queueName: z.enum([
    "notifications",
    "invoices",
    "ai-jobs",
    "image-optimization",
    "analytics",
    "delivery-routing",
    "cron-tasks"
  ]),
  name: z.string().min(1).max(120),
  data: z.record(z.string(), z.unknown()).default({}),
  opts: z.record(z.string(), z.unknown()).optional()
});

app.get("/ready", async (_req, res) => {
  const checks = {
    supabaseConfigured: hasSupabaseConfig(),
    supabaseReachable: false
  };

  if (checks.supabaseConfigured) {
    const { error } = await supabaseAdmin().from("restaurants").select("id", { count: "exact", head: true }).limit(1);
    checks.supabaseReachable = !error;
    if (error) logger.warn({ error }, "Supabase readiness probe failed");
  }

  res.status(checks.supabaseConfigured && checks.supabaseReachable ? 200 : 503).json({
    ok: checks.supabaseConfigured && checks.supabaseReachable,
    checks
  });
});

app.get("/queues", requireInternalApiKey, async (_req, res, next) => {
  try {
    res.json({ ok: true, queues: await queueSummary() });
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
