import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { writeOperationalEvent } from "@/services/operational-observability-service";

type StaffActivitySeverity = "info" | "warning" | "critical";

type StaffActivityInput = {
  restaurantId: string;
  actorUserId?: string | null;
  branchId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  severity?: StaffActivitySeverity;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  deviceInfo?: Record<string, unknown>;
};

function isMissingStaffActivitySchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST204" || error.code === "42P01" || /staff_activity_logs|actor_staff_member_id/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractEntityValue(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function inferBranchId(input: StaffActivityInput) {
  const explicitBranchId = input.branchId ?? null;
  if (explicitBranchId) return explicitBranchId;

  const afterBranch = extractEntityValue(input.afterState, "branch_id");
  if (typeof afterBranch === "string") return afterBranch;

  const beforeBranch = extractEntityValue(input.beforeState, "branch_id");
  if (typeof beforeBranch === "string") return beforeBranch;

  return null;
}

function diffSnapshot(beforeState: unknown, afterState: unknown) {
  if (!isRecord(beforeState) || !isRecord(afterState)) return null;

  const keys = new Set([...Object.keys(beforeState), ...Object.keys(afterState)]);
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  keys.forEach((key) => {
    const beforeValue = beforeState[key];
    const afterValue = afterState[key];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = {
        before: beforeValue ?? null,
        after: afterValue ?? null
      };
    }
  });

  return Object.keys(changes).length > 0 ? changes : null;
}

async function resolveActorStaffMemberId({
  supabase,
  restaurantId,
  actorUserId
}: {
  supabase: any;
  restaurantId: string;
  actorUserId?: string | null;
}) {
  if (!actorUserId) return null;

  const result = await supabase
    .from("staff_members")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", actorUserId)
    .maybeSingle();

  if (result.error) {
    if (isMissingStaffActivitySchema(result.error)) return null;
    throw result.error;
  }

  return result.data?.id ?? null;
}

export async function writeStaffActivityLog(input: StaffActivityInput) {
  const supabase = createAdminSupabaseClient() as any;

  try {
    const actorStaffMemberId = await resolveActorStaffMemberId({
      supabase,
      restaurantId: input.restaurantId,
      actorUserId: input.actorUserId
    });
    const diff = diffSnapshot(input.beforeState, input.afterState);

    const { error } = await supabase.from("staff_activity_logs").insert({
      restaurant_id: input.restaurantId,
      actor_user_id: input.actorUserId ?? null,
      actor_staff_member_id: actorStaffMemberId,
      branch_id: inferBranchId(input),
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      severity: input.severity ?? "info",
      reason: input.reason ?? null,
      before_state: input.beforeState ?? null,
      after_state: input.afterState ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        diff
      },
      ip_address: input.ipAddress ?? null,
      device_info: input.deviceInfo ?? {}
    });

    if (error) {
      if (isMissingStaffActivitySchema(error)) return;
      throw error;
    }

    writeOperationalEvent({
      area: "audit",
      event: "staff_activity_log_written",
      restaurantId: input.restaurantId,
      metadata: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null
      }
    });
  } catch (error) {
    console.error("[staff-activity-log] failed to write activity event", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : "unknown"
    });
    writeOperationalEvent({
      area: "audit",
      event: "staff_activity_log_write_failed",
      restaurantId: input.restaurantId,
      status: "error",
      metadata: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null
      }
    });
  }
}
