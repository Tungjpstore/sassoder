"use client";

import { useState } from "react";
import { Bike, Check, Clock3, Eye, MapPin, Package, Truck } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { MetricCard, EmptyState, Badge } from "../primitives";
import { OrderDetailDrawer, type OrderDetail } from "../order-detail-drawer";
import { useOrders, ordersStore } from "./store";
import { CHANNEL_META, STATUS_META, elapsedMin, fmtVnd, orderTotal, type DemoChannel, type DemoOrder } from "./data";
import { cn } from "@/lib/utils";

/* OnlineDemo — pickup & giao hàng từ cùng order pool. */

type Tab = "all" | "pickup" | "delivery";

export function OnlineDemo() {
  const orders = useOrders();
  const [tab, setTab] = useState<Tab>("all");
  const [sel, setSel] = useState<string | null>(null);

  const onlineOrders = orders.filter((o) => o.channel === "takeaway" || o.channel === "delivery");
  const counts = {
    all: onlineOrders.length,
    pickup: onlineOrders.filter((o) => o.channel === "takeaway").length,
    delivery: onlineOrders.filter((o) => o.channel === "delivery").length
  };
  const visible = tab === "all" ? onlineOrders : tab === "pickup" ? onlineOrders.filter((o) => o.channel === "takeaway") : onlineOrders.filter((o) => o.channel === "delivery");
  const cur = orders.find((o) => o.id === sel) ?? null;

  const delivering = onlineOrders.filter((o) => o.channel === "delivery" && o.status === "cooking").length;
  const waitingPickup = onlineOrders.filter((o) => o.channel === "takeaway" && o.status === "ready").length;
  const totalRevenue = onlineOrders.reduce((s, o) => s + orderTotal(o), 0);

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Pickup & giao hàng" title="Đặt online" />

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Package size={18} />} label="Đơn online" value={String(onlineOrders.length)} tone="jade" />
        <MetricCard icon={<Truck size={18} />} label="Đang giao" value={String(delivering)} tone="orange" />
        <MetricCard icon={<Clock3 size={18} />} label="Chờ khách lấy" value={String(waitingPickup)} tone="info" />
        <MetricCard icon={<Check size={18} />} label="Doanh thu kênh" value={fmtVnd(totalRevenue)} tone="neutral" />
      </section>

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "pickup", label: "Đến lấy", count: counts.pickup },
          { key: "delivery", label: "Giao hàng", count: counts.delivery }
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState icon={<Package size={22} />} title="Chưa có đơn online" description="Các đơn pickup và giao hàng sẽ hiện ở đây." />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => (
            <OnlineCard key={o.id} order={o} onDetail={() => setSel(o.id)} onAdvance={() => ordersStore.advance(o.id)} />
          ))}
        </div>
      )}

      <OrderDetailDrawer
        order={cur ? buildDetail(cur) : null}
        open={Boolean(cur)}
        onClose={() => setSel(null)}
        onAdvance={cur ? () => ordersStore.advance(cur.id) : undefined}
      />
    </div>
  );
}

function OnlineCard({ order, onDetail, onAdvance }: { order: DemoOrder; onDetail: () => void; onAdvance: () => void }) {
  const meta = STATUS_META[order.status];
  const isDelivery = order.channel === "delivery";
  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <span className="h-1" style={{ background: meta.accent }} />
      <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{order.table}</p>
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {isDelivery ? <Bike size={13} /> : <Package size={13} />}
            {order.customer?.name ?? CHANNEL_META[order.channel].label}
          </span>
        </div>
        <Badge tone={order.status === "ready" ? "ok" : order.status === "payment" ? "jade" : order.status === "new" ? "orange" : "info"}>{meta.label}</Badge>
      </header>

      <p className="line-clamp-2 px-[var(--d-s-4)] pb-2 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{order.items.map((i) => `${i.qty}x ${i.name}`).join(" · ")}</p>

      {isDelivery && order.customer?.address ? (
        <p className="line-clamp-1 px-[var(--d-s-4)] pb-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]"><MapPin size={11} className="mr-1 inline" />{order.customer.address}</p>
      ) : null}

      {isDelivery && order.delivery ? (
        <div className="px-[var(--d-s-4)] pb-3">
          <div className="flex items-center justify-between text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
            <span>Tiến độ giao</span>
            <span className="d-num">{Math.round(order.delivery.progress * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--d-surface-3)]">
            <span className="block h-full rounded-full bg-[var(--d-jade)]" style={{ width: `${order.delivery.progress * 100}%` }} />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2.5">
        <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{fmtVnd(orderTotal(order))}</span>
        <span className="inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]"><Clock3 size={12} />{elapsedMin(order)}'</span>
      </div>

      <div className="grid grid-cols-2 border-t border-[var(--d-line)]">
        <button onClick={onDetail} className="flex h-11 items-center justify-center gap-1.5 border-r border-[var(--d-line)] text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"><Eye size={16} /> Chi tiết</button>
        <button onClick={onAdvance} className="flex h-11 items-center justify-center gap-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-on-jade)] transition active:scale-[0.99]" style={{ background: meta.accent }}>
          <Check size={15} />{meta.cta}
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
    delivery: o.delivery
  };
}
