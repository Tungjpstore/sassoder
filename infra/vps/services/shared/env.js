export const queueNames = [
  "notifications",
  "invoices",
  "ai-jobs",
  "image-optimization",
  "analytics",
  "delivery-routing",
  "cron-tasks"
];

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
  return requiredEnv("REDIS_URL");
}

export function internalApiKey() {
  return requiredEnv("LOGIVN_INTERNAL_API_KEY");
}

export function servicePort(defaultPort) {
  return numberEnv("PORT", defaultPort);
}
