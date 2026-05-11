import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { adminOrderIdSchema, deliveryLocationSchema } from "@/lib/validators";
import { writeAuditLog } from "@/services/audit-log-service";
import { recordOrderDeliveryLocation } from "@/services/delivery-tracking-service";
import { getOrderLifecycleSnapshot } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ feature: "delivery_realtime_tracking" });
    const { orderId } = adminOrderIdSchema.parse(await params);
    const body = deliveryLocationSchema.parse(await request.json());
    const before = await getOrderLifecycleSnapshot(session.restaurantId, orderId);

    const data = await recordOrderDeliveryLocation({
      restaurantId: session.restaurantId,
      orderId,
      actorUserId: session.userId,
      input: {
        latitude: body.lat,
        longitude: body.lng,
        accuracyMeters: body.accuracyMeters ?? null,
        headingDegrees: body.headingDegrees ?? null,
        speedMps: body.speedMps ?? null,
        source: body.source ?? "admin_dashboard",
        capturedAt: body.capturedAt ?? null,
        note: body.note ?? null
      }
    });
    await writeAuditLog({
      restaurantId: session.restaurantId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "order.delivery_location_update",
      entityType: "order",
      entityId: orderId,
      beforeData: before,
      afterData: data,
      metadata: { source: body.source ?? "admin_dashboard" }
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
