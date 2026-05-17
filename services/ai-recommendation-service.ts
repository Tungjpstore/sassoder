import "server-only";

import { createHash } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  buildAiRecommendationDeck,
  type AiRecommendation,
  type AiRecommendationDeck,
  type AiRecommendationStatus
} from "@/lib/ai/recommendation-engine";
import type { AiOperationInsightsDeck } from "@/lib/ai/operation-insights";
import { writeOperationalEvent } from "@/services/operational-observability-service";

type RecommendationRow = {
  id: string;
  recommendation_key: string;
  fingerprint: string;
  type: AiRecommendation["type"];
  priority: AiRecommendation["priority"];
  status: AiRecommendationStatus;
  title: string;
  detail: string;
  action: string;
  action_href: string | null;
  action_intent: string | null;
  confidence: AiRecommendation["confidence"];
  estimated_impact_label: string | null;
  estimated_impact_value: number | null;
  evidence: unknown;
  first_seen_at: string | null;
  last_seen_at: string | null;
  accepted_at: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  source_ref_id: string | null;
};

const visibleRecommendationStatuses = new Set<AiRecommendationStatus>(["active", "accepted"]);
const aiRecommendationSource = "ai_ops";
const freshRecommendationWindowMs = 5 * 60 * 1000;

function isMissingAiRecommendationsSchema(error: { code?: string; message?: string } | null | undefined) {
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

function normalizeListLimit(value: number | undefined, fallback = 8, max = 50) {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function hashRecommendation(recommendation: AiRecommendation) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: recommendation.type,
        priority: recommendation.priority,
        title: recommendation.title,
        detail: recommendation.detail,
        action: recommendation.action,
        actionHref: recommendation.actionHref ?? null,
        actionIntent: recommendation.actionIntent ?? null,
        estimatedImpact: recommendation.estimatedImpact ?? null,
        evidence: recommendation.evidence
      })
    )
    .digest("hex")
    .slice(0, 64);
}

function rowLifecycle(row: RecommendationRow, schemaReady = true): NonNullable<AiRecommendation["lifecycle"]> {
  return {
    databaseId: row.id,
    status: row.status,
    schemaReady,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    acceptedAt: row.accepted_at,
    dismissedAt: row.dismissed_at,
    resolvedAt: row.resolved_at,
    expiresAt: row.expires_at
  };
}

function evidenceList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).slice(0, 8) : [];
}

function recommendationFromRow(row: RecommendationRow): AiRecommendation {
  return {
    id: row.recommendation_key,
    type: row.type,
    priority: row.priority,
    status: row.status,
    title: row.title,
    detail: row.detail,
    action: row.action,
    actionHref: row.action_href,
    actionIntent: row.action_intent,
    confidence: row.confidence,
    estimatedImpact: row.estimated_impact_label
      ? { label: row.estimated_impact_label, value: row.estimated_impact_value }
      : null,
    evidence: evidenceList(row.evidence),
    sourceInsightId: row.source_ref_id,
    lifecycle: rowLifecycle(row)
  };
}

function withSchemaMissingLifecycle(deck: AiRecommendationDeck): AiRecommendationDeck {
  return {
    ...deck,
    recommendations: deck.recommendations.map((recommendation) => ({
      ...recommendation,
      lifecycle: {
        status: "active",
        schemaReady: false
      }
    }))
  };
}

function withVisibleDeck(deck: AiRecommendationDeck, rowsByKey: Map<string, RecommendationRow>): AiRecommendationDeck {
  const recommendations = deck.recommendations
    .map((recommendation) => {
      const row = rowsByKey.get(recommendation.id);
      return row ? { ...recommendation, status: row.status, lifecycle: rowLifecycle(row) } : recommendation;
    })
    .filter((recommendation) => visibleRecommendationStatuses.has(recommendation.lifecycle?.status ?? "active"));

  return {
    ...deck,
    summary: recommendations.length ? deck.summary : "AI chưa có gợi ý đang mở.",
    recommendations
  };
}

