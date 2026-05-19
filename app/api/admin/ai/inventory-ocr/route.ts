import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateInventoryOcrDraft } from "@/services/ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const inventoryOcrSchema = z
  .object({
    imageUrl: z.string().trim().url().max(2000).optional(),
    imageBase64: z.string().trim().max(7_500_000).optional(),
    rawText: z.string().trim().max(20_000).optional()
  })
  .refine((value) => value.imageUrl || value.imageBase64 || value.rawText, "Cần ảnh hóa đơn hoặc nội dung nhập kho để AI đọc.");

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "inventory_management" });
    const body = inventoryOcrSchema.parse(await request.json());
    return ok(
      await generateInventoryOcrDraft({
        restaurantId: session.restaurantId,
        userId: session.userId,
        ...body
      })
    );
  } catch (error) {
    return fail(error);
  }
}
