import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { serviceTimerSchema } from "@/lib/validators";
import { acceptOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "order_realtime" });
    const { orderId } = await params;
    const body = serviceTimerSchema.partial().parse(await request.json().catch(() => ({})));
    return ok(await acceptOrder(session.restaurantId, orderId, body.minutes ?? 15));
  } catch (error) {
    return fail(error);
  }
}
