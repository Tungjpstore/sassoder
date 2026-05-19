import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { remoteOrderAccessSchema } from "@/lib/validators";
import { getRemotePublicOrder } from "@/services/order-service";
import { markRemoteCustomerPaid } from "@/services/payment-service";

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
    await assertPublicRateLimits([
      {
        scope: "remote_order_paid_session",
        identifier: rateLimitIdentifier(body.restaurantSlug, body.customerSessionId, orderId),
        ip,
        limit: 6,
        windowMs: 60_000,
        message: "Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau."
      }
    ]);
    await markRemoteCustomerPaid(orderId, body);
    return ok(await getRemotePublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
