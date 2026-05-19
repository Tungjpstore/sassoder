import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderCleanupSchema } from "@/lib/validators";
import { auditRequestContext, writeAuditLog } from "@/services/audit-log-service";
import { cleanupTestOrders } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "order_realtime" });
    const body = adminOrderCleanupSchema.parse(await request.json().catch(() => ({})));
    const requestContext = auditRequestContext(request);
    if (body.mode === "delete_test") {
      await writeAuditLog({
        restaurantId: session.restaurantId,
        actorUserId: session.userId,
        actorRole: session.role,
        action: "order.cleanup_test",
        entityType: "order_batch",
        metadata: { ...body, destructive: true, phase: "before_cleanup" },
        required: true,
        ...requestContext
      });
    }
    const data = await cleanupTestOrders(session.restaurantId, body);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.cleanup_test",
      entityType: "order_batch",
      afterData: data,
      metadata: { ...body, destructive: body.mode === "delete_test", phase: "after_cleanup" },
      ...requestContext
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
