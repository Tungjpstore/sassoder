import "server-only";

import { createHash } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  AiOperationInsight,
  AiOperationInsightLifecycleStatus,
  AiOperationInsightsDeck
} from "@/lib/ai/operation-insights";
import { writeOperationalEvent } from "@/services/operational-observability-service";

type PersistDeckInput = {
  restaurantId: string;
  branchId?: string | null;
  deck: AiOperationInsightsDeck;
};

type OperationInsightRow = {
  id: string;
  insight_key: string;
  fingerprint: string;
  status: AiOperationInsightLifecycleStatus;
  source: string;
  scope_key: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_at: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
  expires_at: string | null;
};

type PersistedOperationInsightsResult = {
  deck: AiOperationInsightsDeck;
  schemaReady: boolean;
};

type BranchOperationInsightRow = {
  id: string;
  branch_id: string | null;
  kind: AiOperationInsight["kind"];
  severity: AiOperationInsight["severity"];
  status: AiOperationInsightLifecycleStatus;
  title: string;
  detail: string;
  action: string;
  action_intent: string | null;
  action_href: string | null;
  confidence: AiOperationInsight["confidence"];
  metric_label: string | null;
  metric_value: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  deck_generated_at: string | null;
};

type BranchNameRow = {
  id: string;
  name: string;
};

export type RecentAiBranchOperationInsight = {
  id: string;
  branchId: string;
  branchName: string;
  kind: AiOperationInsight["kind"];
  severity: AiOperationInsight["severity"];
  status: AiOperationInsightLifecycleStatus;
  title: string;
  detail: string;
  action: string;
  actionIntent: string | null;
  actionHref: string | null;
  confidence: AiOperationInsight["confidence"];
  metric: AiOperationInsight["metric"] | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  deckGeneratedAt: string | null;
};

const aiOpsInsightSource = "ai_ops";
const visibleStatuses = new Set<AiOperationInsightLifecycleStatus>(["active", "seen"]);
const freshInsightWindowMs = 5 * 60 * 1000;

function isMissingAiInsightsSchema(error: { code?: string; message?: string } | null | undefined) {
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

function scopeKey(branchId?: string | null) {
  return branchId ? `branch:${branchId}` : "restaurant";
}

function normalizeListLimit(value: number | undefined, fallback = 12, max = 50) {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function hashInsight(insight: AiOperationInsight) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: insight.kind,
        severity: insight.severity,
        title: insight.title,
        detail: insight.detail,
        action: insight.action,
        actionIntent: insight.actionIntent ?? null,
        actionHref: insight.actionHref ?? null,
        metric: insight.metric ?? null,
        evidence: insight.evidence
      })
    )
    .digest("hex")
    .slice(0, 64);
}

function rowLifecycle(row: OperationInsightRow, schemaReady = true): NonNullable<AiOperationInsight["lifecycle"]> {
  return {
    databaseId: row.id,
    status: row.status,
    source: row.source,
    scopeKey: row.scope_key,
    schemaReady,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    seenAt: row.seen_at,
    dismissedAt: row.dismissed_at,
    resolvedAt: row.resolved_at,
    expiresAt: row.expires_at
  };
}

function withSchemaMissingLifecycle(deck: AiOperationInsightsDeck): AiOperationInsightsDeck {
  return {
    ...deck,
    insights: deck.insights.map((insight) => ({
      ...insight,
      lifecycle: {
        status: "active",
        schemaReady: false
      }
    }))
  };
}

function withVisibleDeck(deck: AiOperationInsightsDeck, rowsByKey: Map<string, OperationInsightRow>): AiOperationInsightsDeck {
  const insights = deck.insights
    .map((insight) => {
      const row = rowsByKey.get(insight.id);
      return row ? { ...insight, lifecycle: rowLifecycle(row) } : insight;
    })
    .filter((insight) => visibleStatuses.has(insight.lifecycle?.status ?? "active"));

  return {
    ...deck,
    summary: insights.length ? deck.summary : `AI Ops chưa có thẻ cần hiển thị. Health ${deck.healthScore}/100.`,
    primaryInsightId: insights[0]?.id ?? null,
    insights
  };
}

