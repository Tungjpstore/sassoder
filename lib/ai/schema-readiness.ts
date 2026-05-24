import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AiSchemaKey = "recommendations" | "automationRuns" | "restaurantMemories";

type AiSchemaDefinition = {
  key: AiSchemaKey;
  table: string;
  label: string;
};

const aiSchemaDefinitions: AiSchemaDefinition[] = [
  { key: "recommendations", table: "ai_recommendations", label: "AI recommendations" },
  { key: "automationRuns", table: "ai_automation_runs", label: "AI automation runs" },
  { key: "restaurantMemories", table: "ai_restaurant_memories", label: "AI restaurant memories" }
];

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
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

export async function getAiSchemaReadiness() {
  const supabase = createAdminSupabaseClient() as any;
  const checks = await Promise.all(
    aiSchemaDefinitions.map(async (definition) => {
      const result = await supabase.from(definition.table).select("id", { count: "exact", head: true }).limit(1);
      const missing = isMissingSchemaError(result.error);
      return {
        key: definition.key,
        table: definition.table,
        label: definition.label,
        ready: !result.error,
        missing,
        errorCode: result.error && !missing ? result.error.code ?? "unknown" : null
      };
    })
  );

  return {
    ready: checks.every((check) => check.ready),
    checks
  };
}
