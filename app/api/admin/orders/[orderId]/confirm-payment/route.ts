import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema } from "@/lib/validators";
import { auditRequestContext, writeAuditLog } from "@/services/audit-log-service";
import { getOrderLifecycleSnapshot } from "@/services/order-service";
import { confirmPayment } from "@/services/payment-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({
      feature: "vietqr_payments",
      permission: "payments.confirm"
    });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
    const data = await confirmPayment(session.restaurantId, orderId);
    const requestContext = auditRequestContext(request);
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.payment_confirm",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data,
      ...requestContext
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
