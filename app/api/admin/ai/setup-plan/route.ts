import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateStoreSetupPlan } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const setupPlanSchema = z.object({
  mode: z.enum(["audit", "express", "growth"]).optional(),
  focus: z.string().trim().max(1000).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const body = setupPlanSchema.parse(await request.json().catch(() => ({})));
    return ok(
      await generateStoreSetupPlan({
        restaurantId: session.restaurantId,
        userId: session.userId,
        mode: body.mode,
        focus: body.focus
      })
    );
  } catch (error) {
    return fail(error);
  }
}
