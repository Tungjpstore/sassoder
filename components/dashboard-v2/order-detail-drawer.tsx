"use client";

import {
  Bike,
  Check,
  ChefHat,
  Clock3,
  CreditCard,
  Hash,
  MapPin,
  MessageSquare,
  Phone,
  QrCode,
  Receipt,
  Truck,
  User,
  Utensils,
  X
} from "lucide-react";
import { Drawer } from "./overlay";
import { Button } from "./button";
import { Badge } from "./primitives";
import { DeliveryMap, FloorMap, type FloorTable } from "./maps";
import { cn } from "@/lib/utils";

/* OrderDetailDrawer — drawer chi tiết đơn với bản đồ ngữ cảnh.
 *  - Đơn QR tại bàn → FloorMap, highlight bàn
 *  - Đơn mang đi → không có map, chỉ hiển thị mã pickup
 *  - Đơn giao hàng → DeliveryMap với tuyến + ETA
 *  - Đơn đặt bàn (reservation) → FloorMap với bàn đã đặt
 */

export type OrderDetail = {
  id: string;
  code: string;
  table: string;
  channel: "qr" | "takeaway" | "delivery" | "reservation";
  customer?: { name: string; phone?: string; address?: string };
  items: { name: string; qty: number; price: string; note?: string }[];
  subtotal: string;
  discount?: string;
  total: string;
  paymentMethod?: string;
  paymentStatus: "unpaid" | "pending" | "paid";
  elapsedMin: number;
  status: "new" | "cooking" | "ready" | "payment";
  // Delivery context
  delivery?: { distanceKm: number; etaMin: number; driverName?: string; driverPhone?: string; progress: number };
  // Floor context
  floor?: { tables: FloorTable[]; selectedId: string };
  // Reservation context
  reservation?: { datetime: string; partySize: number; depositVnd?: string };
};

const channelMeta = {
  qr: { icon: <QrCode size={16} />, label: "QR tại bàn", color: "var(--d-jade)" },
  takeaway: { icon: <Utensils size={16} />, label: "Mang đi", color: "var(--d-orange)" },
  delivery: { icon: <Truck size={16} />, label: "Giao hàng", color: "var(--d-info-fg)" },
  reservation: { icon: <Clock3 size={16} />, label: "Đặt bàn trước", color: "var(--d-orange-600)" }
} as const;

const statusMeta = {
  new: { label: "Đơn mới", tone: "orange" as const, cta: "Nhận & vào bếp", icon: <ChefHat size={16} /> },
  cooking: { label: "Đang làm", tone: "info" as const, cta: "Báo đã ra món", icon: <Check size={16} /> },
  ready: { label: "Sẵn sàng", tone: "ok" as const, cta: "Giao cho khách", icon: <Check size={16} /> },
  payment: { label: "Chờ thu", tone: "jade" as const, cta: "Thu tiền", icon: <CreditCard size={16} /> }
};

