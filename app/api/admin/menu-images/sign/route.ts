import { z } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { fail, ok } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { createMenuImageSignedUpload } from "@/services/menu-image-service";

export const preferredRegion = "sin1";

const signMenuImageSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  contentType: z.string().trim().max(120).optional().or(z.literal("")),
  size: z.coerce.number().int().positive()
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const session = await requireOperationalDashboardApiSession({ adminOnly: true, feature: "menu_management" });

    const parsed = signMenuImageSchema.parse(await request.json());
    return ok(
      await createMenuImageSignedUpload({
        restaurantId: session.restaurantId,
        fileName: parsed.fileName,
        contentType: parsed.contentType,
        size: parsed.size
      })
    );
  } catch (error) {
    return fail(error);
  }
}
