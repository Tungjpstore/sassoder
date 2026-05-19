import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { markStaffNotificationsRead } from "@/features/staff/services/staff-operations-service";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";

export const preferredRegion = "sin1";

const markReadSchema = z
  .object({
    notificationId: z.string().uuid().optional(),
    all: z.boolean().optional()
  })
  .refine((value) => value.all || value.notificationId, {
    message: "Cần chọn thông báo hoặc đánh dấu tất cả.",
    path: ["notificationId"]
  });

function success(data: { updated: number }) {
  return NextResponse.json({
    success: true,
    message: "Đã cập nhật thông báo.",
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
        message: "Dữ liệu thông báo không hợp lệ.",
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

  const message = error instanceof Error ? error.message : "Không thể cập nhật thông báo.";
  console.error("[staff-notifications-read]", error);
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
    const session = await requireOperationalDashboardApiSession({ feature: "staff_management" });
    const input = markReadSchema.parse(await request.json().catch(() => ({})));
    const result = await markStaffNotificationsRead({
      restaurantId: session.restaurantId,
      userId: session.userId,
      notificationId: input.notificationId,
      all: input.all
    });

    return success(result);
  } catch (error) {
    return failure(error);
  }
}