function rowForInsight({
  restaurantId,
  branchId,
  scope,
  generatedAt,
  existing,
  insight
}: {
  restaurantId: string;
  branchId?: string | null;
  scope: string;
  generatedAt: string;
  existing?: OperationInsightRow;
  insight: AiOperationInsight;
}) {
  const fingerprint = hashInsight(insight);
  const fingerprintChanged = Boolean(existing && existing.fingerprint !== fingerprint);
  const status = fingerprintChanged ? "active" : existing?.status ?? "active";

  return {
    restaurant_id: restaurantId,
    branch_id: branchId ?? null,
    scope_key: scope,
    source: aiOpsInsightSource,
    insight_key: insight.id,
    fingerprint,
    kind: insight.kind,
    severity: insight.severity,
    status,
    title: insight.title,
    detail: insight.detail,
    action: insight.action,
    action_intent: insight.actionIntent ?? null,
    action_href: insight.actionHref ?? null,
    confidence: insight.confidence,
    metric_label: insight.metric?.label ?? null,
    metric_value: insight.metric?.value ?? null,
    evidence: insight.evidence,
    deck_generated_at: generatedAt,
    last_seen_at: generatedAt,
    seen_at: fingerprintChanged ? null : existing?.seen_at ?? null,
    dismissed_at: fingerprintChanged ? null : existing?.dismissed_at ?? null,
    dismissed_by: fingerprintChanged ? null : undefined,
    resolved_at: fingerprintChanged ? null : existing?.resolved_at ?? null,
    resolved_by: fingerprintChanged ? null : undefined,
    expires_at: null,
    metadata: {
      actionIntent: insight.actionIntent ?? null,
      confidence: insight.confidence
    }
  };
}

export async function persistAiOperationInsightsDeck(input: PersistDeckInput): Promise<PersistedOperationInsightsResult> {
  if (input.deck.insights.length === 0) {
    return { deck: input.deck, schemaReady: true };
  }

  const startedAt = Date.now();
  const supabase = createAdminSupabaseClient() as any;
  const scope = scopeKey(input.branchId);
  const insightKeys = input.deck.insights.map((insight) => insight.id);

  const existingResult = await supabase
    .from("ai_operation_insights")
    .select("id,insight_key,fingerprint,status,source,scope_key,first_seen_at,last_seen_at,seen_at,dismissed_at,resolved_at,expires_at")
    .eq("restaurant_id", input.restaurantId)
    .eq("scope_key", scope)
    .eq("source", aiOpsInsightSource)
    .in("insight_key", insightKeys);

  if (existingResult.error) {
    if (isMissingAiInsightsSchema(existingResult.error)) {
      return { deck: withSchemaMissingLifecycle(input.deck), schemaReady: false };
    }
    writeOperationalEvent({
      area: "ai",
      event: "ai_ops_insight_read_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { code: existingResult.error.code }
    });
    return { deck: input.deck, schemaReady: false };
  }

  const existingByKey = new Map<string, OperationInsightRow>(
    ((existingResult.data ?? []) as OperationInsightRow[]).map((row) => [row.insight_key, row])
  );
  const rows = input.deck.insights.map((insight) =>
    rowForInsight({
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      scope,
      generatedAt: input.deck.generatedAt,
      existing: existingByKey.get(insight.id),
      insight
    })
  );
  const generatedAtMs = new Date(input.deck.generatedAt).getTime();
  const writesRequired = rows.some((row) => {
    const existing = existingByKey.get(row.insight_key);
    if (!existing || existing.fingerprint !== row.fingerprint) return true;
    const lastSeenAtMs = new Date(existing.last_seen_at ?? "").getTime();
    return !Number.isFinite(lastSeenAtMs) || !Number.isFinite(generatedAtMs) || generatedAtMs - lastSeenAtMs > freshInsightWindowMs;
  });

  if (!writesRequired) {
    return {
      deck: withVisibleDeck(input.deck, existingByKey),
      schemaReady: true
    };
  }

  const upsertResult = await supabase
    .from("ai_operation_insights")
    .upsert(rows, { onConflict: "restaurant_id,scope_key,source,insight_key" })
    .select("id,insight_key,fingerprint,status,source,scope_key,first_seen_at,last_seen_at,seen_at,dismissed_at,resolved_at,expires_at");

  if (upsertResult.error) {
    if (isMissingAiInsightsSchema(upsertResult.error)) {
      return { deck: withSchemaMissingLifecycle(input.deck), schemaReady: false };
    }
    writeOperationalEvent({
      area: "ai",
      event: "ai_ops_insight_upsert_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { code: upsertResult.error.code }
    });
    return { deck: input.deck, schemaReady: false };
  }

  writeOperationalEvent({
    area: "ai",
    event: "ai_ops_insights_persisted",
    restaurantId: input.restaurantId,
    latencyMs: Date.now() - startedAt,
    metadata: { count: rows.length, scope }
  });

  const rowsByKey = new Map<string, OperationInsightRow>(
    ((upsertResult.data ?? []) as OperationInsightRow[]).map((row) => [row.insight_key, row])
  );

  return {
    deck: withVisibleDeck(input.deck, rowsByKey),
    schemaReady: true
  };
}

