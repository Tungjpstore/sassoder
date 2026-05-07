import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { serviceTimerSchema } from "@/lib/validators";
import { updateOrderServiceTimer } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "order_realtime" });
    const { orderId } = await params;
    const body = serviceTimerSchema.parse(await request.json());
    return ok(await updateOrderServiceTimer(session.restaurantId, orderId, body.minutes));
  } catch (error) {
    return fail(error);
  }
}
