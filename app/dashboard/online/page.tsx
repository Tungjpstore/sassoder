import { Suspense } from "react";
import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealOnlineWorkspaceV2 } from "@/components/dashboard-v2/real/online-workspace-v2";
import { readThroughDashboardWorkspaceCache } from "@/lib/dashboard-workspace-cache";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { isMapboxDeliveryProviderReady } from "@/services/delivery-service";
import { getOnlineOrderingDashboard } from "@/services/online-ordering-service";

export const dynamic = "force-dynamic";

export default async function OnlineOrderingPage() {
  const { session, entitlement } = await requireDashboardAccess("online_ordering");

  return (
    <AdminShell
      title="Đặt món online"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Tối giản hoá cấu hình bán online, giao hàng, QR chia sẻ và theo dõi đơn từ xa."
    >
      <Suspense fallback={<OnlineWorkspaceSkeleton />}>
        <OnlineWorkspaceContent restaurantId={session.restaurantId} />
      </Suspense>
    </AdminShell>
  );
}

async function OnlineWorkspaceContent({ restaurantId }: { restaurantId: string }) {
  const data = await readThroughDashboardWorkspaceCache({
    restaurantId,
    workspace: "online",
    ttlSeconds: 5,
    load: () => getOnlineOrderingDashboard(restaurantId)
  });
  const onlineUrl = buildTenantUrl(data.restaurant.slug, "/");

  return (
    <RealOnlineWorkspaceV2
      restaurant={data.restaurant}
      stats={data.stats}
      recentOrders={data.recentOrders}
      onlineUrl={onlineUrl}
      qrSrc="/api/admin/online-qr"
      menuItems={data.menuItems}
      categories={data.categories}
      mapboxReady={isMapboxDeliveryProviderReady()}
    />
  );
}

function OnlineWorkspaceSkeleton() {
  return (
    <div className="dashboard-panel grid gap-4 p-4">
      <div className="h-24 animate-pulse rounded-xl bg-[#A9C5A1]/18" />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl bg-[var(--soft-surface)]" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--soft-surface)]" />
    </div>
  );
}
