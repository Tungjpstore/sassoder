import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Bot, GrammyError, HttpError, InlineKeyboard, webhookCallback } from "grammy";
import type { Context } from "grammy";
import { z } from "zod";
import { enqueueDeadLetterJob, enqueueJob, queueDefinition } from "../shared/queues.js";
import { bullMqPrefix, queueConcurrency, readEnv, requiredEnv, servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { createRedisConnection } from "../shared/redis.js";
import { createCounter, createHistogram } from "../shared/metrics.js";
import { checkRedisRateLimit } from "../shared/rate-limit.js";
import { tenantRateLimitKey } from "../shared/redis-keys.js";
import { formatTelegramCard } from "./formatters.mjs";
import {
  claimCallbackAction,
  claimTelegramSession,
  connectTelegramAccount,
  createCallbackAction,
  createTelegramSession,
  getOrCreateNotification,
  getTelegramConnectionsForUser,
  getTelegramOpsBoard,
  getTelegramRecipients,
  hasPermission,
  markNotificationFailed,
  markNotificationSent,
  recordTelegramAudit,
  touchConnection
} from "./repository.mjs";
import {
  branchIdSchema,
  requiredPermissionByAction,
  telegramNotificationJobSchema,
  type CallbackActionRecord,
  type OperationalTelegramEvent,
  type TelegramActionType,
  type TelegramConnection,
  type TelegramNotificationJob
} from "./types.mjs";

const TELEGRAM_QUEUE = "telegram.notifications";
const TELEGRAM_SESSION_CALLBACK_PREFIX = "s:";
const AI_OPS_COMMANDS = {
  doanhthu: {
    intent: "reports",
    permission: "reports.view",
    route: "/dashboard/analytics",
    prompt: "Tóm tắt doanh thu hôm nay, top món, rủi ro thanh toán và việc cần làm tiếp. Chỉ dùng dữ liệu thật."
  },
  tinhhinh: {
    intent: "overview",
    permission: "dashboard.view",
    route: "/dashboard/ai-ops",
    prompt: "Tóm tắt tình hình vận hành hiện tại: đơn, thanh toán, bếp, bàn và rủi ro cần xử lý ngay. Chỉ dùng dữ liệu thật."
  },
  tonkho: {
    intent: "inventory",
    permission: "inventory.view",
    route: "/dashboard/inventory",
    prompt: "Kiểm tra tồn kho hiện tại: nguyên liệu thấp, recipe coverage, cảnh báo kho và việc cần nhập trước. Chỉ dùng dữ liệu thật."
  }
} as const;
const TELEGRAM_MENU_ACTIONS = ["menu", "help", "status", "ops_board", "hot_orders", "payments", "reservations", "staff", "doanhthu", "tinhhinh", "tonkho"] as const;
type AiOpsCommand = keyof typeof AI_OPS_COMMANDS | "chat";
type TelegramMenuAction = (typeof TELEGRAM_MENU_ACTIONS)[number];
type AiOpsRequestSpec = {
  intent?: string;
  permission: string;
  route: string;
  actionLabel: string;
  message: string;
};

const telegramQueueDefinition = queueDefinition(TELEGRAM_QUEUE);
const logger = createLogger("telegram-bot");
const telegramBotToken = readEnv("TELEGRAM_BOT_TOKEN");
const telegramWebhookSecret = readEnv("TELEGRAM_WEBHOOK_SECRET");
const bot = telegramBotToken ? new Bot(telegramBotToken) : null;
const connection = bot ? createRedisConnection("telegram-bot-worker") : null;
if (connection) await connection.connect();

const deliveryCounter = createCounter({
  name: "logivn_telegram_deliveries_total",
  help: "Telegram notification delivery attempts",
  labelNames: ["event_type", "status"] as const
});

const callbackCounter = createCounter({
  name: "logivn_telegram_callbacks_total",
  help: "Telegram callback actions",
  labelNames: ["action_type", "status"] as const
});

const deliveryLatency = createHistogram({
  name: "logivn_telegram_delivery_seconds",
  help: "Telegram notification delivery latency",
  labelNames: ["event_type"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});

if (bot) {
  bot.command("menu", async (ctx) => {
    await replyWithOpsMenu(ctx);
  });

  bot.command("help", async (ctx) => {
    await replyWithHelp(ctx);
  });

  bot.command("status", async (ctx) => {
    await replyWithConnectionStatus(ctx);
  });

  bot.command("ops", async (ctx) => {
    await replyWithOpsBoard(ctx);
  });

  for (const command of Object.keys(AI_OPS_COMMANDS) as Array<keyof typeof AI_OPS_COMMANDS>) {
    bot.command(command, async (ctx) => {
      const extra = typeof ctx.match === "string" ? ctx.match.trim() : "";
      await handleAiOpsCommand(ctx, command, extra);
    });
  }

  bot.command("start", async (ctx) => {
    const token = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!token) {
      await replyWithOpsMenu(ctx, "LogiVN Ops Bot đã sẵn sàng.");
      return;
    }
    if (!ctx.from || !ctx.chat) {
      await ctx.reply("Không xác định được tài khoản Telegram để kết nối.");
      return;
    }
    if (await isTelegramUserRateLimited("connect", ctx.from.id)) {
      await ctx.reply("Bạn đang thử kết nối quá nhanh. Vui lòng chờ một chút rồi thử lại.");
      return;
    }

    try {
      const account = await connectTelegramAccount(token, {
        telegramUserId: ctx.from.id,
        chatId: ctx.chat.id,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null
      });

      await ctx.reply(
        [
          `Đã kết nối Telegram cho ${connectionLabel(account)}.`,
          `Vai trò: ${account.role}`,
          "Nhận cảnh báo realtime từ bây giờ."
        ].join("\n")
      );
      await replyWithOpsMenu(ctx, "Chọn thao tác vận hành nhanh.");
    } catch (error) {
      logger.warn({ error: safeLogError(error), telegramUserId: ctx.from.id }, "telegram connect rejected");
      await ctx.reply(friendlyConnectError(error));
    }
  });

  bot.on("callback_query:data", async (ctx) => {
    let actionType = "unknown";
    try {
      if (!ctx.from) throw new Error("telegram_user_missing");
      if (await isTelegramUserRateLimited("callback", ctx.from.id)) {
        throw new Error("telegram_user_rate_limited");
      }
      if (ctx.callbackQuery.data.startsWith(TELEGRAM_SESSION_CALLBACK_PREFIX)) {
        await handleTelegramSessionCallback(ctx, ctx.callbackQuery.data.slice(TELEGRAM_SESSION_CALLBACK_PREFIX.length));
        return;
      }
      const claimed = await claimCallbackAction(ctx.callbackQuery.data, ctx.from.id);
      actionType = claimed.action.action_type;
      await touchConnection(claimed.connection.restaurant_id, ctx.from.id).catch((error) => {
        logger.warn({ error: safeLogError(error), telegramUserId: ctx.from?.id }, "telegram connection touch failed");
      });
      const result = await executeInternalAction(claimed.action, claimed.connection);
      callbackCounter.inc({ action_type: claimed.action.action_type, status: "accepted" });
      await ctx.answerCallbackQuery({ text: result.message ?? "Đã thực hiện." });
      await ctx.editMessageReplyMarkup().catch(() => undefined);
    } catch (error) {
      callbackCounter.inc({ action_type: actionType, status: "failed" });
      logger.warn({ error: safeLogError(error) }, "telegram callback rejected");
      await ctx.answerCallbackQuery({
        text: friendlyCallbackError(error),
        show_alert: true
      });
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text || text.startsWith("/")) return;
    await handleAiOpsCommand(ctx, "chat", text);
  });

  bot.catch((error) => {
    const ctx = error.ctx;
    logger.error({ error: safeLogError(error.error), updateId: ctx.update.update_id }, "telegram update failed");
  });
}

let worker: Worker | null = null;
if (bot && connection) {
  worker = new Worker(
    TELEGRAM_QUEUE,
    async (job: Job) => withTimeout(processTelegramJob(job), telegramQueueDefinition.timeoutMs, job.name),
    {
      connection,
      prefix: bullMqPrefix(),
      name: `${readEnv("HOSTNAME", "logivn")}:${TELEGRAM_QUEUE}`,
      concurrency: numberEnv("TELEGRAM_WORKER_CONCURRENCY", queueConcurrency(4)),
      limiter: {
        max: numberEnv("TELEGRAM_RATE_LIMIT_MAX", 24),
        duration: numberEnv("TELEGRAM_RATE_LIMIT_DURATION_MS", 1000)
      },
      lockDuration: Math.max(telegramQueueDefinition.timeoutMs + 15_000, 30_000),
      maxStalledCount: 1,
      removeOnComplete: { age: 86_400, count: 2000 },
      removeOnFail: { age: 604_800, count: 10_000 },
      metrics: {
        maxDataPoints: 24 * 60
      },
      settings: {
        backoffStrategy: telegramBackoffStrategy
      }
    }
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id, name: job.name }, "telegram job completed"));
  worker.on("failed", (job, error) => {
    const attempts = Number(job?.opts.attempts ?? 1);
    const final = Boolean(job && job.attemptsMade >= attempts);
    logger.error({ jobId: job?.id, name: job?.name, attemptsMade: job?.attemptsMade, final, error: safeLogError(error) }, "telegram job failed");

    if (job && final) {
      enqueueDeadLetterJob({ failedQueueName: TELEGRAM_QUEUE, job, error }).catch((dlqError) => {
        logger.error({ jobId: job.id, error: safeLogError(dlqError) }, "telegram dead-letter enqueue failed");
      });
    }
  });
  worker.on("error", (error) => logger.error({ error: safeLogError(error) }, "telegram worker error"));
} else {
  logger.warn("Telegram bot token is missing; Telegram service is running in disabled mode");
}

