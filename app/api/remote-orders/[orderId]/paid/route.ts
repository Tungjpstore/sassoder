import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { remoteOrderAccessSchema } from "@/lib/validators";
import { broadcastVpsRealtime } from "@/lib/vps/realtime";
import { getRemotePublicOrder } from "@/services/order-service";
import { markRemoteCustomerPaid } from "@/services/payment-service";
import { requireRemoteCustomerSession } from "@/lib/customer/customer-session-server";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const ip = await getRequestIpKey();
    await assertPublicRateLimits([
      {
        scope: "remote_order_paid",
        identifier: orderId,
        ip,
        limit: 8,
        windowMs: 60_000,
        message: "Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau."
      }
    ]);
    const body = remoteOrderAccessSchema.parse(await request.json().catch(() => ({})));
    const customerSession = await requireRemoteCustomerSession({
      request,
      restaurantSlug: body.restaurantSlug,
      customerSessionId: body.customerSessionId
    });
    const verifiedBody = { ...body, customerSessionId: customerSession.customerSessionId };
    await assertPublicRateLimits([
      {
        scope: "remote_order_paid_session",
        identifier: rateLimitIdentifier(verifiedBody.restaurantSlug, verifiedBody.customerSessionId, orderId),
        ip,
        limit: 6,
        windowMs: 60_000,
        message: "Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau."
      }
    ]);
    const paymentOrder = await markRemoteCustomerPaid(orderId, verifiedBody);
    await broadcastVpsRealtime({
      event: "payment_update",
      restaurantId: paymentOrder.restaurant_id,
      orderId,
      payload: {
        orderId,
        action: "remote_customer.payment_submitted"
      }
    });
    return ok(await getRemotePublicOrder(orderId, verifiedBody));
  } catch (error) {
    return fail(error);
  }
}
