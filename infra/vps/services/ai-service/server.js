import { z } from "zod";
import { servicePort } from "../shared/env.js";
import { chatWithFallback } from "../shared/ai-providers.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { enqueueJob } from "../shared/queues.js";

const logger = createLogger("ai-service");
const app = createHttpApp({ logger, serviceName: "ai-service" });

const chatSchema = z.object({
  provider: z.enum(["openai", "xai", "qwen", "claude"]).optional(),
  model: z.string().optional(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string().min(1)
    })
  ),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional()
});

const asyncJobSchema = chatSchema.extend({
  tenantId: z.string().optional(),
  jobType: z.enum(["logibot", "analytics", "menu_generation", "assistant", "staff_support"]).default("assistant")
});

app.post("/chat", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = chatSchema.parse(req.body);
    const result = await chatWithFallback(payload, logger);
    res.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});

app.post("/jobs", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = asyncJobSchema.parse(req.body);
    const job = await enqueueJob({
      queueName: "ai-jobs",
      name: payload.jobType,
      data: payload
    });
    res.status(202).json({ ok: true, jobId: job.id });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  logger.error({ error }, "ai-service request failed");
  res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "ai_request_failed" });
});

listen(app, servicePort(3300), logger);
