import { Worker } from "bullmq";
import type { Job } from "bullmq";
import type { NextFunction, Request, Response } from "express";
import { Bot, GrammyError, HttpError, InlineKeyboard, webhookCallback } from "grammy";
import type { Context } from "grammy";
import { z } from "zod";
import { enqueueDeadLetterJob, queueDefinition, queueSummary } from "../shared/queues.js";
import { bullMqPrefix, queueConcurrency, queueNames, readEnv, requiredEnv, servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { createCounter } from "../shared/metrics.js";
import { checkRedisRateLimit } from "../shared/rate-limit.js";
import { createRedisConnection } from "../shared/redis.js";
import { tenantRateLimitKey } from "../shared/redis-keys.js";
import {
  claimPlatformConnectionToken,
  claimPlatformSession,
  connectPlatformTelegramAccount,
  createPlatformSession,
  getPlatformAlertRecipients,
  getPlatformConnectionRecentAudit,
  getPlatformConnectionForTelegramUser,
  hasPlatformScope,
  recordPlatformTelegramAudit,
  revokePlatformConnectionById,
  touchPlatformConnection
} from "./repository.mjs";
import { platformTelegramJobSchema, type PlatformAlertJob, type PlatformTelegramConnection } from "./types.mjs";

const PLATFORM_TELEGRAM_QUEUE = "platform.telegram.notifications";
const PLATFORM_CALLBACK_PREFIX = "p:";
const PLATFORM_MENU_ACTIONS = ["menu", "health", "queues", "webhook", "incidents", "security", "disconnect", "disconnect.confirm", "help"] as const;
type PlatformMenuAction = (typeof PLATFORM_MENU_ACTIONS)[number];

const logger = createLogger("platform-telegram-bot");
const queueConfig = queueDefinition(PLATFORM_TELEGRAM_QUEUE);
const botToken = readEnv("PLATFORM_TELEGRAM_BOT_TOKEN");
const webhookSecret = readEnv("PLATFORM_TELEGRAM_WEBHOOK_SECRET");
const bot = botToken ? new Bot(botToken) : null;
const redis = bot ? createRedisConnection("platform-telegram-bot") : null;
if (redis) await redis.connect();

const deliveryCounter = createCounter({
  name: "logivn_platform_telegram_deliveries_total",
  help: "Platform Telegram DevOps delivery attempts",
  labelNames: ["event_type", "status"] as const
});

const callbackCounter = createCounter({
  name: "logivn_platform_telegram_callbacks_total",
  help: "Platform Telegram DevOps callbacks",
  labelNames: ["action", "status"] as const
});

if (bot) {
  bot.command("start", async (ctx) => {
    await handleStart(ctx, typeof ctx.match === "string" ? ctx.match.trim() : "");
  });
  bot.command("menu", (ctx) => replyWithPlatformMenu(ctx));
  bot.command("health", (ctx) => replyWithHealth(ctx));
  bot.command("queues", (ctx) => replyWithQueues(ctx));
  bot.command("webhook", (ctx) => replyWithWebhook(ctx));
  bot.command("incidents", (ctx) => replyWithIncidents(ctx));
  bot.command("whoami", (ctx) => replyWithWhoami(ctx));
  bot.command("security", (ctx) => replyWithSecurity(ctx));
  bot.command("disconnect", (ctx) => replyWithDisconnectPrompt(ctx));
  bot.command("help", replyWithHelp);

  bot.on("callback_query:data", async (ctx) => {
    let action = "unknown";
    try {
      if (!ctx.from) throw new Error("telegram_user_missing");
      if (await isPlatformUserRateLimited("callback", ctx.from.id)) throw new Error("platform_rate_limited");
      if (!ctx.callbackQuery.data.startsWith(PLATFORM_CALLBACK_PREFIX)) throw new Error("platform_callback_invalid");
      const claimed = await claimPlatformSession(ctx.callbackQuery.data.slice(PLATFORM_CALLBACK_PREFIX.length), ctx.from.id);
      action = claimed.session.action;
      await ctx.answerCallbackQuery({ text: "Đang xử lý..." });
      await handlePlatformMenuAction(ctx, action as PlatformMenuAction, claimed.connection);
      callbackCounter.inc({ action, status: "accepted" });
    } catch (error) {
      callbackCounter.inc({ action, status: "failed" });
      logger.warn({ error: safeLogError(error) }, "platform telegram callback rejected");
      await ctx.answerCallbackQuery({ text: friendlyPlatformError(error), show_alert: true });
    }
  });

  bot.catch((error) => {
    logger.error({ error: safeLogError(error.error), updateId: error.ctx.update.update_id }, "platform telegram update failed");
  });
}

let worker: Worker | null = null;
if (bot && redis) {
  worker = new Worker(
    PLATFORM_TELEGRAM_QUEUE,
    async (job: Job) => processPlatformTelegramJob(job),
    {
      connection: redis,
      prefix: bullMqPrefix(),
      name: `${readEnv("HOSTNAME", "logivn")}:${PLATFORM_TELEGRAM_QUEUE}`,
      concurrency: numberEnv("PLATFORM_TELEGRAM_WORKER_CONCURRENCY", queueConcurrency(2)),
      limiter: {
        max: numberEnv("PLATFORM_TELEGRAM_RATE_LIMIT_MAX", 12),
        duration: numberEnv("PLATFORM_TELEGRAM_RATE_LIMIT_DURATION_MS", 1000)
      },
      lockDuration: Math.max(queueConfig.timeoutMs + 15_000, 30_000),
      maxStalledCount: 1,
      removeOnComplete: { age: 86_400, count: 2000 },
      removeOnFail: { age: 604_800, count: 10_000 }
    }
  );
  worker.on("completed", (job) => logger.info({ jobId: job.id, name: job.name }, "platform telegram job completed"));
  worker.on("failed", (job, error) => {
    const attempts = Number(job?.opts.attempts ?? 1);
    const final = Boolean(job && job.attemptsMade >= attempts);
    logger.error({ jobId: job?.id, name: job?.name, attemptsMade: job?.attemptsMade, final, error: safeLogError(error) }, "platform telegram job failed");
    if (job && final) {
      enqueueDeadLetterJob({ failedQueueName: PLATFORM_TELEGRAM_QUEUE, job, error }).catch((dlqError) => {
        logger.error({ jobId: job.id, error: safeLogError(dlqError) }, "platform telegram dead-letter enqueue failed");
      });
    }
  });
  worker.on("error", (error) => logger.error({ error: safeLogError(error) }, "platform telegram worker error"));
} else {
  logger.warn("PLATFORM_TELEGRAM_BOT_TOKEN is missing; platform Telegram service is disabled");
}

const app = createHttpApp({ logger, serviceName: "platform-telegram-bot" });
if (bot && webhookSecret) {
  app.post(`/webhooks/platform-telegram/${webhookSecret}`, verifyPlatformTelegramWebhookSecret, webhookCallback(bot, "express"));
}

app.post("/webhook/set", requireInternalApiKey, async (_req, res, next) => {
  try {
    if (!bot || !webhookSecret) return res.status(503).json({ ok: false, error: "platform_telegram_not_configured" });
    const webhookUrl = requiredEnv("PLATFORM_TELEGRAM_WEBHOOK_URL");
    await bot.api.setWebhook(webhookUrl, {
      secret_token: webhookSecret,
      allowed_updates: ["message", "callback_query"]
    });
    await configurePlatformCommands();
    res.json({ ok: true, configured: true });
  } catch (error) {
    next(error);
  }
});

app.get("/ready", async (_req, res) => {
  const configured = Boolean(bot && webhookSecret);
  const workerRunning = worker?.isRunning() ?? false;
  const ready = configured && workerRunning;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    configured,
    queue: PLATFORM_TELEGRAM_QUEUE,
    worker: { running: workerRunning, concurrency: numberEnv("PLATFORM_TELEGRAM_WORKER_CONCURRENCY", 2) }
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: safeLogError(error) }, "platform telegram service request failed");
  res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "platform_telegram_request_failed" });
});

