import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { adminOrderIdSchema } from "@/lib/validators";
import { getDeliveryDispatchCandidates } from "@/services/delivery/dispatch-ranking-service";

export const preferredRegion = "sin1";

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_realtime_tracking" });
    const { orderId } = adminOrderIdSchema.parse(await params);
    return ok(await getDeliveryDispatchCandidates(session.restaurantId, orderId));
  } catch (error) {
    return fail(error);
  }
}
