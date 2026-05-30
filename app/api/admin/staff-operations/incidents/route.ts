import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError } from "@/lib/response";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import { staffIncidentReportSchema } from "@/lib/validators";
import { invalidateStaffOperationsBundleCache } from "@/lib/staff-operations-cache";
import { createStaffIncidentReport } from "@/features/staff/services/staff-self-service";

export const preferredRegion = "sin1";

function failure(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ success: false, message: "Báo cáo sự cố chưa hợp lệ.", data: null, meta: null, errors: error.flatten() }, { status: 422 });
  }
  if (error instanceof AppError) {
    return NextResponse.json({ success: false, message: error.message, data: null, meta: null, errors: [error.message] }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Không thể gửi báo cáo sự cố.";
  console.error("[staff-incident-report-api]", error);
  return NextResponse.json({ success: false, message, data: null, meta: null, errors: [message] }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request, { requireOrigin: true });
    const [session, payload] = await Promise.all([
      requireOperationalDashboardApiSession({ feature: "staff_management" }),
      request.json().catch(() => ({}))
    ]);
    const input = staffIncidentReportSchema.parse(payload);
    const data = await createStaffIncidentReport({ session, input });
    await invalidateStaffOperationsBundleCache(session.restaurantId);
    return NextResponse.json({ success: true, message: "Đã gửi báo cáo cho quản lý.", data, meta: { generatedAt: new Date().toISOString() }, errors: [] });
  } catch (error) {
    return failure(error);
  }
}
