"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

const customerOrderEvents = [
  "new_order",
  "order_confirmed",
  "kitchen_update",
  "payment_update"
] as const;

type TokenEnvelope = {
  ok?: boolean;
  data?: { restaurantId?: string; orderId?: string; token?: string; expiresAt?: string };
};

export function useCustomerOrderRealtime(input: {
  restaurantId: string;
  restaurantSlug: string;
  orderId: string | null | undefined;
  customerSessionId: string;
  customerSessionToken: string;
  enabled?: boolean;
  onUpdate: () => void | Promise<void>;
}) {
  const {
    customerSessionId,
    customerSessionToken,
    enabled,
    onUpdate,
    orderId,
    restaurantId,
    restaurantSlug
  } = input;
  const onUpdateRef = useRef(input.onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (
      enabled === false ||
      !restaurantId ||
      !orderId ||
      !customerSessionId ||
      !customerSessionToken
    ) return;

    const controller = new AbortController();
    let socket: Socket | null = null;
    let disposed = false;
    let refreshTimer: number | null = null;

    void requestCustomerRealtimeToken({
      restaurantId,
      restaurantSlug,
      orderId,
      customerSessionId,
      customerSessionToken,
      signal: controller.signal
    })
      .then(({ token, expiresAt }) => {
        if (disposed) return;
        socket = io(publicRealtimeUrl(), {
          auth: { token },
          reconnection: true,
          reconnectionAttempts: Number.POSITIVE_INFINITY,
          timeout: 6000,
          transports: ["websocket", "polling"],
          withCredentials: true
        });

        const scheduleTokenRefresh = (expiration: string) => {
          if (refreshTimer !== null) window.clearTimeout(refreshTimer);
          const expiresAtMs = new Date(expiration).getTime();
          const delay = Number.isFinite(expiresAtMs)
            ? Math.max(1000, expiresAtMs - Date.now() - 30_000)
            : 240_000;
          refreshTimer = window.setTimeout(() => {
            void refreshCustomerToken();
          }, delay);
        };

        const refreshCustomerToken = async () => {
          if (disposed || controller.signal.aborted) return;
          try {
            const refreshed = await requestCustomerRealtimeToken({
              restaurantId,
              restaurantSlug,
              orderId,
              customerSessionId,
              customerSessionToken,
              signal: controller.signal
            });
            if (disposed || !socket) return;
            socket.auth = { token: refreshed.token };
            scheduleTokenRefresh(refreshed.expiresAt);
            if (socket.connected) {
              socket.disconnect();
              socket.connect();
            }
          } catch {
            if (!disposed && !controller.signal.aborted) {
              scheduleTokenRefresh(new Date(Date.now() + 30_000).toISOString());
            }
          }
        };
        scheduleTokenRefresh(expiresAt);

        socket.on("connect", () => {
          socket?.emit("join_restaurant", {
            restaurantId,
            orderId
          });
        });
        for (const event of customerOrderEvents) {
          socket.on(event, () => void onUpdateRef.current());
        }
      })
      .catch(() => {
        // Authenticated HTTP polling remains the fallback when realtime is unavailable.
      });

    return () => {
      disposed = true;
      controller.abort();
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      for (const event of customerOrderEvents) socket?.off(event);
      socket?.disconnect();
    };
  }, [
    customerSessionId,
    customerSessionToken,
    enabled,
    orderId,
    restaurantId,
    restaurantSlug
  ]);
}

async function requestCustomerRealtimeToken(input: {
  restaurantId: string;
  restaurantSlug: string;
  orderId: string;
  customerSessionId: string;
  customerSessionToken: string;
  signal: AbortSignal;
}) {
  const response = await fetch("/api/customer-realtime/token", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    signal: input.signal,
    headers: {
      "Content-Type": "application/json",
      "x-logivn-customer-session-token": input.customerSessionToken
    },
    body: JSON.stringify({
      restaurantSlug: input.restaurantSlug,
      orderId: input.orderId,
      customerSessionId: input.customerSessionId
    })
  });
  const envelope = await response.json().catch(() => null) as TokenEnvelope | null;
  if (
    !response.ok ||
    envelope?.ok !== true ||
    envelope.data?.restaurantId !== input.restaurantId ||
    envelope.data?.orderId !== input.orderId ||
    !envelope.data?.token ||
    !envelope.data?.expiresAt
  ) {
    throw new Error("customer_realtime_token_rejected");
  }
  return { token: envelope.data.token, expiresAt: envelope.data.expiresAt };
}

function publicRealtimeUrl() {
  return process.env.NEXT_PUBLIC_LOGIVN_WS_PUBLIC_URL || "https://ws.logivn.com";
}
