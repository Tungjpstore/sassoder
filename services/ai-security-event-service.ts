import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AiSecurityEventSeverity = "low" | "medium" | "high" | "critical";

export type AiSecurityEventSummary = {
  id: string;
  surface: string;
  eventType: string;
  severity: AiSecurityEventSeverity;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AiSecurityEventFeed = {
  schemaReady: boolean;
  events: AiSecurityEventSummary[];
  highRiskCount: number;
};

type AiSecurityEventRow = {
  id: string;
  surface: string | null;
  event_type: string | null;
  severity: AiSecurityEventSeverity | null;
  metadata: unknown;
  created_at: string | null;
};

const sensitiveKeyPattern = /(secret|token|password|credential|authorization|api[_-]?key|private[_-]?key|session|cookie)/i;
const sensitiveValuePattern = /(bearer\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9_]{12,}|eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)/i;

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

function safeLimit(limit?: number) {
  if (!Number.isFinite(limit)) return 12;
  return Math.min(Math.max(Math.trunc(limit ?? 12), 1), 50);
}

function sanitizeMetadataValue(key: string, value: unknown, depth = 0): unknown {
  if (sensitiveKeyPattern.test(key)) return "[redacted]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (sensitiveValuePattern.test(value)) return "[redacted]";
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return `[array:${value.length}]`;
    return value.slice(0, 8).map((item) => sanitizeMetadataValue(key, item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 2) return "[object]";
    return sanitizeMetadata(value, depth + 1);
  }
  return String(value);
}

export function sanitizeMetadata(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .map(([key, item]) => [key.slice(0, 80), sanitizeMetadataValue(key, item, depth)])
  );
}

function normalizeEvent(row: AiSecurityEventRow): AiSecurityEventSummary {
  return {
    id: row.id,
    surface: row.surface ?? "system",
    eventType: row.event_type ?? "unknown",
    severity: row.severity ?? "medium",
    metadata: sanitizeMetadata(row.metadata),
    createdAt: row.created_at ?? new Date(0).toISOString()
  };
}

export async function listRecentAiSecurityEvents(input: { restaurantId: string; limit?: number }): Promise<AiSecurityEventFeed> {
  const limit = safeLimit(input.limit);
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("ai_security_events")
    .select("id,surface,event_type,severity,metadata,created_at")
    .eq("restaurant_id", input.restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingAiSecuritySchema(error)) return { schemaReady: false, events: [], highRiskCount: 0 };
    throw error;
  }

  const events = ((data ?? []) as AiSecurityEventRow[]).map(normalizeEvent);
  const highRiskCount = events.filter((event) => event.severity === "high" || event.severity === "critical").length;
  return { schemaReady: true, events, highRiskCount };
}