process.once("SIGTERM", async () => {
  await worker?.close();
  await redis?.quit();
});
process.once("SIGINT", async () => {
  await worker?.close();
  await redis?.quit();
});

listen(app, servicePort(3650), logger);

async function processPlatformTelegramJob(job: Job) {
  const parsed = platformTelegramJobSchema.parse(job.data);
  if (parsed.type === "platform.alert") return deliverPlatformAlert(parsed);
  return { delivered: false, skipped: 1 };
}

async function deliverPlatformAlert(event: PlatformAlertJob) {
  const recipients = await getPlatformAlertRecipients(scopeForAlert(event));
  const text = formatPlatformAlert(event);
  let sent = 0;
  for (const recipient of recipients) {
    await sendPlatformMessage(recipient.telegram_chat_id, text, {
      parse_mode: "HTML",
      reply_markup: await platformIncidentKeyboard(recipient)
    });
    await recordPlatformTelegramAudit({
      connection: recipient,
      action: event.type,
      outcome: "sent",
      targetType: "platform_alert",
      targetId: event.eventId,
      metadata: { severity: event.alert.severity, area: event.alert.area ?? null }
    });
    sent += 1;
    deliveryCounter.inc({ event_type: event.type, status: "sent" });
    await delay(numberEnv("PLATFORM_TELEGRAM_SEND_INTERVAL_MS", 100));
  }
  if (sent === 0) deliveryCounter.inc({ event_type: event.type, status: "skipped" });
  return { delivered: sent > 0, sent, recipients: recipients.length };
}

