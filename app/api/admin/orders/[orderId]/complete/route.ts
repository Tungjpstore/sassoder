import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema } from "@/lib/validators";
import { broadcastVpsRealtime } from "@/lib/vps/realtime";
import { assertStaffCanAccessOrder } from "@/features/staff/services/staff-branch-authorization-service";
import { writeAuditLog } from "@/services/audit-log-service";
import { getOrderLifecycleSnapshot, markOrderCompleted } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({
      feature: "order_realtime",
      permission: "orders.update"
    });
    const { orderId } = adminOrderIdSchema.parse(await params);
    await assertStaffCanAccessOrder(session, orderId);
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
    const data = await markOrderCompleted(session.restaurantId, orderId, session.userId);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.complete",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data
    });
    await broadcastVpsRealtime({
      event: "kitchen_update",
      restaurantId: session.restaurantId,
      orderId,
      payload: {
        orderId,
        action: "order.complete"
      }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
