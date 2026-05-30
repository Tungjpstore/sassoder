import { Suspense } from "react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { TablesWorkspace } from "@/components/dashboard/tables-workspace";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { listActiveTableBranches, listTablesWithStatus } from "@/services/table-service";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const { session, entitlement } = await requireDashboardAccess("table_qr");
  return (
    <AdminShell
      title="Bàn & QR"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Quản lý sơ đồ bàn, trạng thái sử dụng và mã QR từng bàn."
    >
      <Suspense fallback={<TablesWorkspaceSkeleton />}>
        <TablesWorkspaceContent restaurantId={session.restaurantId} restaurantSlug={session.restaurant.slug} restaurantName={session.restaurant.name} />
      </Suspense>
    </AdminShell>
  );
}

async function TablesWorkspaceContent({
  restaurantId,
  restaurantSlug,
  restaurantName
}: {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
}) {
  const { tables, branches } = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "tables",
    ttlSeconds: 3,
    load: async () => {
      const [tables, branches] = await Promise.all([
        listTablesWithStatus(restaurantId),
        listActiveTableBranches(restaurantId)
      ]);

      return { tables, branches };
    }
  });

  return (
    <TablesWorkspace
      restaurantId={restaurantId}
      restaurantSlug={restaurantSlug}
      restaurantName={restaurantName}
      dashboardTableCount={tables.length}
      branches={branches}
      tables={tables}
    />
  );
}

function TablesWorkspaceSkeleton() {
  return (
    <div className="dashboard-panel grid gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-[#A9C5A1]/18" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
        ))}
      </div>
    </div>
  );
}
