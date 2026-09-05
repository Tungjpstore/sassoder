import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema } from "@/lib/validators";
import { markReservationDepositRefunded } from "@/services/reservation-service";
import { assertStaffCanAccessReservation } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservations", permission: ["payments.refund", "reservations.manage"], permissionMode: "any" });
    const { reservationId } = reservationIdSchema.parse(await params);
    await assertStaffCanAccessReservation(session, reservationId);
    return ok(await markReservationDepositRefunded(session.restaurantId, reservationId));
  } catch (error) {
    return fail(error);
  }
}
