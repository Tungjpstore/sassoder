import { headers } from "next/headers";
import { z } from "zod";
import { AppError, fail, ok } from "@/lib/response";
import { rateLimit } from "@/lib/rate-limit";
import { getRestaurantIdBySlug, runCustomerAssistant } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const customerAiSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(80),
  customerSessionId: z.string().trim().max(120).optional(),
  message: z.string().trim().min(2).max(1500),
  intent: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  cart: z.unknown().optional(),
  orderStatus: z.unknown().optional()
});

export async function POST(request: Request) {
  try {
    const headerStore = await headers();
    const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!rateLimit(`public-ai:${ip}`, 18, 60_000)) {
      throw new AppError("Bạn đang hỏi trợ lý quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = customerAiSchema.parse(await request.json());
    const restaurantId = await getRestaurantIdBySlug(body.restaurantSlug);
    return ok(
      await runCustomerAssistant({
        restaurantId,
        customerSessionId: body.customerSessionId,
        message: body.message,
        intent: body.intent || body.category,
        cart: body.cart,
        orderStatus: body.orderStatus
      })
    );
  } catch (error) {
    return fail(error);
  }
}
