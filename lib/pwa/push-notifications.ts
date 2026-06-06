import type { StaffPermissionKey } from "@/lib/staff-permissions";

export const PWA_PUSH_NOTIFICATION_EVENTS = [
  "order.created",
  "payment.waiting_confirm",
  "reservation.created",
  "service_request.created",
  "staff.request_created",
  "staff.incident_reported",
  "sla.warning"
] as const;

export type PwaPushNotificationEvent = (typeof PWA_PUSH_NOTIFICATION_EVENTS)[number];

export type PwaPushPayload = {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  badgeCount?: number;
  requireInteraction?: boolean;
  renotify?: boolean;
  data?: {
    url?: string;
    eventId?: string;
    eventType?: string;
  };
};

export type PwaPushTarget = {
  payload: PwaPushPayload;
  requiredPermissions: StaffPermissionKey[];
  urgency: "normal" | "high";
  ttlSeconds: number;
};

type PushMappableEvent = {
  type: string;
  eventId?: string;
  restaurantId?: string;
  order?: {
    id?: string;
    displayCode?: string;
    tableName?: string | null;
    itemCount?: number;
  };
  payment?: {
    orderId?: string;
    orderDisplayCode?: string | null;
    tableName?: string | null;
  };
  reservation?: {
    id?: string;
    partySize?: number;
  };
  serviceRequest?: {
    id?: string;
    tableName?: string | null;
  };
  staffRequest?: {
    id?: string;
    staffName?: string | null;
  };
  staffIncident?: {
    id?: string;
    title?: string | null;
    severity?: string;
  };
  sla?: {
    orderId?: string;
    displayCode?: string;
    lateMinutes?: number;
  };
};

const DASHBOARD_FALLBACK_URL = "/dashboard";
const SAFE_NOTIFICATION_PATH_PREFIXES = ["/dashboard", "/download"];

export function sanitizePwaNotificationUrl(value: unknown, fallback = DASHBOARD_FALLBACK_URL) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed, "https://logivn.local");
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.origin !== "https://logivn.local") return fallback;
    if (!SAFE_NOTIFICATION_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))) {
      return fallback;
    }
    return path;
  } catch {
    return fallback;
  }
}

export function normalizePwaPushPayload(input: PwaPushPayload): PwaPushPayload {
  const title = compactText(input.title, 90) || "LogiVN";
  const body = compactText(input.body, 140);
  const eventId = compactText(input.data?.eventId, 140);
  const eventType = compactText(input.data?.eventType, 80);
  const tag = compactTag(input.tag || eventId || eventType || "logivn-ops");
  const url = sanitizePwaNotificationUrl(input.data?.url);
  const badgeCount = Number.isFinite(input.badgeCount) ? Math.max(0, Math.min(99, Math.trunc(Number(input.badgeCount)))) : undefined;

  return {
    title,
    ...(body ? { body } : {}),
    tag,
    icon: input.icon || "/icons/icon-192x192.png",
    badge: input.badge || "/icons/icon-96x96.png",
    ...(badgeCount !== undefined ? { badgeCount } : {}),
    requireInteraction: Boolean(input.requireInteraction),
    renotify: Boolean(input.renotify),
    data: {
      url,
      ...(eventId ? { eventId } : {}),
      ...(eventType ? { eventType } : {})
    }
  };
}

export function operationalEventToPwaPushTarget(event: PushMappableEvent): PwaPushTarget | null {
  const eventId = event.eventId || `${event.type}:${Date.now()}`;

  if (event.type === "order.created") {
    const displayCode = event.order?.displayCode || shortId(event.order?.id, "Đơn mới");
    return target({
      title: "Có đơn mới",
      body: [displayCode, event.order?.tableName || null, itemCountLabel(event.order?.itemCount)].filter(Boolean).join(" · "),
      url: "/dashboard/orders",
      eventId,
      eventType: event.type,
      requiredPermissions: ["orders.view", "orders.update"],
      urgency: "high",
      requireInteraction: true
    });
  }

  if (event.type === "payment.waiting_confirm") {
    return target({
      title: "Thanh toán chờ xác nhận",
      body: [event.payment?.orderDisplayCode || shortId(event.payment?.orderId, "Đơn hàng"), event.payment?.tableName || null].filter(Boolean).join(" · "),
      url: "/dashboard/payments",
      eventId,
      eventType: event.type,
      requiredPermissions: ["payments.view", "payments.confirm"],
      urgency: "high",
      requireInteraction: true
    });
  }

  if (event.type === "reservation.created") {
    return target({
      title: "Có đặt bàn mới",
      body: event.reservation?.partySize ? `${event.reservation.partySize} khách cần xác nhận` : "Mở lịch đặt bàn để xử lý.",
      url: "/dashboard/reservations",
      eventId,
      eventType: event.type,
      requiredPermissions: ["reservations.manage"],
      urgency: "normal"
    });
  }

  if (event.type === "service_request.created") {
    return target({
      title: "Khách gọi phục vụ",
      body: event.serviceRequest?.tableName ? `${event.serviceRequest.tableName} cần hỗ trợ` : "Có yêu cầu phục vụ mới.",
      url: "/dashboard/orders",
      eventId,
      eventType: event.type,
      requiredPermissions: ["orders.view", "orders.update"],
      urgency: "high",
      requireInteraction: true
    });
  }

  if (event.type === "staff.request_created") {
    return target({
      title: "Yêu cầu nhân sự mới",
      body: event.staffRequest?.staffName ? `${event.staffRequest.staffName} cần quản lý duyệt.` : "Có yêu cầu nhân sự cần duyệt.",
      url: "/dashboard/staff",
      eventId,
      eventType: event.type,
      requiredPermissions: ["approvals.review", "staff.view"],
      urgency: "normal"
    });
  }

  if (event.type === "staff.incident_reported") {
    return target({
      title: "Báo cáo sự cố nhân sự",
      body: event.staffIncident?.title || "Có sự cố mới cần xem trong khu vực nhân sự.",
      url: "/dashboard/staff",
      eventId,
      eventType: event.type,
      requiredPermissions: ["staff.view", "activity_logs.view"],
      urgency: event.staffIncident?.severity === "urgent" ? "high" : "normal"
    });
  }

  if (event.type === "sla.warning") {
    return target({
      title: "Đơn có nguy cơ trễ SLA",
      body: [event.sla?.displayCode || shortId(event.sla?.orderId, "Đơn hàng"), event.sla?.lateMinutes ? `${event.sla.lateMinutes} phút` : null].filter(Boolean).join(" · "),
      url: "/dashboard/orders",
      eventId,
      eventType: event.type,
      requiredPermissions: ["orders.view", "orders.update"],
      urgency: "high"
    });
  }

  return null;
}

function target({
  title,
  body,
  url,
  eventId,
  eventType,
  requiredPermissions,
  urgency,
  requireInteraction = false
}: {
  title: string;
  body: string;
  url: string;
  eventId: string;
  eventType: string;
  requiredPermissions: StaffPermissionKey[];
  urgency: "normal" | "high";
  requireInteraction?: boolean;
}): PwaPushTarget {
  return {
    payload: normalizePwaPushPayload({
      title,
      body,
      tag: eventId,
      requireInteraction,
      renotify: urgency === "high",
      data: {
        url,
        eventId,
        eventType
      }
    }),
    requiredPermissions,
    urgency,
    ttlSeconds: urgency === "high" ? 300 : 900
  };
}

function compactText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function compactTag(value: string) {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 64) || "logivn-ops";
}

function shortId(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value) return fallback;
  return `#${value.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function itemCountLabel(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.trunc(value)} món`;
}
