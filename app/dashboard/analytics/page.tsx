import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { AnalyticsExportActionsV2 } from "@/components/dashboard-v2/real/analytics/export-actions-v2";
import { RealAnalyticsWorkspaceV2 } from "@/components/dashboard-v2/real/analytics-workspace-v2";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { getAdminReport } from "@/services/dashboard-report-service";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

type Period = "weekly" | "monthly" | "yearly";

function normalizePeriod(value: string | string[] | undefined): Period {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "weekly" || v === "yearly" ? v : "monthly";
}

export default async function AdminAnalyticsPage({
  searchParams
}: {
  searchParams?: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const period = normalizePeriod(params?.period);
  const { session, entitlement } = await requireDashboardAccess("core_dashboard");
  const [{ dashboard }, report] = await Promise.all([
    getRestaurantAdminDashboard(session.restaurantId),
    getAdminReport(session.restaurantId, { period })
  ]);

  return (
    <AdminShell
      title="Báo cáo"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Theo dõi hiệu quả kinh doanh, món bán chạy và xu hướng hoạt động"
    >
      <AnalyticsExportActionsV2 />
      <RealAnalyticsWorkspaceV2 report={report} restaurantId={session.restaurantId} period={period} />
    </AdminShell>
  );
}
