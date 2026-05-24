import { AdminShell } from "@/components/dashboard/app-shell";
import { PromotionsWorkspace } from "@/components/dashboard/promotions-workspace";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { listMenuForAdmin } from "@/services/menu-service";
import { getPromotionStatus, listPromotions, listPromotionUsageSummary } from "@/services/promotion-service";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  const { session, entitlement } = await requireDashboardAccess("promotions");
  const [{ dashboard }, campaigns, usage, menuCategories] = await Promise.all([
    getRestaurantAdminDashboard(session.restaurantId),
    listPromotions(session.restaurantId),
    listPromotionUsageSummary(session.restaurantId),
    listMenuForAdmin(session.restaurantId)
  ]);
  const campaignsWithStatus = campaigns.map((campaign) => ({
    ...campaign,
    computedStatus: getPromotionStatus(campaign)
  }));
  const freeItemOptions = menuCategories.flatMap((category) =>
    category.items.map((item) => ({
      id: item.id,
      name: item.name,
      categoryName: category.name,
      price: item.price,
      isAvailable: item.is_available
    }))
  );

  return (
    <AdminShell
      title="Khuyến mãi"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Tạo chiến dịch giảm giá, mã ưu đãi và chương trình giữ chân khách"
    >
      <PromotionsWorkspace campaigns={campaignsWithStatus} usage={usage} freeItemOptions={freeItemOptions} />
    </AdminShell>
  );
}