const app = createHttpApp({ logger, serviceName: "telegram-bot" });
if (bot && telegramWebhookSecret) {
  const webhookPath = `/webhooks/telegram/${telegramWebhookSecret}`;
  app.post(webhookPath, verifyTelegramWebhookSecret, webhookCallback(bot, "express"));
} else if (bot) {
  logger.warn("TELEGRAM_WEBHOOK_SECRET is missing; Telegram webhook route is disabled");
}

const directMessageSchema = z.object({
  restaurantId: z.string().uuid(),
  branchId: branchIdSchema,
  chatId: z.string().min(1),
  text: z.string().min(1).max(4096),
  parseMode: z.enum(["MarkdownV2", "HTML"]).optional()
});

app.post("/messages", requireInternalApiKey, async (req, res, next) => {
  try {
    if (!bot) return res.status(503).json({ ok: false, error: "telegram_not_configured" });
    const payload = directMessageSchema.parse(req.body);
    const job = await enqueueJob({
      queueName: TELEGRAM_QUEUE,
      name: "telegram.send_message",
      data: {
        type: "telegram.send_message",
        eventId: `direct:${Date.now()}:${Math.random().toString(16).slice(2)}`,
        restaurantId: payload.restaurantId,
        branchId: payload.branchId ?? null,
        chatId: payload.chatId,
        text: payload.text,
        parseMode: payload.parseMode
      },
      opts: {
        attempts: 5
      },
      priority: "high"
    });
    res.status(202).json({ ok: true, queued: true, jobId: job.id, queueName: TELEGRAM_QUEUE });
  } catch (error) {
    next(error);
  }
});

app.post("/webhook/set", requireInternalApiKey, async (_req, res, next) => {
  try {
    if (!bot || !telegramWebhookSecret) {
      return res.status(503).json({ ok: false, error: "telegram_not_configured" });
    }
    const webhookUrl = requiredEnv("TELEGRAM_WEBHOOK_URL");
    await bot.api.setWebhook(webhookUrl, {
      secret_token: telegramWebhookSecret,
      allowed_updates: ["message", "callback_query"]
    });
    await configureTelegramCommands();
    res.json({ ok: true, webhookUrl });
  } catch (error) {
    next(error);
  }
});

