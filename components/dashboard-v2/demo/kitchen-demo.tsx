"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Check, ChefHat, Clock3, Coffee, Flame } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { EmptyState, Badge } from "../primitives";
import { useOrders, ordersStore } from "./store";
import { elapsedMin, type DemoOrder } from "./data";
import { cn } from "@/lib/utils";

/* KitchenDemo — KDS đọc trực tiếp từ order pool dùng chung.
 *  - Chỉ hiện đơn status "new" hoặc "cooking" (việc bếp cần làm)
 *  - Timer leo thang theo phút chờ
 *  - Tick từng món; xong hết → đẩy đơn sang "ready" (advance store)
 *  - Trạm bếp suy ra từ station của món
 */

type StationFilter = "all" | "drink" | "hot";

function useTickEverySecond() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
}

function urgencyOf(min: number) {
  if (min < 3) return { label: "Đúng nhịp", bar: "var(--d-ok-fg)", chipBg: "var(--d-ok-bg)", chipFg: "var(--d-ok-fg)", border: "var(--d-line)" };
  if (min < 7) return { label: "Theo dõi", bar: "var(--d-warn-fg)", chipBg: "var(--d-warn-bg)", chipFg: "var(--d-warn-fg)", border: "var(--d-line)" };
  if (min < 10) return { label: "Hơi chậm", bar: "var(--d-orange)", chipBg: "var(--d-accent-soft)", chipFg: "var(--d-orange-600)", border: "var(--d-orange)" };
  return { label: "Quá giờ", bar: "var(--d-danger-fg)", chipBg: "var(--d-danger-bg)", chipFg: "var(--d-danger-fg)", border: "var(--d-danger-fg)" };
}

