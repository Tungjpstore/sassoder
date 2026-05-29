"use client";

import { useState, useEffect, type ElementType } from "react";
import Link from "next/link";
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
  WalletCards,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatVnd } from "@/lib/money";
import type { PaymentMethod } from "@/types/domain";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { AiOpsInsightCards } from "@/components/dashboard/ai-ops-insight-cards";
import { AiRecommendationCards } from "@/components/dashboard/ai-recommendation-cards";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { OnboardingDraftCleanup } from "@/components/dashboard/onboarding-draft-cleanup";

const iconMap = {
  Warehouse,
  ClipboardList,
  WalletCards,
  ChefHat,
  Banknote,
  ReceiptText,
  QrCode,
  RadioTower,
  TrendingUp,
  Gauge,
  UsersRound
} as const;

function getIcon(name: string): ElementType {
  return iconMap[name as keyof typeof iconMap] || Activity;
}

// Type definitions matching database services
type TableOperationalStatus = "available" | "needs_confirm" | "serving" | "overdue" | "awaiting_payment";

type SetupReadiness = {
  score: number;
  completedCount: number;
  totalCount: number;
};

type PriorityCard = {
  title: string;
  value: number;
  helper: string;
  href: string;
  icon: string;
  tone: "green" | "orange" | "red";
};

type OrderRow = {
  id: string;
  status: string;
  total: number;
  paymentMethod: PaymentMethod | string | null;
  createdAt: string;
  tableName: string;
  itemSummary?: string;
};

type HourlyRevenue = {
  label: string;
  revenue: number;
  orderCount: number;
};

type OrderSource = {
  key: "DINE_IN" | "PICKUP" | "DELIVERY";
  label: string;
  count: number;
  revenue: number;
};

type PaymentMethodRow = {
  key: "QR" | "CASH" | "PENDING";
  label: string;
  value: number;
  count: number;
};

type DashboardClientProps = {
  restaurantId: string;
  showOnboardedWelcome: boolean;
  restaurantName: string;
  tenantUrl: string;
  setupReadiness: SetupReadiness;
  operations: {
    pending: number;
    ordering: number;
    completed: number;
    waitingPayment: number;
    waitingConfirm: number;
    paid: number;
    completedToday: number;
    todayOrders: number;
    todayRevenue: number;
    qrRevenue: number;
    cashRevenue: number;
    averageTicket: number;
    openOrderTotal: number;
  };
  tableCount: number;
  menuItemCount: number;
  tables: Array<{
    id: string;
    name: string;
    status: TableOperationalStatus;
    activeOrderCount: number;
    overdueCount: number;
    qr_enabled: boolean;
    unpaidTotal: number;
  }>;
  recentOrders: OrderRow[];
  topItems: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
  monthRevenue: number;
  hourlyRevenueToday: HourlyRevenue[];
  orderSourcesToday: OrderSource[];
  paymentMethodsToday: PaymentMethodRow[];
  inventory: {
    schemaReady: boolean;
    lowStockCount: number;
    activeIngredientCount: number;
    recipeCoveragePercent: number;
    recipeReadyItemCount: number;
    menuItemCount: number;
    lowStockIngredients: Array<{
      name: string;
      unit: string;
      onHandQuantity: number;
      minimumQuantity: number;
      referenceUnitCost: number;
    }>;
  };
  latestMorningBrief: any;
  activeTables: number;
  totalTables: number;
  overdueTables: number;
  paymentWaiting: number;
  openOrderCount: number;
  bestSeller: any;
  focusedTables: any[];
  recentActionOrders: OrderRow[];
  maxHourlyRevenue: number;
  maxHourlyOrders: number;
  peakHours: any[];
  totalSourceOrders: number;
  totalPaymentValue: number;
  kitchenLoad: number;
  serviceHealthScore: number;
  salesForecast: {
    projectedRevenue: number;
    projectedOrders: number;
    trend: "behind" | "ahead" | "normal";
    summary: string;
    actions: string[];
  };
  showActivationPanel: boolean;
  priorityCards: ReadonlyArray<PriorityCard>;
  commandSignals: readonly any[];
  activationRunway: any;
};

function formatOrderTime(value: string) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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

