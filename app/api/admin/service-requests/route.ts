import { fail, ok } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listOpenServiceRequests } from "@/services/service-request-service";
import { getStaffAuthorizedBranchIds } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "staff_call", permission: "orders.view" });
    const authorizedBranchIds = await getStaffAuthorizedBranchIds(session);
    return ok(await listOpenServiceRequests(session.restaurantId, { authorizedBranchIds }));
  } catch (error) {
    return fail(error);
  }
}
