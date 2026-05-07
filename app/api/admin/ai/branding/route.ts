import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateRestaurantBranding } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const brandingAiSchema = z.object({
  restaurantName: z.string().trim().max(120).optional(),
  businessType: z.string().trim().max(80).optional(),
  tone: z.string().trim().max(160).optional(),
  audience: z.string().trim().max(160).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_branding_studio" });
    const body = brandingAiSchema.parse(await request.json());
    return ok(
      await generateRestaurantBranding({
        restaurantId: session.restaurantId,
        userId: session.userId,
        ...body
      })
    );
  } catch (error) {
    return fail(error);
  }
}
