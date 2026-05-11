import { z } from "zod";
import { getAuthUser } from "@/lib/session";
import { fail, ok, AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateOnboardingMenuOcrDraft } from "@/services/ai-service";
import {
  assertOnboardingAiQuota,
  normalizeOnboardingAiPlanCode,
  recordOnboardingAiUsage
} from "@/services/onboarding-ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const onboardingMenuOcrSchema = z
  .object({
    planCode: z.string().trim().toLowerCase().optional(),
    imageUrl: z.string().trim().url().max(2000).optional(),
    imageBase64: z.string().trim().max(7_500_000).optional(),
    rawText: z.string().trim().max(20_000).optional()
  })
  .refine((value) => value.imageUrl || value.imageBase64 || value.rawText, "Cần ảnh menu hoặc nội dung menu để AI đọc.");

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await getAuthUser();
    if (!user) throw new AppError("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại.", 401);

    const body = onboardingMenuOcrSchema.parse(await request.json());
    const planCode = normalizeOnboardingAiPlanCode(body.planCode);
    await assertOnboardingAiQuota({ userId: user.id, planCode, scope: "menu_ocr" });

    const draft = await generateOnboardingMenuOcrDraft({
      imageUrl: body.imageUrl,
      imageBase64: body.imageBase64,
      rawText: body.rawText
    });
    const quota = await recordOnboardingAiUsage({ userId: user.id, planCode, scope: "menu_ocr" });

    return ok({
      ...draft,
      quota
    });
  } catch (error) {
    return fail(error);
  }
}
