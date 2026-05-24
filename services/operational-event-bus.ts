import "server-only";

type BaseOperationalEvent = {
  eventId: string;
  restaurantId: string;
  tenantId?: string;
  branchId?: string | null;
  occurredAt?: string;
};

export type OperationalEvent =
  | (BaseOperationalEvent & {
      type: "order.created";
      order: {
        id: string;
        displayCode?: string;
        itemCount: number;
        total: number;
        tableName?: string | null;
        fulfillmentType?: "DINE_IN" | "PICKUP" | "DELIVERY";
        customerName?: string | null;
      };
    })
  | (BaseOperationalEvent & {
      type: "order.confirmed";
      order: {
        id: string;
        displayCode?: string;
        itemCount: number;
        total: number;
        tableName?: string | null;
        fulfillmentType?: "DINE_IN" | "PICKUP" | "DELIVERY";
        customerName?: string | null;
      };
    })
  | (BaseOperationalEvent & {
      type: "payment.waiting_confirm";
      payment: {
        orderId: string;
        billId?: string | null;
        amount: number;
        method: "QR" | "CASH";
        customerName?: string | null;
      };
    })
  | (BaseOperationalEvent & {
      type: "payment.received";
      payment: {
        orderId: string;
        billId?: string | null;
        amount: number;
        method: "QR" | "CASH";
        customerName?: string | null;
      };
    })
  | (BaseOperationalEvent & {
      type: "reservation.created";
      reservation: {
        id: string;
        startsAt: string;
        partySize: number;
        customerName?: string | null;
        depositRequiredAmount?: number;
      };
    })
  | (BaseOperationalEvent & {
      type: "inventory.low";
      inventory: {
        items: string[];
      };
    })
  | (BaseOperationalEvent & {
      type: "staff.checked_in";
      staff: {
        userId: string;
        staffId?: string | null;
        displayName?: string | null;
      };
    })
  | (BaseOperationalEvent & {
      type: "sla.warning";
      sla: {
        orderId: string;
        displayCode?: string;
        lateMinutes: number;
      };
    });

type PublishOperationalEventResult =
  | {
      queued: true;
      jobs?: Array<{ queueName: string; jobId: string; name: string }>;
    }
  | {
      queued: false;
      reason: "missing_gateway_config" | "request_failed" | "gateway_rejected";
    };

export async function publishOperationalEvent(event: OperationalEvent): Promise<PublishOperationalEventResult> {
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!gatewayUrl || !internalKey) {
    console.warn("[operational-event-bus] skipped: missing gateway URL or LOGIVN_INTERNAL_API_KEY", {
      eventId: event.eventId,
      type: event.type
    });
    return { queued: false, reason: "missing_gateway_config" };
  }

  const response = await fetch(new URL("/events", gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify({
      ...event,
      tenantId: event.tenantId ?? event.restaurantId,
      occurredAt: event.occurredAt ?? new Date().toISOString()
    }),
    signal: AbortSignal.timeout(1500)
  }).catch((error) => {
    console.error("[operational-event-bus] publish failed", { eventId: event.eventId, type: event.type, error });
    return null;
  });

  if (!response) return { queued: false, reason: "request_failed" };
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[operational-event-bus] gateway rejected event", {
      eventId: event.eventId,
      type: event.type,
      status: response.status,
      body: body.slice(0, 500)
    });
    return { queued: false, reason: "gateway_rejected" };
  }

  const body = (await response.json().catch(() => ({}))) as { jobs?: Array<{ queueName: string; jobId: string; name: string }> };
  return { queued: true, jobs: body.jobs };
}

function internalGatewayUrl() {
  return process.env.LOGIVN_API_INTERNAL_URL || process.env.LOGIVN_API_PUBLIC_URL || "";
}
