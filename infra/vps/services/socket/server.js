import { createAdapter } from "@socket.io/redis-adapter";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import { internalApiKey, parseOrigins, readEnv, servicePort } from "../shared/env.js";
import { createHttpApp, listen } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";
import { assertRedisHealthy, createRedisConnection } from "../shared/redis.js";
import { orderRoom, realtimeEvents, restaurantRoom, tableRoom } from "../shared/rooms.js";

const logger = createLogger("socket");
const app = createHttpApp({ logger, serviceName: "socket" });
const httpServer = createServer(app);
const pubClient = createRedisConnection("socket-pub");
const subClient = pubClient.duplicate({ connectionName: "socket-sub" });

const roomJoinSchema = z.object({
  restaurantId: z.string().min(1),
  tableId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional()
});

const broadcastSchema = z.object({
  event: z.enum(realtimeEvents),
  restaurantId: z.string().min(1),
  tableId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

const io = new Server(httpServer, {
  cors: {
    origin: parseOrigins(),
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingTimeout: 30_000,
  pingInterval: 25_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false
  }
});

await pubClient.connect();
await subClient.connect();
io.adapter(createAdapter(pubClient, subClient));

io.use((socket, next) => {
  const provided = socket.handshake.auth?.internalKey || socket.handshake.headers["x-logivn-internal-key"];
  const token = socket.handshake.auth?.token;
  const publicClient = socket.handshake.auth?.publicClient === true || socket.handshake.auth?.publicClient === "true";
  const realtimeClaims = verifyRealtimeToken(token);

  if (realtimeClaims) {
    socket.data.realtimeClaims = realtimeClaims;
    return next();
  }

  if (provided === internalApiKey() || (publicClient && allowPublicClients())) {
    return next();
  }

  return next(new Error("unauthorized"));
});

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "socket connected");

  socket.on("join_restaurant", (input, callback) => {
    try {
      const payload = roomJoinSchema.parse(input);
      const claims = socket.data.realtimeClaims;
      if (claims?.restaurantId && claims.restaurantId !== payload.restaurantId) {
        callback?.({ ok: false, error: "restaurant_forbidden" });
        return;
      }

      if (claims?.scope === "customer_order") {
        if (payload.tableId || !payload.orderId || claims.orderId !== payload.orderId) {
          callback?.({ ok: false, error: "order_forbidden" });
          return;
        }
        socket.join(orderRoom(payload.orderId));
        callback?.({ ok: true });
        return;
      }

      socket.join(restaurantRoom(payload.restaurantId));
      if (payload.tableId) socket.join(tableRoom(payload.restaurantId, payload.tableId));
      if (payload.orderId) socket.join(orderRoom(payload.orderId));
      callback?.({ ok: true });
    } catch (error) {
      callback?.({ ok: false, error: error instanceof Error ? error.message : "invalid_room" });
    }
  });

  socket.on("disconnect", (reason) => {
    logger.info({ socketId: socket.id, reason }, "socket disconnected");
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await assertRedisHealthy(pubClient);
    res.json({ ok: true, redis: "connected", sockets: io.engine.clientsCount });
  } catch (error) {
    res.status(503).json({ ok: false, error: error instanceof Error ? error.message : "redis_unhealthy" });
  }
});

app.post("/broadcast", (req, res) => {
  const provided = req.header("x-logivn-internal-key") || req.header("x-api-key");
  if (provided !== internalApiKey()) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const payload = broadcastSchema.parse(req.body);
  const rooms = [restaurantRoom(payload.restaurantId)];
  if (payload.tableId) rooms.push(tableRoom(payload.restaurantId, payload.tableId));
  if (payload.orderId) rooms.push(orderRoom(payload.orderId));

  for (const room of rooms) {
    io.to(room).emit(payload.event, payload.payload);
  }

  return res.json({ ok: true, event: payload.event, rooms });
});

const port = servicePort(3200);
listen(httpServer, port, logger);

function allowPublicClients() {
  return readEnv("LOGIVN_SOCKET_ALLOW_PUBLIC_CLIENTS", "false") === "true";
}

function verifyRealtimeToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;

  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return null;

    const expected = signPayload(encodedPayload);
    if (!safeEqual(signature, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.restaurantId !== "string" || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= now) return null;
    if (payload.scope === "dashboard") return payload;
    if (
      payload.scope === "customer_order" &&
      typeof payload.customerSessionId === "string" &&
      typeof payload.orderId === "string"
    ) {
      return payload;
    }
    return null;
  } catch (error) {
    logger.warn({ error }, "invalid realtime token");
    return null;
  }
}

function signPayload(encodedPayload) {
  return createHmac("sha256", internalApiKey()).update(encodedPayload).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
