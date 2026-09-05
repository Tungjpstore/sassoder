import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema, reservationSetTablesSchema } from "@/lib/validators";
import { setReservationTables } from "@/services/reservation-service";
import { assertStaffCanAccessReservation, assertStaffCanAccessTables } from "@/features/staff/services/staff-branch-authorization-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservations", permission: "reservations.manage" });
    const { reservationId } = reservationIdSchema.parse(await params);
    await assertStaffCanAccessReservation(session, reservationId);
    const body = reservationSetTablesSchema.parse(await request.json().catch(() => ({})));
    await assertStaffCanAccessTables(session, body.tableIds);
    const data = await setReservationTables(session.restaurantId, reservationId, body.tableIds);
    await invalidateDashboardWorkspaceCaches(session.restaurantId, ["overview", "reservations", "tables"]);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
