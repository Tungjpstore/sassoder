import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { getReservationAnalytics } from "@/services/reservation-service";
import { getStaffAuthorizedBranchIds } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "reservations", permission: "reservations.manage" });
    const authorizedBranchIds = await getStaffAuthorizedBranchIds(session);
    return ok(await getReservationAnalytics(session.restaurantId, { authorizedBranchIds }));
  } catch (error) {
    return fail(error);
  }
}
