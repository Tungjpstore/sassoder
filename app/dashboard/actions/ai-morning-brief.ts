"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { parseAiMorningBriefRecipientsInput } from "@/lib/ai/morning-brief";
import { retryAiMorningBriefEmail, updateAiMorningBriefPreferences } from "@/services/ai-morning-brief-service";

function statusRedirect(param: "settings" | "retry", value: string) {
  redirect(`/dashboard/ai-ops?${param}=${encodeURIComponent(value)}`);
}

export async function updateAiMorningBriefPreferencesAction(formData: FormData) {
  const { session } = await requireDashboardAdminAccess("core_dashboard");
  const recipientInput = String(formData.get("recipientEmails") ?? "");
  const sendHour = Number(formData.get("sendHour") ?? "7");
  const timezone = String(formData.get("timezone") ?? "Asia/Ho_Chi_Minh").trim();

  const result = await updateAiMorningBriefPreferences({
    restaurantId: session.restaurantId,
    emailEnabled: formData.get("emailEnabled") === "on",
    recipients: parseAiMorningBriefRecipientsInput(recipientInput),
    sendHour,
    timezone,
    actorUserId: session.userId,
    fallbackEmail: session.email
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-ops");
  statusRedirect("settings", result.schemaReady ? "saved" : "schema");
}

export async function retryAiMorningBriefEmailAction(formData: FormData) {
  const runId = String(formData.get("runId") ?? "").trim();
  if (!runId) statusRedirect("retry", "missing");

  const { session } = await requireDashboardAdminAccess("core_dashboard");
  const result = await retryAiMorningBriefEmail({
    restaurantId: session.restaurantId,
    runId,
    actorUserId: session.userId
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-ops");
  statusRedirect("retry", result.emailStatus ?? "schema");
}
