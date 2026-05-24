import { assertCronSecret } from "@/lib/cron/auth";
import { fail, ok } from "@/lib/response";
import { runAiOpsCron } from "@/services/ai-operation-cron-service";
import type { DsxAirBatchJobKind } from "@/services/ai-dsx-air-batch-service";
import { normalizeOwnerAiIntent } from "@/services/ai-prompt-router";
import { runLoggedCron } from "@/services/cron-run-log-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);

    const url = new URL(request.url);
    const maxRestaurants = Number(url.searchParams.get("limit") ?? "25");
    const rawIntent = url.searchParams.get("intent");
    const intent = normalizeOwnerAiIntent(rawIntent, rawIntent ?? "overview");
    const morningBrief = url.searchParams.get("brief") !== "false" && intent === "overview";
    const emailParam = url.searchParams.get("email");
    const emailMorningBrief = emailParam === "true" ? true : emailParam === "false" ? false : undefined;
    const branchesParam = url.searchParams.get("branches");
    const branchInsights = branchesParam === "true" ? true : branchesParam === "false" ? false : undefined;
    const inventoryParam = url.searchParams.get("inventory");
    const inventoryJobs = inventoryParam === "true" ? true : inventoryParam === "false" ? false : undefined;
    const dsxBatchParam = url.searchParams.get("dsxBatch") ?? url.searchParams.get("nvidiaBatch");
    const dsxBatch = dsxBatchParam === "true" ? true : dsxBatchParam === "false" ? false : undefined;
    const dsxBatchJobs = normalizeDsxBatchJobs(url.searchParams.get("dsxJobs") ?? url.searchParams.get("nvidiaJobs"));
    const maxBranchesPerRestaurant = Number(url.searchParams.get("branchLimit") ?? url.searchParams.get("maxBranches") ?? "8");

    return ok(
      await runLoggedCron({
        request,
        jobKey: "ai-ops",
        metadata: { intent, maxRestaurants, morningBrief, emailMorningBrief, branchInsights, inventoryJobs, dsxBatch, dsxBatchJobs, maxBranchesPerRestaurant },
        run: () =>
          runAiOpsCron({
            maxRestaurants,
            intent,
            morningBrief,
            emailMorningBrief,
            branchInsights,
            inventoryJobs,
            dsxBatch,
            dsxBatchJobs,
            maxBranchesPerRestaurant
          }),
        statusFromResult: (result) =>
          result.failed > 0 ||
          result.schemaMissing > 0 ||
          result.morningBriefs.failed > 0 ||
          result.morningBriefs.schemaMissing > 0 ||
          result.branchInsights.failed > 0 ||
          result.branchInsights.schemaMissing > 0 ||
          result.inventoryJobs.failed > 0 ||
          result.inventoryJobs.schemaMissing > 0 ||
          result.dsxBatch.failed > 0 ||
          result.dsxBatch.schemaMissing > 0
            ? "warn"
            : "success",
        summaryFromResult: (result) => ({
          scanned: result.scanned,
          generated: result.generated,
          persisted: result.persisted,
          skipped: result.skipped,
          failed: result.failed,
          schemaMissing: result.schemaMissing,
          morningBriefGenerated: result.morningBriefs.generated,
          morningBriefSent: result.morningBriefs.sent,
          morningBriefSkipped: result.morningBriefs.skipped,
          morningBriefFailed: result.morningBriefs.failed,
          morningBriefSchemaMissing: result.morningBriefs.schemaMissing,
          branchInsightsScanned: result.branchInsights.scanned,
          branchInsightsGenerated: result.branchInsights.generated,
          branchInsightsPersisted: result.branchInsights.persisted,
          branchInsightsSkipped: result.branchInsights.skipped,
          branchInsightsFailed: result.branchInsights.failed,
          branchInsightsSchemaMissing: result.branchInsights.schemaMissing,
          inventoryJobsGenerated: result.inventoryJobs.generated,
          inventoryJobsPersisted: result.inventoryJobs.persisted,
          inventoryJobsSkipped: result.inventoryJobs.skipped,
          inventoryJobsFailed: result.inventoryJobs.failed,
          inventoryJobsSchemaMissing: result.inventoryJobs.schemaMissing,
          dsxBatchEnabled: result.dsxBatch.enabled,
          dsxBatchScanned: result.dsxBatch.scanned,
          dsxBatchGenerated: result.dsxBatch.generated,
          dsxBatchPersisted: result.dsxBatch.persisted,
          dsxBatchSkipped: result.dsxBatch.skipped,
          dsxBatchFailed: result.dsxBatch.failed,
          dsxBatchSchemaMissing: result.dsxBatch.schemaMissing
        })
      })
    );
  } catch (error) {
    return fail(error);
  }
}

function normalizeDsxBatchJobs(value: string | null): DsxAirBatchJobKind[] | undefined {
  if (!value) return undefined;
  const allowed = new Set<DsxAirBatchJobKind>(["operations_report", "inventory_analysis", "marketing_seo", "memory_brief"]);
  const jobs = value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is DsxAirBatchJobKind => allowed.has(item as DsxAirBatchJobKind));
  return jobs.length ? jobs : undefined;
}
