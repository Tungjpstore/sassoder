"use client";

import { useMemo, useState } from "react";
import { Clock3, CreditCard, Eye, Grip, MapPin, Move, QrCode, Receipt, Users } from "lucide-react";
import { Toolbar, FilterTabs } from "../workspace-ui";
import { Button } from "../button";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { OrderDetailDrawer, type OrderDetail } from "../order-detail-drawer";
import { Drawer } from "../overlay";
import { useOrders, ordersStore } from "./store";
import {
  DEMO_TABLES,
  deriveTableStatus,
  elapsedMin,
  fmtVnd,
  orderQty,
  orderTotal,
  tableOpenOrder,
  type DemoTable
} from "./data";
import { cn } from "@/lib/utils";

const ZONE_LABEL: Record<DemoTable["zone"], string> = {
  in: "Trong nhà",
  garden: "Sân vườn",
  vip: "VIP"
};

const ST_META = {
  available: { label: "Trống", chip: "neutral" as const, ring: "var(--d-line-strong)", bg: "var(--d-surface)", fg: "var(--d-text-faint)" },
  serving: { label: "Đang phục vụ", chip: "ok" as const, ring: "var(--d-jade)", bg: "var(--d-primary-soft)", fg: "var(--d-primary)" },
  overdue: { label: "Quá giờ", chip: "danger" as const, ring: "var(--d-danger-fg)", bg: "var(--d-danger-bg)", fg: "var(--d-danger-fg)" },
  reserved: { label: "Đã đặt", chip: "orange" as const, ring: "var(--d-orange)", bg: "var(--d-accent-soft)", fg: "var(--d-orange-600)" }
};

