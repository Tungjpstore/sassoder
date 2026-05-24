import "server-only";

import { runAiCompletion } from "@/lib/ai/router/model-router";
import { normalizeAiProviderId } from "@/lib/ai/providers/registry";
import type { AiProvider, AiTaskType } from "@/lib/ai/router/types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getOwnerOperationalSnapshot } from "@/services/ai/runtime";
import type { AiRestaurantContext, OwnerAiIntent } from "@/services/ai-prompt-router";
import { writeOperationalEvent } from "@/services/operational-observability-service";

export type DsxAirBatchJobKind = "operations_report" | "inventory_analysis" | "marketing_seo" | "memory_brief";

type RestaurantAiRow = AiRestaurantContext & {
  platform_status?: string | null;
};

type DsxAirBatchJobDefinition = {
  kind: DsxAirBatchJobKind;
  taskType: AiTaskType;
  intent: OwnerAiIntent;
  title: string;
  system: string;
  outputContract: string;
};

export type RunDsxAirBatchCronInput = {
  maxRestaurants?: number;
  jobs?: DsxAirBatchJobKind[];
  enabled?: boolean;
  provider?: AiProvider;
};

export type RunDsxAirBatchCronResult = {
  enabled: boolean;
  scanned: number;
  generated: number;
  persisted: number;
  skipped: number;
  failed: number;
  schemaMissing: number;
  provider: AiProvider;
  jobs: DsxAirBatchJobKind[];
  failures: Array<{
    restaurantId: string;
    restaurantName: string;
    job: DsxAirBatchJobKind;
    error: string;
  }>;
};

const batchJobDefinitions: DsxAirBatchJobDefinition[] = [
  {
    kind: "operations_report",
    taskType: "batch_report",
    intent: "reports",
    title: "Báo cáo vận hành tự động",
    system:
      "Bạn là AI vận hành nhà hàng LogiVN. Tạo báo cáo batch cho chủ quán từ dữ liệu snapshot, không bịa số liệu và không yêu cầu thao tác realtime.",
    outputContract:
      "Trả JSON có keys: summary, risks[], opportunities[], nextActions[], confidence. Mỗi mảng tối đa 5 mục, tiếng Việt, ngắn gọn."
  },
  {
    kind: "inventory_analysis",
    taskType: "batch_inventory",
    intent: "inventory",
    title: "Phân tích kho và nhập hàng",
    system:
      "Bạn là AI kiểm soát kho F&B. Phân tích tồn kho, hao hụt, food cost, nhập hàng và cảnh báo vận hành từ snapshot.",
    outputContract:
      "Trả JSON có keys: summary, stockRisks[], reorderSuggestions[], wasteSignals[], nextActions[], confidence. Không tạo đơn nhập thật."
  },
  {
    kind: "marketing_seo",
    taskType: "batch_marketing",
    intent: "growth",
    title: "SEO/local marketing",
    system:
      "Bạn là AI marketing địa phương cho quán ăn/cafe. Sinh ý tưởng nội dung Google Business, Facebook và mô tả món dựa trên dữ liệu thật.",
    outputContract:
      "Trả JSON có keys: summary, googleBusinessPosts[], facebookPosts[], menuCopyIdeas[], localSeoKeywords[], nextActions[]. Mỗi nội dung sẵn sàng để chủ quán duyệt."
  },
  {
    kind: "memory_brief",
    taskType: "batch_embedding",
    intent: "overview",
    title: "Tóm tắt bộ nhớ LogiBot",
    system:
      "Bạn là AI chuẩn hóa bộ nhớ cho LogiBot. Tạo bản tóm tắt tri thức quán để phục vụ RAG/embedding batch sau này.",
    outputContract:
      "Trả JSON có keys: summary, memoryFacts[], policyNotes[], menuSignals[], operationsSignals[], embeddingCandidates[]. Không chứa dữ liệu nhạy cảm quá chi tiết."
  }
];
const defaultBatchJobs: DsxAirBatchJobKind[] = ["operations_report", "inventory_analysis", "marketing_seo"];

