import { fail, ok } from "@/lib/response";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { listOrdersForRestaurant } from "@/services/order-service";
import { getStaffAuthorizedBranchIds } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "order_realtime", permission: "orders.view" });
    const url = new URL(request.url);
    const includeHistory = url.searchParams.get("history") === "true";
    const authorizedBranchIds = await getStaffAuthorizedBranchIds(session);
    return ok(await listOrdersForRestaurant(session.restaurantId, { includeHistory, authorizedBranchIds }));
  } catch (error) {
    return fail(error);
  }
}
