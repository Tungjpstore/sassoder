import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateAiImage } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const aiImageSchema = z.object({
  kind: z.enum(["logo", "menu_preview", "food_photo"]),
  prompt: z.string().trim().max(1500).optional(),
  restaurantName: z.string().trim().max(120).optional(),
  businessType: z.string().trim().max(80).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_image_generation" });
    const body = aiImageSchema.parse(await request.json());
    return ok(
      await generateAiImage({
        restaurantId: session.restaurantId,
        userId: session.userId,
        ...body
      })
    );
  } catch (error) {
    return fail(error);
  }
}
