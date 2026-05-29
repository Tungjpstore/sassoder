import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AdminDashboardClientLayout } from "@/components/dashboard/dashboard-client-layout";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { formatVnd } from "@/lib/money";
import { buildOperationInsights } from "@/lib/ai/operation-insights";
import { buildAiRecommendationDeck } from "@/lib/ai/recommendation-engine";
import { buildAiSalesForecast } from "@/lib/ai/sales-forecast";
import { buildActivationRunway } from "@/lib/dashboard-activation-runway";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { getLatestAiMorningBriefRun } from "@/services/ai-morning-brief-service";
import { persistAiOperationInsightsDeck } from "@/services/ai-operation-insights-service";
import { persistAiRecommendationsFromOperationDeck } from "@/services/ai-recommendation-service";
import { buildStoreSetupReadiness } from "@/services/ai-setup-readiness";
import { getAdminDashboardOverview } from "@/services/dashboard-overview-service";
import { getInventorySnapshot } from "@/services/inventory-service";
import { Warehouse, ClipboardList, WalletCards, ChefHat, Banknote, ReceiptText, QrCode, RadioTower, TrendingUp, Gauge, UsersRound } from "lucide-react";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function priorityTone(tone: "green" | "orange" | "red") {
  if (tone === "red") return "border-[var(--accent)]/25 bg-[var(--danger-soft)] text-[var(--accent-strong)]";
  if (tone === "orange") return "border-[var(--accent)]/20 bg-[rgba(245,158,11,0.08)] text-[var(--accent)]";
  return "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]";
}

function maxOf<T>(rows: T[], selector: (row: T) => number) {
  return Math.max(1, ...rows.map(selector));
}

function topPeakHours(rows: Array<{ label: string; revenue: number; orderCount: number }>) {
  return [...rows]
    .filter((row) => row.orderCount > 0 || row.revenue > 0)
    .sort((a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue)
    .slice(0, 3);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<{ onboarded?: string | string[] }>;
}) {
  const params = await searchParams;
  const { session, entitlement } = await requireDashboardAccess("core_dashboard");
  if (session.role === "STAFF") redirect("/dashboard/staff/mobile");
  const showOnboardedWelcome = firstParam(params?.onboarded) === "1";

  return (
    <AdminShell
      title="Tổng quan"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Theo dõi ca bán trong một màn hình"
      topbarVariant="overview"
      hideHeading
      showLiveActionCenter={false}
    >
      <Suspense fallback={<AdminDashboardSkeleton />}>
        <AdminDashboardContent restaurantId={session.restaurantId} showOnboardedWelcome={showOnboardedWelcome} />
      </Suspense>
    </AdminShell>
  );
}

function AdminDashboardSkeleton() {
  return (
    <div className="grid gap-3">
      <section className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5" style={{ minHeight: 100 }} />
      <section className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ minHeight: 96 }} />
        ))}
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" style={{ minHeight: 240 }} />
        ))}
      </section>
    </div>
  );
}

