import type { Redis } from "ioredis";
import { readEnv, requiredEnv } from "../shared/env.js";
import { enqueueJob } from "../shared/queues.js";
import { createDomainWorker, type TenantJobData } from "./shared.mjs";

export function createNotificationWorkers(connection: Redis, logger: any) {
  return [
    createDomainWorker({
      queueName: "push.notifications",
      connection,
      logger,
      processor: async (job) => acknowledge("push", job.data)
    }),
    createDomainWorker({
      queueName: "email.notifications",
      connection,
      logger,
      processor: async (job) => acknowledge("email", job.data)
    })
  ];
}

async function acknowledge(channel: string, data: TenantJobData) {
  const webhookUrl = readEnv(`${channel.toUpperCase()}_NOTIFICATION_WEBHOOK_URL`);
  if (!webhookUrl) return enqueueDevTelegramFallback(channel, data);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": requiredEnv("LOGIVN_INTERNAL_API_KEY")
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) throw new Error(`${channel}_notification_delivery_failed:${response.status}`);

  return { channel, delivered: true, tenantId: data.tenantId, eventId: data.eventId ?? null };
}

async function enqueueDevTelegramFallback(channel: string, data: TenantJobData) {
  const eventId = `notification-${channel}:${String(data.eventId ?? data.type ?? Date.now()).replace(/[^A-Za-z0-9._:-]+/g, "_")}`.slice(0, 180);
  const summary = [
    `Channel: ${channel}`,
    `Event: ${String(data.type ?? "unknown")}`,
    `Tenant: ${String(data.tenantId ?? "unknown")}`,
    `Restaurant: ${String(data.restaurantId ?? "none")}`,
    `Event ID: ${String(data.eventId ?? "none")}`,
    "External provider is not configured; routed to Dev Telegram fallback."
  ].join("\n");

  const job = await enqueueJob({
    queueName: "platform.telegram.notifications",
    name: "platform.alert",
    priority: "high",
    data: {
      type: "platform.alert",
      tenantId: "platform",
      eventId,
      occurredAt: new Date().toISOString(),
      source: "system",
      alert: {
        severity: "warning",
        title: `${channel.toUpperCase()} notification routed to Dev Telegram`,
        summary,
        area: "queue"
      }
    },
    opts: {
      jobId: eventId
    }
  });

  return {
    channel,
    delivered: false,
    routedTo: "platform.telegram.notifications",
    fallbackJobId: job.id,
    tenantId: data.tenantId,
    eventId: data.eventId ?? null
  };
}
