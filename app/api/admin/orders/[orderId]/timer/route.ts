import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema, serviceTimerSchema } from "@/lib/validators";
import { broadcastVpsRealtime } from "@/lib/vps/realtime";
import { writeAuditLog } from "@/services/audit-log-service";
import { getOrderLifecycleSnapshot, updateOrderServiceTimer } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ feature: "order_realtime" });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const body = serviceTimerSchema.parse(await request.json());
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
    const data = await updateOrderServiceTimer(session.restaurantId, orderId, body.minutes);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.timer_update",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data,
      metadata: { minutes: body.minutes }
    });
    await broadcastVpsRealtime({
      event: "kitchen_update",
      restaurantId: session.restaurantId,
      orderId,
      payload: {
        orderId,
        action: "order.timer_update",
        minutes: body.minutes
      }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