function rowForRecommendation({
  restaurantId,
  branchId,
  scope,
  generatedAt,
  existing,
  recommendation
}: {
  restaurantId: string;
  branchId?: string | null;
  scope: string;
  generatedAt: string;
  existing?: RecommendationRow;
  recommendation: AiRecommendation;
}) {
  const fingerprint = hashRecommendation(recommendation);
  const fingerprintChanged = Boolean(existing && existing.fingerprint !== fingerprint);
  const status = fingerprintChanged ? "active" : existing?.status ?? "active";

  return {
    restaurant_id: restaurantId,
    branch_id: branchId ?? null,
    scope_key: scope,
    source: aiRecommendationSource,
    source_ref_id: recommendation.sourceInsightId ?? null,
    recommendation_key: recommendation.id,
    fingerprint,
    type: recommendation.type,
    priority: recommendation.priority,
    status,
    title: recommendation.title,
    detail: recommendation.detail,
    action: recommendation.action,
    action_href: recommendation.actionHref ?? null,
    action_intent: recommendation.actionIntent ?? null,
    confidence: recommendation.confidence,
    estimated_impact_label: recommendation.estimatedImpact?.label ?? null,
    estimated_impact_value: recommendation.estimatedImpact?.value ?? null,
    evidence: recommendation.evidence,
    metadata: {
      sourceInsightId: recommendation.sourceInsightId ?? null,
      deterministic: true
    },
    generated_at: generatedAt,
    last_seen_at: generatedAt,
    accepted_at: fingerprintChanged ? null : existing?.accepted_at ?? null,
    accepted_by: fingerprintChanged ? null : undefined,
    dismissed_at: fingerprintChanged ? null : existing?.dismissed_at ?? null,
    dismissed_by: fingerprintChanged ? null : undefined,
    resolved_at: fingerprintChanged ? null : existing?.resolved_at ?? null,
    resolved_by: fingerprintChanged ? null : undefined,
    expires_at: null
  };
}

