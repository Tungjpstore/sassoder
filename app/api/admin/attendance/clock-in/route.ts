import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { attendanceClockInSchema } from "@/lib/validators";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { clockInStaffAttendance } from "@/features/attendance/services/attendance-service";

export const preferredRegion = "sin1";

function success(data: Awaited<ReturnType<typeof clockInStaffAttendance>>) {
  return NextResponse.json({
    success: true,
    message: data.duplicate ? "Dữ liệu offline đã được đồng bộ trước đó." : "Đã chấm công.",
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
        message: "Dữ liệu chấm công không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể chấm công.";
  console.error("[attendance-clock-in]", error);
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
    const input = attendanceClockInSchema.parse(payload);
    const session = await requireOperationalDashboardApiSession({
      feature: "staff_management",
      permission: input.source === "manual" ? ["attendance.clock", "attendance.edit"] : "attendance.clock"
    });
    return success(await clockInStaffAttendance({ session, input }));
  } catch (error) {
    return failure(error);
  }
}
