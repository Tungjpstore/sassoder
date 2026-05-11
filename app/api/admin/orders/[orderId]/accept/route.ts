import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema, serviceTimerSchema } from "@/lib/validators";
import { writeAuditLog } from "@/services/audit-log-service";
import { acceptOrder, getOrderLifecycleSnapshot } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ feature: "order_realtime" });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const body = serviceTimerSchema.partial().parse(await request.json().catch(() => ({})));
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
    const data = await acceptOrder(session.restaurantId, orderId, body.minutes ?? 15);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.accept",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data,
      metadata: { minutes: body.minutes ?? 15 }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
