import type { Redis } from "ioredis";
import { readEnv, requiredEnv } from "../shared/env.js";
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
  if (!webhookUrl) throw new Error(`${channel}_notification_adapter_not_configured`);

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
