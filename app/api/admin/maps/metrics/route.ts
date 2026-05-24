import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { getMapOperationalMetrics } from "@/services/map-ops-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ adminOnly: true });
    const { searchParams } = new URL(request.url);
    const windowHours = Number(searchParams.get("windowHours") ?? 24);

    return ok(await getMapOperationalMetrics(session.restaurantId, windowHours));
  } catch (error) {
    return fail(error);
  }
}
