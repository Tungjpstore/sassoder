import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendOperationalEventPush } from "@/services/push-notification-service";

type BaseOperationalEvent = {
  eventId: string;
  restaurantId: string;
  tenantId?: string;
  branchId?: string | null;
  occurredAt?: string;
  actor?: {
    type: "customer" | "merchant" | "staff" | "telegram" | "system" | "dev";
    userId?: string | null;
    role?: string | null;
    permissions?: string[];
  };
  source?: "customer_qr" | "online_ordering" | "dashboard" | "staff" | "telegram" | "system" | "devops";
};

type PlatformOperationalEvent = Omit<BaseOperationalEvent, "restaurantId" | "tenantId" | "branchId" | "source"> & {
  restaurantId?: string;
  tenantId?: string;
  branchId?: string | null;
  source?: "system" | "devops" | "telegram" | "dashboard";
};

type PlatformTenantSnapshot = {
  id: string;
  name: string;
  slug?: string | null;
  businessType?: string | null;
  tableCount?: number | null;
  contactEmail?: string | null;
  hotline?: string | null;
  address?: string | null;
  platformStatus?: "active" | "suspended" | "deleted" | string | null;
  createdAt?: string | null;
  planCode?: string | null;
  planName?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  requestedPlanCode?: string | null;
  hasBankAccount?: boolean;
  hasLocation?: boolean;
  initialMenuItemCount?: number | null;
};

type PlatformSubscriptionPaymentSnapshot = {
  id: string;
  restaurantId: string;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  subscriptionId?: string | null;
  planCode?: string | null;
  planName?: string | null;
  fromPlanCode?: string | null;
  fromPlanName?: string | null;
  amount: number;
  months: number;
  transferContent?: string | null;
  billingAction?: "renew" | "upgrade" | "downgrade" | string | null;
  effectiveSummary?: string | null;
  effectiveAt?: string | null;
  subscriptionStatus?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  rejectedReason?: string | null;
};

type PlatformTenantStatusSnapshot = {
  restaurantId: string;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  previousStatus?: string | null;
  status: "active" | "suspended" | "deleted";
  reason?: string | null;
  actor?: string | null;
  changedAt?: string | null;
};

type PlatformSubscriptionStatusSnapshot = {
  id: string;
  restaurantId: string;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  previousStatus?: string | null;
  status: string;
  planCode?: string | null;
  planName?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  reason?: string | null;
  changedAt?: string | null;
};

type OperationalOrderSnapshot = {
  id: string;
  displayCode?: string;
  itemCount: number;
  lineCount?: number;
  subtotal?: number;
  discountAmount?: number;
  deliveryFee?: number;
  serviceFee?: number;
  total: number;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice?: number | null;
    lineTotal?: number | null;
    note?: string | null;
    modifierSummary?: string | null;
  }>;
  tableName?: string | null;
  fulfillmentType?: "DINE_IN" | "PICKUP" | "DELIVERY";
  customerName?: string | null;
  customerPhone?: string | null;
  customerNote?: string | null;
  status?: string;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
  deliveryAddress?: string | null;
  deliveryDistanceKm?: number | null;
  createdAt?: string | null;
  acceptedAt?: string | null;
  servedAt?: string | null;
  serviceDueAt?: string | null;
};

type OperationalPaymentSnapshot = {
  orderId: string;
  billId?: string | null;
  orderDisplayCode?: string | null;
  amount: number;
  method: "QR" | "CASH";
  orderSubtotal?: number | null;
  orderDiscountAmount?: number | null;
  orderDeliveryFee?: number | null;
  orderServiceFee?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerNote?: string | null;
  fulfillmentType?: "DINE_IN" | "PICKUP" | "DELIVERY" | null;
  tableName?: string | null;
  deliveryAddress?: string | null;
  deliveryDistanceKm?: number | null;
  orderItems?: OperationalOrderSnapshot["items"];
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
  customerNote?: string | null;
  preferredSeatingZone?: string | null;
  preferredTableKind?: string | null;
  source?: string | null;
  holdExpiresAt?: string | null;
};

type OperationalStaffRequestSnapshot = {
  id: string;
  requestType:
    | "outside_location"
    | "attendance_edit"
    | "overtime"
    | "shift_override"
    | "manual_clock_in"
    | "leave_request"
    | "shift_swap"
    | "device_restriction";
  staffMemberId: string;
  staffName?: string | null;
  status?: "pending" | "approved" | "rejected" | "cancelled";
  decision?: "approved" | "rejected";
  reason?: string | null;
  requestedPayload?: Record<string, unknown> | null;
};

