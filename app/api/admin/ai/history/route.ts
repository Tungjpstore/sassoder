import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { getLatestAiConversationReplay } from "@/lib/ai/memory/restaurant-memory";
import { fail, ok } from "@/lib/response";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const historyQuerySchema = z.object({
  threadId: z.string().trim().min(6).max(200).optional(),
  limit: z.coerce.number().int().min(2).max(20).optional()
});

export async function GET(request: Request) {
  try {
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    const url = new URL(request.url);
    const query = historyQuerySchema.parse({
      threadId: url.searchParams.get("threadId") || undefined,
      limit: url.searchParams.get("limit") || undefined
    });

    return ok(
      await getLatestAiConversationReplay({
        restaurantId: session.restaurantId,
        userId: session.userId,
        surface: "dashboard",
        threadId: query.threadId,
        limit: query.limit
      })
    );
  } catch (error) {
    return fail(error);
  }
}
