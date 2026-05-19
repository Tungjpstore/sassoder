import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { attendanceClockOutSchema } from "@/lib/validators";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { clockOutStaffAttendance } from "@/features/attendance/services/attendance-service";

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

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const payload = await request.json().catch(() => ({}));
    const input = attendanceClockOutSchema.parse(payload);
    const session = await requireOperationalDashboardApiSession({
      feature: "staff_management",
      permission: input.source === "manual" ? ["attendance.clock", "attendance.edit"] : "attendance.clock"
    });
    return success(await clockOutStaffAttendance({ session, input }));
  } catch (error) {
    return failure(error);
  }
}
