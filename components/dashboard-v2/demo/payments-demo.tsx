"use client";

import { useMemo, useState } from "react";
import { Banknote, Check, CreditCard, Eye, QrCode, Receipt, Wallet } from "lucide-react";
import { FilterTabs, Toolbar, DataTable, type Column } from "../workspace-ui";
import { MetricCard, Badge } from "../primitives";
import { DonutChart } from "../charts";
import { OrderDetailDrawer, type OrderDetail } from "../order-detail-drawer";
import { useOrders, ordersStore } from "./store";
import { elapsedMin, fmtVnd, orderTotal, type DemoOrder } from "./data";

/* PaymentsDemo — quầy thu ngân:
 *  - Lấy đơn ở status "payment" làm hàng đợi cần thu
 *  - Cộng dồn doanh thu hôm nay từ các đơn đã thu (paymentStatus=paid)
 *  - Mark paid → store.markPaid → đơn rời khỏi pool
 */

type Tab = "all" | "pending" | "paid";

const PAID_HISTORY = [
  { id: "h1", code: "#A03-198", table: "Bàn 03", method: "cash" as const, total: 120_000, time: "13:40" },
  { id: "h2", code: "#A05-201", table: "Bàn 05", method: "vietqr" as const, total: 85_000, time: "13:22" },
  { id: "h3", code: "#G18-205", table: "Giao #18", method: "vietqr" as const, total: 210_000, time: "13:10" },
  { id: "h4", code: "#A11-208", table: "Bàn 11", method: "vietqr" as const, total: 168_000, time: "12:55" }
];

type BillRow = {
  id: string;
  code: string;
  table: string;
  method: "vietqr" | "cash" | "card";
  total: number;
  status: "pending" | "paid";
  time: string;
  source: DemoOrder | null;
};

export function PaymentsDemo() {
  const orders = useOrders();
  const [tab, setTab] = useState<Tab>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const pending: BillRow[] = useMemo(
    () =>
      orders
        .filter((o) => o.status === "payment")
        .map((o) => ({
          id: o.id,
          code: o.code,
          table: o.table,
          method: o.paymentMethod,
          total: orderTotal(o),
          status: "pending",
          time: `${elapsedMin(o)}' trước`,
          source: o
        })),
    [orders]
  );

  const paid: BillRow[] = PAID_HISTORY.map((h) => ({ ...h, status: "paid", source: null }));
  const all = [...pending, ...paid];
  const counts = { all: all.length, pending: pending.length, paid: paid.length };
  const visible = tab === "all" ? all : tab === "pending" ? pending : paid;

  const todayRevenue = paid.reduce((s, r) => s + r.total, 0);
  const pendingTotal = pending.reduce((s, r) => s + r.total, 0);
  const vietqrCount = paid.filter((p) => p.method === "vietqr").length;
  const vietqrPct = paid.length ? Math.round((vietqrCount / paid.length) * 100) : 0;

  const cols: Column<BillRow>[] = [
    { key: "code", header: "Hoá đơn", width: "1.5fr", render: (r) => (
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-[var(--d-text)]">{r.table}</span>
        <span className="d-num text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{r.code}</span>
      </span>
    ) },
    { key: "method", header: "Phương thức", render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-[var(--d-text-muted)]">
        {r.method === "vietqr" ? <QrCode size={14} /> : r.method === "cash" ? <Banknote size={14} /> : <CreditCard size={14} />}
        {r.method === "vietqr" ? "VietQR" : r.method === "cash" ? "Tiền mặt" : "Thẻ"}
      </span>
    ) },
    { key: "time", header: "Thời điểm", render: (r) => <span className="d-num text-[var(--d-text-muted)]">{r.time}</span> },
    { key: "total", header: "Số tiền", align: "right", render: (r) => <span className="d-num font-bold text-[var(--d-text)]">{fmtVnd(r.total)}</span> },
    { key: "status", header: "Hành động", align: "right", render: (r) =>
      r.status === "paid" ? (
        <Badge tone="ok">Đã thu</Badge>
      ) : (
        <span className="inline-flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
            className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] text-[var(--d-text-muted)] transition hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
            aria-label="Xem chi tiết"
          ><Eye size={14} /></button>
          <button
            onClick={(e) => { e.stopPropagation(); ordersStore.markPaid(r.id); }}
            className="inline-flex h-8 items-center gap-1 rounded-[var(--d-r-md)] bg-[var(--d-jade)] px-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-on-jade)]"
          ><Check size={13} /> Xác nhận</button>
        </span>
      )
    }
  ];

  const current = orders.find((o) => o.id === detailId) ?? null;

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow={`Đối soát ca · ${pending.length} bill chờ thu`} title="Thanh toán" />

      <section className="grid gap-[var(--d-s-4)] lg:grid-cols-[1.4fr_1fr]">
        <div className="grid grid-cols-2 gap-[var(--d-s-3)]">
          <MetricCard icon={<Wallet size={18} />} label="Đã thu hôm nay" value={fmtVnd(todayRevenue)} tone="jade" />
          <MetricCard icon={<Receipt size={18} />} label="Chờ thu" value={fmtVnd(pendingTotal)} helper={`${pending.length} bill`} tone="orange" />
          <MetricCard icon={<QrCode size={18} />} label="Tỉ lệ VietQR" value={`${vietqrPct}%`} tone="info" />
          <MetricCard icon={<CreditCard size={18} />} label="Số hoá đơn" value={String(paid.length)} tone="neutral" />
        </div>
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)]">
          <p className="d-eyebrow mb-3">Cơ cấu thanh toán</p>
          <DonutChart
            centerValue={fmtVnd(todayRevenue + pendingTotal).replace("₫", "")}
            centerLabel="tổng"
            slices={[
              { label: "VietQR", value: paid.filter((p) => p.method === "vietqr").length || 1, color: "var(--d-jade)" },
              { label: "Tiền mặt", value: paid.filter((p) => p.method === "cash").length || 1, color: "var(--d-orange)" },
              { label: "Thẻ", value: paid.filter((p) => p.method === "card").length || 1, color: "var(--d-sage)" }
            ]}
          />
        </div>
      </section>

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as Tab)}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "pending", label: "Chờ thu", count: counts.pending },
          { key: "paid", label: "Đã thu", count: counts.paid }
        ]}
      />

      <DataTable<BillRow>
        columns={cols}
        rows={visible}
        onRowClick={(r) => r.status === "pending" && setDetailId(r.id)}
      />

      <OrderDetailDrawer
        order={current ? buildDetail(current) : null}
        open={Boolean(current)}
        onClose={() => setDetailId(null)}
        onAdvance={current ? () => { ordersStore.markPaid(current.id); setDetailId(null); } : undefined}
      />
    </div>
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
    status: "payment",
    delivery: o.delivery
  };
}
