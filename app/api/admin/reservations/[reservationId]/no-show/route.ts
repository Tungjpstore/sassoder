import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema } from "@/lib/validators";
import { markReservationNoShow } from "@/services/reservation-service";
import { assertStaffCanAccessReservation } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservations", permission: "reservations.manage" });
    const { reservationId } = reservationIdSchema.parse(await params);
    await assertStaffCanAccessReservation(session, reservationId);
    const data = await markReservationNoShow(session.restaurantId, reservationId);
    await invalidateDashboardWorkspaceCaches(session.restaurantId, ["overview", "reservations", "tables"]);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
