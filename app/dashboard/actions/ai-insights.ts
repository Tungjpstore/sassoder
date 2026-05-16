"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { updateAiOperationInsightStatus } from "@/services/ai-operation-insights-service";
import type { AiOperationInsightLifecycleStatus } from "@/lib/ai/operation-insights";

const mutableInsightStatuses = new Set<AiOperationInsightLifecycleStatus>(["seen", "dismissed", "resolved"]);

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
}
