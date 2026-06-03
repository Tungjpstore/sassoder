import { NextResponse } from "next/server";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { uploadStaffSelfAvatar } from "@/features/staff/services/staff-self-service";

export const preferredRegion = "sin1";

function failure(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ success: false, message: error.message, data: null, meta: null, errors: [error.message] }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Không thể tải ảnh đại diện.";
  console.error("[staff-self-avatar-api]", error);
  return NextResponse.json({ success: false, message, data: null, meta: null, errors: [message] }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const session = await requireOperationalDashboardApiSession({ feature: "staff_management" });
    const formData = await request.formData();
    const data = await uploadStaffSelfAvatar({ session, file: formData.get("avatar") });
    await invalidateStaffOperationsBundleCache(session.restaurantId);
    return NextResponse.json({ success: true, message: "Đã tải ảnh đại diện.", data, meta: { generatedAt: new Date().toISOString() }, errors: [] });
  } catch (error) {
    return failure(error);
  }
}
