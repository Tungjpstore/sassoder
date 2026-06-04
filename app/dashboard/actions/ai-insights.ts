"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { buildAiAutomationWorkflows } from "@/lib/ai/automation-workflows";
import { updateRestaurantAiMemoryStatus } from "@/lib/ai/memory/restaurant-memory";
import {
  persistAiAutomationRuns,
  updateAiAutomationRunStatus,
  type AiAutomationRunStatus
} from "@/services/ai-automation-run-service";
import { persistAiOperationInsightsDeck, updateAiOperationInsightStatus } from "@/services/ai-operation-insights-service";
import {
  getAiRecommendationById,
  persistAiRecommendationsFromOperationDeck,
  updateAiRecommendationStatus
} from "@/services/ai-recommendation-service";
import { getOwnerOperationalSnapshot } from "@/services/ai/runtime";
import { createInventoryPurchaseOrder } from "@/services/inventory-service";
import { createCategory, createMenuItem, listMenuForAdmin } from "@/services/menu-service";
import { createPromotion } from "@/services/promotion-service";
import { assertFeatureEntitlement } from "@/services/subscription-service";
import type { AiRecommendationStatus } from "@/lib/ai/recommendation-engine";
import type { AiOperationInsightLifecycleStatus } from "@/lib/ai/operation-insights";

const mutableInsightStatuses = new Set<AiOperationInsightLifecycleStatus>(["seen", "dismissed", "resolved"]);
const mutableRecommendationStatuses = new Set<AiRecommendationStatus>(["accepted", "dismissed", "resolved"]);
const mutableAutomationRunStatuses = new Set<AiAutomationRunStatus>(["approved", "dismissed", "completed"]);
const mutableMemoryStatuses = new Set(["active", "archived", "deleted"]);

function revalidateAiOperatingSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-ops");
  revalidatePath("/dashboard/ai-control");
  revalidatePath("/dashboard/ai-execution");
  revalidatePath("/dashboard/ai-apply");
  revalidatePath("/dashboard/ai-automation");
  revalidatePath("/dashboard/ai-menu");
  revalidatePath("/dashboard/ai-growth");
  revalidatePath("/dashboard/ai-support");
}

export async function runAiOperationalSweepAction() {
  const { session } = await requireDashboardAdminAccess("core_dashboard");
  const snapshot = (await getOwnerOperationalSnapshot(session.restaurantId, "overview", {
    id: session.restaurantId,
    name: session.restaurant.name,
    slug: session.restaurant.slug,
    business_type: session.restaurant.businessType ?? null,
    address: null,
    hotline: null,
    description: null
  })) as { operationInsights?: unknown };
  const operationInsights = snapshot.operationInsights;

  if (!operationInsights || typeof operationInsights !== "object" || !("insights" in operationInsights)) {
    revalidateAiOperatingSurfaces();
    return;
  }

  const persistedInsights = await persistAiOperationInsightsDeck({
    restaurantId: session.restaurantId,
    deck: operationInsights as Parameters<typeof persistAiOperationInsightsDeck>[0]["deck"]
  });

  await Promise.all([
    persistAiRecommendationsFromOperationDeck({
      restaurantId: session.restaurantId,
      operationInsights: persistedInsights.deck,
      limit: 12
    }),
    persistAiAutomationRuns({
      restaurantId: session.restaurantId,
      workflows: buildAiAutomationWorkflows({ snapshot: snapshot as Record<string, unknown>, limit: 8 })
    })
  ]);

  revalidateAiOperatingSurfaces();
}

function compactPromotionName(value: string) {
  const normalized = value.replace(/^Chạy\s+/i, "").replace(/^Tạo\s+/i, "").trim();
  return `AI nháp - ${normalized || "Ưu đãi vận hành"}`.slice(0, 80);
}

function aiPromotionCode(recommendationId: string) {
  const suffix = recommendationId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase() || "AI";
  return `AI${Date.now().toString(36).toUpperCase().slice(-5)}${suffix}`.slice(0, 20);
}

