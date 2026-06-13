import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderItemParamsSchema, orderItemPreparedSchema } from "@/lib/validators";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { broadcastVpsRealtime } from "@/lib/vps/realtime";
import { assertStaffCanAccessOrder } from "@/features/staff/services/staff-branch-authorization-service";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { writeAuditLog } from "@/services/audit-log-service";
import { markOrderItemPrepared } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string; itemId: string }> }
) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({
      feature: "order_realtime",
      permission: "orders.update"
    });
    const { orderId, itemId } = adminOrderItemParamsSchema.parse(await params);
    const body = orderItemPreparedSchema.parse(await request.json().catch(() => ({})));
    await assertStaffCanAccessOrder(session, orderId);

    const data = await markOrderItemPrepared(session.restaurantId, orderId, itemId, body.prepared);

    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: body.prepared ? "order.item_prepared" : "order.item_unprepared",
      entityType: "order_item",
      entityId: itemId,
      afterData: { orderId, itemId, prepared: body.prepared }
    });

    await Promise.all([
      invalidateDashboardWorkspaceCaches(session.restaurantId, ["overview", "tables"]),
      invalidateStaffOperationsBundleCache(session.restaurantId)
    ]);

    await broadcastVpsRealtime({
      event: "kitchen_update",
      restaurantId: session.restaurantId,
      orderId,
      payload: {
        orderId,
        itemId,
        action: body.prepared ? "order.item_prepared" : "order.item_unprepared"
      }
    });

    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
