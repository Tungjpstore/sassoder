import { createHash, timingSafeEqual } from "node:crypto";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import type { NextFunction, Request, Response } from "express";
import { Bot, GrammyError, HttpError, InlineKeyboard, webhookCallback } from "grammy";
import type { Context } from "grammy";
import { z } from "zod";
import { enqueueDeadLetterJob, failedJobs, queueDefinition, queueSummary, retryFailedJob } from "../shared/queues.js";
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
  confirmPlatformSubscriptionPayment,
  createPlatformSession,
  getPlatformBackupSnapshot,
  getPendingSubscriptionPayment,
  getPlatformAlertRecipients,
  getPlatformConnectionRecentAudit,
  getPlatformConnectionForTelegramUser,
  getPlatformTenantAction,
  hasPlatformScope,
  listPendingSubscriptionPayments,
  listPlatformTenantActions,
  queuePlatformManualBackup,
  recordPlatformTelegramAudit,
  rejectPlatformSubscriptionPayment,
  revokePlatformConnectionById,
  touchPlatformConnection,
  updatePlatformTenantStatusFromTelegram,
  type PlatformBackupQueuedJob,
  type PlatformBackupSnapshot,
  type PlatformSubscriptionPayment,
  type PlatformTenantAction
} from "./repository.mjs";
import { platformTelegramJobSchema, type PlatformAlertJob, type PlatformTelegramConnection } from "./types.mjs";

const PLATFORM_TELEGRAM_QUEUE = "platform.telegram.notifications";
const PLATFORM_CALLBACK_PREFIX = "p:";
const BASE_QUEUE_NAMES = queueNames as string[];
const QUEUE_CONTROL_NAMES = new Set<string>([...BASE_QUEUE_NAMES, ...BASE_QUEUE_NAMES.map((name) => `${name}.dlq`)]);
const PLATFORM_MENU_ACTIONS = [
  "menu",
  "payments",
  "payment.confirm.prompt",
  "payment.confirm",
  "payment.reject.prompt",
  "payment.reject",
  "tenants",
  "tenant.suspend.prompt",
  "tenant.suspend",
  "tenant.restore.prompt",
  "tenant.restore",
  "tenant.delete.prompt",
  "tenant.delete",
  "health",
  "backup",
  "backup.detail",
  "backup.run.prompt",
  "backup.run",
  "queues",
  "queue.failed",
  "queue.retry.prompt",
  "queue.retry",
  "webhook",
  "incidents",
  "security",
  "disconnect",
  "disconnect.confirm",
  "help"
] as const;
type PlatformMenuAction = (typeof PLATFORM_MENU_ACTIONS)[number];

type QueueAttentionRow = {
  name: string;
  backlog: number;
  failed: number;
  paused: number;
};

type QueueFailedJobView = {
  id?: string | number | null;
  name?: string | null;
  state?: string | null;
  attemptsMade?: number | null;
  failedReason?: string | null;
  timestamp?: number | null;
  processedOn?: number | null;
  finishedOn?: number | null;
  data?: Record<string, unknown> | null;
};

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
  bot.command("payments", (ctx) => replyWithPayments(ctx));
  bot.command("tenants", (ctx) => replyWithTenants(ctx));
  bot.command("health", (ctx) => replyWithHealth(ctx));
  bot.command("backup", (ctx) => replyWithBackup(ctx));
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
      await handlePlatformMenuAction(ctx, action as PlatformMenuAction, claimed.connection, claimed.session.payload);
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

  configurePlatformCommands().catch((error) => {
    logger.warn({ error: safeLogError(error) }, "platform telegram command sync failed");
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
    await ctx.reply("Không xác định được tài khoản Telegram.", { reply_markup: new InlineKeyboard().url("Mở Admin Ops", platformAdminUrl("/ops")) });
    return;
  }
  if (await isPlatformUserRateLimited("connect", ctx.from.id)) {
    await ctx.reply("Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ít phút.", { reply_markup: new InlineKeyboard().url("Mở Admin Ops", platformAdminUrl("/ops")) });
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
        await ctx.reply("Link kết nối DevOps không còn hiệu lực hoặc đã được dùng.", { reply_markup: new InlineKeyboard().url("Tạo link mới", platformAdminUrl("/ops")) });
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
    await ctx.reply("Tài khoản này chưa được cấp quyền DevOps Bot.", { reply_markup: new InlineKeyboard().url("Tạo link kết nối", platformAdminUrl("/ops")) });
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
    await replyWithConnectAction(ctx);
    return;
  }
  const keyboard = new InlineKeyboard()
    .text("Duyệt gói", await signedPlatformCallback(connection, "payments"))
    .text("Quản lý quán", await signedPlatformCallback(connection, "tenants"))
    .row()
    .text("Sức khỏe", await signedPlatformCallback(connection, "health"))
    .text("Backup", await signedPlatformCallback(connection, "backup"))
    .row()
    .text("Hàng đợi", await signedPlatformCallback(connection, "queues"))
    .text("Sự cố", await signedPlatformCallback(connection, "incidents"))
    .row()
    .text("Webhook", await signedPlatformCallback(connection, "webhook"))
    .text("Bảo mật", await signedPlatformCallback(connection, "security"))
    .row()
    .text("Ngắt", await signedPlatformCallback(connection, "disconnect"))
    .row()
    .url("Admin Ops", platformAdminUrl("/ops"))
    .url("Thêm quán", appUrl("/dashboard/register?source=devops_bot"))
    .row()
    .url("Grafana", readEnv("PLATFORM_GRAFANA_URL", "https://monitor.logivn.com/grafana/"))
    .url("Bull Board", readEnv("PLATFORM_BULL_BOARD_URL", "https://monitor.logivn.com/queues/board/"));
  const [pendingPayments, tenantActions, queueRows] = await Promise.all([
    listPendingSubscriptionPayments(6).catch(() => []),
    listPlatformTenantActions(6).catch(() => []),
    queueSummary({ includeDeadLetters: true }).then(queueAttentionRows).catch(() => [] as QueueAttentionRow[])
  ]);
  const queueFailures = queueRows.reduce((sum, row) => sum + row.failed, 0);
  await ctx.reply([
    "LogiVN DevOps",
    "",
    `Bạn: ${connectionLabel(connection)}`,
    `Việc mở: ${countLabel(pendingPayments.length, 6)} gói · ${countLabel(tenantActions.length, 6)} quán · ${queueFailures} queue lỗi`,
    `Ưu tiên: ${platformMenuPriority(pendingPayments[0], tenantActions[0])}`,
    "",
    "Chọn nút để xử lý ngay."
  ].join("\n"), { reply_markup: keyboard });
}

async function replyWithHelp(ctx: Context) {
  const connection = await connectionForContext(ctx);
  const keyboard = connection
    ? new InlineKeyboard()
        .text("Mở menu", await signedPlatformCallback(connection, "menu"))
        .text("Duyệt gói", await signedPlatformCallback(connection, "payments"))
        .row()
        .text("Quản lý quán", await signedPlatformCallback(connection, "tenants"))
        .text("Backup", await signedPlatformCallback(connection, "backup"))
        .row()
        .text("Sự cố", await signedPlatformCallback(connection, "incidents"))
    : new InlineKeyboard().url("Admin Ops", platformAdminUrl("/ops"));
  await ctx.reply(["LogiVN DevOps Bot", "", "/menu - trung tâm thao tác", "/payments - duyệt gói chủ quán", "/tenants - tạm dừng, mở lại, xóa mềm quán", "/health - kiểm tra hệ thống", "/backup - xem và chạy backup", "/queues - việc lỗi cần xử lý", "/webhook - kiểm tra bot", "/security - audit và quyền", "/disconnect - ngắt tài khoản"].join("\n"), { reply_markup: keyboard });
}

