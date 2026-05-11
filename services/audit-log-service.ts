import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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
};

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
    metadata: input.metadata ?? {}
  });

  if (error) {
    console.error("[audit-log] failed to write audit event", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      code: error.code,
      message: error.message
    });
  }
}
