import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { attendanceClockOutSchema } from "@/lib/validators";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { authorizeAttendanceManagementSession, clockOutStaffAttendance } from "@/features/attendance/services/attendance-service";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { assertActiveStaffDeviceSession } from "@/features/staff/services/staff-session-service";

export const preferredRegion = "sin1";

function success(data: Awaited<ReturnType<typeof clockOutStaffAttendance>>) {
  return NextResponse.json({
    success: true,
    message: "Đã kết ca.",
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
        message: "Dữ liệu kết ca không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể kết ca.";
  console.error("[attendance-clock-out]", error);
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

function requestNetwork(request: Request) {
  return {
    ipAddress: trustedClientIp(request),
    userAgent: request.headers.get("user-agent")?.slice(0, 500) || null
  };
}

function deviceFingerprint(deviceInfo: Record<string, unknown>) {
  const value = deviceInfo.deviceFingerprint;
  return typeof value === "string" ? value : null;
}

function attendanceSessionToken(deviceInfo: Record<string, unknown>) {
  const value = deviceInfo.attendanceSessionToken ?? deviceInfo.staffSessionToken;
  return typeof value === "string" ? value : null;
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const payload = await request.json().catch(() => ({}));
    const input = attendanceClockOutSchema.parse(payload);
    const session = await requireOperationalDashboardApiSession({
      feature: "staff_management",
      permission: input.source === "manual" ? ["attendance.clock", "attendance.edit"] : "attendance.clock"
    });
    await assertActiveStaffDeviceSession({
      session,
      deviceFingerprint: deviceFingerprint(input.deviceInfo),
      attendanceSessionToken: attendanceSessionToken(input.deviceInfo),
      requireSignedToken: input.source !== "manual"
    });
    const attendanceSession = input.source === "manual" ? authorizeAttendanceManagementSession(session) : session;
    const data = await clockOutStaffAttendance({ session: attendanceSession, input: { ...input, network: requestNetwork(request) } });
    await invalidateStaffOperationsBundleCache(session.restaurantId);
    return success(data);
  } catch (error) {
    return failure(error);
  }
}
