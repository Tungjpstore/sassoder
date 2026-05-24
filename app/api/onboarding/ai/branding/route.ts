import { z } from "zod";
import { getAuthUser } from "@/lib/session";
import { fail, ok, AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { generateOnboardingAiImage, generateOnboardingBranding } from "@/services/ai-service";
import {
  assertOnboardingAiQuota,
  getOnboardingAiQuota,
  normalizeOnboardingAiPlanCode,
  recordOnboardingAiUsage
} from "@/services/onboarding-ai-service";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const onboardingBrandingSchema = z.object({
  planCode: z.string().trim().toLowerCase().optional(),
  restaurantName: z.string().trim().min(2).max(120),
  businessType: z.string().trim().max(80).optional(),
  customBusinessType: z.string().trim().max(80).optional(),
  address: z.string().trim().max(500).optional(),
  tone: z.string().trim().max(180).optional(),
  audience: z.string().trim().max(180).optional(),
  includeLogo: z.coerce.boolean().optional().default(true)
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await getAuthUser();
    if (!user) throw new AppError("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại.", 401);

    const body = onboardingBrandingSchema.parse(await request.json());
    const planCode = normalizeOnboardingAiPlanCode(body.planCode);
    const quotaBefore = await getOnboardingAiQuota({ userId: user.id, planCode, scope: "brand_logo" });
    if (body.includeLogo) {
      await assertOnboardingAiQuota({ userId: user.id, planCode, scope: "brand_logo" });
    }

    const brand = await generateOnboardingBranding({
      restaurantName: body.restaurantName,
      businessType: body.businessType,
      customBusinessType: body.customBusinessType,
      address: body.address,
      tone: body.tone,
      audience: body.audience
    });

    const logoPrompt = brand.data.logoPrompt || body.tone || "";
    let image: Awaited<ReturnType<typeof generateOnboardingAiImage>> | null = null;
    let imageError: string | null = null;

    if (body.includeLogo) {
      try {
        image = await generateOnboardingAiImage({
          kind: "logo",
          restaurantName: body.restaurantName,
          businessType: body.customBusinessType || body.businessType,
          prompt: logoPrompt
        });
      } catch (error) {
        imageError = error instanceof Error ? error.message : "Chưa tạo được logo AI.";
      }
    }

    const quotaAfter =
      body.includeLogo && image
        ? await recordOnboardingAiUsage({ userId: user.id, planCode, scope: "brand_logo" })
        : quotaBefore;

    return ok({
      brand,
      image,
      imageError,
      quota: quotaAfter
    });
  } catch (error) {
    return fail(error);
  }
}
