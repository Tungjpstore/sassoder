import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { publicReservationAccessSchema, reservationIdSchema } from "@/lib/validators";
import { getPublicReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    const { reservationId } = reservationIdSchema.parse(await params);
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "reservation_status",
      identifier: reservationId,
      ip,
      limit: 30,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const url = new URL(request.url);
    const access = publicReservationAccessSchema.parse({
      token: url.searchParams.get("token")
    });

    return ok(await getPublicReservation(reservationId, access.token));
  } catch (error) {
    return fail(error);
  }
}
