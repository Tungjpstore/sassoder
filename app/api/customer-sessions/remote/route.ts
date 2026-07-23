import { z } from "zod";
import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { issueRemoteCustomerSession } from "@/lib/customer/customer-session-server";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

const schema = z.object({ restaurantSlug: z.string().trim().min(1).max(120) });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    const ip = await getRequestIpKey();
    await assertPublicRateLimits([
      {
        scope: "customer_session_issue",
        identifier: body.restaurantSlug,
        ip,
        limit: 12,
        windowMs: 60_000
      }
    ]);
    return ok(await issueRemoteCustomerSession(body.restaurantSlug), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
