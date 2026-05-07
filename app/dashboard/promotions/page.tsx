import { AdminShell } from "@/components/dashboard/app-shell";
import { PromotionsWorkspace } from "@/components/dashboard/promotions-workspace";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { getPromotionStatus, listPromotions, listPromotionUsageSummary } from "@/services/promotion-service";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  const { session, entitlement } = await requireDashboardAccess("promotions");
  const [{ dashboard }, campaigns, usage] = await Promise.all([
    getRestaurantAdminDashboard(session.restaurantId),
    listPromotions(session.restaurantId),
    listPromotionUsageSummary(session.restaurantId)
  ]);
  const campaignsWithStatus = campaigns.map((campaign) => ({
    ...campaign,
    computedStatus: getPromotionStatus(campaign)
  }));

  return (
    <AdminShell
      title="Khuyến mãi"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Tạo chiến dịch giảm giá, mã ưu đãi và chương trình giữ chân khách"
    >
      <PromotionsWorkspace campaigns={campaignsWithStatus} usage={usage} />
    </AdminShell>
  );
}
