import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { requireDashboardPermissionAccess } from "@/lib/dashboard-access";
import { RealStaffWorkspaceV2 } from "@/components/dashboard-v2/real/staff-workspace-v2";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";
import {
  getStaffPayrollDeductions,
  listStaffPayrollProfiles,
  DEFAULT_PAYROLL_DEDUCTIONS
} from "@/features/staff/services/staff-payroll-service";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const { session, entitlement } = await requireDashboardPermissionAccess("staff_management", ["staff.view", "staff.manage"]);

  return (
    <AdminShell
      title="Nhân viên"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Ca làm, phân quyền, lương và hiệu suất đội ngũ."
      showRail={false}
    >
      <Suspense fallback={<StaffWorkspaceSkeleton />}>
        <StaffWorkspaceContent
          restaurantId={session.restaurantId}
          userId={session.userId}
          restaurantName={session.restaurant.name}
          restaurantStaffCode={session.restaurant.staffCode ?? null}
        />
      </Suspense>
    </AdminShell>
  );
}

async function StaffWorkspaceContent({
  restaurantId,
  userId,
  restaurantName,
  restaurantStaffCode
}: {
  restaurantId: string;
  userId: string;
  restaurantName: string;
  restaurantStaffCode: string | null;
}) {
  const [bundle, payroll] = await Promise.all([
    getStaffOperationsBundle(restaurantId, userId),
    loadStaffPayroll(restaurantId)
  ]);

  return (
    <RealStaffWorkspaceV2
      bundle={bundle}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      restaurantStaffCode={restaurantStaffCode}
      payrollDeductions={payroll.deductions}
      payrollProfiles={payroll.profiles}
      payrollDataError={payroll.error}
    />
  );
}

async function loadStaffPayroll(restaurantId: string) {
  const [deductionsResult, profilesResult] = await Promise.allSettled([
    getStaffPayrollDeductions(restaurantId),
    listStaffPayrollProfiles(restaurantId)
  ]);
  const errors = [deductionsResult, profilesResult]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => payrollErrorMessage(result.reason));

  return {
    deductions: deductionsResult.status === "fulfilled" ? deductionsResult.value : DEFAULT_PAYROLL_DEDUCTIONS,
    profiles: profilesResult.status === "fulfilled" ? profilesResult.value : [],
    error: errors.length ? `Không tải được dữ liệu lương thật: ${errors.join("; ")}` : null
  };
}

function payrollErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Lỗi không xác định";
}

function StaffWorkspaceSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="h-12 w-64 animate-pulse rounded-[var(--d-r-md)] bg-[var(--d-surface-2)]" />
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-[var(--d-r-lg)] bg-[var(--d-surface-2)]" />
        ))}
      </div>
      <div className="h-[460px] animate-pulse rounded-[var(--d-r-lg)] bg-[var(--d-surface-2)]" />
    </div>
  );
}