async function replyWithWhoami(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const lines = [
    "Tài khoản DevOps",
    "",
    `${connectionLabel(connection)}`,
    `Telegram ID: ${connection.telegram_user_id}`,
    `Username: ${connection.telegram_username ? `@${connection.telegram_username}` : "none"}`,
    `Quyền: ${compactScopes(connection.scopes)}`
  ];
  const keyboard = new InlineKeyboard().text("Bảo mật", await signedPlatformCallback(connection, "security")).text("Menu", await signedPlatformCallback(connection, "menu"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithPayments(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "billing.approve");
  if (!connection) return;
  const payments = await listPendingSubscriptionPayments(6);
  const keyboard = new InlineKeyboard();

  for (const [index, payment] of payments.slice(0, 4).entries()) {
    keyboard
      .text(`Duyệt #${index + 1}`, await signedPlatformCallback(connection, "payment.confirm.prompt", { paymentId: payment.id }))
      .text(`Từ chối #${index + 1}`, await signedPlatformCallback(connection, "payment.reject.prompt", { paymentId: payment.id }))
      .row();
  }

  keyboard
    .text("Làm mới", await signedPlatformCallback(connection, "payments"))
    .text("Quản lý quán", await signedPlatformCallback(connection, "tenants"))
    .row()
    .url("Mở thu phí", platformAdminUrl("/payments"));

  const lines = [
    "Duyệt gói",
    "",
    payments.length ? `${countLabel(payments.length, 6)} giao dịch cần quyết định.` : "Không có giao dịch chờ xác minh.",
    "",
    ...payments.slice(0, 5).map(formatPaymentListRow)
  ];
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithPaymentConfirmPrompt(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>) {
  const approvedConnection = await requireConnection(ctx, connection, "billing.approve");
  if (!approvedConnection) return;
  const paymentId = payloadString(payload, "paymentId");
  if (!paymentId) {
    await replyWithPaymentsReload(ctx, approvedConnection, "Thiếu giao dịch cần duyệt.");
    return;
  }
  const payment = await getPendingSubscriptionPayment(paymentId);
  if (!payment) {
    await replyWithPaymentsReload(ctx, approvedConnection, "Giao dịch không còn chờ duyệt.");
    return;
  }
  const keyboard = new InlineKeyboard()
    .text("Xác nhận duyệt", await signedPlatformCallback(approvedConnection, "payment.confirm", { paymentId }))
    .text("Hủy", await signedPlatformCallback(approvedConnection, "payments"))
    .row()
    .url("Mở thu phí", platformAdminUrl("/payments"));
  await ctx.reply(formatPaymentDecisionPrompt("Duyệt thanh toán", payment, "Sau khi duyệt: kích hoạt hoặc gia hạn gói và ghi audit."), { reply_markup: keyboard });
}

async function confirmPaymentFromTelegram(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>) {
  const approvedConnection = await requireConnection(ctx, connection, "billing.approve");
  if (!approvedConnection) return;
  const paymentId = payloadString(payload, "paymentId");
  if (!paymentId) {
    await replyWithPaymentsReload(ctx, approvedConnection, "Thiếu giao dịch cần duyệt.");
    return;
  }
  const result = await confirmPlatformSubscriptionPayment(paymentId, actorForConnection(approvedConnection));
  await recordPlatformTelegramAudit({ connection: approvedConnection, action: "platform.billing.payment.confirm", outcome: "accepted", targetType: "subscription_payment", targetId: paymentId, metadata: result });
  const keyboard = new InlineKeyboard().text("Duyệt tiếp", await signedPlatformCallback(approvedConnection, "payments")).text("Menu", await signedPlatformCallback(approvedConnection, "menu"));
  await ctx.reply(`Đã duyệt gói. Kỳ mới tới ${formatShortDate(result.currentPeriodEnd)}.`, { reply_markup: keyboard });
}

async function replyWithPaymentRejectPrompt(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>) {
  const approvedConnection = await requireConnection(ctx, connection, "billing.approve");
  if (!approvedConnection) return;
  const paymentId = payloadString(payload, "paymentId");
  if (!paymentId) {
    await replyWithPaymentsReload(ctx, approvedConnection, "Thiếu giao dịch cần từ chối.");
    return;
  }
  const payment = await getPendingSubscriptionPayment(paymentId);
  if (!payment) {
    await replyWithPaymentsReload(ctx, approvedConnection, "Giao dịch không còn chờ từ chối.");
    return;
  }
  const keyboard = new InlineKeyboard()
    .text("Xác nhận từ chối", await signedPlatformCallback(approvedConnection, "payment.reject", { paymentId }))
    .text("Hủy", await signedPlatformCallback(approvedConnection, "payments"))
    .row()
    .url("Mở thu phí", platformAdminUrl("/payments"));
  await ctx.reply(formatPaymentDecisionPrompt("Từ chối thanh toán", payment, "Lý do sẽ ghi: Không khớp giao dịch ngân hàng."), { reply_markup: keyboard });
}

async function rejectPaymentFromTelegram(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>) {
  const approvedConnection = await requireConnection(ctx, connection, "billing.approve");
  if (!approvedConnection) return;
  const paymentId = payloadString(payload, "paymentId");
  if (!paymentId) {
    await replyWithPaymentsReload(ctx, approvedConnection, "Thiếu giao dịch cần từ chối.");
    return;
  }
  const result = await rejectPlatformSubscriptionPayment(paymentId, actorForConnection(approvedConnection), "Không khớp giao dịch ngân hàng");
  await recordPlatformTelegramAudit({ connection: approvedConnection, action: "platform.billing.payment.reject", outcome: "accepted", targetType: "subscription_payment", targetId: paymentId, metadata: result });
  const keyboard = new InlineKeyboard().text("Duyệt tiếp", await signedPlatformCallback(approvedConnection, "payments")).text("Menu", await signedPlatformCallback(approvedConnection, "menu"));
  await ctx.reply("Đã từ chối giao dịch và ghi audit.", { reply_markup: keyboard });
}

async function replyWithTenants(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "tenants.read");
  if (!connection) return;
  const tenants = await listPlatformTenantActions(6);
  const canManage = hasPlatformScope(connection, "tenants.manage");
  const keyboard = new InlineKeyboard();

  for (const [index, tenant] of tenants.slice(0, 4).entries()) {
    keyboard.url(`Mở #${index + 1}`, tenantDashboardUrl(tenant.slug)).row();
    if (canManage) {
      if (tenant.platformStatus === "active") {
        keyboard
          .text(`Tạm dừng #${index + 1}`, await signedPlatformCallback(connection, "tenant.suspend.prompt", { restaurantId: tenant.id }))
          .text(`Xóa mềm #${index + 1}`, await signedPlatformCallback(connection, "tenant.delete.prompt", { restaurantId: tenant.id }))
          .row();
      } else {
        keyboard.text(`Mở lại #${index + 1}`, await signedPlatformCallback(connection, "tenant.restore.prompt", { restaurantId: tenant.id })).row();
      }
    }
  }

  keyboard
    .text("Làm mới", await signedPlatformCallback(connection, "tenants"))
    .text("Duyệt gói", await signedPlatformCallback(connection, "payments"))
    .row()
    .url("Thêm quán", appUrl("/dashboard/register?source=devops_bot"))
    .url("Mở danh sách quán", platformAdminUrl("/tenants"));

  const lines = [
    "Quản lý quán",
    "",
    tenants.length ? `${countLabel(tenants.length, 6)} quán cần quyết định hoặc theo dõi.` : "Chưa có quán cần xử lý.",
    "",
    ...tenants.slice(0, 5).map(formatTenantListRow)
  ];
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithTenantStatusPrompt(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>, status: "active" | "suspended" | "deleted") {
  const approvedConnection = await requireConnection(ctx, connection, "tenants.manage");
  if (!approvedConnection) return;
  const restaurantId = payloadString(payload, "restaurantId");
  if (!restaurantId) {
    await replyWithTenantsReload(ctx, approvedConnection, "Thiếu quán cần xử lý.");
    return;
  }
  const tenant = await getPlatformTenantAction(restaurantId);
  if (!tenant) {
    await replyWithTenantsReload(ctx, approvedConnection, "Không tìm thấy quán cần xử lý.");
    return;
  }
  const action = status === "active" ? "tenant.restore" : status === "suspended" ? "tenant.suspend" : "tenant.delete";
  const label = tenantStatusActionLabel(status);
  const keyboard = new InlineKeyboard()
    .text(`Xác nhận ${label.toLowerCase()}`, await signedPlatformCallback(approvedConnection, action, { restaurantId }))
    .text("Hủy", await signedPlatformCallback(approvedConnection, "tenants"))
    .row()
    .url("Mở quán", tenantDashboardUrl(tenant.slug));
  await ctx.reply(formatTenantDecisionPrompt(label, tenant, tenantStatusImpact(status)), { reply_markup: keyboard });
}

async function updateTenantFromTelegram(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>, status: "active" | "suspended" | "deleted") {
  const approvedConnection = await requireConnection(ctx, connection, "tenants.manage");
  if (!approvedConnection) return;
  const restaurantId = payloadString(payload, "restaurantId");
  if (!restaurantId) {
    await replyWithTenantsReload(ctx, approvedConnection, "Thiếu quán cần xử lý.");
    return;
  }
  const result = await updatePlatformTenantStatusFromTelegram({ restaurantId, status, actor: actorForConnection(approvedConnection), reason: tenantStatusReason(status) });
  await recordPlatformTelegramAudit({ connection: approvedConnection, action: `platform.tenant.${status}`, outcome: "accepted", targetType: "restaurant", targetId: restaurantId, metadata: result });
  const keyboard = new InlineKeyboard().text("Quản lý tiếp", await signedPlatformCallback(approvedConnection, "tenants")).text("Menu", await signedPlatformCallback(approvedConnection, "menu"));
  await ctx.reply(`Đã cập nhật ${result.name}: ${status}.`, { reply_markup: keyboard });
}

async function replyWithHealth(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const checks = await Promise.all(serviceChecks().map(checkService));
  const failed = checks.filter((item) => !item.ok);
  const slow = checks.filter((item) => item.ok && item.ms >= 1_500);
  const lines = [
    "Sức khỏe hệ thống",
    "",
    failed.length ? `Cần xử lý: ${failed.map((item) => item.name).join(", ")}` : `OK: ${checks.length}/${checks.length} dịch vụ phản hồi`,
    slow.length ? `Chậm: ${slow.map((item) => `${item.name} ${item.ms}ms`).join(", ")}` : "Chậm: không có",
    "",
    ...checks.map((item) => `${item.ok ? "OK" : "FAIL"} ${item.name} · ${item.ms}ms`)
  ];
  const keyboard = new InlineKeyboard()
    .text("Làm mới", await signedPlatformCallback(connection, "health"))
    .text("Hàng đợi", await signedPlatformCallback(connection, "queues"))
    .row()
    .text("Webhook", await signedPlatformCallback(connection, "webhook"))
    .text("Sự cố", await signedPlatformCallback(connection, "incidents"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithBackup(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const snapshot = await getPlatformBackupSnapshot();
  const keyboard = new InlineKeyboard();
  if (hasPlatformScope(connection, "backup.trigger")) {
    keyboard.text("Chạy backup", await signedPlatformCallback(connection, "backup.run.prompt"));
  }
  keyboard
    .text("Chi tiết", await signedPlatformCallback(connection, "backup.detail"))
    .row()
    .text("Làm mới", await signedPlatformCallback(connection, "backup"))
    .text("Hàng đợi", await signedPlatformCallback(connection, "queues"))
    .row()
    .text("Sức khỏe", await signedPlatformCallback(connection, "health"))
    .text("Sự cố", await signedPlatformCallback(connection, "incidents"));
  await ctx.reply(formatBackupSnapshot(snapshot, "summary"), { reply_markup: keyboard });
}

async function replyWithBackupDetails(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const snapshot = await getPlatformBackupSnapshot();
  const keyboard = new InlineKeyboard().text("Tóm tắt", await signedPlatformCallback(connection, "backup"));
  if (hasPlatformScope(connection, "backup.trigger")) {
    keyboard.text("Chạy backup", await signedPlatformCallback(connection, "backup.run.prompt"));
  }
  keyboard
    .row()
    .text("Làm mới", await signedPlatformCallback(connection, "backup.detail"))
    .url("Admin Ops", platformAdminUrl("/ops"));
  await ctx.reply(formatBackupSnapshot(snapshot, "detail"), { reply_markup: keyboard });
}

async function replyWithBackupRunPrompt(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "backup.trigger");
  if (!connection) return;
  const snapshot = await getPlatformBackupSnapshot();
  const keyboard = new InlineKeyboard()
    .text("Xác nhận chạy", await signedPlatformCallback(connection, "backup.run"))
    .text("Hủy", await signedPlatformCallback(connection, "backup"));
  await ctx.reply(formatBackupRunPrompt(snapshot), { reply_markup: keyboard });
}

async function queueBackupFromTelegram(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "backup.trigger");
  if (!connection) return;
  const job = await queuePlatformManualBackup({ actor: actorForConnection(connection), reason: "Dev Telegram Bot manual backup" });
  await recordPlatformTelegramAudit({
    connection,
    action: "platform.backup.manual.queue",
    outcome: "accepted",
    targetType: "backup_job",
    targetId: job.id,
    metadata: { environment: job.environment, retentionClass: job.retentionClass, status: job.status }
  });
  const keyboard = new InlineKeyboard()
    .text("Theo dõi", await signedPlatformCallback(connection, "backup"))
    .text("Hàng đợi", await signedPlatformCallback(connection, "queues"))
    .row()
    .text("Chi tiết", await signedPlatformCallback(connection, "backup.detail"));
  await ctx.reply(formatBackupQueuedJob(job), { reply_markup: keyboard });
}

async function replyWithQueues(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "queues.read");
  if (!connection) return;
  const summary = await queueSummary({ includeDeadLetters: true });
  const rows = queueAttentionRows(summary).slice(0, 10);
  const totalBacklog = rows.reduce((sum, row) => sum + row.backlog, 0);
  const totalFailed = rows.reduce((sum, row) => sum + row.failed, 0);
  const failedRows = rows.filter((row) => row.failed > 0).slice(0, 4);
  const lines = [
    "Hàng đợi",
    "",
    rows.length ? `Cần xem: ${totalBacklog} việc chờ · ${totalFailed} việc lỗi/DLQ` : "Không có hàng đợi nổi bật.",
    "",
    ...(rows.length ? rows.map(formatQueueAttentionRow) : ["Bấm Làm mới để kiểm tra lại."])
  ];
  const keyboard = new InlineKeyboard();
  for (const row of failedRows) {
    keyboard.text(`Xem lỗi ${shortQueueName(row.name)}`, await signedPlatformCallback(connection, "queue.failed", { queueName: row.name })).row();
  }
  keyboard
    .text("Làm mới", await signedPlatformCallback(connection, "queues"))
    .text("Sức khỏe", await signedPlatformCallback(connection, "health"))
    .row()
    .text("Sự cố", await signedPlatformCallback(connection, "incidents"))
    .url("Bull Board", readEnv("PLATFORM_BULL_BOARD_URL", "https://monitor.logivn.com/queues/board/"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithQueueFailedJobs(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>) {
  const approvedConnection = await requireConnection(ctx, connection, "queues.read");
  if (!approvedConnection) return;
  const queueName = payloadQueueName(payload);
  if (!queueName) {
    await replyWithQueues(ctx, approvedConnection);
    return;
  }

  const jobs = (await failedJobs({ queueName, limit: 5 })) as QueueFailedJobView[];
  const canRetry = hasPlatformScope(approvedConnection, "queues.retry");
  const keyboard = new InlineKeyboard();
  if (canRetry) {
    for (const [index, job] of jobs.entries()) {
      if (!job.id) continue;
      keyboard.text(`Retry #${index + 1}`, await signedPlatformCallback(approvedConnection, "queue.retry.prompt", { queueName, jobId: String(job.id) })).row();
    }
  }
  keyboard
    .text("Làm mới", await signedPlatformCallback(approvedConnection, "queue.failed", { queueName }))
    .text("Tất cả queue", await signedPlatformCallback(approvedConnection, "queues"))
    .row()
    .url("Bull Board", readEnv("PLATFORM_BULL_BOARD_URL", "https://monitor.logivn.com/queues/board/"));

  const lines = [
    `Lỗi queue · ${queueName}`,
    "",
    jobs.length ? `${jobs.length} job cần xem. ${canRetry ? "Chọn Retry để xử lý ngay." : "Bạn chưa có quyền retry."}` : "Không còn job lỗi/DLQ trong queue này.",
    "",
    ...(jobs.length ? jobs.map(formatQueueFailedJobLine) : ["Quay lại Hàng đợi để kiểm tra queue khác."])
  ];
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithQueueRetryPrompt(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>) {
  const approvedConnection = await requireConnection(ctx, connection, "queues.retry");
  if (!approvedConnection) return;
  const queueName = payloadQueueName(payload);
  const jobId = payloadString(payload, "jobId");
  if (!queueName || !jobId) {
    await replyWithQueues(ctx, approvedConnection);
    return;
  }

  const job = await findQueueFailedJob(queueName, jobId);
  const keyboard = new InlineKeyboard()
    .text("Xác nhận retry", await signedPlatformCallback(approvedConnection, "queue.retry", { queueName, jobId }))
    .text("Hủy", await signedPlatformCallback(approvedConnection, "queue.failed", { queueName }))
    .row()
    .url("Bull Board", readEnv("PLATFORM_BULL_BOARD_URL", "https://monitor.logivn.com/queues/board/"));
  const detail = job ? formatQueueFailedJobLine(job, 0) : `#1 ${shortId(jobId)} · job có thể đã được xử lý khỏi danh sách lỗi`;
  await ctx.reply(["Retry queue job", "", `Queue: ${queueName}`, detail, "", "Sau khi xác nhận: job failed sẽ được retry, DLQ sẽ replay một lần về queue gốc."].join("\n"), { reply_markup: keyboard });
}

async function retryQueueJobFromTelegram(ctx: Context, connection: PlatformTelegramConnection, payload: Record<string, unknown>) {
  const approvedConnection = await requireConnection(ctx, connection, "queues.retry");
  if (!approvedConnection) return;
  const queueName = payloadQueueName(payload);
  const jobId = payloadString(payload, "jobId");
  if (!queueName || !jobId) {
    await replyWithQueues(ctx, approvedConnection);
    return;
  }

  try {
    const result = await retryFailedJob({ queueName, jobId, actor: actorForConnection(approvedConnection) });
    await recordPlatformTelegramAudit({
      connection: approvedConnection,
      action: "platform.queue.retry",
      outcome: "accepted",
      targetType: "queue_job",
      targetId: `${queueName}:${jobId}`,
      metadata: result as Record<string, unknown>
    });
    const keyboard = new InlineKeyboard().text("Xem queue", await signedPlatformCallback(approvedConnection, "queue.failed", { queueName })).text("Tất cả", await signedPlatformCallback(approvedConnection, "queues"));
    await ctx.reply(formatQueueRetryResult(result as Record<string, unknown>), { reply_markup: keyboard });
  } catch (error) {
    await recordPlatformTelegramAudit({
      connection: approvedConnection,
      action: "platform.queue.retry",
      outcome: "failed",
      targetType: "queue_job",
      targetId: `${queueName}:${jobId}`,
      metadata: safeLogError(error)
    });
    throw error;
  }
}

async function replyWithWebhook(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection || !bot) return;
  const info = await bot.api.getWebhookInfo();
  const lines = [
    "Webhook bot",
    "",
    `Trạng thái: ${info.url ? "đã cấu hình" : "thiếu webhook"}`,
    `Tin chờ: ${info.pending_update_count}`,
    `Lỗi cuối: ${info.last_error_message ? redactVisibleSecret(info.last_error_message) : "không có"}`,
    `Thời điểm lỗi: ${formatUnixDate(info.last_error_date)}`
  ];
  const keyboard = new InlineKeyboard()
    .text("Làm mới", await signedPlatformCallback(connection, "webhook"))
    .text("Sức khỏe", await signedPlatformCallback(connection, "health"))
    .row()
    .text("Bảo mật", await signedPlatformCallback(connection, "security"));
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
  const lines = ["Sự cố", "", ...(failed.length ? failed.map((row) => `- ${row.name}: ${row.failed} lỗi`) : ["Không có hàng đợi lỗi nổi bật."])];
  const keyboard = new InlineKeyboard().text("Làm mới", await signedPlatformCallback(connection, "incidents")).text("Hàng đợi", await signedPlatformCallback(connection, "queues"));
  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

async function replyWithSecurity(ctx: Context, preferredConnection?: PlatformTelegramConnection) {
  const connection = await requireConnection(ctx, preferredConnection, "infra.read");
  if (!connection) return;
  const audit = await getPlatformConnectionRecentAudit(connection, 5);
  const lines = [
    "Bảo mật",
    "",
    `Tài khoản: ${connectionLabel(connection)}`,
    `Quyền: ${compactScopes(connection.scopes)}`,
    `Trạng thái: ${connection.status}`,
    "",
    ...(audit.length ? audit.map((item) => `- ${item.outcome} · ${shortAuditAction(item.action)} · ${formatShortDate(item.createdAt)}`) : ["Chưa có audit gần đây."])
  ];
  const keyboard = new InlineKeyboard()
    .text("Làm mới", await signedPlatformCallback(connection, "security"))
    .text("Ngắt kết nối", await signedPlatformCallback(connection, "disconnect"))
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
  const keyboard = new InlineKeyboard().url("Tạo link mới", platformAdminUrl("/ops"));
  await ctx.reply("Đã ngắt kết nối DevOps Bot cho tài khoản Telegram này.", { reply_markup: keyboard });
}

async function handlePlatformMenuAction(ctx: Context, action: PlatformMenuAction, connection: PlatformTelegramConnection, payload: Record<string, unknown> = {}) {
  if (action === "menu") return replyWithPlatformMenu(ctx, connection);
  if (action === "payments") return replyWithPayments(ctx, connection);
  if (action === "payment.confirm.prompt") return replyWithPaymentConfirmPrompt(ctx, connection, payload);
  if (action === "payment.confirm") return confirmPaymentFromTelegram(ctx, connection, payload);
  if (action === "payment.reject.prompt") return replyWithPaymentRejectPrompt(ctx, connection, payload);
  if (action === "payment.reject") return rejectPaymentFromTelegram(ctx, connection, payload);
  if (action === "tenants") return replyWithTenants(ctx, connection);
  if (action === "tenant.suspend.prompt") return replyWithTenantStatusPrompt(ctx, connection, payload, "suspended");
  if (action === "tenant.suspend") return updateTenantFromTelegram(ctx, connection, payload, "suspended");
  if (action === "tenant.restore.prompt") return replyWithTenantStatusPrompt(ctx, connection, payload, "active");
  if (action === "tenant.restore") return updateTenantFromTelegram(ctx, connection, payload, "active");
  if (action === "tenant.delete.prompt") return replyWithTenantStatusPrompt(ctx, connection, payload, "deleted");
  if (action === "tenant.delete") return updateTenantFromTelegram(ctx, connection, payload, "deleted");
  if (action === "health") return replyWithHealth(ctx, connection);
  if (action === "backup") return replyWithBackup(ctx, connection);
  if (action === "backup.detail") return replyWithBackupDetails(ctx, connection);
  if (action === "backup.run.prompt") return replyWithBackupRunPrompt(ctx, connection);
  if (action === "backup.run") return queueBackupFromTelegram(ctx, connection);
  if (action === "queues") return replyWithQueues(ctx, connection);
  if (action === "queue.failed") return replyWithQueueFailedJobs(ctx, connection, payload);
  if (action === "queue.retry.prompt") return replyWithQueueRetryPrompt(ctx, connection, payload);
  if (action === "queue.retry") return retryQueueJobFromTelegram(ctx, connection, payload);
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
    await replyWithConnectAction(ctx);
    return null;
  }
  if (!hasPlatformScope(connection, scope)) {
    await recordPlatformTelegramAudit({ connection, action: `platform.scope.${scope}`, outcome: "denied" });
    await replyWithScopeDenied(ctx, connection, scope);
    return null;
  }
  await touchPlatformConnection(connection).catch(() => undefined);
  return connection;
}

async function connectionForContext(ctx: Context) {
  return ctx.from ? getPlatformConnectionForTelegramUser(ctx.from.id) : null;
}

async function signedPlatformCallback(connection: PlatformTelegramConnection, action: PlatformMenuAction, payload: Record<string, unknown> = {}) {
  const token = await createPlatformSession({ connection, action, payload, ttlSeconds: numberEnv("PLATFORM_TELEGRAM_SESSION_TTL_SECONDS", 900) });
  return `${PLATFORM_CALLBACK_PREFIX}${token}`;
}

async function platformIncidentKeyboard(connection: PlatformTelegramConnection) {
  return new InlineKeyboard()
    .text("Backup", await signedPlatformCallback(connection, "backup"))
    .text("Sức khỏe", await signedPlatformCallback(connection, "health"))
    .row()
    .text("Hàng đợi", await signedPlatformCallback(connection, "queues"));
}

async function replyWithConnectAction(ctx: Context) {
  const keyboard = new InlineKeyboard().url("Mở Admin Ops", platformAdminUrl("/ops"));
  await ctx.reply("DevOps Bot chưa kết nối hoặc quyền đã bị thu hồi.", { reply_markup: keyboard });
}

async function replyWithScopeDenied(ctx: Context, connection: PlatformTelegramConnection, scope: string) {
  const keyboard = new InlineKeyboard()
    .text("Bảo mật", await signedPlatformCallback(connection, "security"))
    .text("Menu", await signedPlatformCallback(connection, "menu"));
  await ctx.reply(`Thiếu quyền ${scope} cho thao tác này.`, { reply_markup: keyboard });
}

async function replyWithPaymentsReload(ctx: Context, connection: PlatformTelegramConnection, message: string) {
  const keyboard = new InlineKeyboard()
    .text("Làm mới", await signedPlatformCallback(connection, "payments"))
    .text("Menu", await signedPlatformCallback(connection, "menu"));
  await ctx.reply(`${message} Tải lại danh sách thanh toán hiện tại.`, { reply_markup: keyboard });
}

async function replyWithTenantsReload(ctx: Context, connection: PlatformTelegramConnection, message: string) {
  const keyboard = new InlineKeyboard()
    .text("Làm mới", await signedPlatformCallback(connection, "tenants"))
    .text("Menu", await signedPlatformCallback(connection, "menu"));
  await ctx.reply(`${message} Tải lại danh sách quán hiện tại.`, { reply_markup: keyboard });
}

function queueAttentionRows(summary: Record<string, any>): QueueAttentionRow[] {
  return Object.entries(summary)
    .map(([name, counts]: [string, any]) => {
      const waiting = Number(counts.waiting ?? 0);
      const active = Number(counts.active ?? 0);
      const delayed = Number(counts.delayed ?? 0);
      const paused = Number(counts.paused ?? 0);
      const backlog = waiting + active + delayed + paused;
      const failed = Number(counts.failed ?? 0) + (name.endsWith(".dlq") ? backlog : 0);
      return { name, backlog, failed, paused };
    })
    .filter((row) => row.backlog > 0 || row.failed > 0 || row.name === PLATFORM_TELEGRAM_QUEUE)
    .sort((a, b) => b.failed - a.failed || b.backlog - a.backlog || a.name.localeCompare(b.name));
}

function formatQueueAttentionRow(row: QueueAttentionRow) {
  const attention = row.name.endsWith(".dlq") ? `DLQ ${row.failed}` : `lỗi ${row.failed}`;
  return `- ${row.name}: chờ ${row.backlog}, ${attention}${row.paused > 0 ? `, paused ${row.paused}` : ""}`;
}

function payloadQueueName(payload: Record<string, unknown>) {
  const queueName = payloadString(payload, "queueName");
  return QUEUE_CONTROL_NAMES.has(queueName) ? queueName : "";
}

async function findQueueFailedJob(queueName: string, jobId: string) {
  const jobs = (await failedJobs({ queueName, limit: 50 })) as QueueFailedJobView[];
  return jobs.find((job) => String(job.id ?? "") === jobId) ?? null;
}

function formatQueueFailedJobLine(job: QueueFailedJobView, index: number) {
  const id = shortId(String(job.id ?? "unknown"));
  const tenant = queueJobTenant(job);
  const state = job.state ? ` · ${job.state}` : "";
  const attempts = Number(job.attemptsMade ?? 0);
  const reason = job.failedReason ? truncateVisible(job.failedReason, 140) : "không có lỗi chi tiết";
  const failedAt = formatQueueJobTime(job.finishedOn ?? job.processedOn ?? job.timestamp ?? null);
  return [`#${index + 1} ${job.name ?? "job"} · ${id}${state}`, `   tenant: ${tenant} · attempts ${attempts} · ${failedAt}`, `   lỗi: ${reason}`].join("\n");
}

function queueJobTenant(job: QueueFailedJobView) {
  const data = job.data && typeof job.data === "object" ? job.data : {};
  const direct = data.tenantId ?? data.restaurantId;
  if (direct) return shortId(String(direct));
  const nested = data.data && typeof data.data === "object" && !Array.isArray(data.data) ? (data.data as Record<string, unknown>) : null;
  const nestedTenant = nested?.tenantId ?? nested?.restaurantId;
  return nestedTenant ? shortId(String(nestedTenant)) : "unknown";
}

function formatQueueRetryResult(result: Record<string, unknown>) {
  if (result.mode === "dead_letter_replay") {
    const replayed = result.replayed && typeof result.replayed === "object" ? (result.replayed as Record<string, unknown>) : {};
    return ["Đã replay DLQ", "", `Từ: ${result.queueName}:${shortId(String(result.jobId ?? ""))}`, `Về: ${replayed.queueName ?? "unknown"}:${shortId(String(replayed.jobId ?? ""))}`].join("\n");
  }
  return ["Đã retry job", "", `Queue: ${result.queueName ?? "unknown"}`, `Job: ${shortId(String(result.jobId ?? ""))}`].join("\n");
}

function shortQueueName(value: string) {
  return value
    .replace("telegram.notifications", "tenant.tg")
    .replace("platform.telegram.notifications", "platform.tg")
    .replace(".dlq", ".DLQ");
}

function formatQueueJobTime(value: number | null) {
  if (!value) return "chưa có thời điểm";
  return formatShortDate(new Date(value).toISOString());
}

function platformMenuPriority(payment?: PlatformSubscriptionPayment, tenant?: PlatformTenantAction) {
  if (payment) return `Duyệt ${paymentRestaurantLabel(payment)} · ${formatVnd(payment.amount)}`;
  if (tenant) return `Rà soát ${tenantRestaurantLabel(tenant)} · ${tenant.riskFlags[0] ?? tenant.platformStatus}`;
  return "theo dõi sức khỏe hệ thống";
}

function formatPaymentListRow(payment: PlatformSubscriptionPayment, index: number) {
  return [
    `${index + 1}. ${paymentRestaurantLabel(payment)}`,
    `   ${billingActionLabel(payment.billingAction)} · ${paymentPlanLabel(payment)} · ${payment.months} tháng · ${formatVnd(payment.amount)}`,
    `   CK: ${payment.transferContent || shortId(payment.id)}`,
    `   Tạo: ${formatShortDate(payment.createdAt)} (${formatAge(payment.createdAt)})`,
    payment.effectiveSummary ? `   Hiệu lực: ${truncateVisible(payment.effectiveSummary, 120)}` : null
  ].filter(Boolean).join("\n");
}

function formatPaymentDecisionPrompt(title: string, payment: PlatformSubscriptionPayment, impact: string) {
  return [
    title,
    "",
    `Quán: ${paymentRestaurantLabel(payment)}`,
    `Gói: ${billingActionLabel(payment.billingAction)} · ${paymentPlanLabel(payment)} · ${payment.months} tháng`,
    `Số tiền: ${formatVnd(payment.amount)}`,
    `Nội dung CK: ${payment.transferContent || shortId(payment.id)}`,
    `Tạo: ${formatShortDate(payment.createdAt)} (${formatAge(payment.createdAt)})`,
    payment.subscriptionStatus ? `Trạng thái gói: ${payment.subscriptionStatus}` : null,
    formatPaymentPeriod(payment),
    payment.effectiveSummary ? `Hiệu lực: ${truncateVisible(payment.effectiveSummary, 140)}` : null,
    payment.effectiveAt ? `Áp dụng: ${formatShortDate(payment.effectiveAt)}` : null,
    "",
    impact
  ].filter(Boolean).join("\n");
}

function formatTenantListRow(tenant: PlatformTenantAction, index: number) {
  return [
    `${index + 1}. ${tenantRestaurantLabel(tenant)}`,
    `   Trạng thái: ${tenant.platformStatus} · Gói: ${tenant.planName} · ${tenant.subscriptionStatus ?? "chưa có gói"}`,
    `   Kỳ/trial: ${formatTenantPeriod(tenant)}`,
    `   Tạo: ${formatShortDate(tenant.createdAt)} (${formatAge(tenant.createdAt)})`,
    `   Cờ rủi ro: ${tenant.riskFlags.length ? tenant.riskFlags.join(", ") : "không có"}`
  ].join("\n");
}

function formatTenantDecisionPrompt(actionLabel: string, tenant: PlatformTenantAction, impact: string) {
  return [
    `${actionLabel} quán`,
    "",
    `Quán: ${tenantRestaurantLabel(tenant)}`,
    `Trạng thái: ${tenant.platformStatus}`,
    `Gói: ${tenant.planName} · ${tenant.subscriptionStatus ?? "chưa có gói"}`,
    `Kỳ/trial: ${formatTenantPeriod(tenant)}`,
    `Tạo: ${formatShortDate(tenant.createdAt)} (${formatAge(tenant.createdAt)})`,
    `Cờ rủi ro: ${tenant.riskFlags.length ? tenant.riskFlags.join(", ") : "không có"}`,
    tenant.suspendedReason ? `Lý do hiện tại: ${truncateVisible(tenant.suspendedReason, 120)}` : null,
    tenant.deletedAt ? `Xóa mềm: ${formatShortDate(tenant.deletedAt)}` : null,
    "",
    impact
  ].filter(Boolean).join("\n");
}

function formatBackupSnapshot(snapshot: PlatformBackupSnapshot, mode: "summary" | "detail" = "summary") {
  if (!snapshot.schemaReady) {
    return [
      "Backup",
      "",
      "Trạng thái: chưa sẵn sàng",
      `Môi trường: ${snapshot.environment}`,
      ...snapshot.warnings.map((warning) => `- ${warning}`)
    ].join("\n");
  }

  if (mode === "detail") return formatBackupDetailSnapshot(snapshot);

  const latest = snapshot.latestJob;
  const active = latest?.status === "queued" || latest?.status === "running";
  const lines = [
    `Backup: ${backupStateLabel(snapshot)}`,
    `Lần thành công: ${formatBackupSuccessSummary(snapshot.lastSuccessfulJob)}`,
    `Restore test: ${formatBackupRestoreSummary(snapshot.restoreTest)}`,
    `RPO: ${backupRiskLabel(snapshot.rpoRisk)} · tuổi ${formatBackupAgeHours(snapshot.ageHours)}`,
    active ? `Đang xử lý: ${latest.status} · ${shortId(latest.id)} · ${formatAge(latest.createdAt)}` : null,
    snapshot.queuedManualCount > 0 ? `Manual chờ: ${snapshot.queuedManualCount}` : null,
    `Cảnh báo mở: ${formatBackupAlertSummary(snapshot.openAlerts)}`
  ].filter(Boolean);

  return lines.join("\n");
}

function formatBackupDetailSnapshot(snapshot: PlatformBackupSnapshot) {
  const lines = [
    `Backup chi tiết · ${snapshot.environment}`,
    "",
    `Trạng thái: ${backupStateLabel(snapshot)} · RPO ${backupRiskLabel(snapshot.rpoRisk)} · tuổi ${formatBackupAgeHours(snapshot.ageHours)}`,
    formatBackupJobLine("Mới nhất", snapshot.latestJob),
    formatBackupJobLine("Thành công", snapshot.lastSuccessfulJob),
    formatBackupVerificationLine(snapshot.lastSuccessfulJob),
    formatBackupArtifactLine(snapshot.artifacts),
    formatBackupRestoreTestLine(snapshot.restoreTest),
    `Manual chờ: ${snapshot.queuedManualCount}`,
    ...formatBackupAlertLines(snapshot.openAlerts),
    ...formatBackupWarningLines(snapshot.warnings)
  ].filter(Boolean);
  return lines.join("\n");
}

function formatBackupRunPrompt(snapshot: PlatformBackupSnapshot) {
  return [
    "Chạy backup thủ công?",
    "",
    `Môi trường: ${snapshot.environment}`,
    `Hiện tại: ${backupStateLabel(snapshot)} · RPO ${backupRiskLabel(snapshot.rpoRisk)}`,
    `Lần thành công: ${formatBackupSuccessSummary(snapshot.lastSuccessfulJob)}`,
    "",
    "Sau khi xác nhận, VPS sẽ nhận job manual qua cron claim và upload bản backup mới lên R2."
  ].join("\n");
}

function formatBackupQueuedJob(job: PlatformBackupQueuedJob) {
  return [
    "Đã xếp hàng backup",
    "",
    `Job: ${shortId(job.id)} · ${job.environment}`,
    `Loại: ${job.retentionClass} · ${job.status}`,
    `Tạo: ${formatShortDate(job.createdAt)} (${formatAge(job.createdAt)})`,
    "VPS sẽ tự nhận job trong lượt cron manual kế tiếp."
  ].join("\n");
}

function backupStateLabel(snapshot: PlatformBackupSnapshot) {
  const latestStatus = snapshot.latestJob?.status;
  if (latestStatus === "queued") return "Đang chờ";
  if (latestStatus === "running") return "Đang chạy";
  if (snapshot.openAlerts.some((alert) => alert.severity === "critical")) return "Cần xử lý";
  if (snapshot.rpoRisk === "high") return "Cần xử lý";
  if (snapshot.rpoRisk === "medium") return "Theo dõi";
  if (latestStatus === "failed") return "Cần xử lý";
  if (latestStatus === "warn") return "Theo dõi";
  return "Ổn";
}

function formatBackupSuccessSummary(job: PlatformBackupSnapshot["lastSuccessfulJob"]) {
  if (!job) return "chưa có";
  const time = job.finishedAt ?? job.startedAt ?? job.createdAt;
  return `${formatShortDate(time)} · ${formatAge(time)} · ${formatBytes(job.fileSize)}`;
}

function formatBackupRestoreSummary(test: PlatformBackupSnapshot["restoreTest"]) {
  if (!test) return "chưa có";
  const time = test.finishedAt ?? test.startedAt ?? test.createdAt;
  const checksOk = test.schemaVerified && test.rowCountVerified && test.criticalTablesVerified;
  return `${test.status}${checksOk ? " OK" : " cần xem"} · ${formatAge(time)}`;
}

function formatBackupAlertSummary(alerts: PlatformBackupSnapshot["openAlerts"]) {
  if (!alerts.length) return "0";
  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const warning = alerts.filter((alert) => alert.severity === "warning").length;
  return [critical ? `${critical} critical` : null, warning ? `${warning} warning` : null, alerts.length > critical + warning ? `${alerts.length - critical - warning} info` : null]
    .filter(Boolean)
    .join(" · ");
}

function formatBackupJobLine(label: string, job: PlatformBackupSnapshot["latestJob"]) {
  if (!job) return `${label}: chưa có dữ liệu`;
  const time = job.finishedAt ?? job.startedAt ?? job.createdAt;
  const error = job.errorMessage ? ` · lỗi: ${truncateVisible(job.errorMessage, 80)}` : "";
  return `${label}: ${job.status} · ${job.backupType}/${job.retentionClass} · ${job.triggerSource} · ${formatShortDate(time)} (${formatAge(time)})${error}`;
}

function formatBackupVerificationLine(job: PlatformBackupSnapshot["lastSuccessfulJob"]) {
  if (!job) return "Kiểm tra: chưa có bản backup thành công.";
  const encrypted = job.encrypted ? "mã hóa có" : "mã hóa thiếu";
  return `Kiểm tra: checksum ${job.checksumStatus} · verify ${job.verifyStatus} · ${encrypted} · ${formatBytes(job.fileSize)}`;
}

function formatBackupArtifactLine(artifacts: PlatformBackupSnapshot["artifacts"]) {
  if (!artifacts.length) return "Artifacts: chưa có dữ liệu artifact.";
  const visible = artifacts.slice(0, 5).map((artifact) => `${artifact.artifactType}:${artifact.status} ${formatBytes(artifact.fileSize)}`);
  const overflow = artifacts.length > visible.length ? ` +${artifacts.length - visible.length}` : "";
  return `Artifacts: ${visible.join("; ")}${overflow}`;
}

function formatBackupRestoreTestLine(test: PlatformBackupSnapshot["restoreTest"]) {
  if (!test) return "Restore test: chưa có lần kiểm tra.";
  const time = test.finishedAt ?? test.startedAt ?? test.createdAt;
  const checks = [
    `schema ${booleanCheckLabel(test.schemaVerified)}`,
    `rows ${booleanCheckLabel(test.rowCountVerified)}`,
    `critical ${booleanCheckLabel(test.criticalTablesVerified)}`
  ].join(" · ");
  const error = test.errorMessage ? ` · lỗi: ${truncateVisible(test.errorMessage, 80)}` : "";
  return `Restore test: ${test.status} · ${checks} · ${formatShortDate(time)} (${formatAge(time)})${error}`;
}

function formatBackupAlertLines(alerts: PlatformBackupSnapshot["openAlerts"]) {
  if (!alerts.length) return ["Cảnh báo: không có alert backup mở."];
  const unique = dedupeBackupAlerts(alerts).slice(0, 3);
  const overflow = alerts.length > unique.length ? [`- còn ${alerts.length - unique.length} alert tương tự`] : [];
  return ["Cảnh báo:", ...unique.map((alert) => `- ${alert.severity}/${alert.rpoRisk}: ${truncateVisible(alert.title, 80)} (${formatAge(alert.createdAt)})`), ...overflow];
}

function dedupeBackupAlerts(alerts: PlatformBackupSnapshot["openAlerts"]) {
  const seen = new Set<string>();
  const rows: PlatformBackupSnapshot["openAlerts"] = [];
  for (const alert of alerts) {
    const key = `${alert.severity}:${alert.rpoRisk}:${alert.title}:${alert.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(alert);
  }
  return rows;
}

function formatBackupWarningLines(warnings: string[]) {
  return warnings.length ? ["Ghi chú:", ...warnings.map((warning) => `- ${truncateVisible(warning, 100)}`)] : [];
}

function backupRiskLabel(value: string) {
  if (value === "low") return "low";
  if (value === "medium") return "medium";
  return "high";
}

function formatBackupAgeHours(value: number | null) {
  if (!Number.isFinite(value ?? NaN)) return "unknown";
  return `${(value ?? 0).toFixed((value ?? 0) < 10 ? 1 : 0)}h`;
}

function booleanCheckLabel(value: boolean) {
  return value ? "OK" : "FAIL";
}

function formatBytes(value: number) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = bytes / 1024;
  for (const unit of units) {
    if (current < 1024 || unit === units[units.length - 1]) return `${current.toFixed(current < 10 ? 1 : 0)} ${unit}`;
    current /= 1024;
  }
  return `${bytes} B`;
}

function formatPaymentPeriod(payment: PlatformSubscriptionPayment) {
  if (payment.currentPeriodStart || payment.currentPeriodEnd) return `Kỳ hiện tại: ${formatDateRange(payment.currentPeriodStart, payment.currentPeriodEnd)}`;
  if (payment.trialEndsAt) return `Trial đến: ${formatShortDate(payment.trialEndsAt)}`;
  return null;
}

function formatTenantPeriod(tenant: PlatformTenantAction) {
  if (tenant.currentPeriodStart || tenant.currentPeriodEnd) return formatDateRange(tenant.currentPeriodStart, tenant.currentPeriodEnd);
  if (tenant.trialEndsAt) return `trial đến ${formatShortDate(tenant.trialEndsAt)}`;
  if (tenant.subscriptionCreatedAt) return `tạo gói ${formatShortDate(tenant.subscriptionCreatedAt)}`;
  return "chưa có";
}

function tenantStatusActionLabel(status: "active" | "suspended" | "deleted") {
  if (status === "active") return "Mở lại";
  if (status === "suspended") return "Tạm dừng";
  return "Xóa mềm";
}

function tenantStatusImpact(status: "active" | "suspended" | "deleted") {
  if (status === "active") return "Sau khi mở lại: quán quay về active và bỏ khóa tạm dừng/xóa mềm.";
  if (status === "suspended") return "Sau khi tạm dừng: quán bị chặn và gói đang chạy chuyển sang suspended.";
  return "Sau khi xóa mềm: quán bị ẩn khỏi kênh bán hàng và có audit để khôi phục khi cần.";
}

function paymentRestaurantLabel(payment: PlatformSubscriptionPayment) {
  return payment.restaurantSlug ? `${payment.restaurantName} (${payment.restaurantSlug})` : payment.restaurantName;
}

function tenantRestaurantLabel(tenant: PlatformTenantAction) {
  return tenant.slug ? `${tenant.name} (${tenant.slug})` : tenant.name;
}

function paymentPlanLabel(payment: PlatformSubscriptionPayment) {
  return payment.planCode ? `${payment.planName} (${payment.planCode})` : payment.planName;
}

function billingActionLabel(value: string | null) {
  if (value === "renew") return "Gia hạn";
  if (value === "upgrade") return "Nâng gói";
  if (value === "downgrade") return "Hạ gói";
  return "Thanh toán";
}

function formatDateRange(start: string | null, end: string | null) {
  if (start && end) return `${formatShortDate(start)} -> ${formatShortDate(end)}`;
  if (end) return `đến ${formatShortDate(end)}`;
  if (start) return `từ ${formatShortDate(start)}`;
  return "chưa có";
}

function countLabel(count: number, limit: number) {
  return count >= limit ? `${limit}+` : String(count);
}

function formatAge(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return "vừa tạo";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function formatUnixDate(value?: number) {
  if (!value) return "không có";
  const iso = new Date(value * 1000).toISOString();
  return `${formatShortDate(iso)} (${formatAge(iso)})`;
}

function shortAuditAction(action: string) {
  return action.replace(/^platform\./, "").replace(/^telegram\./, "").replace(/\./g, " ");
}

function truncateVisible(value: string, maxLength: number) {
  const text = redactVisibleSecret(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function redactVisibleSecret(value: string) {
  return value
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot***")
    .replace(/lg1_[A-Za-z0-9_.-]{16,}/g, "lg1_***")
    .replace(/\/webhooks\/platform-telegram\/[^\s/]+/g, "/webhooks/platform-telegram/***");
}

async function configurePlatformCommands() {
  if (!bot) return;
  await bot.api.setMyCommands([
    { command: "menu", description: "Mở trung tâm thao tác" },
    { command: "payments", description: "Duyệt gói chủ quán" },
    { command: "tenants", description: "Quản lý quán nhanh" },
    { command: "health", description: "Kiểm tra hệ thống" },
    { command: "backup", description: "Xem và chạy backup" },
    { command: "queues", description: "Kiểm tra việc lỗi" },
    { command: "webhook", description: "Kiểm tra webhook bot" },
    { command: "incidents", description: "Xem sự cố vận hành" },
    { command: "whoami", description: "Xem tài khoản và quyền" },
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
  if (readEnv("NODE_ENV").toLowerCase() === "production") return false;

  const allowedIds = readEnv("PLATFORM_TELEGRAM_ALLOWED_USER_IDS")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  if (allowedIds.includes(telegramUserId)) return true;
  const expected = readEnv("PLATFORM_TELEGRAM_BOOTSTRAP_TOKEN");
  return Boolean(expected && token && secureEqual(token, expected));
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
  if (!webhookSecret || !provided || !secureEqual(provided, webhookSecret)) {
    return res.status(401).json({ ok: false, error: "invalid_platform_telegram_webhook_secret" });
  }
  return next();
}

function secureEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function scopeForAlert(event: PlatformAlertJob) {
  if (event.alert.severity === "critical") return "incidents.read";
  return "incidents.read";
}

function connectionLabel(connection: PlatformTelegramConnection) {
  return `${connection.display_name ?? connection.telegram_username ?? connection.telegram_user_id} · ${connection.role}`;
}

function actorForConnection(connection: PlatformTelegramConnection) {
  return `telegram:${connection.telegram_username ?? connection.telegram_user_id}`;
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function shortId(value: string) {
  return value ? value.slice(0, 8) : "unknown";
}

function formatVnd(value: number) {
  return `${Math.round(Number(value) || 0).toLocaleString("vi-VN")}đ`;
}

function appUrl(path = "/") {
  const base = readEnv("NEXT_PUBLIC_APP_URL", "https://logivn.com").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function platformAdminUrl(path = "/") {
  const base = readEnv("PLATFORM_ADMIN_PUBLIC_URL", "https://admin.logivn.com").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function tenantDashboardUrl(slug: string) {
  const rootDomain = readEnv("LOGIVN_ROOT_DOMAIN", "logivn.com");
  return slug ? `https://${slug}.${rootDomain}/dashboard` : platformAdminUrl("/tenants");
}

function tenantStatusReason(status: "active" | "suspended" | "deleted") {
  if (status === "active") return "Mở lại từ LogiVN DevOps Bot";
  if (status === "suspended") return "Tạm dừng từ LogiVN DevOps Bot";
  return "Xóa mềm từ LogiVN DevOps Bot";
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
  if (message.includes("queue") || message.includes("dead_letter")) return "Queue job không còn retry được. Mở Hàng đợi để tải lại.";
  if (message.includes("backup")) return "Không xử lý được backup. Mở Backup để tải lại trạng thái.";
  if (message.includes("payment")) return "Giao dịch không còn ở trạng thái chờ xử lý.";
  if (message.includes("tenant")) return "Không xử lý được tenant này.";
  if (message.includes("downgrade")) return "Downgrade cần xử lý trong Admin Billing.";
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