async function handleStart(ctx: Context, token: string) {
  if (!ctx.from || !ctx.chat) {
    await ctx.reply("Không xác định được tài khoản Telegram.");
    return;
  }
  if (await isPlatformUserRateLimited("connect", ctx.from.id)) {
    await ctx.reply("Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ít phút.");
    return;
  }

  if (token) {
    try {
      const connection = await claimPlatformConnectionToken(token, {
        telegramUserId: ctx.from.id,
        chatId: ctx.chat.id,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null
      });
      await ctx.reply(`Đã kết nối LogiVN DevOps Bot cho ${connectionLabel(connection)}.`);
      await replyWithPlatformMenu(ctx, connection);
      return;
    } catch (error) {
      if (isLikelySignedConnectToken(token)) {
        logger.warn({ telegramUserId: ctx.from.id, error: safeLogError(error) }, "platform connect token rejected");
        await ctx.reply("Link kết nối DevOps đã hết hạn hoặc đã được dùng. Vui lòng tạo link mới trong admin.logivn.com/ops.");
        return;
      }
    }
  }

  const existing = await getPlatformConnectionForTelegramUser(ctx.from.id);
  if (existing) {
    await touchPlatformConnection(existing).catch(() => undefined);
    await replyWithPlatformMenu(ctx, existing);
    return;
  }

  if (!isBootstrapAllowed(ctx.from.id, token)) {
    await recordPlatformTelegramAudit({ telegramUserId: ctx.from.id, action: "platform.telegram.connect", outcome: "denied" });
    await ctx.reply("Tài khoản này chưa được cấp quyền DevOps Bot. Hãy tạo link kết nối trong admin.logivn.com/ops.");
    return;
  }

  const connection = await connectPlatformTelegramAccount({
    telegramUserId: ctx.from.id,
    chatId: ctx.chat.id,
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name ?? null,
    lastName: ctx.from.last_name ?? null
  });
  await ctx.reply(`Đã kết nối LogiVN DevOps Bot cho ${connectionLabel(connection)}.`);
  await replyWithPlatformMenu(ctx, connection);
}

async function replyWithPlatformMenu(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = preferredConnection ?? (await connectionForContext(ctx));
  if (!connection) {
    await ctx.reply("DevOps Bot chưa kết nối. Hãy tạo link trong admin.logivn.com/ops rồi mở lại Telegram.");
    return;
  }
  const keyboard = new InlineKeyboard()
    .text("Health", await signedPlatformCallback(connection, "health"))
    .text("Queues", await signedPlatformCallback(connection, "queues"))
    .row()
    .text("Webhook", await signedPlatformCallback(connection, "webhook"))
    .text("Incidents", await signedPlatformCallback(connection, "incidents"))
    .row()
    .text("Security", await signedPlatformCallback(connection, "security"))
    .text("Disconnect", await signedPlatformCallback(connection, "disconnect"))
    .row()
    .url("Grafana", readEnv("PLATFORM_GRAFANA_URL", "https://monitor.logivn.com/grafana/"))
    .url("Bull Board", readEnv("PLATFORM_BULL_BOARD_URL", "https://monitor.logivn.com/queues/board/"));
  await ctx.reply(`LogiVN DevOps\n\n${connectionLabel(connection)} · ${connection.scopes.length} scopes\n\nChọn vùng cần kiểm tra.`, { reply_markup: keyboard });
}