export function OrderDetailDrawer({
  order,
  open,
  onClose,
  onAdvance,
  onCancel,
  onTimer,
  busy = false
}: {
  order: OrderDetail | null;
  open: boolean;
  onClose: () => void;
  onAdvance?: () => void;
  onCancel?: () => void;
  onTimer?: () => void;
  busy?: boolean;
}) {
  if (!order) return null;
  const channel = channelMeta[order.channel];
  const status = statusMeta[order.status];
  const overdue = order.elapsedMin >= 10;
  const canCancel = Boolean(onCancel) && order.paymentStatus !== "paid";
  const canTimer = Boolean(onTimer) && (order.status === "cooking" || order.status === "new");
  const hasFooter = Boolean(onAdvance) || canCancel || canTimer;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={order.table}
      subtitle={`Mã đơn ${order.code}`}
      headerMeta={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--d-r-pill)] bg-[var(--d-surface-2)] px-2.5 py-1 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
            {channel.icon}
            {channel.label}
          </span>
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className={cn("inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold", overdue ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text-muted)]")}>
            <Clock3 size={12} />
            {order.elapsedMin === 0 ? "vừa xong" : `${order.elapsedMin} phút`}
          </span>
        </>
      }
      footer={
        hasFooter ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
                Đóng
              </Button>
              {onAdvance ? (
                <Button variant="primary" size="lg" onClick={onAdvance} disabled={busy} className="flex-[2]">
                  {status.icon}
                  {status.cta}
                </Button>
              ) : null}
            </div>
            {canCancel || canTimer ? (
              <div className="flex gap-2">
                {canTimer ? (
                  <Button variant="secondary" size="md" onClick={onTimer} disabled={busy} className="flex-1">
                    <Clock3 size={15} /> +10 phút bếp
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button variant="danger" size="md" onClick={onCancel} disabled={busy} className="flex-1">
                    <X size={15} /> Huỷ đơn
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-[var(--d-s-5)]">
        {/* Map ngữ cảnh */}
        <ContextMap order={order} />

        {/* Khách hàng */}
        {order.customer ? <CustomerBlock customer={order.customer} /> : null}

        {/* Đặt bàn */}
        {order.reservation ? <ReservationBlock res={order.reservation} /> : null}

        {/* Danh sách món */}
        <ItemsBlock order={order} />

        {/* Thanh toán */}
        <PaymentBlock order={order} />
      </div>
    </Drawer>
  );
}

function ContextMap({ order }: { order: OrderDetail }) {
  if (order.channel === "delivery" && order.delivery) {
    return (
      <section className="flex flex-col gap-[var(--d-s-3)]">
        <SectionLabel icon={<Truck size={14} />}>Tuyến giao hàng</SectionLabel>
        <DeliveryMap
          distanceKm={order.delivery.distanceKm}
          etaMin={order.delivery.etaMin}
          driverProgress={order.delivery.progress}
          customerLabel={order.customer?.name ?? "Khách"}
        />
        {order.delivery.driverName ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-[var(--d-s-4)] py-[var(--d-s-3)]">
            <span className="inline-flex items-center gap-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]">
                <Bike size={15} />
              </span>
              {order.delivery.driverName}
            </span>
            {order.delivery.driverPhone ? (
              <a href={`tel:${order.delivery.driverPhone}`} className="inline-flex items-center gap-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)]">
                <Phone size={14} /> {order.delivery.driverPhone}
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  if ((order.channel === "qr" || order.channel === "reservation") && order.floor) {
    return (
      <section className="flex flex-col gap-[var(--d-s-3)]">
        <SectionLabel icon={<MapPin size={14} />}>Vị trí bàn</SectionLabel>
        <FloorMap tables={order.floor.tables} selectedId={order.floor.selectedId} />
      </section>
    );
  }

  if (order.channel === "takeaway") {
    return (
      <section className="flex items-center gap-4 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-5)]">
        <span className="grid h-14 w-14 place-items-center rounded-[var(--d-r-lg)] bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]">
          <Hash size={26} />
        </span>
        <div>
          <p className="d-eyebrow">Mã lấy hàng</p>
          <p className="d-num text-[length:var(--d-fs-display)] font-bold text-[var(--d-text)]">{order.code}</p>
          <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Khách đọc mã này khi đến lấy</p>
        </div>
      </section>
    );
  }

  return null;
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
      <span className="text-[var(--d-primary)]">{icon}</span>
      {children}
    </p>
  );
}

function CustomerBlock({ customer }: { customer: NonNullable<OrderDetail["customer"]> }) {
  return (
    <section className="flex flex-col gap-[var(--d-s-3)]">
      <SectionLabel icon={<User size={14} />}>Khách hàng</SectionLabel>
      <div className="flex flex-col gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{customer.name}</span>
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-primary)]">
              <Phone size={14} /> {customer.phone}
            </a>
          ) : null}
        </div>
        {customer.address ? (
          <p className="flex items-start gap-2 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
            <MapPin size={15} className="mt-0.5 flex-none text-[var(--d-orange-600)]" />
            {customer.address}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ReservationBlock({ res }: { res: NonNullable<OrderDetail["reservation"]> }) {
  return (
    <section className="grid grid-cols-3 gap-2">
      {[
        { label: "Thời gian", value: res.datetime },
        { label: "Số khách", value: `${res.partySize} người` },
        { label: "Tiền cọc", value: res.depositVnd ?? "—" }
      ].map((b) => (
        <div key={b.label} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-3)] text-center">
          <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{b.label}</p>
          <p className="d-num mt-1 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{b.value}</p>
        </div>
      ))}
    </section>
  );
}

function ItemsBlock({ order }: { order: OrderDetail }) {
  return (
    <section className="flex flex-col gap-[var(--d-s-3)]">
      <SectionLabel icon={<Utensils size={14} />}>Món đã gọi ({order.items.length})</SectionLabel>
      <div className="overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)]">
        {order.items.map((it, i) => (
          <div key={i} className={cn("flex items-start justify-between gap-3 px-[var(--d-s-4)] py-[var(--d-s-3)]", i > 0 && "border-t border-[var(--d-line)]")}>
            <div className="flex min-w-0 items-start gap-3">
              <span className="d-num grid h-6 min-w-6 place-items-center rounded-[var(--d-r-sm)] bg-[var(--d-primary-soft)] px-1 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)]">
                {it.qty}
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--d-fs-sm)] font-medium text-[var(--d-text)]">{it.name}</p>
                {it.note ? (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] text-[var(--d-orange-600)]">
                    <MessageSquare size={11} /> {it.note}
                  </p>
                ) : null}
              </div>
            </div>
            <span className="d-num shrink-0 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{it.price}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PaymentBlock({ order }: { order: OrderDetail }) {
  const payTone = order.paymentStatus === "paid" ? "ok" : order.paymentStatus === "pending" ? "orange" : "neutral";
  const payLabel = order.paymentStatus === "paid" ? "Đã thanh toán" : order.paymentStatus === "pending" ? "Chờ xác nhận" : "Chưa thu";
  return (
    <section className="flex flex-col gap-[var(--d-s-3)]">
      <SectionLabel icon={<Receipt size={14} />}>Thanh toán</SectionLabel>
      <div className="flex flex-col gap-2 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <Row label="Tạm tính" value={order.subtotal} />
        {order.discount ? <Row label="Giảm giá" value={`- ${order.discount}`} accent /> : null}
        <div className="mt-1 flex items-center justify-between border-t border-[var(--d-line)] pt-[var(--d-s-3)]">
          <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Tổng cộng</span>
          <span className="d-num text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{order.total}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{order.paymentMethod ?? "VietQR"}</span>
          <Badge tone={payTone}>{payLabel}</Badge>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[length:var(--d-fs-sm)]">
      <span className="text-[var(--d-text-muted)]">{label}</span>
      <span className={cn("d-num font-semibold", accent ? "text-[var(--d-orange-600)]" : "text-[var(--d-text)]")}>{value}</span>
    </div>
  );
}
