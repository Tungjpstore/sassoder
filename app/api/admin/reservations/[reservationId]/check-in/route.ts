import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { invalidateDashboardWorkspaceCaches } from "@/lib/dashboard-workspace-cache";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { reservationIdSchema } from "@/lib/validators";
import { checkInReservation } from "@/services/reservation-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ reservationId: string }> }) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "reservations" });
    const { reservationId } = reservationIdSchema.parse(await params);
    const data = await checkInReservation(session.restaurantId, reservationId);
    await invalidateDashboardWorkspaceCaches(session.restaurantId, ["overview", "reservations", "tables"]);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
