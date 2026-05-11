import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { deliveryCourierSchema } from "@/lib/validators";
import { createDeliveryCourier, listDeliveryCouriers } from "@/services/delivery-tracking-service";

export const preferredRegion = "sin1";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_realtime_tracking" });
    return ok(await listDeliveryCouriers(session.restaurantId));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_realtime_tracking" });
    const body = deliveryCourierSchema.parse(await request.json());
    return ok(await createDeliveryCourier(session.restaurantId, body), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
