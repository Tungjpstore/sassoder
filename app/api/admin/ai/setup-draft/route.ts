import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateStoreSetupDraft } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const setupDraftSchema = z.object({
  kind: z
    .enum(["brand_profile", "menu_blueprint", "online_delivery", "reservation_policy", "promotion_launch", "voice_ops"])
    .optional(),
  focus: z.string().trim().max(1000).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const body = setupDraftSchema.parse(await request.json());
    return ok(
      await generateStoreSetupDraft({
        restaurantId: session.restaurantId,
        userId: session.userId,
        ...body
      })
    );
  } catch (error) {
    return fail(error);
  }
}
