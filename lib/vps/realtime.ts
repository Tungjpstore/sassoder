import "server-only";

export type VpsRealtimeEvent =
  | "new_order"
  | "order_confirmed"
  | "kitchen_update"
  | "payment_update"
  | "staff_notification"
  | "table_status_change";

type BroadcastInput = {
  event: VpsRealtimeEvent;
  restaurantId: string;
  tableId?: string | null;
  orderId?: string | null;
  payload?: Record<string, unknown>;
};

export async function broadcastVpsRealtime(input: BroadcastInput) {
  const wsUrl = internalRealtimeUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;

  if (!wsUrl || !internalKey) {
    console.warn("[vps-realtime] skipped: missing LOGIVN_WS_INTERNAL_URL/LOGIVN_WS_PUBLIC_URL or LOGIVN_INTERNAL_API_KEY", {
      event: input.event,
      restaurantId: input.restaurantId,
      orderId: input.orderId ?? null
    });
    return { sent: false, reason: "missing_config" };
  }

  const response = await fetch(new URL("/broadcast", wsUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify({
      event: input.event,
      restaurantId: input.restaurantId,
      ...(input.tableId ? { tableId: input.tableId } : {}),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      payload: {
        ...(input.payload ?? {}),
        event: input.event,
        restaurantId: input.restaurantId,
        orderId: input.orderId ?? null,
        occurredAt: new Date().toISOString()
      }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(1200)
  }).catch((error) => {
    console.error("[vps-realtime] broadcast failed", {
      event: input.event,
      restaurantId: input.restaurantId,
      orderId: input.orderId ?? null,
      error
    });
    return null;
  });

  if (!response) return { sent: false, reason: "request_failed" };
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[vps-realtime] broadcast rejected", {
      event: input.event,
      restaurantId: input.restaurantId,
      orderId: input.orderId ?? null,
      status: response.status,
      body: body.slice(0, 500)
    });
    return { sent: false, reason: "broadcast_rejected" };
  }

  return { sent: true };
}

function internalRealtimeUrl() {
  return process.env.LOGIVN_WS_INTERNAL_URL || process.env.LOGIVN_WS_PUBLIC_URL || "";
}
