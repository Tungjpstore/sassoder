import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { getAiProductionReadinessDeck } from "@/services/ai-production-readiness-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    return ok(await getAiProductionReadinessDeck(session.restaurantId));
  } catch (error) {
    return fail(error);
  }
}
