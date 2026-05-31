import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema, paymentMethodSchema } from "@/lib/validators";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { withVpsDistributedLock } from "@/lib/vps/backbone";
import { broadcastVpsRealtime } from "@/lib/vps/realtime";
import { assertStaffCanAccessOrder } from "@/features/staff/services/staff-branch-authorization-service";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { auditRequestContext, writeAuditLog } from "@/services/audit-log-service";
import { getOrderLifecycleSnapshot } from "@/services/order-service";
import { confirmPayment } from "@/services/payment-service";

async function readPaymentMethodOverride(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  const body = (await request.json().catch(() => null)) as { paymentMethod?: unknown } | null;
  if (!body || body.paymentMethod == null) return null;
  return paymentMethodSchema.parse(body.paymentMethod);
}

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({
      permission: "payments.confirm"
    });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const paymentMethod = await readPaymentMethodOverride(request);
    await assertStaffCanAccessOrder(session, orderId);
    const data = await withVpsDistributedLock(
      {
        tenantId: session.restaurantId,
        scope: "payment",
        resourceId: orderId,
        ttlMs: 30_000
      },
      async () => {
        const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);
        const confirmed = await confirmPayment(session.restaurantId, orderId, session.userId, paymentMethod);
        const requestContext = auditRequestContext(request);
        await writeAuditLog({
          restaurantId: session.restaurantId,
          actorUserId: session.userId,
          actorRole: session.role,
          action: "order.payment_confirm",
          entityType: "order",
          entityId: orderId,
          beforeData: before,
          afterData: confirmed,
          ...requestContext
        });
        return confirmed;
      }
    );
    await Promise.all([
      invalidateDashboardWorkspaceCaches(session.restaurantId, ["online", "overview", "payments", "tables"]),
      invalidateStaffOperationsBundleCache(session.restaurantId)
    ]);
    await broadcastVpsRealtime({
      event: "payment_update",
      restaurantId: session.restaurantId,
      orderId,
      payload: {
        orderId,
        action: "order.payment_confirm"
      }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
