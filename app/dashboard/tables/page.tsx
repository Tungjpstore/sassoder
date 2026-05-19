import { AdminShell } from "@/components/dashboard/app-shell";
import { TablesWorkspace } from "@/components/dashboard/tables-workspace";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { getRestaurantDashboard } from "@/services/restaurant-service";
import { listActiveTableBranches, listTablesWithStatus } from "@/services/table-service";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const { session, entitlement } = await requireDashboardAccess("table_qr");
  const [dashboard, tables, branches] = await Promise.all([
    getRestaurantDashboard(session.restaurantId),
    listTablesWithStatus(session.restaurantId),
    listActiveTableBranches(session.restaurantId)
  ]);

  return (
    <AdminShell
      title="Bàn & QR"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Quản lý sơ đồ bàn, trạng thái sử dụng và mã QR từng bàn."
    >
      <TablesWorkspace
        restaurantId={session.restaurantId}
        restaurantSlug={dashboard.restaurant.slug}
        restaurantName={dashboard.restaurant.name}
        dashboardTableCount={dashboard.tables}
        branches={branches}
        tables={tables}
      />
    </AdminShell>
  );
}
