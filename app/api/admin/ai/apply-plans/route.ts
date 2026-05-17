import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { getAiApplyLayerDeck } from "@/services/ai-apply-layer-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    return ok(await getAiApplyLayerDeck(session.restaurantId));
  } catch (error) {
    return fail(error);
  }
}