app.get("/ready", async (_req, res) => {
  const configured = Boolean(bot && telegramWebhookSecret);
  const workerRunning = worker?.isRunning() ?? false;
  const ready = configured && workerRunning;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    configured,
    queue: TELEGRAM_QUEUE,
    worker: {
      running: workerRunning,
      concurrency: numberEnv("TELEGRAM_WORKER_CONCURRENCY", 4)
    }
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: safeLogError(error) }, "telegram service request failed");
  res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "telegram_request_failed" });
});

const shutdown = async () => {
  logger.info("closing telegram worker");
  await worker?.close();
  await connection?.quit();
};

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

listen(app, servicePort(3600), logger);

async function processTelegramJob(job: Job) {
  const parsed = telegramNotificationJobSchema.parse(job.data);
  if (parsed.type === "telegram.send_message") {
    const message = await sendTelegramMessage(parsed.chatId, parsed.text, {
      parse_mode: parsed.parseMode
    });
    deliveryCounter.inc({ event_type: parsed.type, status: "sent" });
    return { delivered: true, messageId: message.message_id };
  }

  const stopTimer = deliveryLatency.startTimer({ event_type: parsed.type });
  try {
    const result = await deliverOperationalEvent(parsed);
    deliveryCounter.inc({ event_type: parsed.type, status: "sent" }, result.sent);
    deliveryCounter.inc({ event_type: parsed.type, status: "skipped" }, result.skipped);
    return result;
  } finally {
    stopTimer();
  }
}

