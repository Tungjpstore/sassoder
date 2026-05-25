import pino from "pino";

export function createLogger(serviceName) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-api-key"]',
        'req.headers["x-logivn-internal-key"]',
        'req.headers["x-telegram-bot-api-secret-token"]',
        "headers.authorization",
        "headers.cookie",
        'headers["x-api-key"]',
        'headers["x-logivn-internal-key"]',
        'headers["x-telegram-bot-api-secret-token"]',
        "api.token",
        "ctx.api.token",
        "err.api.token",
        "err.ctx.api.token",
        "error.api.token",
        "error.ctx.api.token",
        "error.error.api.token",
        "error.error.ctx.api.token",
        "*.apiKey",
        "*.token",
        "*.password",
        "*.secret"
      ],
      censor: "[redacted]"
    },
    base: {
      service: serviceName,
      env: process.env.LOGIVN_ENV || "production"
    }
  });
}
