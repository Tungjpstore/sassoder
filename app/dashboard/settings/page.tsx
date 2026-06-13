import { ProductionDashboardShell as AdminShell } from "@/components/dashboard-v2/production-shell";
import { RealSettingsWorkspaceV2 } from "@/components/dashboard-v2/real/settings-workspace-v2";
import {
  buildSettingsSectionStates,
  isSettingsSection,
  normalizeBillingStep,
  type SettingsSectionKey
} from "@/components/dashboard-v2/real/settings/section-states";
import { getDashboardAccessForSettings } from "@/lib/dashboard-access";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import { listStoreBranchesForManagement } from "@/services/branch-service";
import { listDeliveryBranchSettings, type BranchDeliverySettings } from "@/services/delivery/branch-delivery-settings-service";
import { getMapOperationalMetrics } from "@/services/map-ops-service";
import { getReportScheduleForRestaurant, listRecentReportLogs, type ReportScheduleSettings } from "@/services/report-schedule-service";
import { getRestaurantDashboard, listRestaurantUsers } from "@/services/restaurant-service";
import { getRestaurantBillingPortal } from "@/services/subscription-service";
import { normalizeFeatureKey, type PlanFeatureKey } from "@/services/billing/plan-features";

export const dynamic = "force-dynamic";

type SearchParams = {
  section?: string | string[];
  feature?: string | string[];
  gate?: string | string[];
  billingStep?: string | string[];
  paymentId?: string | string[];
  billingError?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminSettingsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = await searchParams;
  const sectionParam = firstParam(params?.section);
  const initialSection: SettingsSectionKey = isSettingsSection(sectionParam) ? sectionParam : "profile";

  const gateParam = firstParam(params?.gate);
  const featureParam = firstParam(params?.feature);
  const gatedFeatureKey: PlanFeatureKey | null =
    gateParam === "feature" && featureParam ? normalizeFeatureKey(featureParam) : null;

  const initialBillingStep = normalizeBillingStep(params?.billingStep ?? (gatedFeatureKey ? "compare" : undefined));
  const billingPaymentId = firstParam(params?.paymentId)?.slice(0, 80) ?? null;
  const billingError = firstParam(params?.billingError)?.slice(0, 240) ?? null;

  const { session, entitlement } = await getDashboardAccessForSettings(initialSection);

  const dashboardPromise = getRestaurantDashboard(session.restaurantId);
  const branchesPromise = listStoreBranchesForManagement(session.restaurantId);

  const billingPortalPromise =
    initialSection === "billing"
      ? getRestaurantBillingPortal({ restaurantId: session.restaurantId, ownerEmail: session.email })
      : Promise.resolve(null);

  const restaurantUsersPromise =
    initialSection === "billing"
      ? listRestaurantUsers(session.restaurantId)
      : Promise.resolve([] as Awaited<ReturnType<typeof listRestaurantUsers>>);

  const onlineDataPromise: Promise<[BranchDeliverySettings[], Awaited<ReturnType<typeof getMapOperationalMetrics>> | null]> =
    initialSection === "online"
      ? Promise.all([
          listDeliveryBranchSettings(session.restaurantId),
          getMapOperationalMetrics(session.restaurantId, 24)
        ])
      : Promise.resolve([[], null]);

  const reportDataPromise: Promise<[ReportScheduleSettings | null, Awaited<ReturnType<typeof listRecentReportLogs>>]> =
    initialSection === "notifications"
      ? dashboardPromise.then((dashboard) =>
          Promise.all([
            getReportScheduleForRestaurant(session.restaurantId, dashboard.restaurant.contact_email ?? session.email),
            listRecentReportLogs(session.restaurantId)
          ])
        )
      : Promise.resolve([null, []]);

  const [
    dashboard,
    branches,
    billingPortal,
    restaurantUsers,
    [branchDeliverySettings, mapOperationalMetrics],
    [reportSchedule, reportLogs]
  ] = await Promise.all([
    dashboardPromise,
    branchesPromise,
    billingPortalPromise,
    restaurantUsersPromise,
    onlineDataPromise,
    reportDataPromise
  ]);

  const restaurant = dashboard.restaurant;
  const setupReadiness = buildStoreSetupReadiness(restaurant, {
    tableCount: dashboard.tables,
    menuItemCount: dashboard.menuItems
  });
  const sectionStates = buildSettingsSectionStates({
    restaurant,
    branches,
    entitlement,
    tableCount: dashboard.tables
  });
  const qrMenuUrl = buildTenantUrl(restaurant.slug, "/");
  const onlineOrderUrl = buildTenantUrl(restaurant.slug, "/");

  return (
    <AdminShell
      title="Cài đặt"
      restaurantName={restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Chỉnh nhanh theo từng vùng vận hành"
      showLiveActionCenter={false}
      showQuickActionsFab={false}
      showDashboardCopilot={false}
      hideHeading
    >
      <RealSettingsWorkspaceV2
        restaurant={restaurant}
        branches={branches}
        branchDeliverySettings={branchDeliverySettings}
        mapOperationalMetrics={mapOperationalMetrics}
        reportSchedule={reportSchedule}
        reportLogs={reportLogs}
        billingPortal={billingPortal}
        setupReadiness={setupReadiness}
        sectionStates={sectionStates}
        initialSection={initialSection}
        initialBillingStep={initialBillingStep}
        initialBillingPaymentId={billingPaymentId}
        billingError={billingError}
        gatedFeatureKey={gatedFeatureKey}
        sessionEmail={session.email}
        tableCount={dashboard.tables}
        menuItemCount={dashboard.menuItems}
        staffCount={restaurantUsers.length}
        qrMenuUrl={qrMenuUrl}
        onlineOrderUrl={onlineOrderUrl}
        restaurantName={restaurant.name}
      />
    </AdminShell>
  );
}