export async function updateAiOperationInsightStatus(input: {
  restaurantId: string;
  insightId: string;
  status: Extract<AiOperationInsightLifecycleStatus, "seen" | "dismissed" | "resolved">;
  actorUserId?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status
  };

  if (input.status === "seen") {
    patch.seen_at = now;
  }

  if (input.status === "dismissed") {
    patch.dismissed_at = now;
    patch.dismissed_by = input.actorUserId ?? null;
  }

  if (input.status === "resolved") {
    patch.resolved_at = now;
    patch.resolved_by = input.actorUserId ?? null;
  }

  const result = await supabase
    .from("ai_operation_insights")
    .update(patch)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.insightId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    if (isMissingAiInsightsSchema(result.error)) return { updated: false, schemaReady: false };
    throw result.error;
  }

  writeOperationalEvent({
    area: "ai",
    event: "ai_ops_insight_status_updated",
    restaurantId: input.restaurantId,
    metadata: { insightId: input.insightId, status: input.status }
  });

  return { updated: Boolean(result.data), schemaReady: true };
}

export async function listRecentAiBranchOperationInsights(restaurantId: string, limit = 12) {
  const supabase = createAdminSupabaseClient() as any;
  const rowLimit = normalizeListLimit(limit);

  const insightsResult = await supabase
    .from("ai_operation_insights")
    .select(
      "id,branch_id,kind,severity,status,title,detail,action,action_intent,action_href,confidence,metric_label,metric_value,first_seen_at,last_seen_at,deck_generated_at"
    )
    .eq("restaurant_id", restaurantId)
    .eq("source", aiOpsInsightSource)
    .not("branch_id", "is", null)
    .in("status", ["active", "seen"])
    .order("last_seen_at", { ascending: false })
    .limit(rowLimit);

  if (insightsResult.error) {
    if (isMissingAiInsightsSchema(insightsResult.error)) return { schemaReady: false, insights: [] };
    throw insightsResult.error;
  }

  const rows = ((insightsResult.data ?? []) as BranchOperationInsightRow[]).filter((row) => row.branch_id);
  const branchIds = [...new Set(rows.map((row) => row.branch_id).filter((branchId): branchId is string => Boolean(branchId)))];
  const branchNames = new Map<string, string>();

  if (branchIds.length > 0) {
    const branchesResult = await supabase
      .from("store_branches")
      .select("id,name")
      .eq("restaurant_id", restaurantId)
      .in("id", branchIds);

    if (branchesResult.error && !isMissingAiInsightsSchema(branchesResult.error)) {
      throw branchesResult.error;
    }

    ((branchesResult.data ?? []) as BranchNameRow[]).forEach((branch) => {
      branchNames.set(branch.id, branch.name);
    });
  }

  return {
    schemaReady: true,
    insights: rows.map((row) => ({
      id: row.id,
      branchId: row.branch_id as string,
      branchName: branchNames.get(row.branch_id as string) ?? "Chi nhánh",
      kind: row.kind,
      severity: row.severity,
      status: row.status,
      title: row.title,
      detail: row.detail,
      action: row.action,
      actionIntent: row.action_intent,
      actionHref: row.action_href,
      confidence: row.confidence,
      metric:
        row.metric_label || row.metric_value
          ? {
              label: row.metric_label ?? "Metric",
              value: row.metric_value ?? "--"
            }
          : null,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      deckGeneratedAt: row.deck_generated_at
    }))
  };
}
