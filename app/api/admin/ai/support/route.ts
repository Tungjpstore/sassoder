import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { buildAiSupportStudioDeck } from "@/lib/ai/support-studio";
import { fail, ok } from "@/lib/response";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false,
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false
  };
}

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    const [providers, schemas, memoriesResult, recommendationsResult] = await Promise.all([
      Promise.resolve(getAiProviderReadiness()),
      getAiSchemaReadiness(),
      listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 40 }),
      listRecentAiRecommendations(session.restaurantId, 30)
    ]);

    return ok(
      buildAiSupportStudioDeck({
        providerConfigured: providers.some((provider) => provider.configured),
        schemas: schemaFlags(schemas),
        memories: memoriesResult.memories.map((memory) => ({
          id: memory.id,
          category: memory.category,
          title: memory.title,
          sensitivity: memory.sensitivity
        })),
        recommendations: recommendationsResult.recommendations.map((recommendation) => ({
          id: recommendation.id,
          type: recommendation.type,
          priority: recommendation.priority,
          title: recommendation.title
        }))
      })
    );
  } catch (error) {
    return fail(error);
  }
}
