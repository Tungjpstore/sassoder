import { z } from "zod";
import { fail, ok } from "@/lib/response";
import { assertPublicRateLimits } from "@/lib/public-api-rate-limit";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { issueDineInCustomerSession } from "@/lib/customer/customer-session-server";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

const schema = z.object({
  restaurantSlug: z.string().trim().min(1).max(120),
  tableId: z.string().uuid(),
  tableAccessToken: z.string().regex(/^[a-f0-9]{40}$/i).optional(),
  customerSessionId: z.string().uuid().optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    const ip = await getRequestIpKey();
    await assertPublicRateLimits([
      {
        scope: "dine_in_customer_session_issue",
        identifier: `${body.restaurantSlug}:${body.tableId}`,
        ip,
        limit: 20,
        windowMs: 60_000
      }
    ]);
    return ok(await issueDineInCustomerSession(body), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
