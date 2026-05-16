import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { remoteOrderSchema } from "@/lib/validators";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { createRemoteOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "remote_order_create",
      identifier: "online_ordering",
      ip,
      limit: 20,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = remoteOrderSchema.parse(await request.json().catch(() => ({})));
    const result = await createRemoteOrder(body);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
