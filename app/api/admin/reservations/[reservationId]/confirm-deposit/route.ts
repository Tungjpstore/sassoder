import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema } from "@/lib/validators";
import { confirmReservationDeposit } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservation_deposits" });
    const { reservationId } = reservationIdSchema.parse(await params);
    return ok(await confirmReservationDeposit(session.restaurantId, reservationId));
  } catch (error) {
    return fail(error);
  }
}