function isMissingBatchSchema(error: { code?: string; message?: string } | null | undefined) {
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

function normalizeLimit(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function configuredBatchProvider(input?: AiProvider) {
  return input ?? normalizeAiProviderId(process.env.NVIDIA_AI_BATCH_PROVIDER) ?? normalizeAiProviderId(process.env.DSX_AIR_BATCH_PROVIDER) ?? "nvidia";
}

function batchEnabled(input?: boolean) {
  return input ?? (process.env.NVIDIA_AI_BATCH_ENABLED === "true" || process.env.DSX_AIR_BATCH_ENABLED === "true");
}

function normalizeJobs(jobs?: DsxAirBatchJobKind[]): DsxAirBatchJobKind[] {
  const known = new Set<DsxAirBatchJobKind>(batchJobDefinitions.map((job) => job.kind));
  const selected = (jobs?.length ? jobs : defaultBatchJobs).filter((job) => known.has(job));
  return selected.length ? selected : ["operations_report"];
}

function jobDefinition(kind: DsxAirBatchJobKind) {
  return batchJobDefinitions.find((job) => job.kind === kind) ?? batchJobDefinitions[0];
}

function safeJson(value: unknown) {
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function compactText(value: string, maxLength = 8000) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function buildBatchMessages(input: {
  restaurant: RestaurantAiRow;
  snapshot: unknown;
  definition: DsxAirBatchJobDefinition;
}) {
  return [
    {
      role: "system" as const,
      content: `${input.definition.system}\n${input.definition.outputContract}`
    },
    {
      role: "user" as const,
      content: compactText(
        JSON.stringify({
          job: input.definition.kind,
          title: input.definition.title,
          restaurant: {
            id: input.restaurant.id,
            name: input.restaurant.name,
            slug: input.restaurant.slug,
            businessType: input.restaurant.business_type,
            address: input.restaurant.address,
            hotline: input.restaurant.hotline,
            description: input.restaurant.description
          },
          snapshot: input.snapshot
        })
      )
    }
  ];
}

async function persistBatchRun(input: {
  restaurantId: string;
  jobKind: DsxAirBatchJobKind;
  status: "success" | "failed";
  provider: AiProvider;
  model?: string | null;
  title: string;
  outputText?: string | null;
  raw?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostVnd?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
}) {
  const supabase = createAdminSupabaseClient() as any;
  const { error } = await supabase.from("ai_batch_compute_runs").insert({
    restaurant_id: input.restaurantId,
    job_kind: input.jobKind,
    status: input.status,
    provider: input.provider,
    model: input.model ?? null,
    title: input.title,
    output_text: input.outputText ? compactText(input.outputText, 12000) : null,
    raw_output: safeJson(input.raw),
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    estimated_cost_vnd: input.estimatedCostVnd ?? null,
    latency_ms: input.latencyMs ?? null,
    error_message: input.errorMessage ? compactText(input.errorMessage, 1000) : null
  });

  if (!error) return { schemaReady: true, persisted: true };
  if (isMissingBatchSchema(error)) return { schemaReady: false, persisted: false };

  writeOperationalEvent({
    area: "ai",
    event: "ai_batch_compute_persist_failed",
    restaurantId: input.restaurantId,
    status: "warn",
    metadata: {
      jobKind: input.jobKind,
      provider: input.provider,
      error: error.message ?? "Unknown ai_batch_compute_runs insert failure"
    }
  });
  return { schemaReady: true, persisted: false };
}

export async function runDsxAirBatchCron(input: RunDsxAirBatchCronInput = {}): Promise<RunDsxAirBatchCronResult> {
  const startedAt = Date.now();
  const enabled = batchEnabled(input.enabled);
  const provider = configuredBatchProvider(input.provider);
  const jobs = normalizeJobs(input.jobs);
  const result: RunDsxAirBatchCronResult = {
    enabled,
    scanned: 0,
    generated: 0,
    persisted: 0,
    skipped: 0,
    failed: 0,
    schemaMissing: 0,
    provider,
    jobs,
    failures: []
  };

  if (!enabled) {
    result.skipped = jobs.length;
    return result;
  }

  const supabase = createAdminSupabaseClient() as any;
  const restaurantsResult = await supabase
    .from("restaurants")
    .select("id,name,slug,business_type,address,hotline,description,platform_status")
    .eq("platform_status", "active")
    .order("created_at", { ascending: true })
    .limit(normalizeLimit(input.maxRestaurants));

  if (restaurantsResult.error) throw restaurantsResult.error;

  const restaurants = (restaurantsResult.data ?? []) as RestaurantAiRow[];
  result.scanned = restaurants.length;

  for (const restaurant of restaurants) {
    for (const kind of jobs) {
      const definition = jobDefinition(kind);
      try {
        const snapshot = await getOwnerOperationalSnapshot(restaurant.id, definition.intent, restaurant);
        const aiResult = await runAiCompletion({
          taskType: definition.taskType,
          preferredProvider: provider,
          messages: buildBatchMessages({ restaurant, snapshot, definition }),
          options: {
            jsonMode: true,
            maxTokens: 900,
            timeoutMs: 45_000,
            cacheTtlMs: 30_000
          }
        });

        result.generated += 1;
        const persisted = await persistBatchRun({
          restaurantId: restaurant.id,
          jobKind: kind,
          status: "success",
          provider: aiResult.provider,
          model: aiResult.model,
          title: definition.title,
          outputText: aiResult.text,
          raw: aiResult.raw,
          inputTokens: aiResult.inputTokens,
          outputTokens: aiResult.outputTokens,
          estimatedCostVnd: aiResult.estimatedCostVnd,
          latencyMs: aiResult.latencyMs
        });
        if (persisted.schemaReady && persisted.persisted) result.persisted += 1;
        if (!persisted.schemaReady) result.schemaMissing += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown DSX Air batch failure";
        result.failed += 1;
        result.failures.push({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          job: kind,
          error: message
        });
        const persisted = await persistBatchRun({
          restaurantId: restaurant.id,
          jobKind: kind,
          status: "failed",
          provider,
          title: definition.title,
          errorMessage: message
        });
        if (!persisted.schemaReady) result.schemaMissing += 1;
      }
    }
  }

  writeOperationalEvent({
    area: "ai",
    event: "dsx_air_batch_cron_completed",
    status: result.failed > 0 ? "warn" : "success",
    latencyMs: Date.now() - startedAt,
    metadata: {
      provider,
      jobs,
      scanned: result.scanned,
      generated: result.generated,
      persisted: result.persisted,
      failed: result.failed,
      schemaMissing: result.schemaMissing
    }
  });

  return result;
}
