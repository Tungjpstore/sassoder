"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Bell,
  Check,
  ChefHat,
  Clock3,
  CreditCard,
  Eye,
  QrCode,
  TrendingUp,
  Truck,
  Users,
  Utensils
} from "lucide-react";
import { Sparkline } from "../charts";
import { OrderDetailDrawer, type OrderDetail } from "../order-detail-drawer";
import { useOrders, ordersStore } from "./store";
import {
  CHANNEL_META,
  DEMO_TABLES,
  STATUS_META,
  deriveTableStatus,
  elapsedMin,
  fmtVnd,
  orderQty,
  orderTotal,
  type DemoChannel,
  type DemoOrder,
  type DemoStatus
} from "./data";
import { cn } from "@/lib/utils";

/* OverviewDemo v6 — đọc trực tiếp từ shared store. KPI sống theo dữ liệu. */

const CHANNEL_ICON: Record<DemoChannel, React.ReactNode> = {
  qr: <QrCode size={14} />,
  takeaway: <Utensils size={14} />,
  delivery: <Truck size={14} />
};

const CTA_ICON: Record<DemoStatus, React.ReactNode> = {
  new: <ChefHat size={17} />,
  cooking: <Check size={17} />,
  ready: <Check size={17} />,
  payment: <CreditCard size={17} />,
  done: <Check size={17} />
};

export function OverviewDemo() {
  const orders = useOrders();
  const [filter, setFilter] = useState<"all" | DemoStatus>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const counts: Record<string, number> = { all: orders.length, new: 0, cooking: 0, ready: 0, payment: 0 };
  orders.forEach((o) => (counts[o.status] = (counts[o.status] ?? 0) + 1));

  const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const detail = orders.find((o) => o.id === detailId) ?? null;

  // KPI derived từ pool
  const totalSold = useMemo(() => orders.reduce((s, o) => s + orderTotal(o), 0), [orders]);
  const pendingMoney = useMemo(
    () => orders.filter((o) => o.paymentStatus !== "paid").reduce((s, o) => s + orderTotal(o), 0),
    [orders]
  );
  const pendingBills = orders.filter((o) => o.paymentStatus !== "paid").length;
  const totalQty = useMemo(() => orders.reduce((s, o) => s + orderQty(o), 0), [orders]);

  const KPIS = [
    { label: "Doanh thu hôm nay", value: fmtVnd(totalSold + 7_200_000), delta: "+12%", up: true, icon: <TrendingUp size={16} />, spark: [3.2, 5.4, 7.8, 6.2, 11.8, 16.4, 13.2, 7.2, 5.6, 8.8] },
    { label: "Đơn đang xử lý", value: String(orders.length), delta: `+${counts.new}`, up: true, icon: <Check size={16} />, spark: [4, 7, 11, 8, 16, 23, 18, 9, 7, 12] },
    { label: "Món đang phục vụ", value: String(totalQty), delta: "Realtime", up: true, icon: <Users size={16} />, spark: [8, 14, 20, 16, 30, 44, 34, 18, 14, 24] },
    { label: "Tiền chờ thu", value: fmtVnd(pendingMoney), delta: `${pendingBills} bill`, up: false, icon: <Banknote size={16} />, spark: [] }
  ];

  const tabs: { key: "all" | DemoStatus; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "new", label: "Đơn mới" },
    { key: "cooking", label: "Đang làm" },
    { key: "ready", label: "Sẵn sàng" },
    { key: "payment", label: "Chờ thu" }
  ];

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k.label} className="flex flex-col gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
            <div className="flex items-center justify-between">
              <span className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">{k.icon}</span>
              <span className={cn("d-num text-[length:var(--d-fs-xs)] font-semibold", k.up ? "text-[var(--d-ok-fg)]" : "text-[var(--d-orange-600)]")}>
                {k.up ? "↑" : ""} {k.delta}
              </span>
            </div>
            <p className="d-num text-[1.5rem] font-bold leading-none text-[var(--d-text)]">{k.value}</p>
            <div className="flex items-end justify-between gap-2">
              <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{k.label}</p>
              {k.spark.length > 0 ? <Sparkline data={k.spark} stroke={k.up ? "var(--d-jade)" : "var(--d-orange)"} className="h-7 w-14 shrink-0" /> : null}
            </div>
          </div>
        ))}
      </section>

      {/* Khu vận hành */}
      <section className="flex flex-col gap-[var(--d-s-4)]">
        <div className="flex flex-col gap-[var(--d-s-3)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="d-eyebrow text-[var(--d-orange-600)]">Đang diễn ra</p>
            <h2 className="text-[length:var(--d-fs-h1)] font-bold text-[var(--d-text)]">Đơn cần xử lý</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => {
              const active = filter === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFilter(t.key)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-[var(--d-r-pill)] px-3.5 text-[length:var(--d-fs-sm)] font-semibold transition-colors",
                    active
                      ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                      : "border border-[var(--d-line)] bg-[var(--d-surface)] text-[var(--d-text-muted)] hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
                  )}
                >
                  {t.label}
                  <span className={cn("d-num grid h-5 min-w-5 place-items-center rounded-full px-1 text-[length:var(--d-fs-2xs)] font-bold", active ? "bg-white/20 text-[var(--d-on-jade)]" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]")}>
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--d-r-lg)] border border-dashed border-[var(--d-line-strong)] bg-[var(--d-surface-2)] py-[var(--d-s-10)] text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--d-primary-soft)] text-[var(--d-primary)]"><Bell size={22} /></span>
            <p className="text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">Không có đơn nào ở mục này</p>
            <p className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">Đơn mới sẽ hiện ngay khi khách gọi món.</p>
          </div>
        ) : (
          <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((o) => (
              <OrderCard key={o.id} order={o} onAdvance={() => ordersStore.advance(o.id)} onDetail={() => setDetailId(o.id)} />
            ))}
          </div>
        )}
      </section>

      <OrderDetailDrawer
        order={detail ? buildDetail(detail) : null}
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        onAdvance={detail ? () => ordersStore.advance(detail.id) : undefined}
      />
    </div>
  );
}