async function deliverOperationalEvent(event: OperationalTelegramEvent) {
  const card = formatTelegramCard(event);
  const requiredPermission = requiredPermissionForEvent(event);
  const recipients = await getTelegramRecipients({
    restaurantId: event.restaurantId,
    branchId: event.branchId ?? null,
    requiredPermission
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const notification = await getOrCreateNotification({
      eventId: event.eventId,
      eventType: event.type,
      restaurantId: event.restaurantId,
      branchId: event.branchId ?? null,
      connection: recipient,
      title: card.title,
      body: card.body,
      payload: event
    });

    if (notification.status === "sent") {
      skipped += 1;
      continue;
    }

    try {
      const keyboard = await buildKeyboard(event, recipient, notification.id, card.viewPath);
      const message = await sendTelegramMessage(recipient.telegram_chat_id, card.body, {
        parse_mode: "HTML",
        reply_markup: keyboard
      });
      await markNotificationSent(notification.id, message.message_id);
      await recordTelegramAudit({
        restaurantId: event.restaurantId,
        branchId: event.branchId ?? null,
        connectionId: recipient.id,
        userId: recipient.user_id,
        telegramUserId: recipient.telegram_user_id,
        action: event.type,
        outcome: "sent",
        metadata: { notificationId: notification.id, telegramMessageId: message.message_id }
      });
      sent += 1;
      await delay(numberEnv("TELEGRAM_SEND_INTERVAL_MS", 75));
    } catch (error) {
      const message = telegramErrorMessage(error);
      const status = telegramRetryAfterMs(error) ? "rate_limited" : "failed";
      await markNotificationFailed(notification.id, message, status);
      await recordTelegramAudit({
        restaurantId: event.restaurantId,
        branchId: event.branchId ?? null,
        connectionId: recipient.id,
        userId: recipient.user_id,
        telegramUserId: recipient.telegram_user_id,
        action: event.type,
        outcome: "failed",
        metadata: { notificationId: notification.id, error: message, status }
      });
      errors.push(message);
    }
  }

  if (errors.length > 0) throw new Error(errors[0]);
  return { delivered: sent > 0, sent, skipped, failed: errors.length, recipients: recipients.length };
}

async function buildKeyboard(
  event: OperationalTelegramEvent,
  connection: TelegramConnection,
  notificationId: string,
  viewPath?: string
) {
  const keyboard = new InlineKeyboard();
  const actions = actionsForEvent(event).filter((actionType) => hasPermission(connection, requiredPermissionByAction[actionType]));

  for (const actionType of actions) {
    keyboard.text(labelForAction(actionType), await createCallbackTokenForEvent(event, actionType, connection, notificationId));
  }

  if (actions.length > 0) keyboard.row();
  if (viewPath) keyboard.url("Xem", absoluteAppUrl(viewPath));
  return keyboard;
}

async function createCallbackTokenForEvent(
  event: OperationalTelegramEvent,
  actionType: TelegramActionType,
  connection: TelegramConnection,
  notificationId: string
) {
  const resource = resourceForEvent(event, actionType);
  return createCallbackAction({
    actionType,
    restaurantId: event.restaurantId,
    branchId: event.branchId ?? null,
    connectionId: connection.id,
    notificationId,
    resourceType: resource.type,
    resourceId: resource.id,
    payload: { eventId: event.eventId, eventType: event.type }
  });
}

async function executeInternalAction(action: CallbackActionRecord, connection: TelegramConnection) {
  if (action.action_type === "payment.amount_mismatch") {
    await recordTelegramAudit({
      restaurantId: action.restaurant_id,
      branchId: action.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId: connection.telegram_user_id,
      action: action.action_type,
      entityType: action.resource_type,
      entityId: action.resource_id,
      outcome: "accepted",
      metadata: { manualReview: true }
    });
    return { ok: true, message: "Đã ghi nhận lệch tiền." };
  }

  const endpoint = new URL("/api/internal/telegram/actions", readEnv("LOGIVN_APP_INTERNAL_URL", readEnv("NEXT_PUBLIC_APP_URL")));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": requiredEnv("LOGIVN_INTERNAL_API_KEY")
    },
    body: JSON.stringify({
      actionId: action.id,
      actionType: action.action_type,
      restaurantId: action.restaurant_id,
      branchId: action.branch_id,
      actorUserId: connection.user_id,
      actorRole: connection.role,
      resourceType: action.resource_type,
      resourceId: action.resource_id,
      payload: action.payload
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.ok === false) {
    await recordTelegramAudit({
      restaurantId: action.restaurant_id,
      branchId: action.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId: connection.telegram_user_id,
      action: action.action_type,
      entityType: action.resource_type,
      entityId: action.resource_id,
      outcome: "failed",
      metadata: { status: response.status, error: json?.error ?? "internal_action_failed" }
    });
    throw new Error(json?.error ?? "internal_action_failed");
  }

  return { ok: true, message: json?.data?.message ?? "Đã thực hiện." };
}

async function configureTelegramCommands() {
  if (!bot) return;
  await bot.api.setMyCommands([
    { command: "menu", description: "Mở trung tâm vận hành" },
    { command: "ops", description: "Xem bảng điều hành realtime" },
    { command: "status", description: "Xem kết nối và phạm vi quyền" },
    { command: "tinhhinh", description: "Tóm tắt vận hành hiện tại" },
    { command: "doanhthu", description: "Tóm tắt doanh thu" },
    { command: "tonkho", description: "Cảnh báo tồn kho" },
    { command: "help", description: "Hướng dẫn thao tác nhanh" }
  ]);
}

async function replyWithOpsMenu(ctx: Context, headline = "LogiVN Ops Center") {
  if (!ctx.from) {
    await ctx.reply("Không xác định được tài khoản Telegram.");
    return;
  }

  const connections = await getTelegramConnectionsForUser(ctx.from.id);
  const keyboard = new InlineKeyboard();

  if (connections.length === 0) {
    keyboard.url("Mở Dashboard", absoluteAppUrl("/dashboard/settings?section=notifications"));
    await ctx.reply(`${headline}\n\nTelegram này chưa nối với quán. Hãy tạo link kết nối trong Dashboard.`, {
      reply_markup: keyboard
    });
    return;
  }

  keyboard
    .text("Hôm nay", await signedMenuCallback(connections[0], "ops_board"))
    .text("Đơn nóng", await signedMenuCallback(connections[0], "hot_orders"))
    .row()
    .text("Thanh toán", await signedMenuCallback(connections[0], "payments"))
    .text("Đặt bàn", await signedMenuCallback(connections[0], "reservations"))
    .row()
    .text("Nhân sự", await signedMenuCallback(connections[0], "staff"))
    .text("AI Ops", await signedMenuCallback(connections[0], "tinhhinh"))
    .row()
    .text("Tồn kho", await signedMenuCallback(connections[0], "tonkho"))
    .text("Kết nối", await signedMenuCallback(connections[0], "status"))
    .row()
    .url("Dashboard", absoluteAppUrl("/dashboard/ai-ops"));

  const connectionSummary = connections
    .slice(0, 3)
    .map((connection) => `- ${connectionLabel(connection)} · ${connection.role}`)
    .join("\n");
  const extra = connections.length > 3 ? `\n+${connections.length - 3} kết nối khác` : "";

  await ctx.reply(compactTelegramText(`${headline}\n\n${connectionSummary}${extra}\n\nChọn việc cần xử lý.`), {
    reply_markup: keyboard
  });
}

async function replyWithHelp(ctx: Context) {
  const keyboard = new InlineKeyboard();
  const connections = ctx.from ? await getTelegramConnectionsForUser(ctx.from.id) : [];
  if (connections.length > 0) keyboard.text("Mở menu", await signedMenuCallback(connections[0], "menu")).row();
  keyboard.url("Dashboard", absoluteAppUrl("/dashboard/settings?section=notifications"));

  await ctx.reply(
    [
      "LogiVN Ops Bot",
      "",
      "/menu - thao tác nhanh",
      "/ops - bảng điều hành realtime",
      "/status - kết nối hiện tại",
      "/tinhhinh - tình hình vận hành",
      "/doanhthu - doanh thu",
      "/tonkho - tồn kho"
    ].join("\n"),
    { reply_markup: keyboard }
  );
}

async function replyWithConnectionStatus(ctx: Context) {
  if (!ctx.from) {
    await ctx.reply("Không xác định được tài khoản Telegram.");
    return;
  }

  const connections = await getTelegramConnectionsForUser(ctx.from.id);
  if (connections.length === 0) {
    await replyWithOpsMenu(ctx, "Chưa có kết nối Telegram.");
    return;
  }

  const rows = connections.map((connection) => {
    const permissions = connection.role === "ADMIN" ? "toàn quyền" : `${connection.permissions.length} quyền`;
    return `- ${connectionLabel(connection)} · ${connection.role} · ${permissions}`;
  });

  const keyboard = new InlineKeyboard()
    .text("Mở menu", await signedMenuCallback(connections[0], "menu"))
    .row()
    .url("Quản lý kết nối", absoluteAppUrl("/dashboard/settings?section=notifications"));
  await ctx.reply(compactTelegramText(`Kết nối đang hoạt động\n\n${rows.join("\n")}`), { reply_markup: keyboard });
}

async function handleTelegramMenuAction(ctx: Context, action: TelegramMenuAction, connection?: TelegramConnection) {
  if (action === "menu") {
    await replyWithOpsMenu(ctx);
    return;
  }
  if (action === "help") {
    await replyWithHelp(ctx);
    return;
  }
  if (action === "status") {
    await replyWithConnectionStatus(ctx);
    return;
  }
  if (action === "ops_board") {
    await replyWithOpsBoard(ctx, connection);
    return;
  }
  if (action === "hot_orders" || action === "payments" || action === "reservations" || action === "staff") {
    await replyWithOpsSlice(ctx, action, connection);
    return;
  }

  await handleAiOpsCommand(ctx, action, "");
}

async function replyWithOpsBoard(ctx: Context, preferredConnection?: TelegramConnection) {
  const connection = preferredConnection ?? (await firstConnectionForContext(ctx));
  if (!connection) {
    await replyWithOpsMenu(ctx, "Chưa có kết nối Telegram.");
    return;
  }

  const board = await getTelegramOpsBoard(connection);
  const counts = board.counts;
  const keyboard = new InlineKeyboard()
    .text("Làm mới", await signedMenuCallback(connection, "ops_board"))
    .text("AI tóm tắt", await signedMenuCallback(connection, "tinhhinh"))
    .row()
    .text("Đơn nóng", await signedMenuCallback(connection, "hot_orders"))
    .text("Thanh toán", await signedMenuCallback(connection, "payments"))
    .row()
    .url("Mở Dashboard", absoluteAppUrl("/dashboard"));

  await ctx.reply(
    compactTelegramText(
      [
        `Hôm nay · ${board.scopeLabel}`,
        "",
        `Đơn mở: ${counts.openOrders}`,
        `Cần xác nhận: ${counts.pendingOrders} · SLA trễ: ${counts.lateOrders}`,
        `VietQR chờ: ${counts.waitingPayments}`,
        `Giao hàng mở: ${counts.openDeliveries}`,
        `Đặt bàn hôm nay: ${counts.todayReservations} · Chờ cọc: ${counts.depositReservations}`,
        `Gọi phục vụ: ${counts.openServiceRequests}`,
        `Nhân sự chờ duyệt: ${counts.pendingStaffRequests}`,
        counts.failedTelegram > 0 ? `Telegram lỗi gửi: ${counts.failedTelegram}` : "Telegram ổn định"
      ].join("\n")
    ),
    { reply_markup: keyboard }
  );
}

async function replyWithOpsSlice(ctx: Context, action: Extract<TelegramMenuAction, "hot_orders" | "payments" | "reservations" | "staff">, preferredConnection?: TelegramConnection) {
  const connection = preferredConnection ?? (await firstConnectionForContext(ctx));
  if (!connection) {
    await replyWithOpsMenu(ctx, "Chưa có kết nối Telegram.");
    return;
  }

  const board = await getTelegramOpsBoard(connection);
  const keyboard = new InlineKeyboard()
    .text("Làm mới", await signedMenuCallback(connection, action))
    .text("Tổng quan", await signedMenuCallback(connection, "ops_board"))
    .row()
    .url("Mở Dashboard", absoluteAppUrl(routeForOpsSlice(action)));

  await ctx.reply(formatOpsSlice(action, board), { reply_markup: keyboard });
}

async function firstConnectionForContext(ctx: Context) {
  if (!ctx.from) return null;
  const connections = await getTelegramConnectionsForUser(ctx.from.id);
  return connections[0] ?? null;
}

function formatOpsSlice(action: Extract<TelegramMenuAction, "hot_orders" | "payments" | "reservations" | "staff">, board: Awaited<ReturnType<typeof getTelegramOpsBoard>>) {
  const counts = board.counts;
  if (action === "hot_orders") {
    return compactTelegramText(
      [
        `Đơn nóng · ${board.scopeLabel}`,
        "",
        `Cần xác nhận: ${counts.pendingOrders}`,
        `Trễ SLA: ${counts.lateOrders}`,
        `Giao hàng mở: ${counts.openDeliveries}`,
        "",
        "Ưu tiên xử lý các card mới nhất trong chat hoặc mở Dashboard."
      ].join("\n")
    );
  }
  if (action === "payments") {
    return compactTelegramText(
      [
        `Thanh toán · ${board.scopeLabel}`,
        "",
        `VietQR/chờ đối soát: ${counts.waitingPayments}`,
        counts.waitingPayments > 0 ? "Mở từng card VietQR để xác nhận hoặc đánh dấu sai số tiền." : "Không có thanh toán cần xử lý."
      ].join("\n")
    );
  }
  if (action === "reservations") {
    return compactTelegramText(
      [
        `Đặt bàn · ${board.scopeLabel}`,
        "",
        `Hôm nay: ${counts.todayReservations}`,
        `Chờ cọc/xác nhận: ${counts.depositReservations}`,
        counts.depositReservations > 0 ? "Ưu tiên xác nhận cọc hoặc từ chối nếu không giữ bàn." : "Luồng đặt bàn đang ổn."
      ].join("\n")
    );
  }
  return compactTelegramText(
    [
      `Nhân sự · ${board.scopeLabel}`,
      "",
      `Yêu cầu chờ duyệt: ${counts.pendingStaffRequests}`,
      counts.pendingStaffRequests > 0 ? "Duyệt nghỉ phép, đổi ca, tăng ca hoặc chấm công ngay trên card Telegram." : "Không có yêu cầu nhân sự đang chờ."
    ].join("\n")
  );
}

function routeForOpsSlice(action: Extract<TelegramMenuAction, "hot_orders" | "payments" | "reservations" | "staff">) {
  if (action === "payments") return "/dashboard/payments";
  if (action === "reservations") return "/dashboard/reservations";
  if (action === "staff") return "/dashboard/staff";
  return "/dashboard/orders";
}

async function handleAiOpsCommand(ctx: Context, command: AiOpsCommand, message: string) {
  if (!ctx.from) {
    await ctx.reply("Không xác định được tài khoản Telegram.");
    return;
  }
  if (await isTelegramUserRateLimited("ai-ops", ctx.from.id)) {
    await ctx.reply("AI Ops đang nhận quá nhiều yêu cầu từ tài khoản này. Vui lòng thử lại sau ít phút.");
    return;
  }

  const spec = aiOpsSpec(command, message);
  const connections = await getTelegramConnectionsForUser(ctx.from.id);
  if (connections.length === 0) {
    await ctx.reply("Telegram này chưa nối với LogiVN. Hãy tạo kết nối từ Dashboard.");
    return;
  }

  const eligibleConnections = connections.filter((connection) => hasPermission(connection, spec.permission));
  if (eligibleConnections.length === 0) {
    await ctx.reply("Bạn chưa có quyền xem dữ liệu vận hành này.");
    await recordAiOpsDenied(connections, command, spec.permission);
    return;
  }

  if (eligibleConnections.length > 1) {
    await promptAiOpsTenantSelection(ctx, eligibleConnections, command, spec);
    return;
  }

  await runAiOpsForConnection(ctx, eligibleConnections[0], command, spec);
}

async function runAiOpsForConnection(
  ctx: Context,
  connection: TelegramConnection,
  command: AiOpsCommand,
  spec: AiOpsRequestSpec
) {
  await touchConnection(connection.restaurant_id, connection.telegram_user_id).catch((error) => {
    logger.warn({ error: safeLogError(error), telegramUserId: connection.telegram_user_id }, "telegram connection touch failed");
  });

  await ctx.api.sendChatAction(ctx.chat!.id, "typing").catch(() => undefined);
  const loading = await ctx.reply("Đang đọc dữ liệu vận hành thật...");

  try {
    const result = await executeAiOpsCommand({
      command,
      message: spec.message,
      intent: spec.intent,
      connection
    });
    const keyboard = new InlineKeyboard().url(spec.actionLabel, absoluteAppUrl(spec.route));
    await ctx.reply(formatAiOpsReply(result), { reply_markup: keyboard });
    await ctx.api.deleteMessage(loading.chat.id, loading.message_id).catch(() => undefined);
    await recordTelegramAudit({
      restaurantId: connection.restaurant_id,
      branchId: connection.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId: connection.telegram_user_id,
      action: `telegram.ai_ops.${command}`,
      outcome: "accepted",
      metadata: { intent: result.intent, provider: result.provider, model: result.model }
    });
  } catch (error) {
    await ctx.reply(friendlyAiOpsError(error));
    await recordTelegramAudit({
      restaurantId: connection.restaurant_id,
      branchId: connection.branch_id,
      connectionId: connection.id,
      userId: connection.user_id,
      telegramUserId: connection.telegram_user_id,
      action: `telegram.ai_ops.${command}`,
      outcome: "failed",
      metadata: { error: error instanceof Error ? error.message : "ai_ops_failed" }
    });
  }
}

async function promptAiOpsTenantSelection(
  ctx: Context,
  connections: TelegramConnection[],
  command: AiOpsCommand,
  spec: AiOpsRequestSpec
) {
  const keyboard = new InlineKeyboard();
  const limitedConnections = connections.slice(0, numberEnv("TELEGRAM_TENANT_PICKER_MAX_OPTIONS", 8));
  for (const connection of limitedConnections) {
    const token = await createTelegramSession({
      connection,
      state: "ai_ops",
      payload: aiOpsSessionPayload(command, spec),
      ttlSeconds: numberEnv("TELEGRAM_SESSION_TTL_SECONDS", 300)
    });
    keyboard.text(connectionLabel(connection), `${TELEGRAM_SESSION_CALLBACK_PREFIX}${token}`).row();
  }

  await ctx.reply("Chọn quán/chi nhánh để chạy AI Ops.", { reply_markup: keyboard });
}

async function handleTelegramSessionCallback(ctx: Context, token: string) {
  if (!ctx.from) throw new Error("telegram_user_missing");
  const claimed = await claimTelegramSession(token, ctx.from.id);

  const menuPayload = menuActionPayloadSchema.safeParse(claimed.session.payload);
  if (menuPayload.success) {
    await ctx.answerCallbackQuery({ text: "Đang xử lý..." });
    await handleTelegramMenuAction(ctx, menuPayload.data.action, claimed.connection);
    return;
  }

  const payload = aiOpsSessionPayloadSchema.parse(claimed.session.payload);
  await ctx.answerCallbackQuery({ text: "Đang đọc dữ liệu..." });
  await ctx.editMessageReplyMarkup().catch(() => undefined);
  await ctx.editMessageText(`Đang đọc dữ liệu cho ${connectionLabel(claimed.connection)}...`).catch(() => undefined);
  await runAiOpsForConnection(ctx, claimed.connection, payload.command, {
    intent: payload.intent,
    permission: payload.permission,
    route: payload.route,
    actionLabel: payload.actionLabel,
    message: payload.message
  });
}

async function recordAiOpsDenied(connections: TelegramConnection[], command: AiOpsCommand, requiredPermission: string) {
  await Promise.all(
    connections.slice(0, 5).map((connection) =>
      recordTelegramAudit({
        restaurantId: connection.restaurant_id,
        branchId: connection.branch_id,
        connectionId: connection.id,
        userId: connection.user_id,
        telegramUserId: connection.telegram_user_id,
        action: `telegram.ai_ops.${command}`,
        outcome: "denied",
        metadata: { requiredPermission }
      })
    )
  );
}

function aiOpsSpec(command: AiOpsCommand, message: string) {
  if (command !== "chat") {
    const spec = AI_OPS_COMMANDS[command];
    return {
      ...spec,
      actionLabel: command === "doanhthu" ? "Mở báo cáo" : command === "tonkho" ? "Mở kho" : "Mở AI Ops",
      message: message ? `${spec.prompt}\n\nCâu hỏi thêm: ${message}` : spec.prompt
    };
  }

  return {
    intent: undefined,
    permission: "dashboard.view",
    route: "/dashboard/ai-ops",
    actionLabel: "Mở AI Ops",
    message
  };
}

const aiOpsSessionPayloadSchema = z.object({
  purpose: z.literal("ai_ops_select"),
  command: z.enum(["doanhthu", "tinhhinh", "tonkho", "chat"]),
  message: z.string().min(1).max(4096),
  intent: z.string().optional(),
  permission: z.string().min(3).max(120),
  route: z.string().min(1).max(160),
  actionLabel: z.string().min(1).max(80)
});

const menuActionPayloadSchema = z.object({
  purpose: z.literal("menu_action"),
  action: z.enum(TELEGRAM_MENU_ACTIONS)
});

function aiOpsSessionPayload(command: AiOpsCommand, spec: AiOpsRequestSpec) {
  return {
    purpose: "ai_ops_select",
    command,
    message: spec.message,
    intent: spec.intent,
    permission: spec.permission,
    route: spec.route,
    actionLabel: spec.actionLabel
  };
}

async function executeAiOpsCommand(input: {
  command: AiOpsCommand;
  message: string;
  intent?: string;
  connection: TelegramConnection;
}) {
  const endpoint = new URL("/api/internal/telegram/ai-ops", readEnv("LOGIVN_APP_INTERNAL_URL", readEnv("NEXT_PUBLIC_APP_URL")));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": requiredEnv("LOGIVN_INTERNAL_API_KEY")
    },
    body: JSON.stringify({
      command: input.command,
      message: input.message,
      intent: input.intent,
      restaurantId: input.connection.restaurant_id,
      branchId: input.connection.branch_id,
      actorUserId: input.connection.user_id,
      actorRole: input.connection.role
    }),
    signal: AbortSignal.timeout(numberEnv("TELEGRAM_AI_OPS_TIMEOUT_MS", 45_000))
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.ok === false) throw new Error(json?.error ?? "ai_ops_failed");
  return json.data as { reply: string; intent: string; intentLabel: string; provider: string; model: string };
}