type OperationalStaffIncidentSnapshot = {
  id: string;
  staffMemberId: string;
  staffName?: string | null;
  employeeCode?: string | null;
  title: string;
  description: string;
  severity: "low" | "normal" | "high" | "urgent";
  status?: "open" | "reviewing" | "resolved" | "dismissed";
  attachmentUrl?: string | null;
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
      type: "menu.item_availability_suggested";
      menuItem: {
        id: string;
        name: string;
        currentAvailable: boolean;
        suggestedAvailable: boolean;
        reason?: string | null;
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
      type: "staff.request_created";
      staffRequest: OperationalStaffRequestSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "staff.request_reviewed";
      staffRequest: OperationalStaffRequestSnapshot;
    })
  | (BaseOperationalEvent & {
      type: "staff.incident_reported";
      staffIncident: OperationalStaffIncidentSnapshot;
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
  | (PlatformOperationalEvent & {
      type: "platform.alert";
      alert: {
        severity: "critical" | "warning" | "info";
        title: string;
        summary?: string | null;
        area?: "api" | "web" | "telegram" | "queue" | "database" | "ai" | "billing" | "security" | "other";
      };
    })
  | (PlatformOperationalEvent & {
      type: "platform.tenant.created";
      restaurantId: string;
      tenant: PlatformTenantSnapshot;
    })
  | (PlatformOperationalEvent & {
      type: "platform.subscription.approval_requested";
      restaurantId: string;
      payment: PlatformSubscriptionPaymentSnapshot;
    })
  | (PlatformOperationalEvent & {
      type: "platform.subscription.confirmed";
      restaurantId: string;
      payment: PlatformSubscriptionPaymentSnapshot;
    })
  | (PlatformOperationalEvent & {
      type: "platform.subscription.rejected";
      restaurantId: string;
      payment: PlatformSubscriptionPaymentSnapshot;
    })
  | (PlatformOperationalEvent & {
      type: "platform.tenant.status_changed";
      restaurantId: string;
      tenantStatus: PlatformTenantStatusSnapshot;
    })
  | (PlatformOperationalEvent & {
      type: "platform.subscription.status_changed";
      restaurantId: string;
      subscription: PlatformSubscriptionStatusSnapshot;
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
  const eventRecord = {
    ...event,
    tenantId: event.tenantId ?? event.restaurantId ?? platformTenantId(event),
    occurredAt: event.occurredAt ?? new Date().toISOString()
  };
  const outbox = await recordOperationalOutbox(eventRecord);
  await sendOperationalEventPush(eventRecord).catch((error) => {
    console.error("[operational-event-bus] pwa push failed", {
      eventId: eventRecord.eventId,
      type: eventRecord.type,
      error
    });
  });
  const gatewayUrl = internalGatewayUrl();
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY;
  if (!gatewayUrl || !internalKey) {
    console.warn("[operational-event-bus] skipped: missing gateway URL or LOGIVN_INTERNAL_API_KEY", {
      eventId: event.eventId,
      type: event.type
    });
    await markOperationalOutboxFailed(outbox, "missing_gateway_config");
    return { queued: false, reason: "missing_gateway_config" };
  }

  const response = await fetch(new URL("/events", gatewayUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logivn-internal-key": internalKey
    },
    body: JSON.stringify(eventRecord),
    signal: AbortSignal.timeout(1500)
  }).catch((error) => {
    console.error("[operational-event-bus] publish failed", { eventId: event.eventId, type: event.type, error });
    return null;
  });

  if (!response) {
    await markOperationalOutboxFailed(outbox, "request_failed");
    return { queued: false, reason: "request_failed" };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[operational-event-bus] gateway rejected event", {
      eventId: event.eventId,
      type: event.type,
      status: response.status,
      body: body.slice(0, 500)
    });
    await markOperationalOutboxFailed(outbox, `gateway_rejected:${response.status}:${body.slice(0, 240)}`);
    return { queued: false, reason: "gateway_rejected" };
  }

  const body = (await response.json().catch(() => ({}))) as { jobs?: Array<{ queueName: string; jobId: string; name: string }> };
  await markOperationalOutboxPublished(outbox, body.jobs ?? []);
  return { queued: true, jobs: body.jobs };
}

