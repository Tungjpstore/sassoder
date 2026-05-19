import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { buildAiMenuStudioDeck } from "@/lib/ai/menu-studio";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { fail, ok } from "@/lib/response";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";
import { listMenuForAdmin } from "@/services/menu-service";
import { getAdminReport } from "@/services/dashboard-report-service";

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
    const [providers, schemas, memoriesResult, recommendationsResult, categories, report] = await Promise.all([
      Promise.resolve(getAiProviderReadiness()),
      getAiSchemaReadiness(),
      listRestaurantAiMemories({ restaurantId: session.restaurantId, includeSensitive: false, limit: 40 }),
      listRecentAiRecommendations(session.restaurantId, 30),
      listMenuForAdmin(session.restaurantId),
      getAdminReport(session.restaurantId)
    ]);
    const topItemIds = new Set(report.topItems.map((item) => item.id));

    return ok(
      buildAiMenuStudioDeck({
        providerConfigured: providers.some((provider) => provider.configured),
        schemas: schemaFlags(schemas),
        items: categories.flatMap((category) =>
          category.items.map((item) => ({
            id: item.id,
            categoryId: category.id,
            categoryName: category.name,
            name: item.name,
            price: item.price,
            imageUrl: item.image_url,
            isAvailable: item.is_available,
            modifierGroupCount: item.modifierGroups?.length ?? 0,
            modifierOptionCount: (item.modifierGroups ?? []).reduce((sum, group) => sum + group.options.length, 0),
            isTopSeller: topItemIds.has(item.id)
          }))
        ),
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
          title: recommendation.title,
          detail: recommendation.detail
        }))
      })
    );
  } catch (error) {
    return fail(error);
  }
}
