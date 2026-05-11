import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema, deliveryStatusSchema } from "@/lib/validators";
import { writeAuditLog } from "@/services/audit-log-service";
import { getOrderLifecycleSnapshot, updateOrderDeliveryStatus } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_realtime_tracking" });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const body = deliveryStatusSchema.parse(await request.json());
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
    const data = await updateOrderDeliveryStatus(session.restaurantId, orderId, body.status, session.userId);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.delivery_status_update",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data,
      metadata: { status: body.status }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
