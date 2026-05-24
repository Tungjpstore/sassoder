import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { internalApiKey, parseOrigins } from "./env.js";
import { metricsRegistry } from "./metrics.js";

export function createHttpApp({ logger, serviceName }) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || parseOrigins().includes(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed: ${origin}`));
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
  app.use(
    pinoHttp({
      logger,
      customProps() {
        return { service: serviceName };
      }
    })
  );

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: serviceName,
      uptime: process.uptime()
    });
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", metricsRegistry().contentType);
    res.send(await metricsRegistry().metrics());
  });

  return app;
}

export function requireInternalApiKey(req, res, next) {
  const expected = internalApiKey();
  const provided = req.header("x-logivn-internal-key") || req.header("x-api-key");
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return next();
}

export function listen(app, port, logger) {
  const server = app.listen(port, () => {
    logger.info({ port }, "service listening");
  });

  const shutdown = () => {
    logger.info("received shutdown signal");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return server;
}
