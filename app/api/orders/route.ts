import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { createOrderSchema } from "@/lib/validators";
import { fail, ok, AppError } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { createOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "order_create",
      identifier: "dine_in",
      ip,
      limit: 24,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = createOrderSchema.parse(await request.json().catch(() => ({})));
    const result = await createOrder(body);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
