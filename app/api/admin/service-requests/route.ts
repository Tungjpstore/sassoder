import { fail, ok } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listOpenServiceRequests } from "@/services/service-request-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "staff_call" });
    return ok(await listOpenServiceRequests(session.restaurantId));
  } catch (error) {
    return fail(error);
  }
}
