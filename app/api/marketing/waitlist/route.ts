import { type NextRequest } from "next/server";
import { AppError, fail, ok } from "@/lib/response";
import { waitlistLeadSchema } from "@/lib/marketing/funnel";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { captureWaitlistLead, recordFunnelEvent } from "@/services/marketing-funnel-service";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function requestIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

function noStore<T>(response: T) {
  return ok(response, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ip = requestIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";
    const contact = typeof body.contact === "string" ? body.contact : "";

    await assertPublicRateLimits([
      {
        scope: "marketing_waitlist_contact",
        identifier: rateLimitIdentifier(contact, userAgent),
        ip,
        limit: 4,
        windowMs: 10 * 60_000,
        message: "Bạn gửi waitlist hơi nhanh. Vui lòng thử lại sau ít phút."
      },
      {
        scope: "marketing_waitlist_ip",
        identifier: userAgent.slice(0, 120),
        ip,
        limit: 30,
        windowMs: 10 * 60_000,
        message: "Có quá nhiều yêu cầu từ kết nối này. Vui lòng thử lại sau."
      }
    ]);

    const waitlistLead = waitlistLeadSchema.parse(body);
    const lead = await captureWaitlistLead(waitlistLead, { ip, userAgent });

    await recordFunnelEvent(
      {
        sessionId: typeof body.sessionId === "string" && body.sessionId ? body.sessionId : `lead-${lead.id}`,
        eventName: "waitlist_submit",
        pagePath: typeof body.pagePath === "string" ? body.pagePath : "/waitlist",
        source: lead.source,
        variant: lead.variant,
        planCode: lead.selectedPlan,
        leadId: lead.id,
        metadata: {
          pilotGoal: lead.pilotGoal,
          businessType: body.businessType
        }
      },
      { ip, userAgent }
    ).catch(() => null);

    return noStore({
      leadId: lead.id,
      selectedPlan: lead.selectedPlan,
      redirectTo: lead.redirectTo
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fail(new AppError("Dữ liệu waitlist không hợp lệ.", 400));
    }

    return fail(error);
  }
}
