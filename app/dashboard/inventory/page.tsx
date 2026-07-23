import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealInventoryWorkspaceV2 } from "@/components/dashboard-v2/real/inventory-workspace-v2";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardPermissionAccess } from "@/lib/dashboard-access";
import { getInventoryWorkspaceData } from "@/services/inventory-service";
import { hasFeature } from "@/services/subscription-service";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const { session, entitlement } = await requireDashboardPermissionAccess("inventory_basic", "inventory.view", { allowAdminBypass: false });
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
        <InventoryWorkspaceContent
          restaurantId={session.restaurantId}
          inventoryFeatures={{
            basic: hasFeature(entitlement, "inventory_basic"),
            procurement: hasFeature(entitlement, "inventory_procurement"),
            warehouseAdvanced: hasFeature(entitlement, "inventory_warehouse_advanced"),
            alerts: hasFeature(entitlement, "inventory_alerts"),
            premium: hasFeature(entitlement, "inventory_premium"),
            aiOcr: hasFeature(entitlement, "inventory_ai_ocr")
          }}
        />
      </Suspense>
    </AdminShell>
  );
}

async function InventoryWorkspaceContent({
  restaurantId,
  inventoryFeatures
}: {
  restaurantId: string;
  inventoryFeatures: {
    basic: boolean;
    procurement: boolean;
    warehouseAdvanced: boolean;
    alerts: boolean;
    premium: boolean;
    aiOcr: boolean;
  };
}) {
  const inventory = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "inventory",
    ttlSeconds: 12,
    load: () => getInventoryWorkspaceData(restaurantId)
  });

  return (
    <RealInventoryWorkspaceV2
      restaurantId={restaurantId}
      snapshot={inventory.snapshot}
      categories={inventory.categories}
      ingredients={inventory.ingredients}
      recipeMenuItems={inventory.recipeMenuItems}
      intelligence={inventory.intelligence}
      warehouse={inventory.warehouse}
      inventoryFeatures={inventoryFeatures}
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
