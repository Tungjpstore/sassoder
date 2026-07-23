import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { adminOrderIdSchema } from "@/lib/validators";
import { assertStaffCanAccessOrder } from "@/features/staff/services/staff-branch-authorization-service";
import { getDeliveryDispatchCandidates } from "@/services/delivery/dispatch-ranking-service";

export const preferredRegion = "sin1";

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const session = await requireOperationalDashboardApiSession({
      feature: "delivery_realtime_tracking",
      permission: "orders.view"
    });
    const { orderId } = adminOrderIdSchema.parse(await params);
    await assertStaffCanAccessOrder(session, orderId);
    return ok(await getDeliveryDispatchCandidates(session.restaurantId, orderId));
  } catch (error) {
    return fail(error);
  }
}