function OrderCard({ order, onAdvance, onDetail }: { order: DemoOrder; onAdvance: () => void; onDetail: () => void }) {
  const meta = STATUS_META[order.status];
  const channel = CHANNEL_META[order.channel];
  const min = elapsedMin(order);
  const overdue = min >= 10;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition-all duration-[var(--d-dur)] hover:-translate-y-0.5 hover:border-[var(--d-line-strong)] hover:shadow-[var(--d-sh-md)]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: meta.accent }} aria-hidden="true" />

      <header className="flex items-start justify-between gap-3 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{order.table}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {CHANNEL_ICON[order.channel]}
            {channel.label}
            <span className="text-[var(--d-text-faint)]">·</span>
            <span className="d-num">{orderQty(order)} món</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-[var(--d-r-pill)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]" style={{ background: meta.chipBg, color: meta.chipText }}>
          {meta.label}
        </span>
      </header>

      <div className="px-[var(--d-s-4)] pb-3">
        <p className="line-clamp-2 text-[length:var(--d-fs-sm)] leading-snug text-[var(--d-text-muted)]">
          {order.items.map((i) => `${i.qty}x ${i.name}`).join(" · ")}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2.5">
        <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{fmtVnd(orderTotal(order))}</span>
        <span className={cn("inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold", overdue ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text-faint)]")}>
          <Clock3 size={13} />
          {min === 0 ? "vừa xong" : `${min} phút`}
          {overdue ? <span className="ml-1 rounded-[var(--d-r-pill)] bg-[var(--d-danger-bg)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] uppercase">Quá giờ</span> : null}
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <button type="button" onClick={onDetail} className="flex h-12 items-center justify-center gap-1.5 border-r border-[var(--d-line)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)] active:scale-[0.99]">
          <Eye size={16} />
          <span className="hidden sm:inline">Chi tiết</span>
        </button>
        <button type="button" onClick={onAdvance} className="flex h-12 items-center justify-center gap-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-on-jade)] transition active:scale-[0.99]" style={{ background: meta.accent }}>
          {CTA_ICON[order.status]}
          <span>{meta.cta}</span>
          <ArrowRight size={16} className="opacity-80" />
        </button>
      </div>
    </article>
  );
}

function buildDetail(o: DemoOrder): OrderDetail {
  return {
    id: o.id,
    code: o.code,
    table: o.table,
    channel: o.channel,
    customer: o.customer,
    items: o.items.map((i) => ({ name: i.name, qty: i.qty, price: fmtVnd(i.price * i.qty), note: i.note })),
    subtotal: fmtVnd(orderTotal(o)),
    total: fmtVnd(orderTotal(o)),
    paymentMethod: o.paymentMethod === "vietqr" ? "VietQR" : o.paymentMethod === "cash" ? "Tiền mặt" : "Thẻ",
    paymentStatus: o.paymentStatus,
    elapsedMin: elapsedMin(o),
    status: o.status === "done" ? "payment" : o.status,
    delivery: o.delivery,
    floor: o.tableId
      ? {
          selectedId: o.tableId,
          tables: DEMO_TABLES.map((t) => ({
            id: t.id,
            name: t.name,
            seats: t.seats,
            zone: t.zone === "in" ? "Trong nhà" : t.zone === "garden" ? "Sân vườn" : "VIP",
            status: deriveTableStatus(t, [o]),
            x: t.x,
            y: t.y
          }))
        }
      : undefined
  };
}
