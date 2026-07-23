import { z } from "zod";
import { requireRemoteCustomerSession } from "@/lib/customer/customer-session-server";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { createCustomerVpsRealtimeToken } from "@/lib/vps/realtime-token";
import { getRemotePublicOrder } from "@/services/order-service";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

const schema = z.object({
  restaurantSlug: z.string().trim().min(1).max(120),
  orderId: z.string().uuid(),
  customerSessionId: z.string().uuid()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    const session = await requireRemoteCustomerSession({
      request,
      restaurantSlug: body.restaurantSlug,
      customerSessionId: body.customerSessionId
    });
    if (!session.verifiedSession) {
      throw new AppError("Realtime yêu cầu phiên khách hàng đã ký.", 401);
    }

    const ip = await getRequestIpKey();
    await assertPublicRateLimits([
      {
        scope: "customer_realtime_token",
        identifier: rateLimitIdentifier(session.restaurantId, session.customerSessionId, body.orderId),
        ip,
        limit: 20,
        windowMs: 60_000
      }
    ]);
    await getRemotePublicOrder(body.orderId, {
      restaurantSlug: session.restaurantSlug,
      customerSessionId: session.customerSessionId
    });
    const token = createCustomerVpsRealtimeToken({
      restaurantId: session.restaurantId,
      customerSessionId: session.customerSessionId,
      orderId: body.orderId,
      customerSessionExpiresAt: session.verifiedSession.exp
    });
    return ok({
      restaurantId: session.restaurantId,
      orderId: body.orderId,
      token: token.value,
      expiresAt: token.expiresAt
    });
  } catch (error) {
    return fail(error);
  }
}
