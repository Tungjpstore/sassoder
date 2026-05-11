import { z } from "zod";
import { getLatestAiConversationReplay } from "@/lib/ai/memory/restaurant-memory";
import { fail, ok } from "@/lib/response";
import { getRestaurantIdBySlug } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const historyQuerySchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(80),
  customerSessionId: z.string().uuid(),
  threadId: z.string().trim().min(6).max(200).optional(),
  limit: z.coerce.number().int().min(2).max(20).optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = historyQuerySchema.parse({
      restaurantSlug: url.searchParams.get("restaurantSlug"),
      customerSessionId: url.searchParams.get("customerSessionId"),
      threadId: url.searchParams.get("threadId") || undefined,
      limit: url.searchParams.get("limit") || undefined
    });

    const restaurantId = await getRestaurantIdBySlug(query.restaurantSlug);

    return ok(
      await getLatestAiConversationReplay({
        restaurantId,
        customerSessionId: query.customerSessionId,
        surface: "customer",
        threadId: query.threadId,
        limit: query.limit
      })
    );
  } catch (error) {
    return fail(error);
  }
}
