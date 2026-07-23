import { remoteOrderHistorySchema } from "@/lib/validators";
import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { listRemoteOrderHistory } from "@/services/order-service";
import { requireRemoteCustomerSession } from "@/lib/customer/customer-session-server";

export const preferredRegion = "sin1";

export async function GET(request: Request) {
  try {
    const ip = await getRequestIpKey();
    const url = new URL(request.url);
    const body = remoteOrderHistorySchema.parse({
      restaurantSlug: url.searchParams.get("restaurantSlug"),
      customerSessionId: url.searchParams.get("customerSessionId")
    });
    const customerSession = await requireRemoteCustomerSession({
      request,
      restaurantSlug: body.restaurantSlug,
      customerSessionId: body.customerSessionId
    });
    const verifiedBody = { ...body, customerSessionId: customerSession.customerSessionId };
    await assertPublicRateLimits([
      {
        scope: "remote_order_history",
        identifier: rateLimitIdentifier(verifiedBody.restaurantSlug, verifiedBody.customerSessionId),
        ip,
        limit: 45,
        windowMs: 60_000
      }
    ]);

    return ok(await listRemoteOrderHistory(verifiedBody));
  } catch (error) {
    return fail(error);
  }
}