export async function persistAiRecommendationsFromOperationDeck(input: {
  restaurantId: string;
  branchId?: string | null;
  operationInsights: AiOperationInsightsDeck;
  limit?: number;
}): Promise<{ deck: AiRecommendationDeck; schemaReady: boolean }> {
  const deck = buildAiRecommendationDeck({ operationInsights: input.operationInsights, limit: input.limit });
  if (deck.recommendations.length === 0) return { deck, schemaReady: true };

  const startedAt = Date.now();
  const supabase = createAdminSupabaseClient() as any;
  const scope = scopeKey(input.branchId);
  const recommendationKeys = deck.recommendations.map((recommendation) => recommendation.id);

  const existingResult = await supabase
    .from("ai_recommendations")
    .select(
      "id,recommendation_key,fingerprint,type,priority,status,title,detail,action,action_href,action_intent,confidence,estimated_impact_label,estimated_impact_value,evidence,first_seen_at,last_seen_at,accepted_at,dismissed_at,resolved_at,expires_at,source_ref_id"
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("scope_key", scope)
    .eq("source", aiRecommendationSource)
    .in("recommendation_key", recommendationKeys);

  if (existingResult.error) {
    if (isMissingAiRecommendationsSchema(existingResult.error)) return { deck: withSchemaMissingLifecycle(deck), schemaReady: false };
    writeOperationalEvent({
      area: "ai",
      event: "ai_recommendations_read_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { code: existingResult.error.code }
    });
    return { deck, schemaReady: false };
  }

  const existingByKey = new Map<string, RecommendationRow>(
    ((existingResult.data ?? []) as RecommendationRow[]).map((row) => [row.recommendation_key, row])
  );
  const rows = deck.recommendations.map((recommendation) =>
    rowForRecommendation({
      restaurantId: input.restaurantId,
      branchId: input.branchId,
      scope,
      generatedAt: deck.generatedAt,
      existing: existingByKey.get(recommendation.id),
      recommendation
    })
  );
  const generatedAtMs = new Date(deck.generatedAt).getTime();
  const writesRequired = rows.some((row) => {
    const existing = existingByKey.get(row.recommendation_key);
    if (!existing || existing.fingerprint !== row.fingerprint) return true;
    const lastSeenAtMs = new Date(existing.last_seen_at ?? "").getTime();
    return !Number.isFinite(lastSeenAtMs) || !Number.isFinite(generatedAtMs) || generatedAtMs - lastSeenAtMs > freshRecommendationWindowMs;
  });

  if (!writesRequired) return { deck: withVisibleDeck(deck, existingByKey), schemaReady: true };

  const upsertResult = await supabase
    .from("ai_recommendations")
    .upsert(rows, { onConflict: "restaurant_id,scope_key,source,recommendation_key" })
    .select(
      "id,recommendation_key,fingerprint,type,priority,status,title,detail,action,action_href,action_intent,confidence,estimated_impact_label,estimated_impact_value,evidence,first_seen_at,last_seen_at,accepted_at,dismissed_at,resolved_at,expires_at,source_ref_id"
    );

  if (upsertResult.error) {
    if (isMissingAiRecommendationsSchema(upsertResult.error)) return { deck: withSchemaMissingLifecycle(deck), schemaReady: false };
    writeOperationalEvent({
      area: "ai",
      event: "ai_recommendations_upsert_failed",
      restaurantId: input.restaurantId,
      status: "warn",
      metadata: { code: upsertResult.error.code }
    });
    return { deck, schemaReady: false };
  }

  writeOperationalEvent({
    area: "ai",
    event: "ai_recommendations_persisted",
    restaurantId: input.restaurantId,
    latencyMs: Date.now() - startedAt,
    metadata: { count: rows.length, scope }
  });

  const rowsByKey = new Map<string, RecommendationRow>(
    ((upsertResult.data ?? []) as RecommendationRow[]).map((row) => [row.recommendation_key, row])
  );

  return { deck: withVisibleDeck(deck, rowsByKey), schemaReady: true };
}

export async function listRecentAiRecommendations(restaurantId: string, limit?: number) {
  const supabase = createAdminSupabaseClient() as any;
  const result = await supabase
    .from("ai_recommendations")
    .select(
      "id,recommendation_key,fingerprint,type,priority,status,title,detail,action,action_href,action_intent,confidence,estimated_impact_label,estimated_impact_value,evidence,first_seen_at,last_seen_at,accepted_at,dismissed_at,resolved_at,expires_at,source_ref_id"
    )
    .eq("restaurant_id", restaurantId)
    .in("status", ["active", "accepted"])
    .order("last_seen_at", { ascending: false })
    .limit(normalizeListLimit(limit));

  if (result.error) {
    if (isMissingAiRecommendationsSchema(result.error)) return { recommendations: [], schemaReady: false };
    throw result.error;
  }

  return {
    recommendations: ((result.data ?? []) as RecommendationRow[]).map(recommendationFromRow),
    schemaReady: true
  };
}

export async function updateAiRecommendationStatus(input: {
  restaurantId: string;
  recommendationId: string;
  status: Extract<AiRecommendationStatus, "accepted" | "dismissed" | "resolved">;
  actorUserId?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status
  };

  if (input.status === "accepted") {
    patch.accepted_at = now;
    patch.accepted_by = input.actorUserId ?? null;
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
    .from("ai_recommendations")
    .update(patch)
    .eq("restaurant_id", input.restaurantId)
    .eq("id", input.recommendationId)
    .select("id")
    .maybeSingle();

  if (result.error) {
    if (isMissingAiRecommendationsSchema(result.error)) return { updated: false, schemaReady: false };
    throw result.error;
  }

  writeOperationalEvent({
    area: "ai",
    event: "ai_recommendation_status_updated",
    restaurantId: input.restaurantId,
    status: "success",
    metadata: { recommendationId: input.recommendationId, recommendationStatus: input.status }
  });

  return { updated: Boolean(result.data?.id), schemaReady: true };
}
