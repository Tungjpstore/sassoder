import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  ChefHat,
  ClipboardList,
  ExternalLink,
  QrCode,
  ReceiptText,
  ShoppingBag,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { Badge } from "@/components/ui/badge";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { buildTenantUrl } from "@/lib/tenant-domain";
import { getAdminDashboardOverview } from "@/services/dashboard-overview-service";
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
  if (tone === "red") return "border-[#E11D48]/25 bg-[#FFF1F2] text-[#BE123C]";
  if (tone === "orange") return "border-[#F28C28]/30 bg-[#FFF7ED] text-[#C76312]";
  return "border-[#0F4D3A]/18 bg-[#F4F8F5] text-[#0F4D3A]";
}

export default async function AdminPage() {
  const { session, entitlement } = await requireDashboardAccess("core_dashboard");

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
        <AdminDashboardContent restaurantId={session.restaurantId} />
      </Suspense>
    </AdminShell>
  );
}

function AdminDashboardSkeleton() {
  return (
    <div className="grid gap-3">
      <section className="animate-pulse rounded-xl border border-[var(--border)] bg-white p-5" style={{ minHeight: 100 }} />
      <section className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-white p-4" style={{ minHeight: 96 }} />
        ))}
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-[var(--border)] bg-white p-4" style={{ minHeight: 240 }} />
        ))}
      </section>
    </div>
  );
}

async function AdminDashboardContent({ restaurantId }: { restaurantId: string }) {
  const { dashboard, operations, tables, recentOrders, topItems, monthRevenue } = await getAdminDashboardOverview(restaurantId);
  const tenantUrl = buildTenantUrl(dashboard.restaurant.slug, "/");
  const totalTables = Math.max(tables.length, dashboard.tables);
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

  const priorityCards = [
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
    { label: "Tháng này", value: formatVnd(monthRevenue), meta: "Doanh thu", icon: TrendingUp }
  ];

  return (
    <div className="grid gap-4">
      {/* ── Header strip ── */}
      <section className="dashboard-minimal-card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Live operations</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-[28px]">
            Tổng quan ca bán
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted-foreground)]">
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
          <a href={tenantUrl} target="_blank" rel="noreferrer" className="dashboard-secondary-action">
            <ExternalLink size={16} />
            Link gọi món
          </a>
        </div>
      </section>

      {/* ── Priority cards + Shift metrics — balanced 2-row layout ── */}
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        {priorityCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href} className="dashboard-minimal-card group flex min-h-[96px] items-center justify-between gap-3 p-4 transition hover:border-[var(--primary)]">
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{card.title}</span>
                <span className="metric-number mt-2 block text-3xl font-semibold tracking-tight text-[var(--foreground)]">{card.value}</span>
                <span className="mt-1 block truncate text-xs font-medium text-[var(--muted-foreground)]">{card.helper}</span>
              </span>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${priorityTone(card.tone)}`}>
                <Icon size={20} />
              </span>
            </Link>
          );
        })}
        {/* Best seller inline card */}
        <div className="dashboard-minimal-card flex items-center gap-3 p-4 max-md:hidden">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
            <TrendingUp size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">Món nổi bật</span>
            <span className="mt-1 block truncate text-sm font-semibold text-[var(--foreground)]">
              {bestSeller ? `${bestSeller.name}` : "Chưa có dữ liệu"}
            </span>
            <span className="block text-xs text-[var(--muted-foreground)]">{bestSeller ? `${bestSeller.quantity} lượt` : "--"}</span>
          </span>
        </div>
      </section>

      {/* ── Shift metrics row ── */}
      <section className="grid gap-3 md:grid-cols-4">
        {shiftMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="admin-stat-tile rounded-[14px] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{metric.label}</p>
                <span className="dashboard-stat-icon">
                  <Icon size={18} />
                </span>
              </div>
              <p className="metric-number mt-3 text-2xl font-semibold text-[var(--foreground)]">{metric.value}</p>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">{metric.meta}</p>
            </div>
          );
        })}
      </section>

      {/* ── Main content: 3-column balanced grid ── */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
        {/* Live Action Center */}
        <div className="lg:col-span-2">
          <AdminLiveActionCenter restaurantId={restaurantId} variant="panel" />
        </div>

        {/* Tables sidebar */}
        <aside className="grid content-start gap-4">
          <div className="dashboard-minimal-card overflow-hidden p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Tables</p>
                <h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Bàn cần chú ý</h2>
              </div>
              <Link href="/dashboard/tables" className="text-xs font-semibold text-[var(--primary)]">Sơ đồ bàn</Link>
            </div>
            <div className="mt-3 grid gap-2">
              {focusedTables.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-3 py-4 text-center text-sm text-[var(--muted-foreground)]">
                  Tất cả bàn đang ổn.
                </div>
              ) : (
                focusedTables.map((table) => (
                  <Link key={table.id} href="/dashboard/tables" className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 transition hover:border-[var(--primary)]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{table.name}</span>
                      <span className="block text-xs text-[var(--muted-foreground)]">{tableStatusLabel(table.status)}</span>
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

      {/* ── Recent orders ── */}
      <section className="dashboard-minimal-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Orders</p>
            <h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">Đơn chưa đóng</h2>
          </div>
          <Link href="/dashboard/orders" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
            Tất cả <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recentActionOrders.length === 0 ? (
            <div className="grid min-h-[100px] place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] px-4 text-center text-sm text-[var(--muted-foreground)] md:col-span-2 xl:col-span-3">
              Không có đơn đang mở.
            </div>
          ) : (
            recentActionOrders.map((order) => (
              <Link key={order.id} href="/dashboard/orders" className="rounded-lg border border-[var(--border)] bg-white px-3 py-3 transition hover:border-[var(--primary)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs font-semibold text-[var(--muted-foreground)]">DH{order.id.slice(0, 5).toUpperCase()}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">{formatOrderTime(order.createdAt)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{order.tableName}</span>
                    <span className="block truncate text-xs text-[var(--muted-foreground)]">{order.itemSummary}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
                    <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">{paymentMethodLabel(order.paymentMethod)}</span>
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
