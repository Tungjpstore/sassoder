import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { staffSelfProfileSchema } from "@/lib/validators";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { updateStaffSelfProfile } from "@/features/staff/services/staff-self-service";

export const preferredRegion = "sin1";

function failure(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ success: false, message: "Hồ sơ chưa hợp lệ.", data: null, meta: null, errors: error.flatten() }, { status: 422 });
  }
  if (error instanceof AppError) {
    return NextResponse.json({ success: false, message: error.message, data: null, meta: null, errors: [error.message] }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Không thể cập nhật hồ sơ nhân viên.";
  console.error("[staff-self-profile-api]", error);
  return NextResponse.json({ success: false, message, data: null, meta: null, errors: [message] }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const [session, payload] = await Promise.all([
      requireOperationalDashboardApiSession({ feature: "staff_management" }),
      request.json().catch(() => ({}))
    ]);
    const input = staffSelfProfileSchema.parse(payload);
    const data = await updateStaffSelfProfile({ session, input });
    await invalidateStaffOperationsBundleCache(session.restaurantId);
    return NextResponse.json({ success: true, message: "Đã cập nhật hồ sơ.", data, meta: { generatedAt: new Date().toISOString() }, errors: [] });
  } catch (error) {
    return failure(error);
  }
}
