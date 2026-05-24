import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema, reservationTablePreflightSchema } from "@/lib/validators";
import { preflightReservationTables } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservations" });
    const { reservationId } = reservationIdSchema.parse(await params);
    const body = reservationTablePreflightSchema.parse(await request.json().catch(() => ({})));
    return ok(await preflightReservationTables(session.restaurantId, reservationId, body.tableIds));
  } catch (error) {
    return fail(error);
  }
}
