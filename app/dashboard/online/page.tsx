import { AdminShell } from "@/components/dashboard/app-shell";
import { OnlineWorkspace } from "@/components/dashboard/online-workspace";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { isMapboxDeliveryProviderReady } from "@/services/delivery-service";
import { getOnlineOrderingDashboard } from "@/services/online-ordering-service";

export const dynamic = "force-dynamic";

export default async function OnlineOrderingPage() {
  const { session, entitlement } = await requireDashboardAccess("online_ordering");
  const data = await getOnlineOrderingDashboard(session.restaurantId);
  const onlineUrl = buildTenantUrl(data.restaurant.slug, "/");

  return (
    <AdminShell
      title="Đặt món online"
      restaurantName={data.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Tối giản hoá cấu hình bán online, giao hàng, QR chia sẻ và theo dõi đơn từ xa."
    >
      <OnlineWorkspace
        restaurant={data.restaurant}
        stats={data.stats}
        recentOrders={data.recentOrders}
        onlineUrl={onlineUrl}
        qrSrc="/api/admin/online-qr"
        menuItems={data.menuItems}
        categories={data.categories}
        mapboxReady={isMapboxDeliveryProviderReady()}
      />
    </AdminShell>
  );
}
