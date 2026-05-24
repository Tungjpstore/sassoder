import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { buildAiAutomationPlaybooks } from "@/lib/ai/automation-playbooks";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { fail, ok } from "@/lib/response";
import { listRecentAiAutomationRuns } from "@/services/ai-automation-run-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false,
    automationRuns: schemas.checks.find((check) => check.key === "automationRuns")?.ready ?? false,
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false
  };
}

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    const [providers, schemas, memoriesResult, recommendationsResult, workflowRunsResult] = await Promise.all([
      Promise.resolve(getAiProviderReadiness()),
      getAiSchemaReadiness(),
      listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 20 }),
      listRecentAiRecommendations(session.restaurantId, 30),
      listRecentAiAutomationRuns(session.restaurantId, 30)
    ]);

    return ok(
      buildAiAutomationPlaybooks({
        providerConfigured: providers.some((provider) => provider.configured),
        schemas: schemaFlags(schemas),
        memoryCount: memoriesResult.memories.length,
        recommendations: recommendationsResult.recommendations.map((recommendation) => ({
          id: recommendation.id,
          type: recommendation.type,
          priority: recommendation.priority,
          title: recommendation.title
        })),
        workflows: workflowRunsResult.workflows.map((workflow) => ({
          id: workflow.id,
          domain: workflow.domain,
          priority: workflow.priority,
          title: workflow.title
        }))
      })
    );
  } catch (error) {
    return fail(error);
  }
}
