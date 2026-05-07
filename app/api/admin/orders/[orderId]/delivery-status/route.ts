import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { deliveryStatusSchema } from "@/lib/validators";
import { updateOrderDeliveryStatus } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_realtime_tracking" });
    const { orderId } = await params;
    const body = deliveryStatusSchema.parse(await request.json());
    return ok(await updateOrderDeliveryStatus(session.restaurantId, orderId, body.status));
  } catch (error) {
    return fail(error);
  }
}
