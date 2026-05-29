import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { StaffRedesignWorkspace } from "@/features/staff/components/staff-redesign-workspace";
import { getStaffOperationsBundle } from "@/features/staff/services/staff-operations-service";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const { session } = await requireDashboardAdminAccess("staff_management");
  const bundle = await getStaffOperationsBundle(session.restaurantId, session.userId);

  return (
    <StaffRedesignWorkspace
      bundle={bundle}
      restaurantId={session.restaurantId}
      restaurantName={session.restaurant.name}
    />
  );
}
