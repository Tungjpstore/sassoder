import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { staffSessionForceLogoutSchema } from "@/lib/validators";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { forceStaffSessionLogout } from "@/features/staff/services/staff-session-service";

export const preferredRegion = "sin1";

function success(data: Awaited<ReturnType<typeof forceStaffSessionLogout>>) {
  return NextResponse.json({
    success: true,
    message: "Đã buộc đăng xuất phiên nhân sự.",
    data,
    meta: {
      generatedAt: new Date().toISOString()
    },
    errors: []
  });
}

function failure(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        message: "Dữ liệu buộc đăng xuất không hợp lệ.",
        data: null,
        meta: null,
        errors: error.flatten()
      },
      { status: 422 }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
        data: null,
        meta: null,
        errors: [error.message]
      },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : "Không thể buộc đăng xuất.";
  console.error("[staff-session-force-logout]", error);
  return NextResponse.json(
    {
      success: false,
      message,
      data: null,
      meta: null,
      errors: [message]
    },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const [session, payload] = await Promise.all([
      requireOperationalDashboardApiSession({
        adminOnly: true,
        feature: "staff_management",
        permission: "staff.suspend"
      }),
      request.json().catch(() => ({}))
    ]);
    const input = staffSessionForceLogoutSchema.parse(payload);
    const data = await forceStaffSessionLogout({
      restaurantId: session.restaurantId,
      restaurantSlug: session.restaurant.slug,
      actorUserId: session.userId,
      input
    });
    await invalidateStaffOperationsBundleCache(session.restaurantId);
    return success(data);
  } catch (error) {
    return failure(error);
  }
}
