import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type AiSecuritySeverity = "low" | "medium" | "high" | "critical";

function isMissingAiSecuritySchema(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.message?.includes("Could not find") ||
    error.message?.includes("does not exist")
  );
}

export async function recordAiSecurityEvent(input: {
  restaurantId?: string | null;
  userId?: string | null;
  customerSessionId?: string | null;
  surface: "owner" | "customer" | "dashboard" | "admin" | "system";
  eventType: string;
  severity: AiSecuritySeverity;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const result = await supabase.from("ai_security_events").insert({
      restaurant_id: input.restaurantId ?? null,
      user_id: input.userId ?? null,
      customer_session_id: input.customerSessionId ?? null,
      surface: input.surface,
      event_type: input.eventType,
      severity: input.severity,
      metadata: input.metadata ?? {}
    });

    if (result.error && !isMissingAiSecuritySchema(result.error)) {
      console.warn("[AI Security] Failed to record event", result.error);
    }
  } catch (error) {
    console.warn("[AI Security] Failed to record event", error);
  }
}
