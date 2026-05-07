import { fail, ok } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listReservationsForRestaurant } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "reservations" });
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || undefined;
    return ok(await listReservationsForRestaurant(session.restaurantId, date));
  } catch (error) {
    return fail(error);
  }
}
