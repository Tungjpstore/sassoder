import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOwnerOperationalSnapshot } from "@/services/ai/runtime";
import { persistAiOperationInsightsDeck } from "@/services/ai-operation-insights-service";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import type { AiOperationInsightsDeck } from "@/lib/ai/operation-insights";
import type { AiRestaurantContext, OwnerAiIntent } from "@/services/ai-prompt-router";

type RestaurantAiRow = AiRestaurantContext & {
  platform_status?: string | null;
};

export type RunAiOpsCronInput = {
  maxRestaurants?: number;
  intent?: OwnerAiIntent;
};

export type RunAiOpsCronResult = {
  scanned: number;
  generated: number;
  persisted: number;
  skipped: number;
  failed: number;
  schemaMissing: number;
  primaryInsights: Array<{
    restaurantId: string;
    restaurantName: string;
    healthScore: number;
    summary: string;
    primaryInsightId: string | null;
  }>;
  failures: Array<{
    restaurantId: string;
    restaurantName: string;
    error: string;
  }>;
};

function asDeck(value: unknown): AiOperationInsightsDeck | null {
  const deck = value as AiOperationInsightsDeck | null | undefined;
  if (!deck || typeof deck.generatedAt !== "string" || !Array.isArray(deck.insights)) return null;
  return deck;
}

function normalizeLimit(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 25;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

export async function runAiOpsCron(input: RunAiOpsCronInput = {}): Promise<RunAiOpsCronResult> {
  const startedAt = Date.now();
  const supabase = createAdminSupabaseClient() as any;
  const maxRestaurants = normalizeLimit(input.maxRestaurants);
  const intent = input.intent ?? "overview";

  const restaurantsResult = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,address,hotline,description,platform_status")
    .eq("platform_status", "active")
    .order("created_at", { ascending: true })
    .limit(maxRestaurants);

  if (restaurantsResult.error) throw restaurantsResult.error;

  const restaurants = (restaurantsResult.data ?? []) as RestaurantAiRow[];
  const result: RunAiOpsCronResult = {
    scanned: restaurants.length,
    generated: 0,
    persisted: 0,
    skipped: 0,
    failed: 0,
    schemaMissing: 0,
    primaryInsights: [],
    failures: []
  };

  for (const restaurant of restaurants) {
    try {
      const snapshot = (await getOwnerOperationalSnapshot(restaurant.id, intent, restaurant)) as { operationInsights?: unknown };
      const deck = asDeck(snapshot.operationInsights);

      if (!deck) {
        result.skipped += 1;
        continue;
      }

      result.generated += 1;

      const persisted = await persistAiOperationInsightsDeck({
        restaurantId: restaurant.id,
        deck
      });

      if (persisted.schemaReady) result.persisted += 1;
      else result.schemaMissing += 1;

      result.primaryInsights.push({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        healthScore: persisted.deck.healthScore,
        summary: persisted.deck.summary,
        primaryInsightId: persisted.deck.primaryInsightId
      });
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        error: error instanceof Error ? error.message : "Unknown AI Ops cron failure"
      });
    }
  }

  writeOperationalEvent({
    area: "ai",
    event: "ai_ops_cron_completed",
    status: result.failed > 0 ? "warn" : "success",
    latencyMs: Date.now() - startedAt,
    metadata: {
      scanned: result.scanned,
      generated: result.generated,
      persisted: result.persisted,
      skipped: result.skipped,
      failed: result.failed,
      schemaMissing: result.schemaMissing
    }
  });

  return result;
}
