import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema, reservationRescheduleSchema } from "@/lib/validators";
import { rescheduleReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservations" });
    const { reservationId } = reservationIdSchema.parse(await params);
    const body = reservationRescheduleSchema.parse(await request.json().catch(() => ({})));
    const data = await rescheduleReservation(session.restaurantId, reservationId, body);
    await invalidateDashboardWorkspaceCaches(session.restaurantId, ["overview", "reservations", "tables"]);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
