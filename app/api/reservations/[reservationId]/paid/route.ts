import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { publicReservationAccessSchema, reservationIdSchema } from "@/lib/validators";
import { markReservationDepositPaid } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    const { reservationId } = reservationIdSchema.parse(await params);
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "reservation_deposit_paid",
      identifier: reservationId,
      ip,
      limit: 8,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác thanh toán quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = publicReservationAccessSchema.parse(await request.json().catch(() => ({})));
    return ok(await markReservationDepositPaid(reservationId, body.token));
  } catch (error) {
    return fail(error);
  }
}
