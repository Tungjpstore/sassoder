import { remoteOrderSchema } from "@/lib/validators";
import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { createRemoteOrder } from "@/services/order-service";
import { requireRemoteCustomerSession } from "@/lib/customer/customer-session-server";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const ip = await getRequestIpKey();
    await assertPublicRateLimits([
      {
        scope: "remote_order_create",
        identifier: "online_ordering",
        ip,
        limit: 20,
        windowMs: 60_000
      }
    ]);
    const body = remoteOrderSchema.parse(await request.json().catch(() => ({})));
    const customerSession = await requireRemoteCustomerSession({
      request,
      restaurantSlug: body.restaurantSlug,
      customerSessionId: body.customerSessionId
    });
    const verifiedBody = { ...body, customerSessionId: customerSession.customerSessionId };
    await assertPublicRateLimits([
      {
        scope: "remote_order_create_session",
        identifier: rateLimitIdentifier(verifiedBody.restaurantSlug, verifiedBody.customerSessionId),
        ip,
        limit: 6,
        windowMs: 60_000
      },
      {
        scope: "remote_order_create_idempotency",
        identifier: rateLimitIdentifier(verifiedBody.restaurantSlug, verifiedBody.idempotencyKey),
        ip,
        limit: 12,
        windowMs: 60_000
      }
    ]);
    const result = await createRemoteOrder(verifiedBody);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
