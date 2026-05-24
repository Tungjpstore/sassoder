import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError, fail } from "@/lib/response";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";

export const preferredRegion = "sin1";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({
      adminOnly: true,
      feature: "staff_management"
    });
    const bundle = await getStaffOperationsBundle(session.restaurantId, session.userId);

    if (!bundle.premium.operationalAnalytics) {
      throw new AppError("Xuất nhật ký nâng cao chỉ khả dụng trên gói Premium.", 402);
    }

    const header = ["Thoi gian", "Nhan su", "Chi nhanh", "Hanh dong", "Muc do", "Doi tuong", "Ma doi tuong", "Ly do"];
    const rows = bundle.activity.map((item) => [
      item.createdAt,
      item.fullName ?? "He thong",
      item.branchName ?? "Toan quan",
      item.action,
      item.severity,
      item.entityType,
      item.entityId ?? "",
      item.reason ?? ""
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="logivn-activity-logs-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  } catch (error) {
    return fail(error);
  }
}
