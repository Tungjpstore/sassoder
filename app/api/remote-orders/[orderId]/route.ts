import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { remoteOrderAccessSchema } from "@/lib/validators";
import { getRemotePublicOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const ip = await getRequestIpKey();
    const url = new URL(request.url);
    const body = remoteOrderAccessSchema.parse({
      restaurantSlug: url.searchParams.get("restaurantSlug"),
      customerSessionId: url.searchParams.get("customerSessionId")
    });
    await assertPublicRateLimits([
      {
        scope: "remote_order_read",
        identifier: rateLimitIdentifier(body.restaurantSlug, body.customerSessionId, orderId),
        ip,
        limit: 90,
        windowMs: 60_000
      }
    ]);

    return ok(await getRemotePublicOrder(orderId, body));
  } catch (error) {
    return fail(error);
  }
}
