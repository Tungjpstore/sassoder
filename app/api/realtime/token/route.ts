import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { createVpsRealtimeToken } from "@/lib/vps/realtime-token";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession();
    const token = createVpsRealtimeToken({
      restaurantId: session.restaurantId,
      userId: session.userId,
      role: session.role
    });
    return ok({
      restaurantId: session.restaurantId,
      token: token.value,
      expiresAt: token.expiresAt
    });
  } catch (error) {
    return fail(error);
  }
}
