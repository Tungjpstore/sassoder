import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createStaffAttendanceQrToken } from "@/features/attendance/services/attendance-qr-service";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { staffAttendanceQrTokenCreateSchema } from "@/lib/validators";

export const preferredRegion = "sin1";

async function requestBaseUrl() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function success(data: Awaited<ReturnType<typeof createStaffAttendanceQrToken>>) {
  return NextResponse.json(
    {
      success: true,
      message: "Đã tạo QR chấm công.",
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
        message: "Dữ liệu QR chấm công không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể tạo QR chấm công.";
  console.error("[staff-attendance-qr-token]", error);
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
    const [session, payload, baseUrl] = await Promise.all([
      requireOperationalDashboardApiSession({
        adminOnly: true,
        feature: "staff_management",
        permission: "attendance.edit"
      }),
      request.json().catch(() => ({})),
      requestBaseUrl()
    ]);
    const input = staffAttendanceQrTokenCreateSchema.parse(payload);
    return success(await createStaffAttendanceQrToken({ session, input, baseUrl }));
  } catch (error) {
    return failure(error);
  }
}
