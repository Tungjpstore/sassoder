import { ReceiptText, ShoppingBasket, TrendingUp, Users, WalletCards } from "lucide-react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AnalyticsExportActions } from "@/components/dashboard/analytics-export-actions";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { formatVnd } from "@/lib/money";
import { getAdminReport } from "@/services/dashboard-report-service";
import type { AdminReport } from "@/services/dashboard-report-service";
import { getRestaurantAdminDashboard } from "@/services/restaurant-service";

export const dynamic = "force-dynamic";

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function deltaLabel(value: number) {
  if (value === 0) return "Không đổi so với kỳ trước";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value)}% so với kỳ trước`;
}

function reportTone(value: number): "green" | "yellow" | "red" {
  if (value >= 85) return "green";
  if (value >= 65) return "yellow";
  return "red";
}

function AnalyticsCommandCenter({ report }: { report: AdminReport }) {
  const revenueMomentum = report.monthRevenueDelta >= 0 ? 100 : Math.max(0, 100 + report.monthRevenueDelta);
  const paidRatio = percent(report.paidOrders, Math.max(report.monthOrders, 1));
  const unpaidRisk = report.unpaidAmount > 0 ? Math.min(30, Math.round(report.unpaidAmount / Math.max(report.monthRevenue, 1) * 100)) : 0;
  const reportScore = Math.max(0, Math.min(100, Math.round((revenueMomentum + paidRatio + Math.max(0, 100 - unpaidRisk)) / 3)));
  const bestCategory = [...report.categoryRows].sort((left, right) => right.revenue - left.revenue)[0] ?? null;
  const bestPeak = [...report.peakHours].sort((left, right) => right.count - left.count)[0] ?? null;
  const checks = [
    {
      id: "revenue",
      label: "Doanh thu không giảm",
      value: `${report.monthRevenueDelta}%`,
      done: report.monthRevenueDelta >= 0
    },
    {
      id: "orders",
      label: "Số đơn không giảm",
      value: `${report.monthOrdersDelta}%`,
      done: report.monthOrdersDelta >= 0
    },
    {
      id: "paid",
      label: "Tỷ lệ đơn đã thu",
      value: `${paidRatio}%`,
      done: paidRatio >= 85
    },
    {
      id: "unpaid",
      label: "Tiền chưa thu thấp",
      value: formatVnd(report.unpaidAmount),
      done: report.unpaidAmount === 0
    }
  ];

  return (
    <section className="dashboard-panel dashboard-command-center dashboard-mobile-report-command mt-4 p-3">
      <div className="grid gap-3 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow">Report command</p>
              <h2 className="dashboard-section-title mt-1">Tóm tắt quyết định kinh doanh</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${reportTone(reportScore) === "green" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : reportTone(reportScore) === "yellow" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--danger-soft)] text-[var(--tertiary)]"}`}>
              Score {reportScore}/100
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Momentum doanh thu</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{report.monthRevenueDelta}%</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Tỷ lệ đã thu</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{paidRatio}%</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Danh mục mạnh</p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--primary)]">{bestCategory?.name ?? "Chưa có"}</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Giờ cao điểm</p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--primary)]">{bestPeak?.label ?? "Chưa có"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Checklist đọc báo cáo</p>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)]">{checks.filter((item) => !item.done).length || "Xong"}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map((item) => (
                <div key={item.id} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                  <span className="truncate text-xs font-semibold text-[var(--foreground)]">{item.label}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.done ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Gợi ý vận hành</p>
              <TrendingUp size={17} className="text-[var(--primary)]" />
            </div>
            <div className="grid gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
              <p className="rounded-lg bg-[var(--soft-surface)] p-3">
                {report.monthRevenueDelta < 0
                  ? "Doanh thu đang giảm, ưu tiên xem giờ thấp điểm và món bán chậm để chạy combo."
                  : "Doanh thu đang giữ nhịp, ưu tiên tăng ticket trung bình bằng upsell món mạnh."}
              </p>
              <p className="rounded-lg bg-[var(--soft-surface)] p-3">
                {report.unpaidAmount > 0
                  ? `Còn ${formatVnd(report.unpaidAmount)} chưa thu, nên đối soát trước khi đọc lợi nhuận.`
                  : "Dòng tiền sạch, có thể dùng báo cáo để ra quyết định menu/nhân sự."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function AdminAnalyticsPage() {
  const { session, entitlement } = await requireDashboardAccess("core_dashboard");
  const [{ dashboard }, report] = await Promise.all([
    getRestaurantAdminDashboard(session.restaurantId),
    getAdminReport(session.restaurantId)
  ]);
  const maxDailyRevenue = Math.max(...report.dailyRevenue.map((point) => point.revenue), 1);
  const maxTopQuantity = Math.max(...report.topItems.map((item) => item.quantity), 1);
  const maxPeak = Math.max(...report.peakHours.map((point) => point.count), 1);
  const paymentBase = report.paymentRows.reduce((sum, row) => sum + row.value, 0);

  const stats = [
    { label: "Doanh thu tháng", value: formatVnd(report.monthRevenue), meta: deltaLabel(report.monthRevenueDelta), icon: WalletCards },
    { label: "Số đơn", value: report.monthOrders.toLocaleString("vi-VN"), meta: deltaLabel(report.monthOrdersDelta), icon: ReceiptText },
    { label: "Giá trị đơn trung bình", value: formatVnd(report.averageTicket), meta: deltaLabel(report.averageTicketDelta), icon: ShoppingBasket },
    { label: "Đơn đã thanh toán", value: report.paidOrders.toLocaleString("vi-VN"), meta: `${formatVnd(report.unpaidAmount)} chưa thanh toán`, icon: Users }
  ];

  return (
    <AdminShell
      title="Báo cáo"
      restaurantName={dashboard.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Theo dõi hiệu quả kinh doanh, món bán chạy và xu hướng hoạt động"
    >
      <AnalyticsExportActions />

      <section className="dashboard-analytics-metric-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="admin-stat-tile rounded-[14px] p-4">
              <div className="flex items-start gap-4">
                <span className="dashboard-stat-icon">
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase text-[var(--muted-foreground)]">{stat.label}</span>
                  <span className="metric-number mt-1 block text-2xl font-semibold text-[var(--foreground)]">{stat.value}</span>
                  <span className={`mt-1 block text-sm font-medium ${stat.meta.startsWith("↓") ? "text-[var(--accent-strong)]" : "text-[var(--primary)]"}`}>{stat.meta}</span>
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <AnalyticsCommandCenter report={report} />

      <section className="dashboard-analytics-split mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="dashboard-panel dashboard-analytics-panel p-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Doanh thu theo ngày</h2>
          <div className="dashboard-analytics-chart mt-5 h-72 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-5">
            <div className="relative h-full border-b border-l border-[var(--border)]">
              <div className="absolute inset-x-0 bottom-1/4 border-t border-dashed border-[rgba(169,197,161,0.4)]" />
              <div className="absolute inset-x-0 bottom-2/4 border-t border-dashed border-[rgba(169,197,161,0.4)]" />
              <div className="absolute inset-x-0 bottom-3/4 border-t border-dashed border-[rgba(169,197,161,0.4)]" />
              <div className="absolute inset-x-4 bottom-0 flex h-full items-end gap-2">
                {report.dailyRevenue.map((point, index) => (
                  <div key={point.date} className="flex flex-1 flex-col items-center justify-end gap-2">
                    <span className="w-full rounded-t-md bg-[var(--primary)]" style={{ height: `${Math.max(percent(point.revenue, maxDailyRevenue), point.revenue > 0 ? 6 : 1)}%` }} />
                    {index % 2 === 0 && <span className="text-[10px] font-medium text-[var(--muted-foreground)]">{point.label}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-panel dashboard-analytics-panel p-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Top món bán chạy</h2>
          <div className="mt-6 grid gap-4">
            {report.topItems.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-center text-sm font-medium text-[var(--muted-foreground)]">
                Chưa có dữ liệu món đã gọi trong tháng này.
              </p>
            )}
            {report.topItems.slice(0, 5).map((item) => (
              <div key={item.id} className="dashboard-analytics-rank-row grid grid-cols-[140px_minmax(0,1fr)_42px] items-center gap-3">
                <span className="truncate text-sm font-semibold">{item.name}</span>
                <span className="h-3 overflow-hidden rounded-full bg-[var(--tertiary-soft)]">
                  <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent(item.quantity, maxTopQuantity)}%` }} />
                </span>
                <span className="metric-number text-right text-sm font-semibold">{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-analytics-split mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="dashboard-panel dashboard-analytics-panel p-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Tỷ lệ thanh toán</h2>
          <div className="dashboard-analytics-payment mt-5 grid gap-5 md:grid-cols-[170px_1fr]">
            <div
              className="grid h-40 w-40 place-items-center rounded-full"
              style={{
                background: `conic-gradient(${report.paymentRows.map((row, index) => {
                  const start = report.paymentRows.slice(0, index).reduce((sum, item) => sum + percent(item.value, paymentBase), 0);
                  const end = start + percent(row.value, paymentBase);
                  return `${row.color} ${start}% ${Math.max(end, start + (row.value > 0 ? 2 : 0))}%`;
                }).join(", ") || "var(--tertiary-soft) 0 100%"})`
              }}
            >
              <div className="h-24 w-24 rounded-full bg-white" />
            </div>
            <div className="grid content-center gap-3">
              {report.paymentRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[12px_1fr_auto] items-center gap-3 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ background: row.color }} />
                  <span className="font-semibold">{row.label}</span>
                  <span className="metric-number font-semibold">{percent(row.value, paymentBase)}% ({formatVnd(row.value)})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dashboard-panel dashboard-analytics-panel p-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Giờ cao điểm</h2>
          <div className="dashboard-analytics-peak-chart mt-6 grid h-64 grid-cols-[repeat(18,minmax(0,1fr))] items-end gap-2 border-b border-l border-[var(--border)] px-4 pb-5">
            {report.peakHours.map((point, index) => (
              <div key={point.label} className="flex h-full flex-col justify-end gap-2">
                <span className="rounded-t-md bg-[var(--accent)]" style={{ height: `${Math.max(percent(point.count, maxPeak), point.count > 0 ? 6 : 1)}%` }} />
                {index % 3 === 0 && <span className="text-center text-[10px] font-medium text-[var(--muted-foreground)]">{point.label}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-panel dashboard-analytics-panel mt-4 p-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Doanh thu theo danh mục</h2>
        <div className="dashboard-analytics-table mt-4 overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="dashboard-muted-header grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr] gap-3 px-4 py-3 text-xs font-semibold uppercase max-lg:hidden">
            <span>Danh mục</span>
            <span>Doanh thu</span>
            <span>Số đơn</span>
            <span>Số món</span>
            <span>Giá trị đơn TB</span>
          </div>
          {report.categoryRows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">Chưa có dữ liệu danh mục.</div>
          )}
          {report.categoryRows.map((row) => (
            <div key={row.name} className="dashboard-analytics-table-row grid gap-3 border-t border-[var(--border)] px-4 py-3 text-sm lg:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr]">
              <span className="font-semibold" data-label="Danh mục">{row.name}</span>
              <span className="metric-number font-semibold" data-label="Doanh thu">{formatVnd(row.revenue)}</span>
              <span data-label="Số đơn">{row.orderCount}</span>
              <span data-label="Số món">{row.quantity}</span>
              <span className="metric-number" data-label="Giá trị đơn TB">{formatVnd(row.averageTicket)}</span>
            </div>
          ))}
          <div className="dashboard-analytics-table-row dashboard-analytics-table-total grid gap-3 border-t border-[var(--border)] bg-[var(--soft-surface)] px-4 py-3 text-sm font-semibold lg:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr]">
            <span data-label="Danh mục">Tổng cộng</span>
            <span className="metric-number" data-label="Doanh thu">{formatVnd(report.categoryRows.reduce((sum, row) => sum + row.revenue, 0))}</span>
            <span data-label="Số đơn">{report.categoryRows.reduce((sum, row) => sum + row.orderCount, 0)}</span>
            <span data-label="Số món">{report.categoryRows.reduce((sum, row) => sum + row.quantity, 0)}</span>
            <span data-label="Giá trị đơn TB">{formatVnd(report.averageTicket)}</span>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
