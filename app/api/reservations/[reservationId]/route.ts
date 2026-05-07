import { fail, ok } from "@/lib/response";
import { publicReservationAccessSchema, reservationIdSchema } from "@/lib/validators";
import { getPublicReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function GET(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    const { reservationId } = reservationIdSchema.parse(await params);
    const url = new URL(request.url);
    const access = publicReservationAccessSchema.parse({
      token: url.searchParams.get("token")
    });

    return ok(await getPublicReservation(reservationId, access.token));
  } catch (error) {
    return fail(error);
  }
}
