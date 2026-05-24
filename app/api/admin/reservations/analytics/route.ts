import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { getReservationAnalytics } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "reservations" });
    return ok(await getReservationAnalytics(session.restaurantId));
  } catch (error) {
    return fail(error);
  }
}
