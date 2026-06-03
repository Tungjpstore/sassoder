import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { AppError, fail } from "@/lib/response";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";

export const preferredRegion = "sin1";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function minutesToHours(minutes: number) {
  return (minutes / 60).toFixed(2);
}

export async function GET() {
  try {
    const session = await requireOperationalDashboardApiSession({
      feature: "staff_management",
      permission: ["attendance.view", "activity_logs.export"]
    });
    const bundle = await getStaffOperationsBundle(session.restaurantId, session.userId);

    if (!bundle.premium.operationalAnalytics) {
      throw new AppError("Xuất timesheet nâng cao chỉ khả dụng trên gói Premium.", 402);
    }

    const header = [
      "Nhan su",
      "Chi nhanh",
      "So luot cham cong",
      "Gio cong",
      "Phut di muon",
      "Gio tang ca",
      "Gio tang ca duyet tay",
      "Ngay nghi co luong",
      "Ngay nghi khong luong",
      "So lan muon",
      "Duyet cho",
      "Diem cham cong"
    ];
    const rows = bundle.timesheets.map((item) => [
      item.fullName,
      item.branchName ?? "",
      item.attendanceCount,
      minutesToHours(item.workMinutes),
      item.lateMinutes,
      minutesToHours(item.overtimeMinutes),
      minutesToHours(item.approvedOvertimeMinutes),
      item.paidLeaveDays,
      item.unpaidLeaveDays,
      item.lateCount,
      item.pendingApprovals,
      item.attendanceScore
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="logivn-timesheets-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  } catch (error) {
    return fail(error);
  }
}
