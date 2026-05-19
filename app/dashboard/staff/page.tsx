import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { AdminShell } from "@/components/dashboard/app-shell";
import { StaffOperationsWorkspace } from "@/features/staff/components/staff-operations-workspace";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("staff_management");
  const bundle = await getStaffOperationsBundle(session.restaurantId, session.userId);

  return (
    <AdminShell
      title="Nhân viên"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Quản lý hồ sơ, ca làm và quyền vận hành trong một màn hình"
      hideHeading
    >
      <StaffOperationsWorkspace
        bundle={bundle}
        restaurantId={session.restaurantId}
        restaurantName={session.restaurant.name}
        illustrationSrc="/brand/logivn/staff-operations-illustration.png"
      />
    </AdminShell>
  );
}