function promotionDraftFromRecommendation(recommendation: NonNullable<Awaited<ReturnType<typeof getAiRecommendationById>>["recommendation"]>) {
  const isCritical = recommendation.priority === "critical" || recommendation.priority === "high";
  return {
    name: compactPromotionName(recommendation.title),
    code: aiPromotionCode(recommendation.id),
    discountScope: "ORDER" as const,
    discountType: "PERCENT" as const,
    discountValue: isCritical ? 12 : 10,
    minOrderAmount: isCritical ? 80000 : 50000,
    totalUsageLimit: 80,
    perCustomerUsageLimit: 1,
    channels: ["WEBSITE", "QR_MENU"],
    isActive: false,
    showOnCustomerMenu: false
  };
}

function compactMenuDraftName(value: string) {
  const normalized = value.replace(/^Biến\s+/i, "").replace(/^Tạo\s+/i, "").trim();
  return `AI nháp - ${normalized || "Combo vận hành"}`.slice(0, 120);
}

function menuDraftPriceFromCategories(categories: Awaited<ReturnType<typeof listMenuForAdmin>>) {
  const prices = categories.flatMap((category) => category.items.map((item) => Number(item.price || 0))).filter((price) => price > 0);
  if (prices.length === 0) return 49000;
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  return Math.max(1000, Math.round((average * 1.25) / 1000) * 1000);
}

