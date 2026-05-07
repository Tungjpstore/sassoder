import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateMenuOcrDraft } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const menuOcrSchema = z
  .object({
    imageUrl: z.string().trim().url().max(2000).optional(),
    imageBase64: z.string().trim().max(7_500_000).optional(),
    rawText: z.string().trim().max(20_000).optional()
  })
  .refine((value) => value.imageUrl || value.imageBase64 || value.rawText, "Cần ảnh menu hoặc nội dung menu để AI đọc.");

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_menu_ocr" });
    const body = menuOcrSchema.parse(await request.json());
    return ok(
      await generateMenuOcrDraft({
        restaurantId: session.restaurantId,
        userId: session.userId,
        ...body
      })
    );
  } catch (error) {
    return fail(error);
  }
}
