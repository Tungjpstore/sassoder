import { headers } from "next/headers";
import { AppError, fail, ok } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { serviceRequestSchema } from "@/lib/validators";
import { createCustomerServiceRequest } from "@/services/service-request-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`service-request:${ip}`, 10, 60_000)) {
      throw new AppError("Bạn gọi hỗ trợ quá nhanh. Vui lòng chờ một chút.", 429);
    }

    const body = serviceRequestSchema.parse(await request.json());
    const result = await createCustomerServiceRequest(body);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