export function TablesDemo() {
  const orders = useOrders();
  const [zone, setZone] = useState<"all" | DemoTable["zone"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orderDrawerId, setOrderDrawerId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(DEMO_TABLES.map((t) => [t.id, { x: t.x, y: t.y }]))
  );
  const [dragId, setDragId] = useState<string | null>(null);

  const tables = useMemo(
    () => DEMO_TABLES.map((t) => ({ ...t, status: deriveTableStatus(t, orders), x: positions[t.id]?.x ?? t.x, y: positions[t.id]?.y ?? t.y })),
    [orders, positions]
  );
  const visible = zone === "all" ? tables : tables.filter((t) => t.zone === zone);

  const counts = {
    all: tables.length,
    serving: tables.filter((t) => t.status === "serving").length,
    overdue: tables.filter((t) => t.status === "overdue").length,
    reserved: tables.filter((t) => t.status === "reserved").length,
    available: tables.filter((t) => t.status === "available").length
  };

  const selected = (selectedId ? tables.find((t) => t.id === selectedId) : null) ?? null;
  const selectedOrder = (selected ? tableOpenOrder(orders, selected.id) : null) ?? null;
  const drawerOrder = (orderDrawerId ? orders.find((o) => o.id === orderDrawerId) : null) ?? null;

  function moveTable(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragId || !editMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(6, Math.min(94, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    setPositions((p) => ({ ...p, [dragId]: { x, y } }));
  }

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Sơ đồ vận hành" title="Bàn & QR">
        <Button variant={editMode ? "primary" : "secondary"} size="md" onClick={() => setEditMode((v) => !v)}><Move size={15} /> {editMode ? "Đang sửa sơ đồ — bấm để xong" : "Sửa sơ đồ"}</Button>
        <Button variant="secondary" size="md"><QrCode size={15} /> In QR menu</Button>
      </Toolbar>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<Users size={18} />} label="Tổng bàn" value={String(counts.all)} tone="jade" />
        <MetricCard icon={<Clock3 size={18} />} label="Đang phục vụ" value={String(counts.serving)} tone="info" />
        <MetricCard icon={<Clock3 size={18} />} label="Quá giờ" value={String(counts.overdue)} tone={counts.overdue ? "danger" : "neutral"} />
        <MetricCard icon={<Receipt size={18} />} label="Trống" value={String(counts.available)} tone="orange" />
      </section>

      <FilterTabs
        active={zone}
        onChange={(k) => setZone(k as typeof zone)}
        tabs={[
          { key: "all", label: "Tất cả khu vực", count: counts.all },
          { key: "in", label: "Trong nhà", count: tables.filter((t) => t.zone === "in").length },
          { key: "garden", label: "Sân vườn", count: tables.filter((t) => t.zone === "garden").length }
        ]}
      />

      {/* Floor map */}
      <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="d-eyebrow">Sơ đồ {zone === "all" ? "toàn quán" : ZONE_LABEL[zone]}</p>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{editMode ? "Kéo thả để di chuyển bàn" : "Bấm vào bàn để xem chi tiết"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {(["available", "serving", "overdue", "reserved"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: ST_META[k].ring }} />
                {ST_META[k].label}
              </span>
            ))}
          </div>
        </div>

        <div
          onPointerMove={moveTable}
          onPointerUp={() => setDragId(null)}
          onPointerLeave={() => setDragId(null)}
          className={cn(
            "relative aspect-[16/8] w-full select-none overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)]",
            "bg-[radial-gradient(circle_at_center,_var(--d-surface)_0%,_var(--d-surface-2)_100%)]"
          )}
        >
          {/* Floor grid */}
          <svg className="absolute inset-0 h-full w-full opacity-40" aria-hidden="true">
            <defs>
              <pattern id="floor-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--d-line)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#floor-grid)" />
          </svg>

          {/* Zone labels */}
          <div className="pointer-events-none absolute left-3 top-3 rounded-[var(--d-r-pill)] bg-[var(--d-surface)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-muted)] shadow-[var(--d-sh-sm)]">Trong nhà</div>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-[var(--d-r-pill)] bg-[var(--d-surface)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-muted)] shadow-[var(--d-sh-sm)]">Sân vườn</div>

          {/* Divider */}
          <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 border-t border-dashed border-[var(--d-line)]" />

          {visible.map((t) => {
            const meta = ST_META[t.status];
            const open = tableOpenOrder(orders, t.id);
            const isSelected = selectedId === t.id;
            const isDragging = dragId === t.id;
            return (
              <div
                key={t.id}
                onPointerDown={(e) => {
                  if (editMode) {
                    e.preventDefault();
                    setDragId(t.id);
                  }
                }}
                onClick={() => { if (!editMode && !isDragging) setSelectedId(t.id); }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 select-none",
                  editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  isDragging && "z-10 scale-110"
                )}
                style={{ left: `${t.x}%`, top: `${t.y}%` }}
              >
                <div
                  className={cn(
                    "relative flex flex-col gap-0.5 rounded-[var(--d-r-md)] border-2 bg-[var(--d-surface)] px-2.5 py-1.5 shadow-[var(--d-sh-sm)] transition-all",
                    !editMode && "hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]",
                    isSelected && "ring-2 ring-offset-2 ring-offset-[var(--d-surface)]"
                  )}
                  style={{
                    minWidth: `${64 + t.seats * 3}px`,
                    borderColor: meta.ring,
                    background: meta.bg,
                    color: meta.fg,
                    boxShadow: isSelected ? `0 0 0 3px ${meta.ring}40, var(--d-sh-md)` : undefined
                  }}
                >
                  {/* Status dot */}
                  <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2 ring-[var(--d-surface)]" style={{ background: meta.ring }} />

                  {/* Drag handle in edit mode */}
                  {editMode ? (
                    <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--d-surface)] text-[var(--d-text-muted)] shadow"><Grip size={10} /></span>
                  ) : null}

                  <div className="flex items-baseline justify-between gap-2">
                    <span className="d-num text-[length:var(--d-fs-h3)] font-bold leading-none">{t.name}</span>
                    <span className="d-num text-[length:var(--d-fs-2xs)] font-semibold opacity-80">{t.seats}c</span>
                  </div>
                  {open ? (
                    <div className="d-num flex items-center gap-2 text-[length:var(--d-fs-2xs)] font-bold">
                      <span>{elapsedMin(open)}'</span>
                      <span className="opacity-70">·</span>
                      <span>{fmtVnd(orderTotal(open))}</span>
                    </div>
                  ) : t.reservedFor ? (
                    <p className="line-clamp-1 text-[length:var(--d-fs-2xs)] font-semibold opacity-90">{t.reservedFor}</p>
                  ) : (
                    <p className="text-[length:var(--d-fs-2xs)] opacity-70">Sẵn sàng</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {editMode ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--d-r-md)] border border-[var(--d-jade)]/30 bg-[var(--d-primary-soft)]/40 px-3 py-2">
            <p className="inline-flex items-center gap-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-primary)]"><MapPin size={13} /> Chế độ sửa sơ đồ — kéo bàn vào vị trí mong muốn rồi bấm "xong".</p>
            <Button variant="primary" size="sm" onClick={() => setEditMode(false)}>Lưu sơ đồ</Button>
          </div>
        ) : null}
      </section>

      {visible.length === 0 ? <EmptyState icon={<Users size={20} />} title="Không có bàn ở khu này" /> : null}

      <TablePanel
        table={selected}
        order={selectedOrder}
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        onOpenOrder={(id) => setOrderDrawerId(id)}
        onAdvance={(id) => ordersStore.advance(id)}
      />

      <OrderDetailDrawer
        order={drawerOrder ? buildOrderDetail(drawerOrder) : null}
        open={Boolean(drawerOrder)}
        onClose={() => setOrderDrawerId(null)}
        onAdvance={drawerOrder ? () => ordersStore.advance(drawerOrder.id) : undefined}
      />
    </div>
  );
}

