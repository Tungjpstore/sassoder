import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { serviceRequestSchema } from "@/lib/validators";
import { createCustomerServiceRequest } from "@/services/service-request-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "service_request",
      identifier: "call_staff",
      ip,
      limit: 10,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn gọi hỗ trợ quá nhanh. Vui lòng chờ một chút.", 429);
    }

    const body = serviceRequestSchema.parse(await request.json().catch(() => ({})));
    const result = await createCustomerServiceRequest(body);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
