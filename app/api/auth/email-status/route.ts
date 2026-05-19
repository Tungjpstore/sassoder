import { NextResponse, type NextRequest } from "next/server";
import { getAuthEmailDeliveryStatus } from "@/lib/auth-email-delivery";
import { buildPublicAuthEmailStatusPayload } from "@/lib/auth-email-status-response";
import { checkPersistentAuthRateLimit } from "@/lib/auth-rate-limit";
import { authEmailStatusSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

function requestIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ status: "invalid", message: "Vui lòng nhập email hợp lệ." }, 400);
  }

  const parsed = authEmailStatusSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ status: "invalid", message: "Vui lòng nhập email hợp lệ." }, 400);
  }

  const ip = requestIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) || "unknown";
  const [emailAllowed, ipAllowed] = await Promise.all([
    checkPersistentAuthRateLimit({
      scope: "email_status_email",
      identifier: `${parsed.data.email}:${userAgent}`,
      ip,
      limit: 8,
      windowMs: 10 * 60_000
    }),
    checkPersistentAuthRateLimit({
      scope: "email_status_ip",
      identifier: userAgent,
      ip,
      limit: 60,
      windowMs: 10 * 60_000
    })
  ]);

  if (!emailAllowed || !ipAllowed) {
    return jsonResponse(
      {
        status: "rate_limited",
        message: "Bạn đang kiểm tra email quá nhanh. Vui lòng thử lại sau ít phút."
      },
      429
    );
  }

  try {
    const emailDeliveryStatus = getAuthEmailDeliveryStatus();
    return jsonResponse(buildPublicAuthEmailStatusPayload(emailDeliveryStatus));
  } catch (error) {
    console.error("[auth/email-status] Failed to check email status", {
      message: error instanceof Error ? error.message : String(error)
    });
    return jsonResponse(
      {
        status: "error",
        message: "Chưa kiểm tra được email lúc này."
      },
      500
    );
  }
}