function formatAiOpsReply(result: { reply: string; intentLabel?: string }) {
  const prefix = result.intentLabel ? `${result.intentLabel}\n` : "";
  return compactTelegramText(`${prefix}${result.reply}`);
}

function compactTelegramText(value: string, maxLength = 1800) {
  const normalized = value.replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function actionsForEvent(event: OperationalTelegramEvent): TelegramActionType[] {
  if (isTestEvent(event)) return [];
  if (event.type === "order.created") return ["order.confirm", "order.cancel"];
  if (event.type === "order.confirmed") {
    if (event.order.fulfillmentType === "DELIVERY" && event.order.deliveryStatus === "accepted") return ["delivery.out_for_delivery"];
    return ["order.done"];
  }
  if (event.type === "order.delivery_status_changed") {
    if (event.delivery.status === "requested") return ["delivery.accept", "delivery.reject"];
    if (event.delivery.status === "accepted") return ["delivery.out_for_delivery"];
    if (event.delivery.status === "out_for_delivery") return ["delivery.delivered"];
  }
  if (event.type === "service_request.created") return ["service_request.resolve"];
  if (event.type === "payment.waiting_confirm") return ["payment.confirm", "payment.amount_mismatch"];
  if (event.type === "reservation.created") return ["reservation.reject"];
  if (event.type === "reservation.deposit_submitted") return ["reservation.confirm", "reservation.reject"];
  if (event.type === "staff.request_created") return ["staff_request.approve", "staff_request.reject"];
  return [];
}

function requiredPermissionForEvent(event: OperationalTelegramEvent) {
  if (
    event.type === "order.created" ||
    event.type === "order.confirmed" ||
    event.type === "order.completed" ||
    event.type === "order.cancelled" ||
    event.type === "order.delivery_status_changed" ||
    event.type === "sla.warning"
  ) {
    return "orders.view";
  }
  if (event.type === "payment.waiting_confirm" || event.type === "payment.received") return "payments.view";
  if (
    event.type === "reservation.created" ||
    event.type === "reservation.deposit_submitted" ||
    event.type === "reservation.confirmed" ||
    event.type === "reservation.rejected" ||
    event.type === "reservation.cancelled" ||
    event.type === "reservation.checked_in" ||
    event.type === "reservation.seated" ||
    event.type === "reservation.no_show" ||
    event.type === "reservation.rescheduled"
  ) {
    return "reservations.manage";
  }
  if (event.type === "inventory.low") return "inventory.view";
  if (event.type === "service_request.created" || event.type === "service_request.resolved") return "orders.view";
  if (event.type === "staff.request_created" || event.type === "staff.request_reviewed") return "approvals.review";
  if (event.type === "platform.alert") return "notifications.manage";
  return "notifications.manage";
}

function resourceForEvent(event: OperationalTelegramEvent, actionType: TelegramActionType) {
  if (
    event.type === "order.created" ||
    event.type === "order.confirmed" ||
    event.type === "order.completed" ||
    event.type === "order.cancelled" ||
    event.type === "order.delivery_status_changed"
  ) {
    return { type: "order", id: event.order.id };
  }
  if (event.type === "payment.waiting_confirm" || event.type === "payment.received") return { type: "order", id: event.payment.orderId };
  if (
    event.type === "reservation.created" ||
    event.type === "reservation.deposit_submitted" ||
    event.type === "reservation.confirmed" ||
    event.type === "reservation.rejected" ||
    event.type === "reservation.cancelled" ||
    event.type === "reservation.checked_in" ||
    event.type === "reservation.seated" ||
    event.type === "reservation.no_show" ||
    event.type === "reservation.rescheduled"
  ) {
    return { type: "reservation", id: event.reservation.id };
  }
  if (event.type === "service_request.created" || event.type === "service_request.resolved") return { type: "service_request", id: event.serviceRequest.id };
  if (event.type === "staff.request_created" || event.type === "staff.request_reviewed") return { type: "staff_request", id: event.staffRequest.id };
  if (event.type === "sla.warning") return { type: "order", id: event.sla.orderId };
  return { type: actionType.split(".")[0], id: event.eventId };
}

function labelForAction(actionType: TelegramActionType) {
  const labels: Record<TelegramActionType, string> = {
    "order.confirm": "Xác nhận",
    "order.cancel": "Huỷ",
    "order.done": "Xong",
    "delivery.accept": "Nhận giao",
    "delivery.out_for_delivery": "Xuất phát",
    "delivery.delivered": "Đã giao",
    "delivery.reject": "Từ chối giao",
    "payment.confirm": "Xác nhận",
    "payment.amount_mismatch": "Sai số tiền",
    "service_request.resolve": "Đã xử lý",
    "reservation.confirm": "Đồng ý",
    "reservation.reject": "Từ chối",
    "staff_request.approve": "Duyệt",
    "staff_request.reject": "Từ chối"
  };
  return labels[actionType];
}

function connectionLabel(connection: TelegramConnection) {
  const restaurant = connection.restaurant_name ?? `Quán ${shortId(connection.restaurant_id)}`;
  const branch = connection.branch_name ?? (connection.branch_id ? `CN ${shortId(connection.branch_id)}` : "Toàn quán");
  return compactTelegramText(`${restaurant} · ${branch}`, 64);
}

function isTestEvent(event: OperationalTelegramEvent) {
  return event.eventId.startsWith("telegram.test:");
}

async function signedMenuCallback(connection: TelegramConnection, action: TelegramMenuAction) {
  const token = await createTelegramSession({
    connection,
    state: "idle",
    payload: { purpose: "menu_action", action },
    ttlSeconds: numberEnv("TELEGRAM_MENU_SESSION_TTL_SECONDS", 300)
  });
  return `${TELEGRAM_SESSION_CALLBACK_PREFIX}${token}`;
}

function absoluteAppUrl(path: string) {
  return new URL(path, readEnv("NEXT_PUBLIC_APP_URL", "https://logivn.com")).toString();
}

function friendlyCallbackError(error: unknown) {
  const message = error instanceof Error ? error.message : "callback_failed";
  if (message.includes("rate_limited")) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
  if (message.includes("session_expired")) return "Lựa chọn này đã hết hạn. Hãy gửi lại yêu cầu.";
  if (message.includes("expired")) return "Nút này đã hết hạn.";
  if (message.includes("permission")) return "Bạn chưa có quyền thao tác.";
  if (message.includes("replayed")) return "Nút này đã được dùng.";
  if (message.includes("authorized")) return "Telegram này chưa được kết nối đúng tài khoản.";
  return "Không thể thực hiện thao tác. Dashboard sẽ có log chi tiết.";
}

function friendlyConnectError(error: unknown) {
  const message = error instanceof Error ? error.message : "connect_failed";
  if (message.includes("expired")) return "Link kết nối đã hết hạn. Hãy tạo link mới trong Dashboard.";
  if (message.includes("used")) return "Link kết nối này đã được dùng. Hãy tạo link mới trong Dashboard.";
  if (message.includes("already_connected")) return "Telegram này đang nối với tài khoản khác trong quán.";
  if (message.includes("not_found") || message.includes("signature")) return "Link kết nối không hợp lệ hoặc đã hết hạn.";
  return "Chưa kết nối được Telegram. Dashboard sẽ có log chi tiết.";
}

function friendlyAiOpsError(error: unknown) {
  const message = error instanceof Error ? error.message : "ai_ops_failed";
  if (message.includes("quota") || message.includes("gói") || message.includes("Premium")) return message;
  if (message.includes("429") || message.includes("quá nhanh")) return "AI Ops đang bị gọi quá nhanh. Vui lòng thử lại sau ít phút.";
  return "Chưa chạy được AI Ops lúc này. Dashboard sẽ có log chi tiết.";
}

function safeLogError(error: unknown): Record<string, unknown> {
  if (error instanceof TelegramRateLimitError) {
    return {
      name: error.name,
      message: error.message,
      retryAfterMs: error.retryAfterMs,
      cause: safeLogError(error.cause)
    };
  }

  if (error instanceof GrammyError) {
    return {
      name: error.name,
      message: error.message,
      errorCode: error.error_code,
      description: error.description,
      method: error.method,
      retryAfter: error.parameters?.retry_after ?? null
    };
  }

  if (error instanceof HttpError) {
    return {
      name: error.name,
      message: error.message
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: "NonError",
    message: typeof error === "string" ? error : "unknown_error"
  };
}

function telegramErrorMessage(error: unknown) {
  if (error instanceof TelegramRateLimitError) return `429:retry_after:${Math.ceil(error.retryAfterMs / 1000)}s`;
  if (error instanceof GrammyError) return `${error.error_code}:${error.description}`;
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return "telegram_delivery_failed";
}

async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: Parameters<Bot["api"]["sendMessage"]>[2]
) {
  if (!bot) throw new Error("telegram_not_configured");
  try {
    return await bot.api.sendMessage(chatId, text, options);
  } catch (error) {
    const retryAfterMs = telegramRetryAfterMs(error);
    if (retryAfterMs) throw new TelegramRateLimitError(retryAfterMs, error);
    throw error;
  }
}

function telegramRetryAfterMs(error: unknown) {
  if (error instanceof TelegramRateLimitError) return error.retryAfterMs;
  if (error instanceof GrammyError && error.error_code === 429) {
    const retryAfterSeconds = Number(error.parameters.retry_after ?? 0);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1000, numberEnv("TELEGRAM_MAX_RETRY_AFTER_MS", 300_000));
    }
  }
  return 0;
}

