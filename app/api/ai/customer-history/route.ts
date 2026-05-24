import { z } from "zod";
import { getLatestAiConversationReplay } from "@/lib/ai/memory/restaurant-memory";
import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
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
    const allowed = await checkPersistentRateLimit({
      scope: "public_ai_customer_history",
      identifier: query.restaurantSlug,
      ip: await getRequestIpKey(),
      limit: 30,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác với lịch sử LogiBot hơi nhanh. Vui lòng thử lại sau.", 429);
    }

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
