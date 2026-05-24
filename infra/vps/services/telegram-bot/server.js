import { z } from "zod";
import { readEnv, servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("telegram-bot");
const app = createHttpApp({ logger, serviceName: "telegram-bot" });

const messageSchema = z.object({
  chatId: z.string().min(1),
  text: z.string().min(1).max(4096),
  parseMode: z.enum(["MarkdownV2", "HTML"]).optional()
});

async function telegram(method, body) {
  const token = readEnv("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.description || `Telegram API failed with HTTP ${response.status}`);
  }

  return json.result;
}

app.post("/messages", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = messageSchema.parse(req.body);
    const result = await telegram("sendMessage", {
      chat_id: payload.chatId,
      text: payload.text,
      parse_mode: payload.parseMode
    });
    res.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  logger.error({ error }, "telegram request failed");
  res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "telegram_request_failed" });
});

listen(app, servicePort(3600), logger);
