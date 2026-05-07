import { headers } from "next/headers";
import { createOrderSchema } from "@/lib/validators";
import { fail, ok, AppError } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { createOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`order:${ip}`, 30, 60_000)) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = createOrderSchema.parse(await request.json());
    const result = await createOrder(body);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
