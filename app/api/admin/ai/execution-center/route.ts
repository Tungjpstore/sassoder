import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { getAiExecutionCenterDeck } from "@/services/ai-execution-center-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    return ok(await getAiExecutionCenterDeck(session.restaurantId));
  } catch (error) {
    return fail(error);
  }
}
