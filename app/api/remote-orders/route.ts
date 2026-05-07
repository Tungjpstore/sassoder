import { headers } from "next/headers";
import { remoteOrderSchema } from "@/lib/validators";
import { AppError, fail, ok } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { createRemoteOrder } from "@/services/order-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`remote-order:${ip}`, 20, 60_000)) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = remoteOrderSchema.parse(await request.json());
    const result = await createRemoteOrder(body);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
