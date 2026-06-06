import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { sendTestPushToUser } from "@/services/push-notification-service";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession();
    return ok(await sendTestPushToUser(session));
  } catch (error) {
    return fail(error);
  }
}
