import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { attendanceApprovalReviewSchema } from "@/lib/validators";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { authorizeAttendanceManagementSession, reviewAttendanceApproval } from "@/features/attendance/services/attendance-service";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";

export const preferredRegion = "sin1";

type RouteContext = {
  params: Promise<{
    approvalId: string;
  }>;
};

function success(data: Awaited<ReturnType<typeof reviewAttendanceApproval>>) {
  return NextResponse.json({
    success: true,
    message: "Đã xử lý phê duyệt chấm công.",
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
        message: "Dữ liệu phê duyệt không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể xử lý phê duyệt.";
  console.error("[attendance-approval-review]", error);
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

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const [{ approvalId }, session, payload] = await Promise.all([
      context.params,
      requireOperationalDashboardApiSession({
        feature: "staff_management",
        permission: ["attendance.approve", "approvals.review"],
        permissionMode: "any"
      }),
      request.json().catch(() => ({}))
    ]);
    const input = attendanceApprovalReviewSchema.parse(payload);
    const data = await reviewAttendanceApproval({ session: authorizeAttendanceManagementSession(session), approvalId, input });
    await invalidateStaffOperationsBundleCache(session.restaurantId);
    return success(data);
  } catch (error) {
    return failure(error);
  }
}
