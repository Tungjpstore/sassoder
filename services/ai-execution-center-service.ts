import "server-only";

import { buildAiAutomationPlaybooks } from "@/lib/ai/automation-playbooks";
import { buildAiExecutionCenter, type AiStudioExecutionSignal } from "@/lib/ai/execution-center";
import { buildAiGrowthStudioDeck } from "@/lib/ai/growth-studio";
import { buildAiMenuStudioDeck } from "@/lib/ai/menu-studio";
import { listRestaurantAiMemories } from "@/lib/ai/memory/restaurant-memory";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { buildAiSupportStudioDeck } from "@/lib/ai/support-studio";
import { listRecentAiAutomationRuns } from "@/services/ai-automation-run-service";
import { listRecentAiRecommendations } from "@/services/ai-recommendation-service";
import { getAdminReport } from "@/services/dashboard-report-service";
import { listMenuForAdmin } from "@/services/menu-service";
import { listPublicPromotions } from "@/services/promotion-service";

function schemaFlags(schemas: Awaited<ReturnType<typeof getAiSchemaReadiness>>) {
  return {
    recommendations: schemas.checks.find((check) => check.key === "recommendations")?.ready ?? false,
    restaurantMemories: schemas.checks.find((check) => check.key === "restaurantMemories")?.ready ?? false,
    automationRuns: schemas.checks.find((check) => check.key === "automationRuns")?.ready ?? false
  };
}

function studioSignals(input: {
  menuDeck: ReturnType<typeof buildAiMenuStudioDeck>;
  growthDeck: ReturnType<typeof buildAiGrowthStudioDeck>;
  supportDeck: ReturnType<typeof buildAiSupportStudioDeck>;
}): AiStudioExecutionSignal[] {
  return [
    ...input.menuDeck.opportunities.slice(0, 6).map<AiStudioExecutionSignal>((opportunity) => ({
      id: opportunity.id,
      kind: "menu_opportunity",
      title: opportunity.title,
      detail: opportunity.reason,
      priority: opportunity.priority,
      status: opportunity.status,
      actionHref: opportunity.actionHref,
      nextAction: opportunity.nextAction,
      safetyNote: opportunity.safetyNote,
      source: opportunity.estimatedImpact
    })),
    ...input.growthDeck.campaigns.slice(0, 6).map<AiStudioExecutionSignal>((campaign) => ({
      id: campaign.id,
      kind: "growth_campaign",
      title: campaign.title,
      detail: campaign.messageAngle,
      priority: campaign.priority,
      status: campaign.status,
      actionHref: campaign.actionHref,
      nextAction: campaign.nextAction,
      safetyNote: campaign.safetyNote,
      source: campaign.estimatedImpact
    })),
    ...input.supportDeck.scenarios.slice(0, 6).map<AiStudioExecutionSignal>((scenario) => ({
      id: scenario.id,
      kind: "support_scenario",
      title: scenario.title,
      detail: scenario.answerStrategy,
      priority: scenario.priority,
      status: scenario.status,
      actionHref: scenario.actionHref,
      nextAction: scenario.nextAction,
      safetyNote: scenario.guardrails[0] ?? null,
      source: scenario.escalationMode
    }))
  ];
}

export async function getAiExecutionCenterDeck(restaurantId: string) {
  const [providers, schemas, memoriesResult, recommendationsResult, workflowRunsResult, categories, report, activePromotions] = await Promise.all([
    Promise.resolve(getAiProviderReadiness()),
    getAiSchemaReadiness(),
    listRestaurantAiMemories({ restaurantId, includeSensitive: false, limit: 40 }),
    listRecentAiRecommendations(restaurantId, 30),
    listRecentAiAutomationRuns(restaurantId, 30),
    listMenuForAdmin(restaurantId),
    getAdminReport(restaurantId),
    listPublicPromotions(restaurantId, "WEBSITE").catch(() => [])
  ]);
  const flags = schemaFlags(schemas);
  const providerConfigured = providers.some((provider) => provider.configured);
  const memories = memoriesResult.memories.map((memory) => ({
    id: memory.id,
    category: memory.category,
    title: memory.title,
    sensitivity: memory.sensitivity
  }));
  const recommendations = recommendationsResult.recommendations.map((recommendation) => ({
    id: recommendation.id,
    type: recommendation.type,
    priority: recommendation.priority,
    title: recommendation.title,
    detail: recommendation.detail,
    action: recommendation.action,
    actionHref: recommendation.actionHref,
    estimatedImpactLabel: recommendation.estimatedImpact?.label ?? null
  }));
  const topItemIds = new Set(report.topItems.map((item) => item.id));
  const menuItems = categories.flatMap((category) =>
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
  );
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
  const growthDeck = buildAiGrowthStudioDeck({
    providerConfigured,
    schemas: flags,
    memoryCount: memoriesResult.memories.length,
    activePromotionCount: activePromotions.length,
    recommendations,
    playbooks: playbookDeck.playbooks.map((playbook) => ({
      id: playbook.id,
      domain: playbook.domain,
      status: playbook.status,
      title: playbook.title,
      readinessScore: playbook.readinessScore
    }))
  });
  const menuDeck = buildAiMenuStudioDeck({
    providerConfigured,
    schemas: flags,
    items: menuItems,
    memories,
    recommendations: recommendationsResult.recommendations.map((recommendation) => ({
      id: recommendation.id,
      type: recommendation.type,
      priority: recommendation.priority,
      title: recommendation.title,
      detail: recommendation.detail
    }))
  });
  const supportDeck = buildAiSupportStudioDeck({
    providerConfigured,
    schemas: flags,
    memories,
    recommendations: recommendationsResult.recommendations.map((recommendation) => ({
      id: recommendation.id,
      type: recommendation.type,
      priority: recommendation.priority,
      title: recommendation.title
    }))
  });

  return buildAiExecutionCenter({
    recommendations: recommendationsResult.recommendations,
    workflows: workflowRunsResult.workflows,
    studioSignals: studioSignals({ menuDeck, growthDeck, supportDeck })
  });
}