function statusTone(status: string) {
  if (status === "paid") return "green";
  if (status === "completed") return "blue";
  if (status === "waiting_confirm" || status === "waiting_payment") return "yellow";
  if (status === "cancelled") return "red";
  return "neutral";
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

export function AdminDashboardClientLayout(props: DashboardClientProps) {
  const {
    restaurantId,
    showOnboardedWelcome,
    restaurantName,
    tenantUrl,
    setupReadiness,
    operations,
    tableCount,
    menuItemCount,
    tables,
    recentOrders,
    topItems,
    monthRevenue,
    hourlyRevenueToday,
    orderSourcesToday,
    paymentMethodsToday,
    inventory,
    latestMorningBrief,
    activeTables,
    totalTables,
    overdueTables,
    paymentWaiting,
    openOrderCount,
    bestSeller,
    focusedTables,
    recentActionOrders,
    maxHourlyRevenue,
    maxHourlyOrders,
    peakHours,
    totalSourceOrders,
    totalPaymentValue,
    kitchenLoad,
    serviceHealthScore,
    salesForecast,
    showActivationPanel,
    priorityCards,
    commandSignals,
    activationRunway
  } = props;

  // client states
  const [activeTab, setActiveTab] = useState<"tables" | "orders" | "inventory">("tables");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Read user preference for onboarding banner from localStorage
    const dismissed = localStorage.getItem(`onboarding_dismissed_${restaurantId}`);
    if (showActivationPanel && dismissed !== "true") {
      setTimeout(() => {
        setShowOnboarding(true);
      }, 0);
    }
  }, [showActivationPanel, restaurantId]);

  const handleDismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem(`onboarding_dismissed_${restaurantId}`, "true");
  };

  const taskTone = (status: string, priority: string) => {
    if (status === "future") return "border-dashed border-[var(--border)] bg-white/60 text-[var(--muted-foreground)]";
    if (status === "done") return "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]";
    if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
    if (priority === "high") return "border-amber-200 bg-amber-50 text-amber-800";
    return "border-[var(--border)] bg-white/78 text-[var(--foreground)]";
  };

  const launchTone = activationRunway?.launchReady ? "green" : activationRunway?.stage === "launch" ? "yellow" : "blue";
  const stageTone =
    activationRunway?.stage === "scale"
      ? "border-[var(--primary)]/20 bg-[var(--primary)] text-white"
      : activationRunway?.stage === "sell"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : activationRunway?.stage === "configure"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className="grid gap-3">
      {/* ── Mobile Layout ── */}
      <section className="logivn-mobile-overview grid gap-3 md:hidden" aria-label="Tổng quan vận hành mobile">
        <Link href="/dashboard/settings" className="mobile-store-card">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff4df] text-[var(--primary)]">
            <Store size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{restaurantName}</span>
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
                {salesForecast.trend === "behind" ? "↘ chậm nhịp hôm qua" : "↗ ổn định so với hôm qua"}
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

      {/* ── Desktop Layout (Redesigned 3-Zone Control Plane) ── */}
      <div className="hidden gap-3 md:grid md:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
        {/* Zone 2: Main Grid Left Column (75%) */}
        <div className="flex flex-col gap-3 min-w-0">
          
          {/* Onboarding Welcome Panel (Dismissible Banner) */}
          {showOnboarding && activationRunway ? (
            <section className="relative overflow-hidden rounded-xl border border-[var(--primary)]/18 bg-[var(--primary-soft)] px-4 py-4 text-[var(--foreground)] transition-all">
              <button
                onClick={handleDismissOnboarding}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg border border-[var(--primary)]/15 bg-white/70 text-[var(--primary)] transition hover:bg-white"
                title="Đóng bảng hướng dẫn"
              >
                <X size={15} />
              </button>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start pr-6">
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
                    {activationRunway.secondaryActions.map((action: any) => (
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
                    {activationRunway.visibleTasks.map((task: any) => (
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
                    {[
                      { label: "Bàn QR", value: tableCount.toLocaleString("vi-VN"), icon: QrCode },
                      { label: "Món menu", value: menuItemCount.toLocaleString("vi-VN"), icon: ReceiptText },
                      { label: "Readiness", value: `${setupReadiness.score}%`, icon: Gauge }
                    ].map((stat) => {
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
                      {activationRunway.futureActions.map((item: any) => (
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
                </div>
              </div>
            </section>
          ) : null}

          {/* Live Status Bar & Fast Actions */}
          <section className="admin-hero-panel dashboard-wallpaper-stage relative overflow-hidden px-4 py-3.5 rounded-xl border border-[var(--border)]">
            <div className="relative z-[1] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--primary)]/15 bg-white/78 text-[var(--primary)] shadow-[var(--shadow-soft)]">
                  <Store size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="dashboard-eyebrow text-[var(--primary)]">Live operations</p>
                    <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-black text-emerald-800">
                      <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-600" />
                      Ca đồng bộ
                    </span>
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)] mt-0.5">
                    Quán: {restaurantName}
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/orders" className="dashboard-primary-action">
                  <ClipboardList size={16} />
                  Xử lý đơn
                </Link>
                <Link href="/dashboard/kitchen" className="dashboard-secondary-action">
                  <ChefHat size={16} />
                  Bếp
                </Link>
                <Link href="/dashboard/tables" className="dashboard-secondary-action">
                  <QrCode size={16} />
                  Bàn
                </Link>
                <a href={tenantUrl} target="_blank" rel="noreferrer" className="dashboard-secondary-action">
                  <ExternalLink size={16} />
                  Trang gọi món
                </a>
              </div>
            </div>
          </section>

          {/* Operational Metrics Horizontal Row */}
          <section className="grid gap-2 md:grid-cols-5">
            {commandSignals.map((signal) => {
              const Icon = getIcon(signal.icon);
              return (
                <div key={signal.label} className="dashboard-panel dashboard-wallpaper-stage flex flex-col justify-between p-3 min-h-[96px] rounded-xl border border-[var(--border)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase text-[var(--muted-foreground)] tracking-wide">{signal.label}</span>
                    <span className={`grid h-8 w-8 place-items-center rounded-lg border ${priorityTone(signal.tone)}`}>
                      <Icon size={16} />
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="metric-number text-xl font-bold leading-none tabular-nums text-[var(--foreground)]">{signal.value}</p>
                    <p className="mt-1 text-[10px] font-medium text-[var(--muted-foreground)] truncate">{signal.helper}</p>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Main Grid Workspaces with Clean Tab Navigation */}
          <div className="dashboard-panel bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden flex flex-col">
            
            {/* Tab header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--soft-surface)] px-4 py-2">
              <div className="flex gap-2">
                {[
                  { id: "tables", label: "Sơ đồ bàn chú ý", icon: QrCode },
                  { id: "orders", label: "Đơn chưa đóng", icon: ClipboardList },
                  { id: "inventory", label: "Kho & Định lượng", icon: Warehouse }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
                        isActive
                          ? "bg-[var(--primary)] text-white shadow-[var(--glow-primary)]"
                          : "text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                      }`}
                    >
                      <Icon size={14} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Auxiliary Quick Links per active tab */}
              <div>
                {activeTab === "tables" && (
                  <Link href="/dashboard/tables" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline">
                    Quản lý sơ đồ bàn <ArrowRight size={13} />
                  </Link>
                )}
                {activeTab === "orders" && (
                  <Link href="/dashboard/orders" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline">
                    Xem tất cả đơn hàng <ArrowRight size={13} />
                  </Link>
                )}
                {activeTab === "inventory" && (
                  <Link href="/dashboard/inventory" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--primary)] hover:underline">
                    Vào kho nguyên liệu <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            </div>

            {/* Tab Content body */}
            <div className="p-4 min-h-[300px]">
              
              {/* Tab 1: Tables List */}
              {activeTab === "tables" && (
                <div>
                  {focusedTables.length === 0 ? (
                    <div className="grid min-h-[200px] place-items-center rounded-xl border border-dashed border-[var(--border)] px-3 text-center text-sm text-[var(--muted-foreground)]">
                      Tất cả bàn của quán đang ở trạng thái ổn định.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {focusedTables.map((table) => (
                        <Link
                          key={table.id}
                          href="/dashboard/tables"
                          className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3.5 transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-soft)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-[var(--foreground)] group-hover:text-[var(--primary)]">{table.name}</span>
                              <span className="block text-[11px] font-semibold text-[var(--muted-foreground)] mt-0.5">{tableStatusLabel(table.status)}</span>
                            </span>
                            <Badge tone={table.status === "overdue" ? "red" : table.status === "awaiting_payment" ? "yellow" : "blue"}>
                              {formatVnd(table.unpaidTotal)}
                            </Badge>
                          </div>
                          <div className="mt-3 pt-3 border-t border-[var(--border)]/35 flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-semibold">
                            <span>{table.activeOrderCount} đơn đang hoạt động</span>
                            {table.overdueCount > 0 && <span className="text-[var(--accent-strong)]">{table.overdueCount} lần quá giờ</span>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Orders List */}
              {activeTab === "orders" && (
                <div>
                  {recentActionOrders.length === 0 ? (
                    <div className="grid min-h-[200px] place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm text-[var(--muted-foreground)]">
                      Không có đơn hàng nào chưa đóng trong ca hiện tại.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {recentActionOrders.map((order) => (
                        <Link
                          key={order.id}
                          href="/dashboard/orders"
                          className="group rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3.5 transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-soft)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xs font-bold text-[var(--primary)]">DH{order.id.slice(0, 5).toUpperCase()}</span>
                            <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">{formatOrderTime(order.createdAt)}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-[var(--foreground)]">{order.tableName}</span>
                              <span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{order.itemSummary}</span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              <Badge tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
                              <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">{paymentMethodLabel(order.paymentMethod as PaymentMethod | null)}</span>
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Inventory List */}
              {activeTab === "inventory" && (
                <div>
                  {!inventory.schemaReady ? (
                    <div className="grid min-h-[200px] place-items-center rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted-foreground)]">
                      Hệ thống kho và định lượng chưa được kích hoạt cho quán này.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Nguyên liệu theo dõi</p>
                          <p className="metric-number mt-1 text-xl font-bold">{inventory.activeIngredientCount}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Nguyên liệu sắp hết</p>
                          <p className="metric-number mt-1 text-xl font-bold text-[var(--accent-strong)]">{inventory.lowStockCount}</p>
                        </div>
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)]">Định lượng món ăn</p>
                          <p className="metric-number mt-1 text-xl font-bold">{inventory.recipeCoveragePercent.toFixed(0)}% ({inventory.recipeReadyItemCount}/{inventory.menuItemCount})</p>
                        </div>
                      </div>

                      {inventory.lowStockIngredients.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted-foreground)]">
                          Không có nguyên liệu nào ở mức báo động thiếu.
                        </div>
                      ) : (
                        <div className="mt-2 rounded-xl border border-[var(--border)] overflow-hidden">
                          <table className="w-full text-left text-xs font-semibold text-[var(--foreground)]">
                            <thead className="bg-[var(--soft-surface)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                              <tr>
                                <th className="px-4 py-2">Nguyên liệu</th>
                                <th className="px-4 py-2">Đơn vị</th>
                                <th className="px-4 py-2 text-right">Tồn thực tế</th>
                                <th className="px-4 py-2 text-right">Mức tối thiểu</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]/35">
                              {inventory.lowStockIngredients.slice(0, 4).map((ingredient) => (
                                <tr key={ingredient.name} className="hover:bg-[var(--soft-surface)]/40">
                                  <td className="px-4 py-2.5 font-bold">{ingredient.name}</td>
                                  <td className="px-4 py-2.5">{ingredient.unit}</td>
                                  <td className="px-4 py-2.5 text-right text-[var(--accent-strong)]">{ingredient.onHandQuantity.toLocaleString("vi-VN")}</td>
                                  <td className="px-4 py-2.5 text-right">{ingredient.minimumQuantity.toLocaleString("vi-VN")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Revenue Rhythm (Interactive CSS-only Chart) */}
          <section className="dashboard-panel bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow">Revenue rhythm</p>
                <h2 className="dashboard-section-title mt-1">Doanh thu theo giờ (Hôm nay)</h2>
              </div>
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--muted-foreground)]">
                <Activity size={14} />
                {operations.todayOrders} đơn hôm nay
              </span>
            </div>

            {/* CSS Chart with Custom styled tooltips */}
            <div className="mt-6 grid h-[180px] grid-cols-[repeat(18,minmax(8px,1fr))] items-end gap-2 relative">
              {hourlyRevenueToday.map((row) => {
                const revenueHeight = Math.max(row.revenue > 0 ? 12 : 3, Math.round((row.revenue / maxHourlyRevenue) * 100));
                const orderHeight = Math.max(row.orderCount > 0 ? 10 : 2, Math.round((row.orderCount / maxHourlyOrders) * 74));
                return (
                  <div key={row.label} className="group flex min-w-0 flex-col items-center gap-1 relative">
                    
                    {/* Glassmorphism custom styled tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 rounded-lg border border-[var(--primary)]/15 bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)] backdrop-blur-md">
                      <p className="text-[10px] font-black text-[var(--primary)] border-b border-[var(--border)]/20 pb-1 mb-1">{row.label}</p>
                      <p className="text-xs font-bold text-[var(--foreground)]">{formatVnd(row.revenue)}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)] font-semibold mt-0.5">{row.orderCount} đơn hàng</p>
                    </div>

                    <div className="flex h-[130px] w-full items-end justify-center gap-1 rounded-t-lg bg-[var(--surface-container)] px-1 pb-1">
                      <span
                        className="w-full max-w-3 rounded-t-full bg-[var(--primary)] transition group-hover:bg-[var(--primary-hover)] cursor-pointer"
                        style={{ height: `${revenueHeight}%` }}
                      />
                      <span
                        className="w-full max-w-2 rounded-t-full bg-[var(--accent)]/75 cursor-pointer"
                        style={{ height: `${orderHeight}%` }}
                      />
                    </div>
                    <span className="hidden text-[10px] font-bold text-[var(--muted-foreground)] sm:block">
                      {row.label.slice(0, 2)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />Doanh thu</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />Số đơn</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--primary)] font-bold">
                Cao điểm: {peakHours.length > 0 ? peakHours.map((row) => row.label).join(", ") : "Chưa có"}
              </span>
            </div>
          </section>

          {/* Order Sources & Cash Control */}
          <section className="grid gap-3 sm:grid-cols-2">
            
            {/* Order Sources card */}
            <div className="dashboard-panel bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl">
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
                            <span className="block truncate text-sm font-bold">{source.label}</span>
                            <span className="block text-xs font-semibold text-[var(--muted-foreground)]">{compactVnd(source.revenue)}</span>
                          </span>
                        </span>
                        <span className="metric-number text-lg font-bold tabular-nums">{source.count}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-container)]">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cash Control card */}
            <div className="dashboard-panel bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl">
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
                        <span className="font-bold text-[var(--foreground)]">{row.label}</span>
                        <span className="metric-number font-bold tabular-nums">{compactVnd(row.value)}</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-container)]">
                        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
                      </div>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{row.count} giao dịch</p>
                    </div>
                  );
                })}
              </div>
              <Link href="/dashboard/payments" className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--primary)] transition hover:border-[var(--primary)]/30">
                Đối soát thanh toán trong ca <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        </div>

        {/* Zone 3: AI Copilot Right Column Panel (25%) */}
        <aside className="flex flex-col gap-3 min-w-0">
          
          {/* Health and Morning Brief Summary Card */}
          <div className="dashboard-panel bg-gradient-to-br from-[var(--primary-soft)] to-white border border-[var(--primary)]/15 p-4 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="dashboard-eyebrow text-[var(--primary)]">LogiBot Copilot</span>
              <Badge tone={serviceHealthScore >= 82 ? "green" : serviceHealthScore >= 62 ? "yellow" : "red"}>
                Health {serviceHealthScore}%
              </Badge>
            </div>
            <h3 className="text-base font-bold text-[var(--foreground)] mt-2">Đề xuất vận hành hôm nay</h3>
            <p className="text-xs font-semibold text-[var(--muted-foreground)] mt-1.5 leading-relaxed">
              {salesForecast.trend === "behind"
                ? "Dữ liệu dự báo AI cho thấy ca bán đang chậm nhịp so với hôm qua. Cân nhắc chạy ưu đãi giờ vàng."
                : "Nhịp độ bán hàng đang ổn định. Không có rủi ro lớn từ nhà bếp."}
            </p>
          </div>

          {/* AI Insights Deck Component */}
          <div className="dashboard-panel bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[var(--border)]/35 pb-2">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">AI Operations</p>
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" />
            </div>
            <AiOpsInsightCards deck={latestMorningBrief ?? []} morningBrief={latestMorningBrief} />
          </div>

          {/* AI Recommendations component */}
          <div className="dashboard-panel bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[var(--border)]/35 pb-2">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Khuyến nghị của AI</p>
            </div>
            <AiRecommendationCards deck={latestMorningBrief ?? []} schemaReady={true} />
          </div>

          {/* Priority Cards breakdown */}
          <div className="dashboard-panel bg-[var(--surface)] border border-[var(--border)] p-4 rounded-xl flex flex-col gap-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)] border-b border-[var(--border)]/35 pb-2">Việc nên làm trước</p>
            <div className="grid gap-2">
              {priorityCards.map((card) => {
                const Icon = getIcon(card.icon);
                const isAlert = card.tone !== "green";
                return (
                  <Link
                    key={card.title}
                    href={card.href}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5 transition hover:border-[var(--primary)]"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`grid h-8 w-8 place-items-center rounded-lg border shrink-0 ${priorityTone(card.tone)}`}>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-[var(--foreground)]">{card.title}</span>
                        <span className="block text-[10px] text-[var(--muted-foreground)] font-semibold mt-0.5 truncate">{card.helper}</span>
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="metric-number text-base font-bold tabular-nums text-[var(--foreground)]">{card.value}</span>
                      {isAlert && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
