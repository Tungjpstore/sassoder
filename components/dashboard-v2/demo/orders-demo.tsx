"use client";

import { useState } from "react";
import { Check, Clock3, CreditCard, Eye, Filter, QrCode, Truck, Utensils } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { Button } from "../button";
import { EmptyState } from "../primitives";
import { Modal } from "../overlay";
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

const CHANNEL_ICON: Record<DemoChannel, React.ReactNode> = {
  qr: <QrCode size={13} />,
  takeaway: <Utensils size={13} />,
  delivery: <Truck size={13} />
};

const STATUS_ICON: Record<DemoStatus, React.ReactNode> = {
  new: <Utensils size={16} />,
  cooking: <Check size={16} />,
  ready: <Check size={16} />,
  payment: <CreditCard size={16} />,
  done: <Check size={16} />
};

export function OrdersDemo() {
  const orders = useOrders();
  const [tab, setTab] = useState<"all" | DemoStatus>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const counts: Record<string, number> = { all: orders.length, new: 0, cooking: 0, ready: 0, payment: 0 };
  orders.forEach((o) => (counts[o.status] = (counts[o.status] ?? 0) + 1));
  const visible = tab === "all" ? orders : orders.filter((o) => o.status === tab);
  const current = orders.find((o) => o.id === detailId) ?? null;

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow={`Realtime · ${orders.length} đơn đang mở`} title="Đơn hàng">
        <Button variant="secondary" size="md" onClick={() => setFilterOpen(true)}><Filter size={15} /> Lọc nâng cao</Button>
      </Toolbar>

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "new", label: "Đơn mới", count: counts.new },
          { key: "cooking", label: "Đang làm", count: counts.cooking },
          { key: "ready", label: "Sẵn sàng", count: counts.ready },
          { key: "payment", label: "Chờ thu", count: counts.payment }
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState icon={<Utensils size={22} />} title="Không có đơn ở mục này" description="Đơn mới sẽ hiện ngay khi khách gọi món." />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => (
            <OrderCard key={o.id} order={o} onAdvance={() => ordersStore.advance(o.id)} onDetail={() => setDetailId(o.id)} />
          ))}
        </div>
      )}

      <OrderDetailDrawer
        order={current ? buildDetail(current) : null}
        open={Boolean(current)}
        onClose={() => setDetailId(null)}
        onAdvance={current ? () => ordersStore.advance(current.id) : undefined}
      />
      <AdvancedFilterModal open={filterOpen} onClose={() => setFilterOpen(false)} />
    </div>
  );
}

function OrderCard({ order, onAdvance, onDetail }: { order: DemoOrder; onAdvance: () => void; onDetail: () => void }) {
  const m = STATUS_META[order.status];
  const overdue = elapsedMin(order) >= 10;
  const ch = CHANNEL_META[order.channel];

  return (
    <article className="relative flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: m.accent }} />
      <header className="flex items-start justify-between gap-3 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{order.table}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {CHANNEL_ICON[order.channel]}
            {ch.label}
            <span className="text-[var(--d-text-faint)]">·</span>
            <span className="d-num">{orderQty(order)} món</span>
          </span>
        </div>
        <span className="inline-flex items-center rounded-[var(--d-r-pill)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]" style={{ background: m.chipBg, color: m.chipText }}>
          {m.label}
        </span>
      </header>
      <p className="line-clamp-2 px-[var(--d-s-4)] pb-3 text-[length:var(--d-fs-sm)] leading-snug text-[var(--d-text-muted)]">
        {order.items.map((i) => `${i.qty}x ${i.name}`).join(" · ")}
      </p>
      <div className="flex items-center justify-between border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2.5">
        <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{fmtVnd(orderTotal(order))}</span>
        <span className={cn("inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold", overdue ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text-faint)]")}>
          <Clock3 size={13} />
          {elapsedMin(order) === 0 ? "vừa xong" : `${elapsedMin(order)}'`}
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr]">
        <button type="button" onClick={onDetail} className="flex h-12 items-center justify-center gap-1.5 border-r border-[var(--d-line)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]">
          <Eye size={16} /><span className="hidden sm:inline">Chi tiết</span>
        </button>
        <button type="button" onClick={onAdvance} className="flex h-12 items-center justify-center gap-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-on-jade)] transition active:scale-[0.99]" style={{ background: m.accent }}>
          {STATUS_ICON[order.status]}
          {m.cta}
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

function AdvancedFilterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Lọc đơn nâng cao" subtitle="Đơn hàng realtime" footer={
      <div className="flex justify-end gap-2"><Button variant="secondary" size="md" onClick={onClose}>Đặt lại</Button><Button variant="primary" size="md" onClick={onClose}>Áp dụng lọc</Button></div>
    }>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Kênh</span><select className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"><option>Tất cả kênh</option><option>QR tại bàn</option><option>Mang đi</option><option>Giao hàng</option></select></label>
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Thanh toán</span><select className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"><option>Tất cả</option><option>Chưa thu</option><option>Chờ xác nhận VietQR</option><option>Đã thu</option></select></label>
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Bàn / mã đơn</span><input placeholder="VD: Bàn 07, #A07" className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Quá giờ từ</span><select className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"><option>Không lọc</option><option>5 phút</option><option>10 phút</option><option>15 phút</option></select></label>
      </div>
    </Modal>
  );
}
