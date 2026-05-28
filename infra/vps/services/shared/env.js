export const priorityNames = ["critical", "high", "normal", "low", "background"];

export const priorityValues = {
  critical: 1,
  high: 5,
  normal: 10,
  low: 50,
  background: 100
};

export const queueNames = [
  "telegram.notifications",
  "platform.telegram.notifications",
  "push.notifications",
  "email.notifications",
  "orders.processing",
  "orders.sla",
  "orders.retry",
  "payments.confirmation",
  "payments.retry",
  "payments.reconciliation",
  "ai.analytics",
  "ai.summary",
  "ai.reports",
  "ai.chat",
  "reservation.reminders",
  "reservation.expiry",
  "reservation.confirmation",
  "inventory.sync",
  "inventory.alerts",
  "staff.attendance",
  "staff.notifications",
  "staff.requests"
];

export const legacyQueueAliases = {
  "telegram-notifications": "telegram.notifications",
  "platform-telegram-notifications": "platform.telegram.notifications",
  notifications: "push.notifications",
  invoices: "payments.reconciliation",
  "ai-jobs": "ai.chat",
  "image-optimization": "ai.reports",
  analytics: "ai.analytics",
  "delivery-routing": "orders.processing",
  "cron-tasks": "ai.summary"
};

export function readEnv(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : value;
}

export function requiredEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function numberEnv(name, fallback) {
  const raw = readEnv(name);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseOrigins() {
  return readEnv("LOGIVN_ALLOWED_ORIGINS", "https://logivn.com,https://app.logivn.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function redisUrl() {
  const configuredUrl = readEnv("REDIS_URL");
  if (configuredUrl) return configuredUrl;

  const host = readEnv("REDIS_HOST", "redis");
  const port = numberEnv("REDIS_PORT", 6379);
  const db = numberEnv("REDIS_DB", 0);
  const password = requiredEnv("REDIS_PASSWORD");
  return `redis://:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

export function internalApiKey() {
  return requiredEnv("LOGIVN_INTERNAL_API_KEY");
}

export function servicePort(defaultPort) {
  return numberEnv("PORT", defaultPort);
}

export function bullMqPrefix() {
  return readEnv("BULLMQ_PREFIX", "logivn");
}

export function queueConcurrency(defaultConcurrency = 4) {
  return numberEnv("QUEUE_CONCURRENCY", numberEnv("WORKER_CONCURRENCY", defaultConcurrency));
}
