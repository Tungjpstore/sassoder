import pino from "pino";

export function createLogger(serviceName) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || "info",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "*.apiKey",
      "*.token",
      "*.password"
    ],
    base: {
      service: serviceName,
      env: process.env.LOGIVN_ENV || "production"
    }
  });
}
