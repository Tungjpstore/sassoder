import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { runOwnerAssistant } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const ownerAiSchema = z.object({
  message: z.string().trim().min(2).max(3000),
  intent: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  context: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ feature: "ai_owner_assistant" });
    const body = ownerAiSchema.parse(await request.json());
    return ok(
      await runOwnerAssistant({
        restaurantId: session.restaurantId,
        userId: session.userId,
        message: body.message,
        intent: body.intent || body.category,
        context: body.context
      })
    );
  } catch (error) {
    return fail(error);
  }
}
