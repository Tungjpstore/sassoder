import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { assertPublicRateLimits, rateLimitIdentifier } from "@/lib/public-api-rate-limit";
import { funnelEventSchema } from "@/lib/marketing/funnel";
import { recordFunnelEvent } from "@/services/marketing-funnel-service";

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

function accepted(payload: Record<string, unknown> = {}) {
  return NextResponse.json(
    { ok: true, accepted: true, ...payload },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ip = requestIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "unknown";

    await assertPublicRateLimits([
      {
        scope: "marketing_event_session",
        identifier: rateLimitIdentifier(sessionId, userAgent),
        ip,
        limit: 120,
        windowMs: 60_000
      },
      {
        scope: "marketing_event_ip",
        identifier: userAgent.slice(0, 120),
        ip,
        limit: 300,
        windowMs: 60_000
      }
    ]);

    const event = funnelEventSchema.parse(body);
    await recordFunnelEvent(event, { ip, userAgent });
    return accepted();
  } catch (error) {
    console.error("[marketing/events] Event dropped", {
      message: error instanceof Error ? error.message : String(error)
    });
    return accepted({ dropped: true });
  }
}
