import { AdminShell } from "@/components/dashboard/app-shell";
import { InventoryWorkspaceV2 } from "@/components/dashboard/inventory-workspace-v2";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { getInventoryWorkspaceData } from "@/services/inventory-service";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const { session, entitlement } = await requireDashboardAccess("inventory_management");
  const [{ dashboard }, inventory] = await Promise.all([
    getRestaurantAdminDashboard(session.restaurantId),
    getInventoryWorkspaceData(session.restaurantId)
  ]);

  return (
    <AdminShell
      title="Kho hàng"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Theo dõi nguyên liệu, recipe coverage, tồn kho và ledger vận hành"
      hideHeading
    >
      <InventoryWorkspaceV2
        restaurantId={session.restaurantId}
        snapshot={inventory.snapshot}
        categories={inventory.categories}
        ingredients={inventory.ingredients}
        recipeMenuItems={inventory.recipeMenuItems}
        intelligence={inventory.intelligence}
        warehouse={inventory.warehouse}
      />
    </AdminShell>
  );
}
