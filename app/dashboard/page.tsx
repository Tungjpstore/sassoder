import { Suspense, type ElementType } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarCheck,
  ChefHat,
  ChevronDown,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  ExternalLink,
  Gauge,
  MapPin,
  QrCode,
  RadioTower,
  ReceiptText,
  ShoppingBag,
  Store,
  TrendingUp,
  UsersRound,
  Warehouse,
  WalletCards
} from "lucide-react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AiOpsInsightCards } from "@/components/dashboard/ai-ops-insight-cards";
import { AiRecommendationCards } from "@/components/dashboard/ai-recommendation-cards";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { OnboardingDraftCleanup } from "@/components/dashboard/onboarding-draft-cleanup";
import { Badge } from "@/components/ui/badge";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { buildOperationInsights } from "@/lib/ai/operation-insights";
import { buildAiRecommendationDeck } from "@/lib/ai/recommendation-engine";
import { buildAiSalesForecast } from "@/lib/ai/sales-forecast";
import { buildActivationRunway } from "@/lib/dashboard-activation-runway";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { getLatestAiMorningBriefRun } from "@/services/ai-morning-brief-service";
import { persistAiOperationInsightsDeck } from "@/services/ai-operation-insights-service";
import { persistAiRecommendationsFromOperationDeck } from "@/services/ai-recommendation-service";
import { buildStoreSetupReadiness, type StoreSetupReadiness } from "@/services/ai-setup-readiness";
import { getAdminDashboardOverview } from "@/services/dashboard-overview-service";
import { getInventorySnapshot } from "@/services/inventory-service";
import type { TableOperationalStatus } from "@/services/table-service";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function formatOrderTime(value: string) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "paid") return "green";
  if (status === "completed") return "blue";
  if (status === "waiting_confirm" || status === "waiting_payment") return "yellow";
  if (status === "cancelled") return "red";
  return "neutral";
}

function tableStatusLabel(status: TableOperationalStatus) {
  const labels = {
    available: "Trống",
    needs_confirm: "Có đơn mới",
    serving: "Đang ra món",
    overdue: "Quá giờ",
    awaiting_payment: "Chờ thanh toán"
  } satisfies Record<TableOperationalStatus, string>;

  return labels[status];
}

function priorityTone(tone: "green" | "orange" | "red") {
  if (tone === "red") return "border-[var(--accent)]/25 bg-[var(--danger-soft)] text-[var(--accent-strong)]";
  if (tone === "orange") return "border-[var(--accent)]/20 bg-[rgba(245,158,11,0.08)] text-[var(--accent)]";
  return "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]";
}

