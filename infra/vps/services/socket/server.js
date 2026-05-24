import { createAdapter } from "@socket.io/redis-adapter";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import { internalApiKey, parseOrigins, servicePort } from "../shared/env.js";
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
  const publicClient = socket.handshake.auth?.publicClient === true || socket.handshake.auth?.publicClient === "true";

  if (publicClient || provided === internalApiKey()) {
    return next();
  }

  return next(new Error("unauthorized"));
});

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "socket connected");

  socket.on("join_restaurant", (input, callback) => {
    try {
      const payload = roomJoinSchema.parse(input);
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
