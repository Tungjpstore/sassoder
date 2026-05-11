import { AdminShell } from "@/components/dashboard/app-shell";
import { MenuWorkspace } from "@/components/dashboard/menu-workspace";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { getAdminReport } from "@/services/dashboard-report-service";
import { listMenuForAdmin } from "@/services/menu-service";
import { getRestaurantDashboard } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const { session, entitlement } = await requireDashboardAccess("menu_management");
  const [dashboard, categories, report] = await Promise.all([
    getRestaurantDashboard(session.restaurantId),
    listMenuForAdmin(session.restaurantId),
    getAdminReport(session.restaurantId)
  ]);

  return (
    <AdminShell
      title="Menu món"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Quản lý danh mục món ăn, giá bán, hình ảnh và tình trạng phục vụ"
    >
      <MenuWorkspace
        categories={categories}
        topItemIds={report.topItems.map((item) => item.id)}
        topItemNames={report.topItems.map((item) => item.name)}
        restaurantName={dashboard.restaurant.name}
      />
    </AdminShell>
  );
}
