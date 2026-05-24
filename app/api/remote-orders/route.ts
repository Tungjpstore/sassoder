import { remoteOrderSchema } from "@/lib/validators";
import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { createRemoteOrder } from "@/services/order-service";

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
    await assertPublicRateLimits([
      {
        scope: "remote_order_create_session",
        identifier: rateLimitIdentifier(body.restaurantSlug, body.customerSessionId),
        ip,
        limit: 6,
        windowMs: 60_000
      },
      {
        scope: "remote_order_create_idempotency",
        identifier: rateLimitIdentifier(body.restaurantSlug, body.idempotencyKey),
        ip,
        limit: 12,
        windowMs: 60_000
      }
    ]);
    const result = await createRemoteOrder(body);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
