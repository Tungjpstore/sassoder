import { fail, ok } from "@/lib/response";
import { publicReservationAccessSchema, reservationIdSchema } from "@/lib/validators";
import { markReservationDepositPaid } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    const { reservationId } = reservationIdSchema.parse(await params);
    const body = publicReservationAccessSchema.parse(await request.json().catch(() => ({})));
    return ok(await markReservationDepositPaid(reservationId, body.token));
  } catch (error) {
    return fail(error);
  }
}
