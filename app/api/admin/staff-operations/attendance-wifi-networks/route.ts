import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { registerStaffAttendanceWifiNetwork } from "@/features/attendance/services/attendance-wifi-service";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { firstForwardedIp } from "@/lib/attendance-network";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { staffAttendanceWifiNetworkRegisterSchema } from "@/lib/validators";

export const preferredRegion = "sin1";

function requestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    firstForwardedIp(request.headers.get("x-forwarded-for"))
  );
}

function success(data: Awaited<ReturnType<typeof registerStaffAttendanceWifiNetwork>>) {
  return NextResponse.json(
    {
      success: true,
      message: "Đã lưu WiFi chấm công cho chi nhánh.",
      data,
      meta: {
        generatedAt: new Date().toISOString()
      },
      errors: []
    },
    { status: 201 }
  );
}

function failure(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        message: "Dữ liệu WiFi chấm công không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể lưu WiFi chấm công.";
  console.error("[staff-attendance-wifi-network]", error);
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
        permission: "attendance.edit"
      }),
      request.json().catch(() => ({}))
    ]);
    const input = staffAttendanceWifiNetworkRegisterSchema.parse(payload);
    return success(await registerStaffAttendanceWifiNetwork({ session, input, requestIp: requestIp(request) }));
  } catch (error) {
    return failure(error);
  }
}
