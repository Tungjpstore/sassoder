"use client";

import { useEffect, useMemo, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export type LogiVnRealtimeState = "connecting" | "connected" | "error";

export type LogiVnRealtimeEvent =
  | "new_order"
  | "order_confirmed"
  | "kitchen_update"
  | "payment_update"
  | "staff_notification"
  | "table_status_change";

export const OPERATIONAL_REALTIME_EVENTS: readonly LogiVnRealtimeEvent[] = [
  "new_order",
  "order_confirmed",
  "kitchen_update",
  "payment_update",
  "staff_notification",
  "table_status_change"
];

type JoinAck = {
  ok?: boolean;
  error?: string;
};

type TokenResponse =
  | {
      ok: true;
      data: {
        restaurantId: string;
        token: string;
        expiresAt: string;
      };
    }
  | {
      ok: false;
      error?: string;
    };

type UseVpsRealtimeOptions = {
  restaurantId: string;
  tableId?: string | null;
  orderId?: string | null;
  events?: readonly LogiVnRealtimeEvent[];
  enabled?: boolean;
  onEvent: (event: LogiVnRealtimeEvent, payload: Record<string, unknown>) => void;
  onStateChange?: (state: LogiVnRealtimeState) => void;
};

export function useVpsRealtime({
  restaurantId,
  tableId,
  orderId,
  events = OPERATIONAL_REALTIME_EVENTS,
  enabled = true,
  onEvent,
  onStateChange
}: UseVpsRealtimeOptions) {
  const onEventRef = useRef(onEvent);
  const onStateChangeRef = useRef(onStateChange);
  const eventKey = useMemo(() => events.join("|"), [events]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (!enabled || !restaurantId) return;

    const url = publicRealtimeUrl();
    if (!url) return;

    const abortController = new AbortController();
    let socket: Socket | null = null;
    let disposed = false;
    const activeEvents = eventKey.split("|").filter(Boolean) as LogiVnRealtimeEvent[];

    onStateChangeRef.current?.("connecting");

    void connectWithDashboardToken({
      signal: abortController.signal,
      restaurantId
    })
      .then((token) => {
        if (disposed) return;
        socket = io(url, {
          auth: { token },
          reconnection: true,
          reconnectionAttempts: Number.POSITIVE_INFINITY,
          timeout: 6000,
          transports: ["websocket", "polling"],
          withCredentials: true
        });

        socket.on("connect", () => {
          socket?.emit(
            "join_restaurant",
            {
              restaurantId,
              ...(tableId ? { tableId } : {}),
              ...(orderId ? { orderId } : {})
            },
            (ack?: JoinAck) => {
              onStateChangeRef.current?.(ack?.ok === false ? "error" : "connected");
            }
          );
        });

        socket.io.on("reconnect_attempt", () => {
          onStateChangeRef.current?.("connecting");
        });

        socket.on("connect_error", () => {
          onStateChangeRef.current?.("error");
        });

        socket.on("disconnect", (reason) => {
          if (reason !== "io client disconnect") onStateChangeRef.current?.("error");
        });

        for (const event of activeEvents) {
          socket.on(event, (payload: Record<string, unknown> = {}) => {
            onEventRef.current(event, payload);
          });
        }
      })
      .catch((error: unknown) => {
        if (disposed || abortController.signal.aborted) return;
        console.warn("[vps-realtime] token handshake failed", error);
        onStateChangeRef.current?.("error");
      });

    return () => {
      disposed = true;
      abortController.abort();
      for (const event of activeEvents) {
        socket?.off(event);
      }
      socket?.disconnect();
      socket = null;
    };
  }, [enabled, eventKey, orderId, restaurantId, tableId]);
}

async function connectWithDashboardToken({ signal, restaurantId }: { signal: AbortSignal; restaurantId: string }) {
  const response = await fetch("/api/realtime/token", {
    cache: "no-store",
    credentials: "same-origin",
    signal
  });
  if (!response.ok) throw new Error(`token_request_failed:${response.status}`);

  const body = (await response.json()) as TokenResponse;
  if (!body.ok || body.data.restaurantId !== restaurantId || !body.data.token) {
    throw new Error("token_response_invalid");
  }
  return body.data.token;
}

function publicRealtimeUrl() {
  return process.env.NEXT_PUBLIC_LOGIVN_WS_PUBLIC_URL || "https://ws.logivn.com";
}
