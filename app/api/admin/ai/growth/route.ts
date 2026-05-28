import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { buildAiAutomationPlaybooks } from "@/lib/ai/automation-playbooks";
import { buildAiGrowthStudioDeck } from "@/lib/ai/growth-studio";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getResolvedAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { fail, ok } from "@/lib/response";
import { listRecentAiAutomationRuns } from "@/services/ai-automation-run-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";
import { listPublicPromotions } from "@/services/promotion-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false,
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false,
    automationRuns: schemas.checks.find((check) => check.key === "automationRuns")?.ready ?? false
  };
}

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    const [providers, schemas, memoriesResult, recommendationsResult, workflowRunsResult, activePromotions] = await Promise.all([
      getResolvedAiProviderReadiness(),
      getAiSchemaReadiness(),
      listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 20 }),
      listRecentAiRecommendations(session.restaurantId, 30),
      listRecentAiAutomationRuns(session.restaurantId, 30),
      listPublicPromotions(session.restaurantId, "WEBSITE").catch(() => [])
    ]);
    const flags = schemaFlags(schemas);
    const providerConfigured = providers.some((provider) => provider.configured);
    const playbookDeck = buildAiAutomationPlaybooks({
      providerConfigured,
      schemas: flags,
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
    });

    return ok(
      buildAiGrowthStudioDeck({
        providerConfigured,
        schemas: flags,
        memoryCount: memoriesResult.memories.length,
        activePromotionCount: activePromotions.length,
        recommendations: recommendationsResult.recommendations.map((recommendation) => ({
          id: recommendation.id,
          type: recommendation.type,
          priority: recommendation.priority,
          title: recommendation.title,
          detail: recommendation.detail,
          action: recommendation.action,
          actionHref: recommendation.actionHref,
          estimatedImpactLabel: recommendation.estimatedImpact?.label ?? null
        })),
        playbooks: playbookDeck.playbooks.map((playbook) => ({
          id: playbook.id,
          domain: playbook.domain,
          status: playbook.status,
          title: playbook.title,
          readinessScore: playbook.readinessScore
        }))
      })
    );
  } catch (error) {
    return fail(error);
  }
}
