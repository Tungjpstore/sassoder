"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Banknote, BarChart3, Receipt, ShoppingBasket, TrendingDown, TrendingUp, Users } from "lucide-react";
import { MetricCard, EmptyState, Badge } from "../primitives";
import { AreaChart, BarChart, DonutChart, type Point } from "../charts";
import { Toolbar } from "../workspace-ui";
import { NextSteps } from "../cross-link";
import { RealtimeStatusBadge } from "../realtime";
import { useDashboardRealtime } from "@/hooks/use-dashboard-realtime";
import { cn } from "@/lib/utils";
import type { AdminReport } from "@/services/dashboard-report-service";

function fmt(n: number) { return `${n.toLocaleString("vi-VN")}₫`; }

type Props = { report: AdminReport; restaurantId: string; period?: "weekly" | "monthly" | "yearly" };

const ICONS = [Banknote, Receipt, ShoppingBasket, Users];

export function RealAnalyticsWorkspaceV2({ report, restaurantId, period = "monthly" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rtState = useDashboardRealtime({
    restaurantId,
    workspace: "analytics",
    tables: [{ table: "orders" }],
    pollMs: 60_000,
    debounceMs: 1500
  });

  function setPeriod(next: "weekly" | "monthly" | "yearly") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const stats = [
    { label: "Doanh thu tháng", value: fmt(report.monthRevenue), delta: report.monthRevenueDelta },
    { label: "Số đơn", value: report.monthOrders.toLocaleString("vi-VN"), delta: report.monthOrdersDelta },
    { label: "Đơn TB", value: fmt(report.averageTicket), delta: report.averageTicketDelta },
    { label: "Đã thanh toán", value: report.paidOrders.toLocaleString("vi-VN"), delta: 0 }
  ];

  const dailyPoints: Point[] = report.dailyRevenue.map((p) => ({ label: p.label, value: Math.round(p.revenue / 1_000_000 * 10) / 10 }));
  const peakPoints: Point[] = report.peakHours.map((p) => ({ label: p.label, value: p.count }));
  const paymentBase = report.paymentRows.reduce((s, r) => s + r.value, 0) || 1;
  const totalCategoryRevenue = report.categoryRows.reduce((s, r) => s + r.revenue, 0) || 1;

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Báo cáo" title="Phân tích kinh doanh">
        <RealtimeStatusBadge state={rtState} />
        <div className="inline-flex rounded-[var(--d-r-pill)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-1">
          {(["weekly", "monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-[var(--d-r-pill)] px-3 text-[length:var(--d-fs-xs)] font-semibold transition",
                period === p
                  ? "bg-[var(--d-jade)] text-[var(--d-on-jade)] shadow-[var(--d-sh-sm)]"
                  : "text-[var(--d-text-muted)] hover:text-[var(--d-text)]"
              )}
            >
              {p === "weekly" ? "Tuần" : p === "yearly" ? "Năm" : "Tháng"}
            </button>
          ))}
        </div>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        {stats.map((s, i) => {
          const Icon = ICONS[i] ?? Banknote;
          const trend: { delta: string; direction: "up" | "down" | "flat" } | undefined = i < 3 && s.delta !== 0 ? { delta: `${Math.abs(s.delta)}%`, direction: s.delta > 0 ? "up" : "down" } : undefined;
          return <MetricCard key={s.label} icon={<Icon size={18} />} label={s.label} value={s.value} trend={trend} tone={i === 0 ? "jade" : i === 1 ? "info" : i === 2 ? "orange" : "neutral"} />;
        })}
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="mb-3 flex items-center justify-between"><div><p className="d-eyebrow">Doanh thu</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Theo ngày trong tháng</h3></div><span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Đơn vị: triệu ₫</span></header>
        {dailyPoints.length === 0 ? <EmptyState icon={<BarChart3 size={20} />} title="Chưa có dữ liệu" /> : <AreaChart data={dailyPoints} height={220} valueFormat={(v) => `${v.toFixed(1)}tr`} />}
      </section>

      <section className="grid gap-[var(--d-s-4)] lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
          <header className="mb-3"><p className="d-eyebrow">Khung giờ peak</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Đơn theo giờ</h3></header>
          {peakPoints.length === 0 ? <EmptyState icon={<BarChart3 size={20} />} title="Chưa có dữ liệu giờ" /> : <BarChart data={peakPoints} height={200} />}
        </div>
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)]">
          <header className="mb-3"><p className="d-eyebrow">Cơ cấu thanh toán</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Theo phương thức</h3></header>
          {report.paymentRows.length === 0 ? <EmptyState icon={<Banknote size={20} />} title="Chưa có giao dịch" /> : (
            <DonutChart centerValue={fmt(paymentBase).replace("₫", "")} centerLabel="đã thu" slices={report.paymentRows.map((r) => ({ label: r.label, value: r.value || 1, color: r.color || "var(--d-jade)" }))} />
          )}
        </div>
      </section>

      <section className="grid gap-[var(--d-s-4)] lg:grid-cols-2">
        <article className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
          <header className="border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]"><p className="d-eyebrow">Top món bán chạy</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Theo số lượng</h3></header>
          {report.topItems.length === 0 ? <div className="p-[var(--d-s-5)]"><EmptyState icon={<ShoppingBasket size={20} />} title="Chưa có món bán chạy" /></div> : (
            <div className="divide-y divide-[var(--d-line)]">
              {report.topItems.slice(0, 8).map((it, i) => (
                <div key={it.id} className="flex items-center gap-3 px-[var(--d-s-5)] py-3">
                  <span className="d-num grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--d-primary-soft)] text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{it.name}</span>
                  <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{it.quantity} phần</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
          <header className="border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]"><p className="d-eyebrow">Doanh thu theo nhóm</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Danh mục</h3></header>
          {report.categoryRows.length === 0 ? <div className="p-[var(--d-s-5)]"><EmptyState icon={<BarChart3 size={20} />} title="Chưa có dữ liệu danh mục" /></div> : (
            <div className="divide-y divide-[var(--d-line)]">
              {report.categoryRows.map((c) => {
                const pct = Math.round((c.revenue / totalCategoryRevenue) * 100);
                return (
                  <div key={c.name} className="flex flex-col gap-1.5 px-[var(--d-s-5)] py-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{c.name}</span><span className="d-num text-[length:var(--d-fs-sm)] font-bold">{fmt(c.revenue)}</span></div>
                    <div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--d-surface-3)]"><span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${pct}%` }} /></div><span className="d-num w-10 text-right text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{pct}%</span></div>
                    <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{c.orderCount} đơn · {c.quantity} phần · TB {fmt(c.averageTicket)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-[var(--d-s-3)] sm:grid-cols-3">
        <Signal label="Doanh thu kỳ này" value={fmt(report.monthRevenue)} positive={report.monthRevenueDelta >= 0} />
        <Signal label="Đơn chưa thanh toán" value={fmt(report.unpaidAmount)} tone={report.unpaidAmount > 0 ? "orange" : "ok"} />
        <Signal label="Đơn đã thanh toán" value={String(report.paidOrders)} tone="ok" />
      </section>

      <NextSteps
        items={[
          { href: "/dashboard/payments", label: "Đối soát thanh toán", hint: "Xác nhận VietQR & tiền mặt", icon: <Banknote size={14} /> },
          { href: "/dashboard/menu", label: "Menu món", hint: "Tối ưu giá & combo", icon: <ShoppingBasket size={14} /> },
          { href: "/dashboard/promotions", label: "Khuyến mãi", hint: "Đẩy doanh thu giờ vắng", icon: <TrendingUp size={14} /> }
        ]}
      />
    </div>
  );
}

function Signal({ label, value, positive, tone }: { label: string; value: string; positive?: boolean; tone?: "ok" | "orange" }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
      <div><p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p><p className="d-num mt-1 text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{value}</p></div>
      {positive !== undefined ? (positive ? <TrendingUp size={28} className="text-[var(--d-ok-fg)]" /> : <TrendingDown size={28} className="text-[var(--d-danger-fg)]" />) : <Badge tone={tone === "orange" ? "orange" : "ok"}>{tone === "orange" ? "Theo dõi" : "Tốt"}</Badge>}
    </div>
  );
}
