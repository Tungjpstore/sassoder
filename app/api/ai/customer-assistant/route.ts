import { z } from "zod";
import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail, ok } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { getRestaurantIdBySlug, runCustomerAssistant } from "@/services/ai-service";
import { writeOperationalEvent } from "@/services/operational-observability-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const customerAiSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(80),
  customerSessionId: z.string().trim().max(120).optional(),
  threadId: z.string().trim().min(6).max(200).optional(),
  message: z.string().trim().min(2).max(1500),
  intent: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  cart: z.unknown().optional(),
  orderStatus: z.unknown().optional(),
  reservationStatus: z.unknown().optional(),
  context: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  let restaurantId: string | null = null;
  let intent: string | undefined;
  try {
    const ip = await getRequestIpKey();
    const allowed = await checkPersistentRateLimit({
      scope: "public_ai_customer",
      identifier: "logibot",
      ip,
      limit: 18,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn đang hỏi trợ lý quá nhanh. Vui lòng thử lại sau.", 429);
    }

    const body = customerAiSchema.parse(await request.json().catch(() => ({})));
    intent = body.intent || body.category;
    restaurantId = await getRestaurantIdBySlug(body.restaurantSlug);
    const result = await runCustomerAssistant({
      restaurantId,
      customerSessionId: body.customerSessionId,
      threadId: body.threadId,
      message: body.message,
      intent,
      cart: body.cart,
      orderStatus: body.orderStatus,
      reservationStatus: body.reservationStatus,
      context: body.context
    });
    writeOperationalEvent({
      area: "ai",
      event: "customer_ai_completed",
      restaurantId,
      latencyMs: Date.now() - startedAt,
      metadata: {
        intent: intent ?? null,
        threadIdPresent: Boolean(body.threadId)
      }
    });
    return ok(result);
  } catch (error) {
    writeOperationalEvent({
      area: "ai",
      event: "customer_ai_failed",
      restaurantId,
      status: "error",
      latencyMs: Date.now() - startedAt,
      metadata: {
        intent: intent ?? null,
        message: error instanceof Error ? error.message : String(error)
      }
    });
    return fail(error);
  }
}
