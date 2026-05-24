import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema, deliveryCourierAssignmentSchema } from "@/lib/validators";
import { writeAuditLog } from "@/services/audit-log-service";
import { assignDeliveryCourierToOrder } from "@/services/delivery-tracking-service";
import { getOrderLifecycleSnapshot } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_realtime_tracking" });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const body = deliveryCourierAssignmentSchema.parse(await request.json());
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);

    const data = await assignDeliveryCourierToOrder({
      restaurantId: session.restaurantId,
      orderId,
      courierId: body.courierId ?? null,
      actorUserId: session.userId
    });
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.delivery_courier_assign",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data,
      metadata: { courierId: body.courierId ?? null }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
