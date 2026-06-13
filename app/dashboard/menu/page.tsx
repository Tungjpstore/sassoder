import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealMenuWorkspaceV2 } from "@/components/dashboard-v2/real/menu-workspace-v2";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { getAdminReport } from "@/services/dashboard-report-service";
import { listMenuForAdmin } from "@/services/menu-service";
import { listInventoryIngredients, listInventoryRecipeMenuItems } from "@/services/inventory-service";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const { session, entitlement } = await requireDashboardAccess("menu_management");
  return (
    <AdminShell
      title="Menu món"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Quản lý danh mục món ăn, giá bán, hình ảnh, công thức và tình trạng phục vụ"
    >
      <Suspense fallback={<MenuWorkspaceSkeleton />}>
        <MenuWorkspaceContent restaurantId={session.restaurantId} restaurantName={session.restaurant.name} />
      </Suspense>
    </AdminShell>
  );
}

async function MenuWorkspaceContent({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const { categories, report, ingredients, recipeMenuItems } = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "menu",
    ttlSeconds: 15,
    load: async () => {
      const [categories, report, ingredients, recipeMenuItems] = await Promise.all([
        listMenuForAdmin(restaurantId),
        getAdminReport(restaurantId),
        listInventoryIngredients(restaurantId).catch(() => []),
        listInventoryRecipeMenuItems(restaurantId).catch(() => [])
      ]);
      return { categories, report, ingredients, recipeMenuItems };
    }
  });

  return (
    <RealMenuWorkspaceV2
      restaurantId={restaurantId}
      categories={categories}
      topItemIds={report.topItems.map((item) => item.id)}
      topItemNames={report.topItems.map((item) => item.name)}
      restaurantName={restaurantName}
      ingredients={ingredients}
      recipeMenuItems={recipeMenuItems}
    />
  );
}

function MenuWorkspaceSkeleton() {
  return (
    <div className="dashboard-panel grid gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-[#A9C5A1]/18" />
        ))}
      </div>
      <div className="h-[460px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
    </div>
  );
}
