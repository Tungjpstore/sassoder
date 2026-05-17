"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { updateRestaurantAiMemoryStatus } from "@/lib/ai/memory/restaurant-memory";
import { updateAiAutomationRunStatus, type AiAutomationRunStatus } from "@/services/ai-automation-run-service";
import { updateAiOperationInsightStatus } from "@/services/ai-operation-insights-service";
import { updateAiRecommendationStatus } from "@/services/ai-recommendation-service";
import type { AiRecommendationStatus } from "@/lib/ai/recommendation-engine";
import type { AiOperationInsightLifecycleStatus } from "@/lib/ai/operation-insights";

const mutableInsightStatuses = new Set<AiOperationInsightLifecycleStatus>(["seen", "dismissed", "resolved"]);
const mutableRecommendationStatuses = new Set<AiRecommendationStatus>(["accepted", "dismissed", "resolved"]);
const mutableAutomationRunStatuses = new Set<AiAutomationRunStatus>(["approved", "dismissed", "completed"]);
const mutableMemoryStatuses = new Set(["active", "archived", "deleted"]);

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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-ops");
  revalidatePath("/dashboard/ai-control");
  revalidatePath("/dashboard/ai-execution");
  revalidatePath("/dashboard/ai-apply");
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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-ops");
  revalidatePath("/dashboard/ai-control");
  revalidatePath("/dashboard/ai-execution");
  revalidatePath("/dashboard/ai-apply");
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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-ops");
  revalidatePath("/dashboard/ai-control");
  revalidatePath("/dashboard/ai-execution");
  revalidatePath("/dashboard/ai-apply");
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
