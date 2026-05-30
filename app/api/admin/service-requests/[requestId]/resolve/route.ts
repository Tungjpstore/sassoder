import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { assertStaffCanAccessServiceRequest } from "@/features/staff/services/staff-branch-authorization-service";
import { resolveServiceRequest } from "@/services/service-request-service";

export const preferredRegion = "sin1";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ feature: "staff_call" });
    const { requestId } = await params;
    await assertStaffCanAccessServiceRequest(session, requestId);
    return ok(await resolveServiceRequest(session.restaurantId, requestId));
  } catch (error) {
    return fail(error);
  }
}