function fmtMMSS(o: DemoOrder) {
  const totalSec = Math.max(0, Math.floor((Date.now() - o.startedAt) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATION_META = {
  drink: { icon: <Coffee size={14} />, label: "Pha chế" },
  hot: { icon: <Flame size={14} />, label: "Bếp nóng" }
};

function orderStation(o: DemoOrder): "drink" | "hot" {
  const hasHot = o.items.some((i) => i.station === "hot" && !i.done);
  return hasHot ? "hot" : "drink";
}

export function KitchenDemo() {
  const orders = useOrders();
  const [tab, setTab] = useState<StationFilter>("all");
  useTickEverySecond();

  const queue = useMemo(
    () => orders.filter((o) => o.status === "new" || o.status === "cooking").sort((a, b) => a.startedAt - b.startedAt),
    [orders]
  );

  const counts = {
    all: queue.length,
    drink: queue.filter((o) => orderStation(o) === "drink").length,
    hot: queue.filter((o) => orderStation(o) === "hot").length
  };
  const visible = tab === "all" ? queue : queue.filter((o) => orderStation(o) === tab);

  const urgentCount = queue.filter((o) => elapsedMin(o) >= 10).length;
  const longest = queue[0] ? fmtMMSS(queue[0]) : "0:00";
  const longestMin = queue[0] ? elapsedMin(queue[0]) : 0;

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Kitchen Display System" title="Bếp" />

      {urgentCount > 0 ? (
        <div className="flex items-center gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] p-[var(--d-s-4)]">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--d-danger-fg)] text-white"><Bell size={18} /></span>
          <div className="flex-1">
            <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-danger-fg)]">{urgentCount} đơn quá 10 phút</p>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Đơn lâu nhất: {longest} — ưu tiên xử lý ngay.</p>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-3 gap-[var(--d-s-3)]">
        <SmallKpi icon={<ChefHat size={16} />} label="Đang chờ" value={String(queue.length)} tone="orange" />
        <SmallKpi icon={<Clock3 size={16} />} label="Lâu nhất" value={longest} tone={longestMin >= 10 ? "danger" : longestMin >= 7 ? "orange" : "info"} />
        <SmallKpi icon={<Check size={16} />} label="Xong hôm nay" value="86" tone="jade" />
      </section>

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as StationFilter)}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "drink", label: "Pha chế", count: counts.drink },
          { key: "hot", label: "Bếp nóng", count: counts.hot }
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState icon={<Check size={22} />} title="Hết món cần làm" description="Tuyệt vời. Bếp đã xử lý hết hàng đợi cho ca này." />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => (
            <TicketCard key={o.id} order={o} onComplete={() => ordersStore.advance(o.id)} onToggle={(i) => ordersStore.toggleItem(o.id, i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SmallKpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "jade" | "orange" | "danger" | "info" }) {
  const toneCls: Record<string, string> = {
    jade: "bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
    orange: "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]",
    danger: "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
    info: "bg-[var(--d-info-bg)] text-[var(--d-info-fg)]"
  };
  return (
    <div className="flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-[var(--d-s-4)] py-[var(--d-s-3)]">
      <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-[var(--d-r-md)]", toneCls[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
        <p className="d-num text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{value}</p>
      </div>
    </div>
  );
}

function TicketCard({ order, onComplete, onToggle }: { order: DemoOrder; onComplete: () => void; onToggle: (idx: number) => void }) {
  const min = elapsedMin(order);
  const u = urgencyOf(min);
  const station = STATION_META[orderStation(order)];
  const doneCount = order.items.filter((i) => i.done).length;
  const allDone = doneCount === order.items.length;

  return (
    <article className={cn("relative flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border-2 bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]", min >= 10 && "animate-[d-fade-up_0.3s_ease]")} style={{ borderColor: u.border }}>
      <div className="h-1.5 w-full" style={{ background: u.bar }} />
      <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-3)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{order.table}</span>
            {order.vip ? <Badge tone="orange">VIP</Badge> : null}
          </div>
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {station.icon}{station.label}<span className="text-[var(--d-text-faint)]">·</span><span className="d-num">{order.code}</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-[var(--d-r-md)] px-2.5 py-1.5 text-[length:var(--d-fs-sm)] font-bold" style={{ background: u.chipBg, color: u.chipFg }}>
          <Clock3 size={14} /><span className="d-num tabular-nums">{fmtMMSS(order)}</span>
        </span>
      </header>

      <div className="px-[var(--d-s-4)] pb-2">
        <div className="flex items-center justify-between text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
          <span>Tiến độ món</span><span className="d-num">{doneCount}/{order.items.length}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]">
          <span className="block h-full rounded-full transition-all" style={{ width: `${(doneCount / order.items.length) * 100}%`, background: u.bar }} />
        </div>
      </div>

      <ul className="flex flex-col gap-1 px-[var(--d-s-3)] pb-2">
        {order.items.map((it, i) => (
          <li key={i}>
            <button type="button" onClick={() => onToggle(i)} className={cn("flex w-full items-center gap-2.5 rounded-[var(--d-r-md)] px-2.5 py-2.5 text-left transition", it.done ? "bg-[var(--d-ok-bg)]/40" : "hover:bg-[var(--d-surface-2)]")}>
              <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-[var(--d-r-sm)] border-2", it.done ? "border-[var(--d-ok-fg)] bg-[var(--d-ok-fg)] text-white" : "border-[var(--d-line-strong)]")}>
                {it.done ? <Check size={14} /> : <span className="d-num text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text-muted)]">{it.qty}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[length:var(--d-fs-sm)] font-semibold", it.done ? "text-[var(--d-text-faint)] line-through" : "text-[var(--d-text)]")}>{it.name}</span>
                {it.note ? <span className="mt-0.5 inline-block rounded-[var(--d-r-sm)] bg-[var(--d-accent-soft)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-orange-600)]">⚠ {it.note}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={onComplete} className={cn("flex h-12 items-center justify-center gap-2 text-[length:var(--d-fs-sm)] font-bold transition active:scale-[0.99]", allDone ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "bg-[var(--d-surface-2)] text-[var(--d-text-muted)] hover:bg-[var(--d-surface-3)]")}>
        <Check size={17} />{allDone ? "Hoàn tất — đẩy ra" : `Còn ${order.items.length - doneCount} món`}
      </button>
    </article>
  );
}
