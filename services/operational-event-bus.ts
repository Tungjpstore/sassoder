import "server-only";

type BaseOperationalEvent = {
  eventId: string;
  restaurantId: string;
  tenantId?: string;
  branchId?: string | null;
  occurredAt?: string;
  actor?: {
    type: "customer" | "merchant" | "telegram" | "system" | "dev";
    userId?: string | null;
    role?: string | null;
    permissions?: string[];
  };
  source?: "customer_qr" | "online_ordering" | "dashboard" | "telegram" | "system" | "devops";
};

type OperationalOrderSnapshot = {
  id: string;
  displayCode?: string;
  itemCount: number;
  total: number;
  tableName?: string | null;
  fulfillmentType?: "DINE_IN" | "PICKUP" | "DELIVERY";
  customerName?: string | null;
  customerPhone?: string | null;
  status?: string;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
  deliveryAddress?: string | null;
  serviceDueAt?: string | null;
};

type OperationalPaymentSnapshot = {
  orderId: string;
  billId?: string | null;
  amount: number;
  method: "QR" | "CASH";
  customerName?: string | null;
  status?: "pending" | "waiting_confirm" | "confirmed" | "failed" | "cancelled" | "refunded";
};

type OperationalReservationSnapshot = {
  id: string;
  startsAt: string;
  partySize: number;
  customerName?: string | null;
  customerPhone?: string | null;
  depositRequiredAmount?: number;
  depositPaidAmount?: number;
  status?: string;
  depositStatus?: string | null;
  tableNames?: string[];
};

export type OperationalEvent =
  | (BaseOperationalEvent & {
      type: "order.created";
      order: OperationalOrderSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "order.confirmed";
      order: OperationalOrderSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "order.completed";
      order: OperationalOrderSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "order.cancelled";
      order: OperationalOrderSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "order.delivery_status_changed";
      order: OperationalOrderSnapshot;
      delivery: {
        previousStatus?: string | null;
        status: string;
        courierId?: string | null;
        courierName?: string | null;
      };
    })
  | (BaseOperationalEvent & {
      type: "payment.waiting_confirm";
      payment: OperationalPaymentSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "payment.received";
      payment: OperationalPaymentSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.created";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.deposit_submitted";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.confirmed";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.rejected";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.cancelled";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.checked_in";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.seated";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.no_show";
      reservation: OperationalReservationSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "reservation.rescheduled";
      reservation: OperationalReservationSnapshot & {
        previousStartsAt?: string | null;
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
      type: "service_request.created";
      serviceRequest: {
        id: string;
        tableId?: string | null;
        tableName?: string | null;
        type: "CALL_STAFF";
        message?: string | null;
        status?: string;
      };
    })
  | (BaseOperationalEvent & {
      type: "service_request.resolved";
      serviceRequest: {
        id: string;
        tableId?: string | null;
        tableName?: string | null;
        type: "CALL_STAFF";
        message?: string | null;
        status?: string;
      };
    })
  | (BaseOperationalEvent & {
      type: "platform.alert";
      alert: {
        severity: "critical" | "warning" | "info";
        title: string;
        summary?: string | null;
        area?: "api" | "web" | "telegram" | "queue" | "database" | "ai" | "billing" | "security" | "other";
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
