import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema } from "@/lib/validators";
import { auditRequestContext, writeAuditLog } from "@/services/audit-log-service";
import { deleteTestOrder, getOrderLifecycleSnapshot } from "@/services/order-service";
import { assertStaffCanAccessOrder } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "order_realtime" });
    const { orderId } = adminOrderIdSchema.parse(await params);
    await assertStaffCanAccessOrder(session, orderId);
    const requestContext = auditRequestContext(request);
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.delete_test",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      metadata: { destructive: true, phase: "before_delete" },
      required: true,
      ...requestContext
    });
    const data = await deleteTestOrder(session.restaurantId, orderId);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.delete_test.completed",
      entityType: "order",
      entityId: orderId,
      afterData: data,
      metadata: { destructive: true, phase: "after_delete" },
      ...requestContext
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
