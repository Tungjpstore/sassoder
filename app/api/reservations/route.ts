import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { fail, ok, AppError } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { createReservationSchema } from "@/lib/validators";
import { createReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "reservation_create",
      identifier: "public",
      ip,
      limit: 12,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = createReservationSchema.parse(await request.json().catch(() => ({})));
    return ok(await createReservation(body), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