async function createMenuDraftFromRecommendation(
  restaurantId: string,
  recommendation: NonNullable<Awaited<ReturnType<typeof getAiRecommendationById>>["recommendation"]>
) {
  const categories = await listMenuForAdmin(restaurantId);
  const targetCategory = categories[0] ?? (await createCategory(restaurantId, "AI nháp"));

  return createMenuItem({
    restaurantId,
    categoryId: targetCategory.id,
    name: compactMenuDraftName(recommendation.title),
    price: menuDraftPriceFromCategories(categories),
    isAvailable: false
  });
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function lowStockLinesFromSnapshot(snapshot: unknown) {
  const inventory = recordFromUnknown(recordFromUnknown(snapshot)?.inventory);
  const lowStockIngredients = Array.isArray(inventory?.lowStockIngredients) ? inventory.lowStockIngredients : [];

  return lowStockIngredients
    .map((item) => {
      const ingredient = recordFromUnknown(item);
      const ingredientId = String(ingredient?.id ?? "").trim();
      if (!ingredientId) return null;

      const onHandQuantity = numberValue(ingredient?.onHandQuantity);
      const minimumQuantity = numberValue(ingredient?.minimumQuantity);
      const reorderGap = Math.max(minimumQuantity - onHandQuantity, minimumQuantity * 0.5, 1);

      return {
        ingredientId,
        orderQuantity: Math.ceil(reorderGap * 100) / 100,
        orderUnit: String(ingredient?.unit ?? "").trim() || undefined,
        unitCost: Math.max(0, Math.round(numberValue(ingredient?.referenceUnitCost))),
        note: "AI nháp từ cảnh báo tồn thấp"
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line))
    .slice(0, 8);
}

async function createPurchaseOrderDraftFromRecommendation(input: {
  restaurantId: string;
  actorUserId: string;
  recommendation: NonNullable<Awaited<ReturnType<typeof getAiRecommendationById>>["recommendation"]>;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    businessType?: string | null;
  };
}) {
  const snapshot = await getOwnerOperationalSnapshot(input.restaurantId, "inventory", {
    id: input.restaurant.id,
    name: input.restaurant.name,
    slug: input.restaurant.slug,
    business_type: input.restaurant.businessType ?? null,
    address: null,
    hotline: null,
    description: null
  });
  const lines = lowStockLinesFromSnapshot(snapshot);
  if (lines.length === 0) return null;

  const expectedDeliveryAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return createInventoryPurchaseOrder(input.restaurantId, {
    supplierId: null,
    locationId: null,
    expectedDeliveryAt,
    note: `AI nháp từ recommendation: ${input.recommendation.title}`.slice(0, 240),
    actorUserId: input.actorUserId,
    lines
  });
}

export async function applyAiRecommendationDraftAction(formData: FormData) {
  const recommendationId = String(formData.get("recommendationId") ?? "").trim();
  if (!recommendationId) return;

  const { session } = await requireDashboardAdminAccess("ai_owner_assistant");
  const result = await getAiRecommendationById(session.restaurantId, recommendationId);
  const recommendation = result.recommendation;

  if (!recommendation || recommendation.lifecycle?.status !== "accepted") {
    revalidateAiOperatingSurfaces();
    return;
  }

  if (recommendation.type === "promotion" || recommendation.type === "customer_retention" || recommendation.type === "pricing") {
    await createPromotion(session.restaurantId, promotionDraftFromRecommendation(recommendation));
    await updateAiRecommendationStatus({
      restaurantId: session.restaurantId,
      recommendationId,
      status: "resolved",
      actorUserId: session.userId
    });
    revalidatePath("/dashboard/promotions");
  }

  if (recommendation.type === "combo" || recommendation.type === "upsell" || recommendation.type === "menu") {
    await createMenuDraftFromRecommendation(session.restaurantId, recommendation);
    await updateAiRecommendationStatus({
      restaurantId: session.restaurantId,
      recommendationId,
      status: "resolved",
      actorUserId: session.userId
    });
    revalidatePath("/dashboard/menu");
  }

  if (recommendation.type === "inventory") {
    await assertFeatureEntitlement(session.restaurantId, "inventory_ai_intelligence");
    await assertFeatureEntitlement(session.restaurantId, "inventory_procurement");
    const created = await createPurchaseOrderDraftFromRecommendation({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      recommendation,
      restaurant: {
        id: session.restaurantId,
        name: session.restaurant.name,
        slug: session.restaurant.slug,
        businessType: session.restaurant.businessType ?? null
      }
    });

    if (created) {
      await updateAiRecommendationStatus({
        restaurantId: session.restaurantId,
        recommendationId,
        status: "resolved",
        actorUserId: session.userId
      });
    }
    revalidatePath("/dashboard/inventory");
  }

  revalidateAiOperatingSurfaces();
}

export async function updateAiOperationInsightStatusAction(formData: FormData) {
  const insightId = String(formData.get("insightId") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();

  if (!insightId || !mutableInsightStatuses.has(rawStatus as AiOperationInsightLifecycleStatus)) {
    return;
  }

  const { session } = await requireDashboardAdminAccess("core_dashboard");

  await updateAiOperationInsightStatus({
    restaurantId: session.restaurantId,
    insightId,
    status: rawStatus as Extract<AiOperationInsightLifecycleStatus, "seen" | "dismissed" | "resolved">,
    actorUserId: session.userId
  });

  revalidateAiOperatingSurfaces();
}

export async function updateAiRecommendationStatusAction(formData: FormData) {
  const recommendationId = String(formData.get("recommendationId") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();

  if (!recommendationId || !mutableRecommendationStatuses.has(rawStatus as AiRecommendationStatus)) {
    return;
  }

  const { session } = await requireDashboardAdminAccess("core_dashboard");

  await updateAiRecommendationStatus({
    restaurantId: session.restaurantId,
    recommendationId,
    status: rawStatus as Extract<AiRecommendationStatus, "accepted" | "dismissed" | "resolved">,
    actorUserId: session.userId
  });

  revalidateAiOperatingSurfaces();
}

export async function updateAiAutomationRunStatusAction(formData: FormData) {
  const runId = String(formData.get("runId") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();

  if (!runId || !mutableAutomationRunStatuses.has(rawStatus as AiAutomationRunStatus)) {
    return;
  }

  const { session } = await requireDashboardAdminAccess("core_dashboard");

  await updateAiAutomationRunStatus({
    restaurantId: session.restaurantId,
    runId,
    status: rawStatus as Extract<AiAutomationRunStatus, "approved" | "dismissed" | "completed">,
    actorUserId: session.userId
  });

  revalidateAiOperatingSurfaces();
}

export async function updateRestaurantAiMemoryStatusAction(formData: FormData) {
  const memoryId = String(formData.get("memoryId") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();

  if (!memoryId || !mutableMemoryStatuses.has(rawStatus)) {
    return;
  }

  const { session } = await requireDashboardAdminAccess("ai_owner_assistant");

  await updateRestaurantAiMemoryStatus({
    restaurantId: session.restaurantId,
    memoryId,
    status: rawStatus as "active" | "archived" | "deleted",
    actorUserId: session.userId
  });

  revalidatePath("/dashboard/ai-control");
}