function TablePanel({
  table,
  order,
  open,
  onClose,
  onOpenOrder,
  onAdvance
}: {
  table: (DemoTable & { status: keyof typeof ST_META }) | null;
  order: ReturnType<typeof tableOpenOrder> | null;
  open: boolean;
  onClose: () => void;
  onOpenOrder: (id: string) => void;
  onAdvance: (id: string) => void;
}) {
  if (!table) return null;
  const meta = ST_META[table.status];
  return (
    <Drawer open={open} onClose={onClose} width="md" title={`Bàn ${table.name}`} subtitle={`${ZONE_LABEL[table.zone]} · ${table.seats} khách tối đa`} headerMeta={<Badge tone={meta.chip}>{meta.label}</Badge>}>
      <div className="flex flex-col gap-[var(--d-s-4)]">
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)]/60 p-[var(--d-s-4)]">
          <p className="d-eyebrow">Thông tin bàn</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <InfoTile label="Mã bàn" value={table.id.toUpperCase()} />
            <InfoTile label="Khu vực" value={ZONE_LABEL[table.zone]} />
            <InfoTile label="Sức chứa" value={`${table.seats} khách`} />
            <InfoTile label="Nhân viên" value={table.server ?? "Chưa gán"} />
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-[var(--d-r-md)] bg-[var(--d-surface-2)] text-[var(--d-text-faint)]"><QrCode size={22} /></span>
            <div className="min-w-0">
              <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">QR gọi món</p>
              <p className="truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">/m/quan-cafe-demo?ban={table.id}</p>
            </div>
          </div>
        </section>

        {order ? (
          <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="d-eyebrow">Đơn đang mở</p>
                <h3 className="mt-1 text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{order.code}</h3>
                <p className="mt-1 line-clamp-2 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">
                  {order.items.map((i) => `${i.qty}x ${i.name}`).join(" · ")}
                </p>
              </div>
              <Badge tone={elapsedMin(order) >= 30 ? "danger" : "info"}>{elapsedMin(order)} phút</Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <InfoTile label="Số món" value={`${orderQty(order)} món`} />
              <InfoTile label="Tạm tính" value={fmtVnd(orderTotal(order))} />
              <InfoTile label="Thanh toán" value={order.paymentStatus === "paid" ? "Đã thu" : order.paymentStatus === "pending" ? "Chờ xác nhận" : "Chưa thu"} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="md" onClick={() => onOpenOrder(order.id)}><Eye size={15} /> Xem đơn</Button>
              <Button variant="primary" size="md" onClick={() => onAdvance(order.id)}><CreditCard size={15} /> Bước tiếp</Button>
            </div>
          </section>
        ) : table.reservedFor ? (
          <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-accent-soft)]/50 p-[var(--d-s-4)]">
            <p className="d-eyebrow text-[var(--d-orange-600)]">Đặt bàn sắp tới</p>
            <p className="mt-1 text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{table.reservedFor}</p>
          </section>
        ) : (
          <div className="flex flex-col gap-3">
            <EmptyState icon={<QrCode size={20} />} title="Bàn đang trống" description="Có thể in QR, gán nhân viên hoặc mở đơn mới cho bàn này." />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="md"><Eye size={15} /> Xem QR bàn</Button>
              <Button variant="primary" size="md"><Users size={15} /> Mở đơn mới</Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
      <p className="text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="mt-1 truncate text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function buildOrderDetail(o: NonNullable<ReturnType<typeof tableOpenOrder>>): OrderDetail {
  return {
    id: o.id,
    code: o.code,
    table: o.table,
    channel: o.channel,
    customer: o.customer,
    items: o.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      price: fmtVnd(i.price * i.qty),
      note: i.note
    })),
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
            zone: ZONE_LABEL[t.zone],
            status: deriveTableStatus(t, [o]),
            x: t.x,
            y: t.y
          }))
        }
      : undefined
  };
}
