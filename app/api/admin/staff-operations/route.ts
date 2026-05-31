import { NextResponse } from "next/server";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";

export const preferredRegion = "sin1";

function success(data: Awaited<ReturnType<typeof getStaffOperationsBundle>>) {
  return NextResponse.json({
    success: true,
    message: "Đã tải dữ liệu staff operations.",
    data,
    meta: {
      generatedAt: data.generatedAt
    },
    errors: []
  });
}

function failure(error: unknown) {
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

  const message = error instanceof Error ? error.message : "Không thể tải staff operations.";
  console.error("[staff-operations-api]", error);
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "self" ? "self" : "admin";
    const session = await requireOperationalDashboardApiSession({
      feature: "staff_management",
      permission: scope === "self" ? "attendance.clock" : "staff.view"
    });

    return success(await getStaffOperationsBundle(session.restaurantId, session.userId, { scope }));
  } catch (error) {
    return failure(error);
  }
}