function telegramBackoffStrategy(attemptsMade: number, _type?: string, error?: Error) {
  const retryAfterMs = telegramRetryAfterMs(error);
  if (retryAfterMs) return retryAfterMs;
  const exponentialDelay = telegramQueueDefinition.backoffDelayMs * 2 ** Math.max(attemptsMade - 1, 0);
  return Math.min(exponentialDelay, numberEnv("TELEGRAM_MAX_RETRY_DELAY_MS", 120_000));
}

function shortId(id: string) {
  return id.replaceAll("-", "").slice(0, 6).toUpperCase();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, jobName: string) {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`telegram_job_timeout:${jobName}:${timeoutMs}`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

type TelegramIngressScope = "connect" | "callback" | "ai-ops";

async function isTelegramUserRateLimited(scope: TelegramIngressScope, telegramUserId: number) {
  if (!connection) return false;
  const config = telegramIngressRateLimitConfig(scope);
  const result = await checkRedisRateLimit(connection, {
    key: tenantRateLimitKey("telegram", scope, String(telegramUserId)),
    limit: config.limit,
    windowMs: config.windowMs
  });

  if (result.allowed) return false;
  logger.warn(
    {
      scope,
      telegramUserId,
      count: result.count,
      limit: result.limit,
      resetInMs: result.resetInMs
    },
    "telegram ingress rate limit exceeded"
  );
  return true;
}

function telegramIngressRateLimitConfig(scope: TelegramIngressScope) {
  if (scope === "connect") {
    return {
      limit: numberEnv("TELEGRAM_CONNECT_RATE_LIMIT_MAX", 8),
      windowMs: numberEnv("TELEGRAM_CONNECT_RATE_LIMIT_WINDOW_MS", 60_000)
    };
  }

  if (scope === "ai-ops") {
    return {
      limit: numberEnv("TELEGRAM_AI_OPS_RATE_LIMIT_MAX", 8),
      windowMs: numberEnv("TELEGRAM_AI_OPS_RATE_LIMIT_WINDOW_MS", 60_000)
    };
  }

  return {
    limit: numberEnv("TELEGRAM_CALLBACK_RATE_LIMIT_MAX", 30),
    windowMs: numberEnv("TELEGRAM_CALLBACK_RATE_LIMIT_WINDOW_MS", 60_000)
  };
}

class TelegramRateLimitError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    public readonly cause: unknown
  ) {
    super(`telegram_rate_limited:${retryAfterMs}`);
    this.name = "TelegramRateLimitError";
  }
}

function verifyTelegramWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("x-telegram-bot-api-secret-token");
  if (!telegramWebhookSecret || !provided || !secureEqual(provided, telegramWebhookSecret)) {
    return res.status(401).json({ ok: false, error: "invalid_telegram_webhook_secret" });
  }
  return next();
}

function secureEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function numberEnv(name: string, fallback: number) {
  const value = Number(readEnv(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
