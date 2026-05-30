import { Suspense } from "react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { InventoryWorkspaceV2 } from "@/components/dashboard/inventory-workspace-v2";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { getInventoryWorkspaceData } from "@/services/inventory-service";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const { session, entitlement } = await requireDashboardAccess("inventory_management");
  return (
    <AdminShell
      title="Kho hàng"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Theo dõi nguyên liệu, recipe coverage, tồn kho và ledger vận hành"
      hideHeading
    >
      <Suspense fallback={<InventoryWorkspaceSkeleton />}>
        <InventoryWorkspaceContent restaurantId={session.restaurantId} />
      </Suspense>
    </AdminShell>
  );
}

async function InventoryWorkspaceContent({ restaurantId }: { restaurantId: string }) {
  const inventory = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "inventory",
    ttlSeconds: 12,
    load: () => getInventoryWorkspaceData(restaurantId)
  });

  return (
    <InventoryWorkspaceV2
      restaurantId={restaurantId}
      snapshot={inventory.snapshot}
      categories={inventory.categories}
      ingredients={inventory.ingredients}
      recipeMenuItems={inventory.recipeMenuItems}
      intelligence={inventory.intelligence}
      warehouse={inventory.warehouse}
    />
  );
}

function InventoryWorkspaceSkeleton() {
  return (
    <div className="dashboard-panel grid gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-[#A9C5A1]/18" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="h-[520px] animate-pulse rounded-xl bg-[var(--soft-surface)]" />
        <div className="h-[520px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
      </div>
    </div>
  );
}
