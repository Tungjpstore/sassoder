import { fail, ok, AppError } from "@/lib/response";
import { requireDashboardApiSession } from "@/lib/dashboard-api-session";
import { assertStaffActionPermission } from "@/services/staff-permission-service";
import { getRestaurantEntitlement, hasFeature } from "@/services/subscription-service";
import { listOrdersForRestaurant } from "@/services/order-service";
import { listOpenServiceRequests } from "@/services/service-request-service";
import { getStaffAuthorizedBranchIds } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireDashboardApiSession();
    const entitlement = await getRestaurantEntitlement(session.restaurantId);

    if (!entitlement.allowed) {
      throw new AppError(entitlement.reason ?? "Gói LogiVN không hợp lệ.", entitlement.statusCode);
    }

    const canReadOrders = hasFeature(entitlement, "order_realtime");
    const canReadRequests = hasFeature(entitlement, "staff_call");

    if (!canReadOrders && !canReadRequests) {
      throw new AppError("Gói hiện tại chưa bật luồng vận hành realtime.", 402);
    }

    const authorizedBranchIds = canReadOrders || canReadRequests ? await getStaffAuthorizedBranchIds(session) : null;
    if (canReadOrders) await assertStaffActionPermission(session, "orders.view");
    const [orders, requests] = await Promise.all([
      canReadOrders ? listOrdersForRestaurant(session.restaurantId, { limit: 80, authorizedBranchIds }) : Promise.resolve([]),
      canReadRequests ? listOpenServiceRequests(session.restaurantId, { authorizedBranchIds }) : Promise.resolve([])
    ]);

    return ok({
      orders,
      requests,
      features: {
        orderRealtime: canReadOrders,
        staffCall: canReadRequests
      }
    });
  } catch (error) {
    return fail(error);
  }
}
