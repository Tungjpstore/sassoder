import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { staffSessionHeartbeatSchema } from "@/lib/validators";
import { recordStaffSessionHeartbeat } from "@/features/staff/services/staff-session-service";

export const preferredRegion = "sin1";

function success(data: Awaited<ReturnType<typeof recordStaffSessionHeartbeat>>) {
  return NextResponse.json({
    success: true,
    message: data.forcedLogout ? "Phiên đã bị buộc đăng xuất." : "Đã cập nhật hiện diện.",
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
        message: "Dữ liệu heartbeat không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể cập nhật hiện diện.";
  console.error("[staff-session-heartbeat]", error);
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
        feature: "staff_management",
        permission: ["dashboard.view", "attendance.clock"],
        permissionMode: "any"
      }),
      request.json().catch(() => ({}))
    ]);
    const input = staffSessionHeartbeatSchema.parse(payload);
    return success(await recordStaffSessionHeartbeat({ session, input }));
  } catch (error) {
    return failure(error);
  }
}
