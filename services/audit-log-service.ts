import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import { writeStaffActivityLog } from "@/services/staff-activity-log-service";

type AuditLogInput = {
  restaurantId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: Record<string, unknown>;
  branchId?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  deviceInfo?: Record<string, unknown>;
  required?: boolean;
};

const sensitiveActionMap: Record<string, { action: string; severity: "info" | "warning" | "critical" }> = {
  "order.accept": { action: "orders.update", severity: "info" },
  "order.cancel": { action: "orders.cancel", severity: "warning" },
  "order.complete": { action: "orders.update", severity: "info" },
  "order.payment_confirm": { action: "payments.confirm", severity: "warning" },
  "order.cleanup_test": { action: "orders.cleanup_test", severity: "critical" },
  "order.delete_test": { action: "orders.delete_test", severity: "critical" },
  "order.delivery_status": { action: "orders.delivery_status", severity: "info" },
  "order.delivery_courier": { action: "orders.delivery_courier", severity: "warning" },
  "order.delivery_location": { action: "orders.delivery_location", severity: "warning" },
  "order.timer_update": { action: "orders.timer_update", severity: "info" }
};

function shouldWriteStaffActivity(input: AuditLogInput) {
  return Boolean(input.actorUserId && sensitiveActionMap[input.action]);
}

export function auditRequestContext(request: Request) {
  const headers = request.headers;
  return {
    ipAddress:
      headers.get("cf-connecting-ip") ||
      headers.get("x-real-ip") ||
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local",
    deviceInfo: {
      userAgent: headers.get("user-agent")?.slice(0, 240) ?? "unknown",
      acceptLanguage: headers.get("accept-language")?.slice(0, 120) ?? null,
      referer: headers.get("referer")?.slice(0, 240) ?? null
    }
  };
}

export async function writeAuditLog(input: AuditLogInput) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("audit_logs").insert({
    restaurant_id: input.restaurantId,
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      reason: input.reason ?? null
    }
  });

  if (error) {
    console.error("[audit-log] failed to write audit event", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      code: error.code,
      message: error.message
    });
    writeOperationalEvent({
      area: "audit",
      event: "audit_log_write_failed",
      restaurantId: input.restaurantId,
      status: "error",
      metadata: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        code: error.code
      }
    });
    if (input.required) {
      throw new AppError("Không ghi được audit log bắt buộc.", 500);
    }
  } else {
    writeOperationalEvent({
      area: "audit",
      event: "audit_log_written",
      restaurantId: input.restaurantId,
      metadata: {
        action: input.action,
        actorRole: input.actorRole ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null
      }
    });
  }

  if (shouldWriteStaffActivity(input)) {
    const sensitive = sensitiveActionMap[input.action];
    await writeStaffActivityLog({
      restaurantId: input.restaurantId,
      actorUserId: input.actorUserId,
      branchId: input.branchId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: sensitive.action,
      severity: sensitive.severity,
      reason: input.reason ?? null,
      beforeState: input.beforeData,
      afterState: input.afterData,
      metadata: {
        ...(input.metadata ?? {}),
        auditAction: input.action,
        actorRole: input.actorRole ?? null
      },
      ipAddress: input.ipAddress,
      deviceInfo: input.deviceInfo
    });
  }
}
