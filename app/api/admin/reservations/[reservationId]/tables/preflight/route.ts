import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema, reservationTablePreflightSchema } from "@/lib/validators";
import { preflightReservationTables } from "@/services/reservation-service";
import { assertStaffCanAccessReservation, assertStaffCanAccessTables } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservations", permission: "reservations.manage" });
    const { reservationId } = reservationIdSchema.parse(await params);
    await assertStaffCanAccessReservation(session, reservationId);
    const body = reservationTablePreflightSchema.parse(await request.json().catch(() => ({})));
    await assertStaffCanAccessTables(session, body.tableIds);
    return ok(await preflightReservationTables(session.restaurantId, reservationId, body.tableIds));
  } catch (error) {
    return fail(error);
  }
}
