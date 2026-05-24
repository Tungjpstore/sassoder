import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildAiAutomationWorkflows } from "@/lib/ai/automation-workflows";
import { getOwnerOperationalSnapshot } from "@/services/ai/runtime";
import { generateAiBranchOperationInsightsForRestaurant } from "@/services/ai-branch-operation-insights-service";
import { persistAiAutomationRuns } from "@/services/ai-automation-run-service";
import { createAiMorningBriefRun } from "@/services/ai-morning-brief-service";
import { persistAiOperationInsightsDeck } from "@/services/ai-operation-insights-service";
import { runDsxAirBatchCron, type DsxAirBatchJobKind } from "@/services/ai-dsx-air-batch-service";
import { writeOperationalEvent } from "@/services/operational-observability-service";
import type { AiOperationInsightsDeck } from "@/lib/ai/operation-insights";
import type { AiRestaurantContext, OwnerAiIntent } from "@/services/ai-prompt-router";

type RestaurantAiRow = AiRestaurantContext & {
  platform_status?: string | null;
  contact_email?: string | null;
};

export type RunAiOpsCronInput = {
  maxRestaurants?: number;
  intent?: OwnerAiIntent;
  morningBrief?: boolean;
  emailMorningBrief?: boolean;
  branchInsights?: boolean;
  inventoryJobs?: boolean;
  dsxBatch?: boolean;
  dsxBatchJobs?: DsxAirBatchJobKind[];
  maxBranchesPerRestaurant?: number;
};

export type RunAiOpsCronResult = {
  scanned: number;
  generated: number;
  persisted: number;
  skipped: number;
  failed: number;
  schemaMissing: number;
  morningBriefs: {
    generated: number;
    sent: number;
    skipped: number;
    failed: number;
    schemaMissing: number;
  };
  branchInsights: {
    scanned: number;
    generated: number;
    persisted: number;
    skipped: number;
    failed: number;
    schemaMissing: number;
  };
  inventoryJobs: {
    generated: number;
    persisted: number;
    skipped: number;
    failed: number;
    schemaMissing: number;
  };
  dsxBatch: Awaited<ReturnType<typeof runDsxAirBatchCron>>;
  primaryInsights: Array<{
    restaurantId: string;
    restaurantName: string;
    healthScore: number;
    summary: string;
    primaryInsightId: string | null;
  }>;
  branchPrimaryInsights: Array<{
    restaurantId: string;
    restaurantName: string;
    branchId: string;
    branchName: string;
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
  const shouldCreateMorningBrief = input.morningBrief ?? intent === "overview";
  const emailMorningBrief = input.emailMorningBrief;
  const shouldGenerateBranchInsights = input.branchInsights ?? intent === "overview";
  const shouldGenerateInventoryJobs = input.inventoryJobs ?? intent === "overview";
  const shouldRunDsxBatch =
    input.dsxBatch ?? (intent === "overview" && (process.env.NVIDIA_AI_BATCH_ENABLED === "true" || process.env.DSX_AIR_BATCH_ENABLED === "true"));

  const restaurantsResult = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,address,hotline,contact_email,description,platform_status")
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
    morningBriefs: {
      generated: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      schemaMissing: 0
    },
    branchInsights: {
      scanned: 0,
      generated: 0,
      persisted: 0,
      skipped: 0,
      failed: 0,
      schemaMissing: 0
    },
    inventoryJobs: {
      generated: 0,
      persisted: 0,
      skipped: 0,
      failed: 0,
      schemaMissing: 0
    },
    dsxBatch: {
      enabled: false,
      scanned: 0,
      generated: 0,
      persisted: 0,
      skipped: 0,
      failed: 0,
      schemaMissing: 0,
      provider: "nvidia",
      jobs: [],
      failures: []
    },
    primaryInsights: [],
    branchPrimaryInsights: [],
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

      if (shouldCreateMorningBrief) {
        const brief = await createAiMorningBriefRun({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          contactEmail: restaurant.contact_email,
          deck: persisted.deck,
          source: "ai_ops_cron",
          emailEnabled: emailMorningBrief
        });

        if (!brief.schemaReady) {
          result.morningBriefs.schemaMissing += 1;
        } else if (brief.dashboard) {
          result.morningBriefs.generated += 1;
        }

        if (brief.emailStatus === "sent") result.morningBriefs.sent += 1;
        if (brief.emailStatus === "skipped") result.morningBriefs.skipped += 1;
        if (brief.emailStatus === "failed") result.morningBriefs.failed += 1;
      }

      if (shouldGenerateBranchInsights) {
        const branchResult = await generateAiBranchOperationInsightsForRestaurant({
          restaurantId: restaurant.id,
          maxBranches: input.maxBranchesPerRestaurant
        });

        result.branchInsights.scanned += branchResult.scanned;
        result.branchInsights.generated += branchResult.generated;
        result.branchInsights.persisted += branchResult.persisted;
        result.branchInsights.skipped += branchResult.skipped;
        result.branchInsights.failed += branchResult.failed;
        result.branchInsights.schemaMissing += branchResult.schemaMissing;
        result.branchPrimaryInsights.push(
          ...branchResult.primaryInsights.map((insight) => ({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            ...insight
          }))
        );
      }

      if (shouldGenerateInventoryJobs) {
        try {
          const inventoryWorkflows = buildAiAutomationWorkflows({ snapshot, limit: 8 }).filter((workflow) => workflow.domain === "inventory");
          if (inventoryWorkflows.length === 0) {
            result.inventoryJobs.skipped += 1;
          } else {
            result.inventoryJobs.generated += inventoryWorkflows.length;
            const automationResult = await persistAiAutomationRuns({
              restaurantId: restaurant.id,
              workflows: inventoryWorkflows,
              generatedAt: deck.generatedAt
            });
            if (automationResult.schemaReady) result.inventoryJobs.persisted += automationResult.workflows.length;
            else result.inventoryJobs.schemaMissing += 1;
          }
        } catch (error) {
          result.inventoryJobs.failed += 1;
          writeOperationalEvent({
            area: "ai",
            event: "ai_inventory_jobs_failed",
            restaurantId: restaurant.id,
            status: "warn",
            metadata: {
              error: error instanceof Error ? error.message : "Unknown inventory AI job failure"
            }
          });
        }
      }

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

  result.dsxBatch = await runDsxAirBatchCron({
    enabled: shouldRunDsxBatch,
    maxRestaurants,
    jobs: input.dsxBatchJobs
  });

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
      schemaMissing: result.schemaMissing,
      morningBriefs: result.morningBriefs,
      branchInsights: result.branchInsights,
      inventoryJobs: result.inventoryJobs,
      dsxBatch: {
        enabled: result.dsxBatch.enabled,
        scanned: result.dsxBatch.scanned,
        generated: result.dsxBatch.generated,
        persisted: result.dsxBatch.persisted,
        failed: result.dsxBatch.failed,
        schemaMissing: result.dsxBatch.schemaMissing
      }
    }
  });

  return result;
}
