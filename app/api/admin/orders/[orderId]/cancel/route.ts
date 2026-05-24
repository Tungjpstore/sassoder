import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema } from "@/lib/validators";
import { broadcastVpsRealtime } from "@/lib/vps/realtime";
import { auditRequestContext, writeAuditLog } from "@/services/audit-log-service";
import { cancelOrder, getOrderLifecycleSnapshot } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({
      feature: "order_realtime",
      permission: "orders.cancel"
    });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
    const data = await cancelOrder(session.restaurantId, orderId, session.userId);
    const requestContext = auditRequestContext(request);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.cancel",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data,
      ...requestContext
    });
    await broadcastVpsRealtime({
      event: "kitchen_update",
      restaurantId: session.restaurantId,
      orderId,
      payload: {
        orderId,
        action: "order.cancel"
      }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
