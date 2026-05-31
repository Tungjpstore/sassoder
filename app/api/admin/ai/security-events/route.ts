import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { listRecentAiSecurityEvents } from "@/services/ai-security-event-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const securityEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional()
});

export async function GET(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const url = new URL(request.url);
    const query = securityEventsQuerySchema.parse({
      limit: url.searchParams.get("limit") || undefined
    });

    return ok(
      await listRecentAiSecurityEvents({
        restaurantId: session.restaurantId,
        limit: query.limit
      })
    );
  } catch (error) {
    return fail(error);
  }
}
