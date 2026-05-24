import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { staffOperationalRequestSchema } from "@/lib/validators";
import { createStaffOperationalRequest } from "@/features/staff/services/staff-request-service";

export const preferredRegion = "sin1";

function success(data: Awaited<ReturnType<typeof createStaffOperationalRequest>>) {
  return NextResponse.json({
    success: true,
    message: "Đã gửi yêu cầu cho quản lý.",
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
        message: "Dữ liệu yêu cầu không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể tạo yêu cầu nhân sự.";
  console.error("[staff-requests-api]", error);
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
        permission: ["attendance.clock", "shifts.view"],
        permissionMode: "any"
      }),
      request.json().catch(() => ({}))
    ]);
    const input = staffOperationalRequestSchema.parse(payload);
    return success(await createStaffOperationalRequest({ session, input }));
  } catch (error) {
    return failure(error);
  }
}