async function AdminDashboardContent({ restaurantId, showOnboardedWelcome }: { restaurantId: string; showOnboardedWelcome: boolean }) {
  const [
    { dashboard, operations, tables, recentOrders, topItems, monthRevenue, hourlyRevenueToday, orderSourcesToday, paymentMethodsToday },
    inventory,
    latestMorningBrief
  ] = await Promise.all([
    getAdminDashboardOverview(restaurantId),
    getInventorySnapshot(restaurantId),
    getLatestAiMorningBriefRun(restaurantId)
  ]);
  const tenantUrl = buildTenantUrl(dashboard.restaurant.slug, "/");
  const totalTables = Math.max(tables.length, dashboard.tables);
  const setupReadiness = buildStoreSetupReadiness(dashboard.restaurant, {
    tableCount: totalTables,
    menuItemCount: dashboard.menuItems
  });
  const activeTables = tables.filter((table) => table.status !== "available").length;
  const overdueTables = tables.filter((table) => table.status === "overdue").length;
  const paymentWaiting = operations.waitingConfirm + operations.waitingPayment;
  const paidRevenue = operations.qrRevenue + operations.cashRevenue;
  const qrRatio = percent(operations.qrRevenue, paidRevenue);
  const openOrderCount = operations.pending + operations.ordering + operations.completed + operations.waitingPayment + operations.waitingConfirm;
  const bestSeller = topItems[0];
  const focusedTables = tables.filter((table) => table.status !== "available").slice(0, 6);
  const recentActionOrders = recentOrders
    .filter((order) => !["paid", "cancelled"].includes(order.status))
    .slice(0, 6);
  const maxHourlyRevenue = maxOf(hourlyRevenueToday, (row) => row.revenue);
  const maxHourlyOrders = maxOf(hourlyRevenueToday, (row) => row.orderCount);
  const peakHours = topPeakHours(hourlyRevenueToday);
  const totalSourceOrders = orderSourcesToday.reduce((sum, source) => sum + source.count, 0);
  const totalPaymentValue = paymentMethodsToday.reduce((sum, row) => sum + row.value, 0);
  const kitchenLoad = operations.pending + operations.ordering;
  const serviceHealthScore = Math.max(
    0,
    100 -
      operations.pending * 8 -
      operations.waitingConfirm * 10 -
      operations.waitingPayment * 5 -
      overdueTables * 12 -
      (inventory.schemaReady ? inventory.lowStockCount * 4 : 8)
  );
  const generatedOperationInsights = buildOperationInsights({
    summary24h: {
      orderCount: operations.todayOrders,
      paidRevenue: operations.todayRevenue,
      statusCount: {
        pending: operations.pending,
        ordering: operations.ordering,
        completed: operations.completed,
        waiting_payment: operations.waitingPayment,
        waiting_confirm: operations.waitingConfirm,
        paid: operations.paid
      },
      paymentStatusCount: {
        waiting_payment: operations.waitingPayment,
        waiting_confirm: operations.waitingConfirm,
        paid: operations.paid
      }
    },
    recentOrders: operations.recentOrders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      tableName: order.tableName
    })),
    topItems: topItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      revenue: item.revenue
    })),
    menu: {
      itemCount: dashboard.menuItems,
      unavailableCount: 0
    },
    tables: {
      tableCount: totalTables,
      activeTableCount: activeTables,
      qrDisabledCount: tables.filter((table) => !table.qr_enabled).length,
      tables: tables.map((table) => ({
        id: table.id,
        name: table.name,
        status: table.status,
        activeOrderCount: table.activeOrderCount,
        overdueCount: table.overdueCount,
        qrEnabled: table.qr_enabled,
        unpaidTotal: table.unpaidTotal
      }))
    },
    payments: {
      waitingConfirm: operations.waitingConfirm,
      waitingPayment: operations.waitingPayment
    },
    inventory: {
      schemaReady: inventory.schemaReady,
      activeIngredientCount: inventory.activeIngredientCount,
      lowStockCount: inventory.lowStockCount,
      recipeCoveragePercent: inventory.recipeCoveragePercent,
      recipeReadyItemCount: inventory.recipeReadyItemCount,
      menuItemCount: inventory.menuItemCount,
      totalReferenceValue: inventory.totalReferenceValue,
      lowStockIngredients: inventory.lowStockIngredients.map((ingredient) => ({
        name: ingredient.name,
        unit: ingredient.unit,
        onHandQuantity: ingredient.onHandQuantity,
        minimumQuantity: ingredient.minimumQuantity,
        referenceUnitCost: ingredient.referenceUnitCost
      }))
    }
  });
  const recommendationDeck = buildAiRecommendationDeck({
    operationInsights: generatedOperationInsights,
    limit: 3
  });

  after(async () => {
    try {
      const persistedInsights = await persistAiOperationInsightsDeck({
        restaurantId,
        deck: generatedOperationInsights
      });
      await persistAiRecommendationsFromOperationDeck({
        restaurantId,
        operationInsights: persistedInsights.deck,
        limit: 6
      });
    } catch (error) {
      console.error("[dashboard-ai-persistence] failed", error);
    }
  });
  const dailyTarget = monthRevenue > 0 ? Math.max(operations.todayRevenue, Math.round(monthRevenue / Math.max(1, new Date().getDate()))) : null;
  const salesForecast = buildAiSalesForecast({
    hourlyRevenueToday,
    targetRevenue: dailyTarget
  });
  const showActivationPanel = showOnboardedWelcome || setupReadiness.score < 75;
  const activationRunway = buildActivationRunway(setupReadiness);

  const priorityCards = [
    {
      title: "Kho thiếu",
      value: inventory.schemaReady ? inventory.lowStockCount : 0,
      helper: inventory.schemaReady ? `${inventory.activeIngredientCount} nguyên liệu` : "Cần bật kho",
      href: "/dashboard/inventory",
      icon: "Warehouse",
      tone: inventory.schemaReady && inventory.lowStockCount > 0 ? "orange" : "green"
    },
    {
      title: "Đơn mới",
      value: operations.pending,
      helper: "Nhận đơn",
      href: "/dashboard/orders",
      icon: "ClipboardList",
      tone: operations.pending > 0 ? "orange" : "green"
    },
    {
      title: "Chờ thanh toán",
      value: paymentWaiting,
      helper: formatVnd(operations.openOrderTotal),
      href: "/dashboard/payments",
      icon: "WalletCards",
      tone: paymentWaiting > 0 ? "orange" : "green"
    },
    {
      title: "Bàn quá giờ",
      value: overdueTables,
      helper: `${activeTables}/${totalTables || 0} bàn bận`,
      href: "/dashboard/kitchen",
      icon: "ChefHat",
      tone: overdueTables > 0 ? "red" : "green"
    }
  ] as const;

  const commandSignals = [
    {
      label: "Sức khoẻ ca",
      value: `${serviceHealthScore}%`,
      helper: serviceHealthScore >= 82 ? "Ổn định" : serviceHealthScore >= 62 ? "Cần theo dõi" : "Cần xử lý ngay",
      icon: "Gauge",
      tone: serviceHealthScore >= 82 ? "green" : serviceHealthScore >= 62 ? "orange" : "red"
    },
    {
      label: "Tải bếp",
      value: kitchenLoad,
      helper: `${operations.pending} mới · ${operations.ordering} đang làm`,
      icon: "ChefHat",
      tone: kitchenLoad >= 8 ? "red" : kitchenLoad >= 4 ? "orange" : "green"
    },
    {
      label: "Bàn hoạt động",
      value: `${activeTables}/${totalTables || 0}`,
      helper: overdueTables > 0 ? `${overdueTables} bàn quá giờ` : "Không có bàn quá giờ",
      icon: "UsersRound",
      tone: overdueTables > 0 ? "red" : activeTables > 0 ? "orange" : "green"
    },
    {
      label: "Tiền chờ thu",
      value: formatVnd(operations.openOrderTotal),
      helper: `${paymentWaiting} bill cần đóng`,
      icon: "WalletCards",
      tone: paymentWaiting > 0 ? "orange" : "green"
    },
    {
      label: "Forecast AI",
      value: salesForecast.trend === "behind" ? "Chậm" : salesForecast.trend === "ahead" ? "Tốt" : "Ổn",
      helper: salesForecast.actions[0] ?? salesForecast.summary,
      icon: "RadioTower",
      tone: salesForecast.trend === "behind" ? "orange" : "green"
    }
  ] as const;

  return (
    <AdminDashboardClientLayout
      restaurantId={restaurantId}
      showOnboardedWelcome={showOnboardedWelcome}
      restaurantName={dashboard.restaurant.name}
      operations={operations}
      tenantUrl={tenantUrl}
      setupReadiness={setupReadiness}
      tableCount={totalTables}
      menuItemCount={dashboard.menuItems}
      tables={tables}
      recentOrders={recentOrders}
      topItems={topItems}
      monthRevenue={monthRevenue}
      hourlyRevenueToday={hourlyRevenueToday}
      orderSourcesToday={orderSourcesToday}
      paymentMethodsToday={paymentMethodsToday}
      inventory={{
        schemaReady: inventory.schemaReady,
        lowStockCount: inventory.lowStockCount,
        activeIngredientCount: inventory.activeIngredientCount,
        recipeCoveragePercent: inventory.recipeCoveragePercent,
        recipeReadyItemCount: inventory.recipeReadyItemCount,
        menuItemCount: inventory.menuItemCount,
        lowStockIngredients: inventory.lowStockIngredients
      }}
      latestMorningBrief={latestMorningBrief}
      activeTables={activeTables}
      totalTables={totalTables}
      overdueTables={overdueTables}
      paymentWaiting={paymentWaiting}
      openOrderCount={openOrderCount}
      bestSeller={bestSeller}
      focusedTables={focusedTables}
      recentActionOrders={recentActionOrders}
      maxHourlyRevenue={maxHourlyRevenue}
      maxHourlyOrders={maxHourlyOrders}
      peakHours={peakHours}
      totalSourceOrders={totalSourceOrders}
      totalPaymentValue={totalPaymentValue}
      kitchenLoad={kitchenLoad}
      serviceHealthScore={serviceHealthScore}
      salesForecast={salesForecast}
      showActivationPanel={showActivationPanel}
      priorityCards={priorityCards}
      commandSignals={commandSignals}
      activationRunway={activationRunway}
      operationInsightsDeck={generatedOperationInsights}
      recommendationDeck={recommendationDeck}
    />
  );
}