function internalGatewayUrl() {
  return process.env.LOGIVN_API_INTERNAL_URL || process.env.LOGIVN_API_PUBLIC_URL || "";
}

type OperationalOutboxRef =
  | {
      id: string;
      restaurantId: string | null;
      eventId: string;
    }
  | null;

async function recordOperationalOutbox(event: OperationalEvent): Promise<OperationalOutboxRef> {
  const supabase = createAdminSupabaseClient() as any;
  const tenantId = event.tenantId ?? event.restaurantId ?? platformTenantId(event);
  const row = {
    event_id: event.eventId,
    event_type: event.type,
    restaurant_id: event.restaurantId ?? null,
    branch_id: event.branchId ?? null,
    tenant_id: tenantId,
    source: event.source ?? null,
    priority: eventPriority(event.type),
    status: "pending",
    payload: event,
    last_error: null,
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const inserted = await supabase.from("operational_event_outbox").insert(row).select("id,event_id,restaurant_id").maybeSingle();
  if (!inserted.error && inserted.data) {
    return {
      id: String(inserted.data.id),
      eventId: String(inserted.data.event_id),
      restaurantId: inserted.data.restaurant_id ? String(inserted.data.restaurant_id) : null
    };
  }

  if (inserted.error?.code === "23505") {
    const existing = await supabase
      .from("operational_event_outbox")
      .select("id,event_id,restaurant_id")
      .eq("tenant_id", tenantId)
      .eq("event_id", event.eventId)
      .maybeSingle();
    if (!existing.error && existing.data) {
      return {
        id: String(existing.data.id),
        eventId: String(existing.data.event_id),
        restaurantId: existing.data.restaurant_id ? String(existing.data.restaurant_id) : null
      };
    }
  }

  if (isMissingOutboxSchema(inserted.error)) {
    console.warn("[operational-event-bus] skipped durable outbox: migration not applied", {
      eventId: event.eventId,
      type: event.type
    });
    return null;
  }

  console.error("[operational-event-bus] outbox insert failed", {
    eventId: event.eventId,
    type: event.type,
    error: inserted.error
  });
  return null;
}

async function markOperationalOutboxPublished(outbox: OperationalOutboxRef, jobs: Array<{ queueName: string; jobId: string; name: string }>) {
  if (!outbox) return;
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase
    .from("operational_event_outbox")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
      delivery_metadata: { jobs },
      updated_at: new Date().toISOString()
    })
    .eq("id", outbox.id)
    .neq("status", "published");
  if (error && !isMissingOutboxSchema(error)) {
    console.error("[operational-event-bus] outbox published update failed", { outboxId: outbox.id, error });
  }
}

async function markOperationalOutboxFailed(outbox: OperationalOutboxRef, errorMessage: string) {
  if (!outbox) return;
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase
    .from("operational_event_outbox")
    .update({
      status: "failed",
      locked_at: null,
      locked_by: null,
      last_error: errorMessage.slice(0, 500),
      next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", outbox.id)
    .neq("status", "published");
  if (error && !isMissingOutboxSchema(error)) {
    console.error("[operational-event-bus] outbox failed update failed", { outboxId: outbox.id, error });
  }
}

function eventPriority(type: OperationalEvent["type"]) {
  if (
    type === "payment.waiting_confirm" ||
    type === "payment.received" ||
    type === "reservation.deposit_submitted" ||
    type === "sla.warning" ||
    type === "service_request.created" ||
    type === "staff.request_created" ||
    type === "staff.incident_reported" ||
    type === "platform.alert" ||
    type === "platform.subscription.approval_requested" ||
    type === "platform.subscription.confirmed" ||
    type === "platform.subscription.rejected" ||
    type === "platform.tenant.status_changed" ||
    type === "platform.subscription.status_changed"
  ) {
    return 1;
  }
  if (
    type === "order.created" ||
    type === "order.confirmed" ||
    type === "order.cancelled" ||
    type === "reservation.created" ||
    type === "staff.checked_in" ||
    type === "inventory.low" ||
    type === "menu.item_availability_suggested" ||
    type === "platform.tenant.created"
  ) {
    return 2;
  }
  return 5;
}

function platformTenantId(event: OperationalEvent) {
  return event.type.startsWith("platform.") ? event.restaurantId ?? "platform" : "";
}

function isMissingOutboxSchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42P01" || /operational_event_outbox/i.test(error.message ?? "");
}