function compactVnd(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return formatVnd(value);
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

function OnboardingWelcomePanel({
  restaurantName,
  tenantUrl,
  setupReadiness,
  tableCount,
  menuItemCount
}: {
  restaurantName: string;
  tenantUrl: string;
  setupReadiness: StoreSetupReadiness;
  tableCount: number;
  menuItemCount: number;
}) {
  const activationRunway = buildActivationRunway(setupReadiness);
  const launchStats = [
    { label: "Bàn QR", value: tableCount.toLocaleString("vi-VN"), icon: QrCode },
    { label: "Món menu", value: menuItemCount.toLocaleString("vi-VN"), icon: ReceiptText },
    { label: "Readiness", value: `${setupReadiness.score}%`, icon: Gauge }
  ];
  const stageTone =
    activationRunway.stage === "scale"
      ? "border-[var(--primary)]/20 bg-[var(--primary)] text-white"
      : activationRunway.stage === "sell"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : activationRunway.stage === "configure"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-red-200 bg-red-50 text-red-800";
  const taskTone = (status: string, priority: string) => {
    if (status === "future") return "border-dashed border-[var(--border)] bg-white/60 text-[var(--muted-foreground)]";
    if (status === "done") return "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]";
    if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
    if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-800";
    return "border-[var(--border)] bg-white/78 text-[var(--foreground)]";
  };
  const launchTone = activationRunway.launchReady ? "green" : activationRunway.stage === "launch" ? "yellow" : "blue";

  return (
    <section className="relative overflow-hidden rounded-xl border border-[var(--primary)]/18 bg-[var(--primary-soft)] px-4 py-4 text-[var(--foreground)]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-[var(--primary)] px-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-white">
              <CheckCircle2 size={13} />
              Đã tạo quán
            </span>
            <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-black ${stageTone}`}>{activationRunway.riskLabel}</span>
            <span className="text-xs font-bold text-[var(--muted-foreground)]">{activationRunway.progressLabel}</span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] md:text-3xl">{restaurantName}: {activationRunway.title}</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--muted-foreground)]">
            {activationRunway.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={activationRunway.primaryAction.route} className="dashboard-primary-action">
              <ArrowRight size={16} />
              {activationRunway.primaryAction.label}
            </Link>
            {activationRunway.secondaryActions.map((action) => (
              <Link key={action.key} href={action.route} className="dashboard-secondary-action">
                <ArrowRight size={16} />
                {action.label}
              </Link>
            ))}
            <a href={tenantUrl} target="_blank" rel="noreferrer" className="dashboard-secondary-action">
              <ExternalLink size={16} />
              Mở trang gọi món
            </a>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {activationRunway.visibleTasks.map((task) => (
              <Link
                key={task.key}
                href={task.route}
                className={`group min-h-[84px] rounded-lg border px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(17,24,39,0.08)] ${taskTone(task.status, task.priority)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{task.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold opacity-80">{task.action}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-current/15 px-2 py-1 text-[10px] font-black">{task.badge}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <div className="grid grid-cols-3 gap-2">
            {launchStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg border border-[var(--primary)]/12 bg-white/78 px-3 py-2">
                  <Icon size={16} className="text-[var(--primary)]" />
                  <p className="metric-number mt-2 text-xl font-black">{stat.value}</p>
                  <p className="truncate text-[11px] font-bold text-[var(--muted-foreground)]">{stat.label}</p>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-[var(--primary)]/12 bg-white/78 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Activation runway</p>
              <span className="text-xs font-black text-[var(--primary)]">{setupReadiness.completedCount}/{setupReadiness.totalCount}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--primary-soft)]">
              <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${setupReadiness.score}%` }} />
            </div>
            <div className="mt-3 grid gap-2">
              {activationRunway.futureActions.map((item) => (
                <Link key={item.key} href={item.route} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-white/70 px-2 text-xs font-bold transition hover:bg-[var(--primary-soft)]">
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--foreground)]">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--muted-foreground)]">{item.badge}</span>
                  </span>
                  <ArrowRight size={13} className="shrink-0 text-[var(--primary)]" />
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--primary)]/12 bg-white/78 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">First-shift test</p>
              <Badge tone={launchTone}>{activationRunway.launchReady ? "Sẵn sàng" : "Chạy thử"}</Badge>
            </div>
            <div className="mt-3 grid gap-2">
              {activationRunway.launchSteps.map((step, index) => (
                <Link
                  key={step.key}
                  href={step.route}
                  className="grid min-h-[58px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[var(--border)] bg-white/70 px-2 py-2 transition hover:bg-[var(--primary-soft)]"
                >
                  <span className={`grid h-7 w-7 place-items-center rounded-md ${step.done ? "bg-[var(--primary)] text-white" : "bg-[var(--soft-surface)] text-[var(--primary)]"}`}>
                    {step.done ? <CheckCircle2 size={15} /> : <CircleDot size={15} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-[var(--foreground)]">{index + 1}. {step.label}</span>
                    <span className="mt-0.5 block line-clamp-1 text-[10px] font-semibold text-[var(--muted-foreground)]">{step.action}</span>
                  </span>
                  <ArrowRight size={13} className="shrink-0 text-[var(--primary)]" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OwnerDecisionCommandCenter({
  serviceHealthScore,
  openOrderCount,
  activeTables,
  totalTables,
  paymentWaiting,
  pendingOrders,
  overdueTables,
  lowStockCount,
  todayRevenue,
  forecastLabel,
  forecastAction,
  priorityCards
}: {
  serviceHealthScore: number;
  openOrderCount: number;
  activeTables: number;
  totalTables: number;
  paymentWaiting: number;
  pendingOrders: number;
  overdueTables: number;
  lowStockCount: number;
  todayRevenue: number;
  forecastLabel: string;
  forecastAction: string;
  priorityCards: ReadonlyArray<{
    title: string;
    value: number;
    helper: string;
    href: string;
    icon: ElementType;
    tone: "green" | "orange" | "red";
  }>;
}) {
  const firstPriority = priorityCards.find((card) => card.tone === "red") ?? priorityCards.find((card) => card.tone === "orange") ?? null;
  const readinessTone = serviceHealthScore >= 82 ? "green" : serviceHealthScore >= 62 ? "yellow" : "red";
  const checks = [
    {
      id: "orders",
      label: "Đơn mới đã nhận",
      value: pendingOrders.toLocaleString("vi-VN"),
      done: pendingOrders === 0,
      href: "/dashboard/orders"
    },
    {
      id: "kitchen",
      label: "Không có bàn quá giờ",
      value: overdueTables.toLocaleString("vi-VN"),
      done: overdueTables === 0,
      href: "/dashboard/kitchen"
    },
    {
      id: "payment",
      label: "Bill chờ tiền sạch",
      value: paymentWaiting.toLocaleString("vi-VN"),
      done: paymentWaiting === 0,
      href: "/dashboard/payments"
    },
    {
      id: "inventory",
      label: "Kho không thiếu gấp",
      value: lowStockCount.toLocaleString("vi-VN"),
      done: lowStockCount === 0,
      href: "/dashboard/inventory"
    }
  ];

  return (
    <section className="dashboard-panel dashboard-wallpaper-stage p-3">
      <div className="grid gap-3 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="dashboard-content-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow">Owner command</p>
              <h2 className="dashboard-section-title mt-1">Chốt ưu tiên trong ca</h2>
            </div>
            <Badge tone={readinessTone}>Health {serviceHealthScore}%</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="dashboard-content-card rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Doanh thu hôm nay</p>
              <p className="metric-number mt-1 text-xl font-semibold text-[var(--foreground)]">{formatVnd(todayRevenue)}</p>
            </div>
            <div className="dashboard-content-card rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Đơn mở</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{openOrderCount}</p>
            </div>
            <div className="dashboard-content-card rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Bàn hoạt động</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{activeTables}/{totalTables}</p>
            </div>
            <div className="dashboard-content-card rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Forecast AI</p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--primary)]">{forecastLabel}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="dashboard-content-card rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Checklist chủ quán</p>
              <Badge tone={checks.every((item) => item.done) ? "green" : "yellow"}>{checks.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map((item) => (
                <Link key={item.id} href={item.href} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 transition hover:border-[var(--primary)]">
                  <span className="truncate text-xs font-semibold text-[var(--foreground)]">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </Link>
              ))}
            </div>
          </div>

          <div className="dashboard-content-card rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Việc nên làm trước</p>
              <Badge tone={firstPriority?.tone === "red" ? "red" : firstPriority ? "yellow" : "green"}>{firstPriority ? "Có việc" : "Ổn"}</Badge>
            </div>
            {firstPriority ? (
              <Link href={firstPriority.href} className={`block rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)] ${priorityTone(firstPriority.tone)}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{firstPriority.title}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold opacity-80">{firstPriority.helper}</span>
                  </span>
                  <span className="metric-number text-2xl font-semibold">{firstPriority.value}</span>
                </div>
              </Link>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                Không có điểm nghẽn nổi bật. {forecastAction}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
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
  const operationInsights = generatedOperationInsights;
  const aiRecommendationDeck = buildAiRecommendationDeck({ operationInsights, limit: 6 });
  const aiRecommendationsSchemaReady = true;

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

  const priorityCards = [
    {
      title: "Kho thiếu",
      value: inventory.schemaReady ? inventory.lowStockCount : 0,
      helper: inventory.schemaReady ? `${inventory.activeIngredientCount} nguyên liệu` : "Cần bật kho",
      href: "/dashboard/inventory",
      icon: Warehouse,
      tone: inventory.schemaReady && inventory.lowStockCount > 0 ? "orange" : "green"
    },
    {
      title: "Đơn mới",
      value: operations.pending,
      helper: "Nhận đơn",
      href: "/dashboard/orders",
      icon: ClipboardList,
      tone: operations.pending > 0 ? "orange" : "green"
    },
    {
      title: "Chờ thanh toán",
      value: paymentWaiting,
      helper: formatVnd(operations.openOrderTotal),
      href: "/dashboard/payments",
      icon: WalletCards,
      tone: paymentWaiting > 0 ? "orange" : "green"
    },
    {
      title: "Bàn quá giờ",
      value: overdueTables,
      helper: `${activeTables}/${totalTables || 0} bàn bận`,
      href: "/dashboard/kitchen",
      icon: ChefHat,
      tone: overdueTables > 0 ? "red" : "green"
    }
  ] as const;

  const shiftMetrics = [
    { label: "Doanh thu hôm nay", value: formatVnd(operations.todayRevenue), meta: `${operations.paid} đơn`, icon: Banknote },
    { label: "Đơn đang mở", value: openOrderCount, meta: "Chưa đóng", icon: ReceiptText },
    { label: "VietQR", value: `${qrRatio}%`, meta: formatVnd(operations.qrRevenue), icon: QrCode },
    {
      label: "Dự báo cuối ngày",
      value: formatVnd(salesForecast.projectedRevenue),
      meta: salesForecast.trend === "behind" ? "Dưới nhịp" : salesForecast.trend === "ahead" ? "Vượt nhịp" : `${salesForecast.projectedOrders} đơn`,
      icon: RadioTower
    },
    { label: "Tháng này", value: formatVnd(monthRevenue), meta: "Doanh thu", icon: TrendingUp },
    {
      label: "Kho & định mức",
      value: inventory.schemaReady ? `${inventory.recipeCoveragePercent.toFixed(0)}%` : "--",
      meta: inventory.schemaReady ? `${inventory.recipeReadyItemCount}/${inventory.menuItemCount} món` : "Chưa sẵn sàng",
      icon: Warehouse
    }
  ];

  const commandSignals = [
    {
      label: "Sức khoẻ ca",
      value: `${serviceHealthScore}%`,
      helper: serviceHealthScore >= 82 ? "Ổn định" : serviceHealthScore >= 62 ? "Cần theo dõi" : "Cần xử lý ngay",
      icon: Gauge,
      tone: serviceHealthScore >= 82 ? "green" : serviceHealthScore >= 62 ? "orange" : "red"
    },
    {
      label: "Tải bếp",
      value: kitchenLoad,
      helper: `${operations.pending} mới · ${operations.ordering} đang làm`,
      icon: ChefHat,
      tone: kitchenLoad >= 8 ? "red" : kitchenLoad >= 4 ? "orange" : "green"
    },
    {
      label: "Bàn hoạt động",
      value: `${activeTables}/${totalTables || 0}`,
      helper: overdueTables > 0 ? `${overdueTables} bàn quá giờ` : "Không có bàn quá giờ",
      icon: UsersRound,
      tone: overdueTables > 0 ? "red" : activeTables > 0 ? "orange" : "green"
    },
    {
      label: "Tiền chờ thu",
      value: formatVnd(operations.openOrderTotal),
      helper: `${paymentWaiting} bill cần đóng`,
      icon: WalletCards,
      tone: paymentWaiting > 0 ? "orange" : "green"
    },
    {
      label: "Forecast AI",
      value: salesForecast.trend === "behind" ? "Chậm" : salesForecast.trend === "ahead" ? "Tốt" : "Ổn",
      helper: salesForecast.actions[0] ?? salesForecast.summary,
      icon: RadioTower,
      tone: salesForecast.trend === "behind" ? "orange" : "green"
    }
  ] as const;

  return (
    <div className="grid gap-3">
      {showActivationPanel ? (
        <div className="hidden md:block">
          {showOnboardedWelcome ? <OnboardingDraftCleanup /> : null}
          <OnboardingWelcomePanel
            restaurantName={dashboard.restaurant.name}
            tenantUrl={tenantUrl}
            setupReadiness={setupReadiness}
            tableCount={totalTables}
            menuItemCount={dashboard.menuItems}
          />
        </div>
      ) : null}

      <section className="logivn-mobile-overview grid gap-3 md:hidden" aria-label="Tổng quan vận hành mobile">
        <Link href="/dashboard/settings" className="mobile-store-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff4df] text-[var(--primary)]">
            <Store size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{dashboard.restaurant.name}</span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              Đang mở cửa
            </span>
          </span>
          <ChevronDown size={16} className="text-[var(--muted-foreground)]" />
        </Link>

        <div className="mobile-reference-card mobile-revenue-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mobile-card-label">Doanh thu hôm nay</p>
              <p className="metric-number mt-1 text-[1.85rem] font-semibold leading-none text-[var(--foreground)]">{formatVnd(operations.todayRevenue)}</p>
              <p className={`mt-2 text-xs font-semibold ${salesForecast.trend === "behind" ? "text-[var(--accent-strong)]" : "text-[var(--primary)]"}`}>
                {salesForecast.trend === "behind" ? "↘ chậm nhịp hôm qua" : "↗ 18.6% so với hôm qua"}
              </p>
            </div>
            <span className={`mobile-live-chip ${serviceHealthScore >= 82 ? "is-live" : serviceHealthScore >= 62 ? "is-warning" : "is-danger"}`}>
              <RadioTower size={12} />
              Live
            </span>
          </div>
        </div>

        <div className="mobile-kpi-row">
          {[
            { label: "Đơn mở", value: openOrderCount, helper: `${operations.pending} chờ nhận`, href: "/dashboard/orders" },
            { label: "Bàn", value: `${activeTables}/${totalTables || 0}`, helper: overdueTables ? `${overdueTables} quá giờ` : "Đang ổn", href: "/dashboard/tables" },
            { label: "Chờ tiền", value: paymentWaiting, helper: formatVnd(operations.openOrderTotal), href: "/dashboard/payments" }
          ].map((card) => (
            <Link key={card.label} href={card.href} className="mobile-mini-stat">
              <span className="block text-[11px] font-semibold text-[var(--muted-foreground)]">{card.label}</span>
              <span className="metric-number mt-1 block truncate text-[1.35rem] font-semibold text-[var(--foreground)]">{card.value}</span>
              <span className="mt-1 block truncate text-[11px] font-semibold text-[var(--primary)]">{card.helper}</span>
            </Link>
          ))}
        </div>

        <div className="mobile-reference-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="mobile-card-label">Doanh thu trong ca</p>
            <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">24 giờ</span>
          </div>
          <div className="mobile-bar-chart">
            {hourlyRevenueToday.slice(-7).map((row) => {
              const height = Math.max(row.revenue > 0 ? 18 : 6, Math.round((row.revenue / maxHourlyRevenue) * 100));
              return (
                <span key={row.label} className="mobile-bar-col">
                  <span className="mobile-bar" style={{ height: `${height}%` }} />
                  <span className="mobile-bar-label">{row.label.split(":")[0]}</span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="mobile-reference-card">
          <div className="flex items-center justify-between gap-3">
            <p className="mobile-card-label">Cảnh báo</p>
            <Link href="/dashboard/orders" className="inline-flex min-h-10 items-center text-[11px] font-semibold text-[var(--primary)]">
              Xem tất cả
            </Link>
          </div>
          <div className="mt-2 grid gap-2">
            {[
              {
                icon: ClipboardList,
                label: operations.pending > 0 ? `${operations.pending} đơn cần nhận ngay` : "Không có đơn mới bị treo",
                tone: operations.pending > 0 ? "danger" : "ok",
                href: "/dashboard/orders"
              },
              {
                icon: WalletCards,
                label: paymentWaiting > 0 ? `${paymentWaiting} bill chờ xác nhận tiền` : "Dòng tiền trong ca sạch",
                tone: paymentWaiting > 0 ? "warning" : "ok",
                href: "/dashboard/payments"
              },
              {
                icon: Warehouse,
                label: inventory.schemaReady ? `${inventory.lowStockCount} món sắp hết nguyên liệu` : "Kho chưa bật định mức",
                tone: inventory.schemaReady && inventory.lowStockCount > 0 ? "warning" : "ok",
                href: "/dashboard/inventory"
              }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} className={`mobile-alert-row is-${item.tone}`}>
                  <Icon size={15} />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mobile-action-dock" aria-label="Thao tác nhanh trong ca">
          <Link href="/dashboard/orders" className="mobile-green-cta">
            <ClipboardList size={16} />
            Xử lý đơn
          </Link>
          <Link href="/dashboard/kitchen" className="mobile-soft-action">
            <ChefHat size={16} />
            Bếp
          </Link>
          <Link href="/dashboard/tables" className="mobile-soft-action">
            <QrCode size={16} />
            Bàn
          </Link>
        </div>

        <div className="mobile-reference-card mobile-ai-strip">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-white">
            <RadioTower size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--foreground)]">Trợ lý AI - LogiBot</span>
            <span className="mt-0.5 block line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">
              {bestSeller ? `${bestSeller.name} đang bán chạy. ${salesForecast.actions[0] ?? salesForecast.summary}` : salesForecast.summary}
            </span>
            <span className="mobile-ai-prompt-row mt-2">
              <Link href="/dashboard/logibot-ai">Doanh thu</Link>
              <Link href="/dashboard/logibot-ai">Món bán chạy</Link>
              <Link href="/dashboard/logibot-ai">Tồn kho</Link>
            </span>
          </span>
        </div>

        <div className="mobile-reference-card">
          <div className="flex items-center justify-between gap-3">
            <p className="mobile-card-label">Đơn cần nhìn</p>
            <Link href="/dashboard/orders" className="inline-flex min-h-10 items-center text-[11px] font-semibold text-[var(--primary)]">
              Tất cả
            </Link>
          </div>
          <div className="mt-2 grid gap-2">
            {recentActionOrders.length === 0 ? (
              <div className="rounded-xl bg-[#faf6ee] p-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                Không có đơn đang mở.
              </div>
            ) : (
              recentActionOrders.slice(0, 4).map((order) => (
                <Link key={order.id} href="/dashboard/orders" className="mobile-order-row">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">#{order.id.slice(0, 6).toUpperCase()} · {order.tableName}</span>
                    <span className="mt-0.5 block truncate text-xs font-medium text-[var(--muted-foreground)]">{order.itemSummary}</span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] font-semibold text-[var(--accent-strong)]">{formatOrderTime(order.createdAt)}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      <div className="hidden gap-3 md:grid">
      {/* ── Hero welcome strip ── */}
      <section className="admin-hero-panel dashboard-wallpaper-stage relative overflow-hidden px-4 py-3.5">
        <div className="relative z-[1] flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="dashboard-content-card min-w-0 rounded-2xl px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="dashboard-eyebrow">Live operations</p>
              <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-2.5 text-[11px] font-semibold text-[var(--primary)]">
                <RadioTower size={13} />
                Đồng bộ ca bán
              </span>
            </div>
            <h1 className="dashboard-page-title mt-1">
              Tổng quan ca bán
            </h1>
            <p className="dashboard-body-copy mt-1 max-w-lg md:truncate">
              Ưu tiên đơn mới, thanh toán và bàn cần chú ý.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/orders" className="dashboard-primary-action">
              <ClipboardList size={16} />
              Xử lý đơn
            </Link>
            <Link href="/dashboard/online" className="dashboard-secondary-action">
              <ShoppingBag size={16} />
              Bán online
            </Link>
            <Link href="/dashboard/kitchen" className="dashboard-secondary-action">
              <ChefHat size={16} />
              Bếp
            </Link>
            <Link href="/dashboard/inventory" className="dashboard-secondary-action">
              <Warehouse size={16} />
              Kho hàng
            </Link>
            <a href={tenantUrl} target="_blank" rel="noreferrer" className="dashboard-secondary-action">
              <ExternalLink size={16} />
              Link gọi món
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {commandSignals.map((signal) => {
          const Icon = signal.icon;
          return (
            <div key={signal.label} className="dashboard-panel dashboard-wallpaper-stage flex min-h-[104px] items-center gap-3 px-4 py-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${priorityTone(signal.tone)}`}>
                <Icon size={19} />
              </span>
              <div className="dashboard-content-card min-w-0 rounded-xl px-2.5 py-1.5">
                <p className="truncate text-xs font-semibold uppercase text-[var(--muted-foreground)]">{signal.label}</p>
                <p className="metric-number mt-0.5 truncate text-2xl font-semibold tabular-nums">{signal.value}</p>
                <p className="mt-0.5 truncate text-xs font-medium text-[var(--muted-foreground)]">{signal.helper}</p>
              </div>
            </div>
          );
        })}
      </section>

      <OwnerDecisionCommandCenter
        serviceHealthScore={serviceHealthScore}
        openOrderCount={openOrderCount}
        activeTables={activeTables}
        totalTables={totalTables}
        paymentWaiting={paymentWaiting}
        pendingOrders={operations.pending}
        overdueTables={overdueTables}
        lowStockCount={inventory.schemaReady ? inventory.lowStockCount : 0}
        todayRevenue={operations.todayRevenue}
        forecastLabel={salesForecast.trend === "behind" ? "Đang chậm nhịp" : salesForecast.trend === "ahead" ? "Đang vượt nhịp" : "Ổn định"}
        forecastAction={salesForecast.actions[0] ?? salesForecast.summary}
        priorityCards={priorityCards}
      />

      <details className="dashboard-panel dashboard-wallpaper-stage dashboard-advanced-ops-group overflow-hidden p-0">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--primary-soft)] [&::-webkit-details-marker]:hidden">
          <span className="dashboard-content-card min-w-0 rounded-xl px-3 py-2">
            <span className="dashboard-eyebrow block text-[var(--primary)]">Advanced operations</span>
            <span className="mt-1 block truncate text-lg font-black text-[var(--foreground)]">Vận hành nâng cao</span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted-foreground)]">
              AI insight, biểu đồ, dòng tiền, bàn chi tiết và đơn chưa đóng được gom tại đây.
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-2 sm:flex">
            <Badge tone={paymentWaiting > 0 || operations.pending > 0 ? "yellow" : "green"}>
              {operations.pending + paymentWaiting} việc
            </Badge>
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)]">
              <ArrowRight size={16} className="dashboard-advanced-ops-arrow transition" />
            </span>
          </span>
        </summary>
        <div className="grid gap-3 border-t border-[var(--border)] bg-[var(--soft-surface)] p-3">
          <AiOpsInsightCards deck={operationInsights} morningBrief={latestMorningBrief} />
          <AiRecommendationCards deck={aiRecommendationDeck} schemaReady={aiRecommendationsSchemaReady} />

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {priorityCards.map((card) => {
              const Icon = card.icon;
              const isAlert = card.tone !== "green";
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="admin-stat-tile group relative flex min-h-[128px] flex-col justify-between gap-3 p-4"
                >
                  <div className="flex items-start justify-between">
                    <span className={`grid h-10 w-10 place-items-center rounded-xl border ${priorityTone(card.tone)}`}>
                      <Icon size={19} />
                    </span>
                    {isAlert && (
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--accent)]" />
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">{card.title}</p>
                    <p className="metric-number mt-0.5 text-2xl font-semibold tabular-nums">{card.value}</p>
                    <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{card.helper}</p>
                  </div>
                </Link>
              );
            })}

            <div className="admin-stat-tile flex min-h-[128px] items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]">
                <TrendingUp size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Món nổi bật</p>
                <p className="mt-1 truncate text-lg font-semibold text-[var(--foreground)]">
                  {bestSeller ? bestSeller.name : "Chưa có dữ liệu"}
                </p>
                <p className="text-xs font-medium text-[var(--muted-foreground)]">{bestSeller ? `${bestSeller.quantity} lượt gọi` : "--"}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
            {shiftMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="dashboard-panel flex items-center gap-3 px-4 py-3">
                  <span className="dashboard-stat-icon shrink-0">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase text-[var(--muted-foreground)]">{metric.label}</p>
                    <p className="metric-number mt-0.5 text-xl font-semibold tabular-nums">{metric.value}</p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--muted-foreground)]">{metric.meta}</p>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)_minmax(300px,0.85fr)]">
            <div className="dashboard-panel overflow-hidden p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow">Revenue rhythm</p>
                  <h2 className="dashboard-section-title mt-1">Doanh thu theo giờ</h2>
                </div>
                <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--muted-foreground)]">
                  <Activity size={14} />
                  {operations.todayOrders} đơn hôm nay
                </span>
              </div>
              <div className="mt-4 grid h-[172px] grid-cols-[repeat(18,minmax(8px,1fr))] items-end gap-1.5">
                {hourlyRevenueToday.map((row) => {
                  const revenueHeight = Math.max(row.revenue > 0 ? 12 : 3, Math.round((row.revenue / maxHourlyRevenue) * 100));
                  const orderHeight = Math.max(row.orderCount > 0 ? 10 : 2, Math.round((row.orderCount / maxHourlyOrders) * 74));
                  return (
                    <div key={row.label} className="group flex min-w-0 flex-col items-center gap-1">
                      <div className="flex h-[128px] w-full items-end justify-center gap-1 rounded-t-lg bg-[var(--surface-container)] px-1 pb-1">
                        <span
                          className="w-full max-w-3 rounded-t-full bg-[var(--primary)] transition group-hover:bg-[var(--primary-hover)]"
                          style={{ height: `${revenueHeight}%` }}
                          title={`${row.label}: ${formatVnd(row.revenue)}`}
                        />
                        <span
                          className="w-full max-w-2 rounded-t-full bg-[var(--accent)]/75"
                          style={{ height: `${orderHeight}%` }}
                          title={`${row.label}: ${row.orderCount} đơn`}
                        />
                      </div>
                      <span className="hidden text-[10px] font-semibold text-[var(--muted-foreground)] sm:block">
                        {row.label.slice(0, 2)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--muted-foreground)]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />Doanh thu</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />Số đơn</span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--primary)]">
                  Cao điểm: {peakHours.length > 0 ? peakHours.map((row) => row.label).join(", ") : "Chưa có"}
                </span>
              </div>
            </div>

            <div className="dashboard-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow">Order sources</p>
                  <h2 className="dashboard-section-title mt-1">Nguồn đơn hôm nay</h2>
                </div>
                <MapPin size={18} className="text-[var(--primary)]" />
              </div>
              <div className="mt-4 grid gap-3">
                {orderSourcesToday.map((source) => {
                  const width = totalSourceOrders > 0 ? Math.max(8, Math.round((source.count / totalSourceOrders) * 100)) : 0;
                  const SourceIcon = source.key === "DELIVERY" ? ShoppingBag : source.key === "PICKUP" ? CalendarCheck : QrCode;
                  return (
                    <div key={source.key} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                            <SourceIcon size={16} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{source.label}</span>
                            <span className="block text-xs text-[var(--muted-foreground)]">{compactVnd(source.revenue)}</span>
                          </span>
                        </span>
                        <span className="metric-number text-lg font-semibold tabular-nums">{source.count}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-container)]">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="dashboard-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow">Cash control</p>
                  <h2 className="dashboard-section-title mt-1">Dòng tiền trong ca</h2>
                </div>
                <WalletCards size={18} className="text-[var(--primary)]" />
              </div>
              <div className="mt-4 grid gap-3">
                {paymentMethodsToday.map((row) => {
                  const width = totalPaymentValue > 0 ? Math.max(6, Math.round((row.value / totalPaymentValue) * 100)) : 0;
                  const toneClass = row.key === "PENDING" ? "bg-[var(--accent)]" : row.key === "QR" ? "bg-[var(--primary)]" : "bg-[var(--secondary)]";
                  return (
                    <div key={row.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-[var(--foreground)]">{row.label}</span>
                        <span className="metric-number font-semibold tabular-nums">{compactVnd(row.value)}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-container)]">
                        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
                      </div>
                      <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{row.count} giao dịch</p>
                    </div>
                  );
                })}
              </div>
              <Link href="/dashboard/payments" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)]/30">
                Đối soát thanh toán <ArrowRight size={15} />
              </Link>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.85fr)]">
            <div className="min-h-0">
              <AdminLiveActionCenter restaurantId={restaurantId} variant="panel" />
            </div>

            <aside className="grid content-start gap-3">
              <div className="dashboard-panel overflow-hidden p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="dashboard-eyebrow">Tables</p>
                    <h2 className="dashboard-section-title mt-1">Bàn cần chú ý</h2>
                  </div>
                  <Link href="/dashboard/tables" className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--primary)] transition hover:underline">Sơ đồ bàn</Link>
                </div>
                <div className="mt-3 grid gap-2">
                  {focusedTables.length === 0 ? (
                    <div className="grid min-h-[56px] place-items-center rounded-xl border border-dashed border-[var(--border)] px-3 text-center text-sm text-[var(--muted-foreground)]">
                      Tất cả bàn đang ổn.
                    </div>
                  ) : (
                    focusedTables.map((table) => (
                      <Link key={table.id} href="/dashboard/tables" className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5 transition hover:border-[var(--primary)]">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{table.name}</span>
                          <span className="block text-[11px] text-[var(--muted-foreground)]">{tableStatusLabel(table.status)}</span>
                        </span>
                        <Badge tone={table.status === "overdue" ? "red" : table.status === "awaiting_payment" ? "yellow" : "blue"}>
                          {formatVnd(table.unpaidTotal)}
                        </Badge>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </section>

          <section className="dashboard-panel overflow-hidden p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow">Orders</p>
                <h2 className="dashboard-section-title mt-1">Đơn chưa đóng</h2>
              </div>
              <Link href="/dashboard/orders" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] transition hover:underline">
                Tất cả <ArrowRight size={14} />
              </Link>
            </div>
            <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {recentActionOrders.length === 0 ? (
                <div className="grid min-h-[64px] place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm text-[var(--muted-foreground)] md:col-span-2 xl:col-span-3">
                  Không có đơn đang mở.
                </div>
              ) : (
                recentActionOrders.map((order) => (
                  <Link key={order.id} href="/dashboard/orders" className="group rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5 transition hover:border-[var(--primary)]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-semibold text-[var(--primary)]">DH{order.id.slice(0, 5).toUpperCase()}</span>
                      <span className="text-[11px] text-[var(--muted-foreground)]">{formatOrderTime(order.createdAt)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{order.tableName}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{order.itemSummary}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
                        <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">{paymentMethodLabel(order.paymentMethod)}</span>
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      </details>
      </div>
    </div>
  );
}
