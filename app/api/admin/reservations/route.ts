import { fail, ok } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listReservationsForRestaurant } from "@/services/reservation-service";
import { getStaffAuthorizedBranchIds } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "reservations", permission: "reservations.manage" });
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || undefined;
    const authorizedBranchIds = await getStaffAuthorizedBranchIds(session);
    return ok(await listReservationsForRestaurant(session.restaurantId, date, { authorizedBranchIds }));
  } catch (error) {
    return fail(error);
  }
}
