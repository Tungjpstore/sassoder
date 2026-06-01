import { ReceiptText, ShoppingBasket, Users, WalletCards } from "lucide-react";
import { AdminShell } from "@/components/dashboard/app-shell";
import { AnalyticsExportActions } from "@/components/dashboard/analytics-export-actions";
import { requireDashboardAccess } from "@/lib/dashboard-access";
import { formatVnd } from "@/lib/money";
import { getAdminReport } from "@/services/dashboard-report-service";
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
