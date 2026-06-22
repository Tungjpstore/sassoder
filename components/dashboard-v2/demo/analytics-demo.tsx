"use client";

import { useState } from "react";
import { Banknote, BarChart3, Download, FileSpreadsheet, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { Toolbar, FilterTabs } from "../workspace-ui";
import { MetricCard, Badge } from "../primitives";
import { Button } from "../button";
import { AreaChart, BarChart, DonutChart, type Point } from "../charts";
import { useToast } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { fmtVnd } from "./data";
import { cn } from "@/lib/utils";

/* AnalyticsDemo — bám sát AdminReport trong services/dashboard-report-service.ts.
 *  Shape mirror: monthRevenue, dailyRevenue, topItems, paymentRows,
 *  peakHours, categoryRows.
 */

const DAILY: Point[] = [
  { label: "T2", value: 6.2 }, { label: "T3", value: 7.4 }, { label: "T4", value: 8.1 }, { label: "T5", value: 7.8 },
  { label: "T6", value: 8.6 }, { label: "T7", value: 12.4 }, { label: "CN", value: 11.2 }
];

const PEAK: Point[] = [
  { label: "7h", value: 4 }, { label: "9h", value: 11 }, { label: "11h", value: 16 }, { label: "12h", value: 23 },
  { label: "14h", value: 9 }, { label: "16h", value: 12 }, { label: "18h", value: 18 }, { label: "20h", value: 14 }
];

const TOP_ITEMS = [
  { name: "Cà phê sữa đá", quantity: 64, revenue: 1_600_000 },
  { name: "Bạc xỉu", quantity: 52, revenue: 1_560_000 },
  { name: "Trà đào cam sả", quantity: 38, revenue: 1_330_000 },
  { name: "Combo 2 ly + bánh", quantity: 31, revenue: 2_170_000 },
  { name: "Bánh mì thịt", quantity: 27, revenue: 810_000 },
  { name: "Caramen", quantity: 22, revenue: 440_000 }
];

const CATEGORIES = [
  { name: "Đồ uống", revenue: 38_400_000, orderCount: 224, quantity: 280 },
  { name: "Đồ ăn", revenue: 14_700_000, orderCount: 78, quantity: 92 },
  { name: "Tráng miệng", revenue: 4_200_000, orderCount: 18, quantity: 22 },
  { name: "Combo", revenue: 4_400_000, orderCount: 31, quantity: 31 }
];

export function AnalyticsDemo() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const toast = useToast();
  const total = CATEGORIES.reduce((s, c) => s + c.revenue, 0);

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Báo cáo & insight" title="Báo cáo">
        <FilterTabs active={period} onChange={(k) => setPeriod(k as typeof period)} tabs={[{ key: "today", label: "Hôm nay" }, { key: "week", label: "Tuần này" }, { key: "month", label: "Tháng này" }]} />
        <Button variant="secondary" size="md" onClick={() => toast.success("Đang xuất báo cáo PDF")}><Download size={15} /> Xuất PDF</Button>
        <Button variant="secondary" size="md" onClick={() => toast.success("Đang xuất Excel")}><FileSpreadsheet size={15} /> Excel</Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<TrendingUp size={18} />} label="Doanh thu" value={fmtVnd(total)} trend={{ delta: "12%", direction: "up" }} tone="jade" />
        <MetricCard icon={<Receipt size={18} />} label="Số đơn" value="324" trend={{ delta: "8%", direction: "up" }} tone="info" />
        <MetricCard icon={<Banknote size={18} />} label="Đơn TB" value={fmtVnd(Math.round(total / 324))} trend={{ delta: "3%", direction: "down" }} tone="orange" />
        <MetricCard icon={<BarChart3 size={18} />} label="Khách quay lại" value="42%" trend={{ delta: "5%", direction: "up" }} tone="neutral" />
      </section>

      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <header className="mb-3 flex items-center justify-between">
          <div><p className="d-eyebrow">Doanh thu</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">7 ngày gần nhất</h3></div>
          <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Đơn vị: triệu ₫</span>
        </header>
        <AreaChart data={DAILY} height={220} valueFormat={(v) => `${v.toFixed(1)}tr`} />
      </section>

      <section className="grid gap-[var(--d-s-4)] lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
          <header className="mb-3"><p className="d-eyebrow">Đơn theo giờ</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Khung giờ peak</h3></header>
          <BarChart data={PEAK} height={200} />
        </div>
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)]">
          <header className="mb-3"><p className="d-eyebrow">Cơ cấu kênh</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Phân bổ doanh thu</h3></header>
          <DonutChart centerValue="324" centerLabel="đơn" slices={[{ label: "QR tại bàn", value: 220, color: "var(--d-jade)" }, { label: "Mang đi", value: 70, color: "var(--d-orange)" }, { label: "Giao hàng", value: 34, color: "var(--d-sage)" }]} />
        </div>
      </section>

      <section className="grid gap-[var(--d-s-4)] lg:grid-cols-2">
        <article className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
          <header className="border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]"><p className="d-eyebrow">Top món bán chạy</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">8 món dẫn đầu</h3></header>
          <div className="divide-y divide-[var(--d-line)]">
            {TOP_ITEMS.map((it, i) => (
              <div key={it.name} className="flex items-center gap-3 px-[var(--d-s-5)] py-3">
                <span className="d-num grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--d-primary-soft)] text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)]">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{it.name}</span>
                <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{it.quantity} phần</span>
                <span className="d-num shrink-0 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{fmtVnd(it.revenue)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
          <header className="border-b border-[var(--d-line)] px-[var(--d-s-5)] py-[var(--d-s-4)]"><p className="d-eyebrow">Doanh thu theo nhóm</p><h3 className="text-[length:var(--d-fs-h3)] font-semibold">Phân bổ danh mục</h3></header>
          <div className="divide-y divide-[var(--d-line)]">
            {CATEGORIES.map((c) => {
              const pct = Math.round((c.revenue / total) * 100);
              return (
                <div key={c.name} className="flex flex-col gap-1.5 px-[var(--d-s-5)] py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{c.name}</span>
                    <span className="d-num text-[length:var(--d-fs-sm)] font-bold">{fmtVnd(c.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--d-surface-3)]"><span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${pct}%` }} /></div>
                    <span className="d-num w-10 text-right text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{pct}%</span>
                  </div>
                  <p className="text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{c.orderCount} đơn · {c.quantity} phần · TB {fmtVnd(Math.round(c.revenue / c.orderCount))}</p>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="grid gap-[var(--d-s-3)] sm:grid-cols-3">
        <Compare label="So với tuần trước" value="+12%" up />
        <Compare label="Đơn huỷ" value="2.1%" tone="orange" />
        <Compare label="Bill chờ thu > 15'" value="0" tone="ok" />
      </section>
    </div>
  );
}

function Compare({ label, value, up, tone }: { label: string; value: string; up?: boolean; tone?: "ok" | "orange" }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]")}>
      <div>
        <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
        <p className="d-num mt-1 text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{value}</p>
      </div>
      {up !== undefined ? (up ? <TrendingUp size={28} className="text-[var(--d-ok-fg)]" /> : <TrendingDown size={28} className="text-[var(--d-danger-fg)]" />) : tone === "orange" ? <Badge tone="orange">Theo dõi</Badge> : tone === "ok" ? <Badge tone="ok">Tốt</Badge> : null}
    </div>
  );
}