async function replyWithHelp(ctx: Context) {
  await ctx.reply(["LogiVN DevOps Bot", "", "/menu - trung tâm DevOps", "/health - service health", "/queues - BullMQ backlog", "/webhook - webhook bot", "/incidents - incident/action gần đây", "/whoami - tài khoản và scope", "/security - audit bảo mật", "/disconnect - ngắt Telegram khỏi DevOps bot"].join("\n"));
}

async function replyWithWhoami(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const lines = [
    "Whoami · LogiVN DevOps",
    "",
    `${connectionLabel(connection)}`,
    `Telegram ID: ${connection.telegram_user_id}`,
    `Username: ${connection.telegram_username ? `@${connection.telegram_username}` : "none"}`,
    `Scopes: ${compactScopes(connection.scopes)}`
  ];
  const keyboard = new InlineKeyboard().text("Security", await signedPlatformCallback(connection, "security")).text("Menu", await signedPlatformCallback(connection, "menu"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithHealth(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const checks = await Promise.all(serviceChecks().map(checkService));
  const lines = ["Health · LogiVN VPS", "", ...checks.map((item) => `${item.ok ? "OK" : "FAIL"} ${item.name} · ${item.ms}ms`)];
  const keyboard = new InlineKeyboard().text("Refresh", await signedPlatformCallback(connection, "health")).text("Queues", await signedPlatformCallback(connection, "queues"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithQueues(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "queues.read");
  if (!connection) return;
  const summary = await queueSummary({ includeDeadLetters: true });
  const rows = Object.entries(summary)
    .map(([name, counts]: [string, any]) => ({ name, backlog: Number(counts.waiting ?? 0) + Number(counts.active ?? 0) + Number(counts.delayed ?? 0) + Number(counts.paused ?? 0), failed: Number(counts.failed ?? 0) }))
    .filter((row) => row.backlog > 0 || row.failed > 0 || row.name === PLATFORM_TELEGRAM_QUEUE)
    .sort((a, b) => b.failed - a.failed || b.backlog - a.backlog)
    .slice(0, 10);
  const lines = ["Queues · BullMQ", "", ...(rows.length ? rows.map((row) => `- ${row.name}: backlog ${row.backlog}, failed ${row.failed}`) : ["Không có backlog nổi bật."])];
  const keyboard = new InlineKeyboard().text("Refresh", await signedPlatformCallback(connection, "queues")).text("Health", await signedPlatformCallback(connection, "health"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithWebhook(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection || !bot) return;
  const info = await bot.api.getWebhookInfo();
  const lines = [
    "Webhook · DevOps Bot",
    "",
    `URL: ${info.url ? "configured" : "missing"}`,
    `Pending: ${info.pending_update_count}`,
    `Last error: ${info.last_error_message ?? "none"}`
  ];
  const keyboard = new InlineKeyboard().text("Refresh", await signedPlatformCallback(connection, "webhook"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithIncidents(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "incidents.read");
  if (!connection) return;
  const summary = await queueSummary({ includeDeadLetters: true });
  const failed = Object.entries(summary)
    .map(([name, counts]: [string, any]) => ({ name, failed: Number(counts.failed ?? 0) }))
    .filter((row) => row.failed > 0)
    .sort((a, b) => b.failed - a.failed)
    .slice(0, 8);
  const lines = ["Incidents · Queue/DLQ", "", ...(failed.length ? failed.map((row) => `- ${row.name}: ${row.failed} failed`) : ["Không có failed queue nổi bật."])];
  const keyboard = new InlineKeyboard().text("Refresh", await signedPlatformCallback(connection, "incidents")).text("Queues", await signedPlatformCallback(connection, "queues"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithSecurity(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const audit = await getPlatformConnectionRecentAudit(connection, 5);
  const lines = [
    "Security · DevOps Bot",
    "",
    `${connectionLabel(connection)}`,
    `Scopes: ${compactScopes(connection.scopes)}`,
    "",
    ...(audit.length ? audit.map((item) => `- ${item.outcome} · ${item.action} · ${formatShortDate(item.createdAt)}`) : ["Chưa có audit gần đây."])
  ];
  const keyboard = new InlineKeyboard()
    .text("Refresh", await signedPlatformCallback(connection, "security"))
    .text("Disconnect", await signedPlatformCallback(connection, "disconnect"))
    .row()
    .text("Menu", await signedPlatformCallback(connection, "menu"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithDisconnectPrompt(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const keyboard = new InlineKeyboard()
    .text("Ngắt kết nối", await signedPlatformCallback(connection, "disconnect.confirm"))
    .text("Giữ lại", await signedPlatformCallback(connection, "menu"));
  await ctx.reply("Ngắt tài khoản Telegram này khỏi LogiVN DevOps Bot? Sau đó cần tạo link mới từ admin.logivn.com/ops để kết nối lại.", { reply_markup: keyboard });
}

async function confirmDisconnect(ctx: Context, connection: PlatformTelegramConnection) {
  await revokePlatformConnectionById(connection);
  await ctx.reply("Đã ngắt kết nối DevOps Bot cho tài khoản Telegram này. Tạo link mới trong admin.logivn.com/ops nếu cần kết nối lại.");
}

async function handlePlatformMenuAction(ctx: Context, action: PlatformMenuAction, connection: PlatformTelegramConnection) {
  if (action === "menu") return replyWithPlatformMenu(ctx, connection);
  if (action === "health") return replyWithHealth(ctx, connection);
  if (action === "queues") return replyWithQueues(ctx, connection);
  if (action === "webhook") return replyWithWebhook(ctx, connection);
  if (action === "incidents") return replyWithIncidents(ctx, connection);
  if (action === "security") return replyWithSecurity(ctx, connection);
  if (action === "disconnect") return replyWithDisconnectPrompt(ctx, connection);
  if (action === "disconnect.confirm") return confirmDisconnect(ctx, connection);
  return replyWithHelp(ctx);
}

async function requireConnection(ctx: Context, preferredConnection: PlatformTelegramConnection | undefined, scope: string) {
  const connection = preferredConnection ?? (await connectionForContext(ctx));
  if (!connection) {
    await ctx.reply("DevOps Bot chưa kết nối hoặc đã bị thu hồi quyền.");
    return null;
  }
  if (!hasPlatformScope(connection, scope)) {
    await recordPlatformTelegramAudit({ connection, action: `platform.scope.${scope}`, outcome: "denied" });
    await ctx.reply("Bạn chưa có scope cho thao tác DevOps này.");
    return null;
  }
  await touchPlatformConnection(connection).catch(() => undefined);
  return connection;
}

async function connectionForContext(ctx: Context) {
  return ctx.from ? getPlatformConnectionForTelegramUser(ctx.from.id) : null;
}

async function signedPlatformCallback(connection: PlatformTelegramConnection, action: PlatformMenuAction) {
  const token = await createPlatformSession({ connection, action, ttlSeconds: numberEnv("PLATFORM_TELEGRAM_SESSION_TTL_SECONDS", 300) });
  return `${PLATFORM_CALLBACK_PREFIX}${token}`;
}

async function platformIncidentKeyboard(connection: PlatformTelegramConnection) {
  return new InlineKeyboard()
    .text("Health", await signedPlatformCallback(connection, "health"))
    .text("Queues", await signedPlatformCallback(connection, "queues"));
}

async function configurePlatformCommands() {
  if (!bot) return;
  await bot.api.setMyCommands([
    { command: "menu", description: "Mở DevOps center" },
    { command: "health", description: "Kiểm tra service health" },
    { command: "queues", description: "Kiểm tra queue/DLQ" },
    { command: "webhook", description: "Kiểm tra webhook bot" },
    { command: "incidents", description: "Xem sự cố queue/infra" },
    { command: "whoami", description: "Xem tài khoản và scope" },
    { command: "security", description: "Xem audit bảo mật" },
    { command: "disconnect", description: "Ngắt tài khoản DevOps" },
    { command: "help", description: "Hướng dẫn DevOps Bot" }
  ]);
}

function formatPlatformAlert(event: PlatformAlertJob) {
  const area = event.alert.area ? ` · ${escapeHtml(event.alert.area)}` : "";
  const summary = event.alert.summary ? `\n${escapeHtml(event.alert.summary)}` : "";
  return `${alertIcon(event.alert.severity)} <b>${escapeHtml(event.alert.title)}</b>\n${event.alert.severity.toUpperCase()}${area}${summary}`;
}

function serviceChecks() {
  return [
    { name: "gateway", url: readEnv("LOGIVN_API_INTERNAL_URL", "http://gateway:3100") + "/health" },
    { name: "socket", url: readEnv("PLATFORM_SOCKET_HEALTH_URL", "http://socket:3200/health") },
    { name: "ai-service", url: readEnv("PLATFORM_AI_HEALTH_URL", "http://ai-service:3300/health") },
    { name: "image-service", url: readEnv("PLATFORM_IMAGE_HEALTH_URL", "http://image-service:3400/health") },
    { name: "worker", url: readEnv("PLATFORM_WORKER_HEALTH_URL", "http://worker:3500/health") },
    { name: "tenant-telegram", url: readEnv("PLATFORM_TENANT_TELEGRAM_HEALTH_URL", "http://telegram-bot:3600/health") }
  ];
}

async function checkService(input: { name: string; url: string }) {
  const startedAt = Date.now();
  try {
    const response = await fetch(input.url, { signal: AbortSignal.timeout(2500) });
    return { name: input.name, ok: response.ok, ms: Date.now() - startedAt };
  } catch {
    return { name: input.name, ok: false, ms: Date.now() - startedAt };
  }
}

function isBootstrapAllowed(telegramUserId: number, token: string) {
  const allowedIds = readEnv("PLATFORM_TELEGRAM_ALLOWED_USER_IDS")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  if (allowedIds.includes(telegramUserId)) return true;
  const expected = readEnv("PLATFORM_TELEGRAM_BOOTSTRAP_TOKEN");
  return Boolean(expected && token && token === expected);
}

function isLikelySignedConnectToken(token: string) {
  return /^lg1_[A-Za-z0-9_-]{32,44}$/.test(token) || /^lg1_[A-Za-z0-9_-]{20,32}\.[A-Za-z0-9_-]{8,24}$/.test(token);
}

async function isPlatformUserRateLimited(scope: string, telegramUserId: number) {
  if (!redis) return false;
  const result = await checkRedisRateLimit(redis, {
    key: tenantRateLimitKey("platform", `telegram:${scope}`, String(telegramUserId)),
    limit: numberEnv(`PLATFORM_TELEGRAM_${scope.toUpperCase()}_RATE_LIMIT_MAX`, scope === "callback" ? 20 : 8),
    windowMs: numberEnv(`PLATFORM_TELEGRAM_${scope.toUpperCase()}_RATE_LIMIT_WINDOW_MS`, 60_000)
  });
  return !result.allowed;
}

async function sendPlatformMessage(chatId: string | number, text: string, options: Parameters<Bot["api"]["sendMessage"]>[2]) {
  if (!bot) throw new Error("platform_telegram_not_configured");
  return bot.api.sendMessage(chatId, text, options);
}

function verifyPlatformTelegramWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("x-telegram-bot-api-secret-token");
  if (!webhookSecret || provided !== webhookSecret) return res.status(401).json({ ok: false, error: "invalid_platform_telegram_webhook_secret" });
  return next();
}

function scopeForAlert(event: PlatformAlertJob) {
  if (event.alert.severity === "critical") return "incidents.read";
  return "incidents.read";
}

function connectionLabel(connection: PlatformTelegramConnection) {
  return `${connection.display_name ?? connection.telegram_username ?? connection.telegram_user_id} · ${connection.role}`;
}

function compactScopes(scopes: string[]) {
  if (!scopes.length) return "none";
  if (scopes.includes("platform.admin")) return "platform.admin";
  return scopes.slice(0, 5).join(", ") + (scopes.length > 5 ? ` +${scopes.length - 5}` : "");
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().slice(5, 16).replace("T", " ");
}

function alertIcon(severity: string) {
  if (severity === "critical") return "🚨";
  if (severity === "warning") return "⚠️";
  return "ℹ️";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function friendlyPlatformError(error: unknown) {
  const message = error instanceof Error ? error.message : "platform_callback_failed";
  if (message.includes("rate_limited")) return "Bạn thao tác quá nhanh.";
  if (message.includes("expired")) return "Nút này đã hết hạn.";
  if (message.includes("authorized")) return "Tài khoản chưa được cấp quyền DevOps Bot.";
  if (message.includes("scope")) return "Bạn chưa có scope cho thao tác này.";
  return "Không thể thực hiện thao tác DevOps.";
}

function safeLogError(error: unknown): Record<string, unknown> {
  if (error instanceof GrammyError) return { name: error.name, message: error.message, errorCode: error.error_code, description: error.description };
  if (error instanceof HttpError) return { name: error.name, message: error.message };
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "NonError", message: typeof error === "string" ? error : "unknown_error" };
}

function numberEnv(name: string, fallback: number) {
  const parsed = Number(readEnv(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
