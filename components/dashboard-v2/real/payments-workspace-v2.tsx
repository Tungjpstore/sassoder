"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, Clock3, CreditCard, QrCode, Receipt, Search, Wallet } from "lucide-react";
import { MetricCard, Badge, EmptyState } from "../primitives";
import { DataTable, FilterTabs, Toolbar, type Column } from "../workspace-ui";
import { DonutChart } from "../charts";
import { Button } from "../button";
import { Drawer } from "../overlay";
import { RealtimeStatusBadge } from "../realtime";
import { useDashboardRealtime } from "@/hooks/use-dashboard-realtime";
import { useToast } from "@/components/dashboard/toast-provider";
import type { AdminPaymentTransaction } from "@/services/dashboard-report-service";

type Stat = { label: string; value: string | number; meta: string; icon: "credit" | "cash" | "qr" | "clock" };

type Props = {
  stats: Stat[];
  transactions: AdminPaymentTransaction[];
  restaurantId: string;
  bankCode: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  restaurantName: string;
  totalPaid: number;
  waitingAmount: number;
  cashRevenue: number;
  qrRevenue: number;
};

function formatVnd(n: number) {
  return `${n.toLocaleString("vi-VN")}₫`;
}

const ICONS = { credit: Receipt, cash: Banknote, qr: QrCode, clock: Clock3 };

function paymentTone(tx: AdminPaymentTransaction) {
  if (tx.paymentStatus === "paid") return { label: "Đã thu", tone: "ok" as const };
  if (tx.paymentStatus === "waiting_confirm" || tx.status === "waiting_confirm") return { label: "Chờ xác nhận", tone: "orange" as const };
  return { label: "Chưa thu", tone: "neutral" as const };
}

export function RealPaymentsWorkspaceV2({ stats, transactions, restaurantId, bankCode, bankAccount, bankAccountName, restaurantName, totalPaid, waitingAmount, cashRevenue, qrRevenue }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AdminPaymentTransaction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const rtState = useDashboardRealtime({
    restaurantId,
    workspace: "payments",
    tables: [
      { table: "orders" },
      { table: "payment_logs", filterByRestaurant: false }
    ]
  });

  async function confirmPayment(orderId: string) {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/confirm-payment`, { method: "POST", cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => `${res.status}`);
        throw new Error(text || "Không xác nhận được thanh toán");
      }
      toast.success("Đã xác nhận thanh toán");
      setSelected(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xác nhận được thanh toán");
    } finally {
      setConfirming(false);
    }
  }

  const rows = useMemo(() => {
    let list = transactions;
    if (tab !== "all") list = list.filter((tx) => (tab === "paid" ? tx.paymentStatus === "paid" : tx.paymentStatus !== "paid"));
    if (q.trim()) list = list.filter((tx) => `${tx.tableName} ${tx.itemSummary}`.toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [transactions, tab, q]);

  const paidCount = transactions.filter((tx) => tx.paymentStatus === "paid").length;
  const pendingCount = transactions.length - paidCount;

  const columns: Column<AdminPaymentTransaction>[] = [
    { key: "bill", header: "Hoá đơn", width: "1.6fr", render: (tx) => (
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold text-[var(--d-text)]">{tx.tableName}</span>
        <span className="line-clamp-1 text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">{tx.itemSummary}</span>
      </span>
    ) },
    { key: "method", header: "Phương thức", render: (tx) => (
      <span className="inline-flex items-center gap-1.5 text-[var(--d-text-muted)]">
        {tx.method === "CASH" ? <Banknote size={14} /> : <QrCode size={14} />}
        {tx.method === "CASH" ? "Tiền mặt" : tx.method === "QR" ? "VietQR" : "Khác"}
      </span>
    ) },
    { key: "items", header: "Món", render: (tx) => <span className="d-num text-[var(--d-text-muted)]">{tx.itemCount}</span> },
    { key: "amount", header: "Số tiền", align: "right", render: (tx) => <span className="d-num font-bold text-[var(--d-text)]">{formatVnd(tx.amount)}</span> },
    { key: "status", header: "Trạng thái", align: "right", render: (tx) => {
      const st = paymentTone(tx);
      return <Badge tone={st.tone}>{st.label}</Badge>;
    } }
  ];

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Vận hành" title="Thanh toán">
        <RealtimeStatusBadge state={rtState} />
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = ICONS[s.icon];
          return <MetricCard key={s.label} icon={<Icon size={18} />} label={s.label} value={s.value} helper={s.meta} tone={s.icon === "clock" ? "orange" : s.icon === "qr" ? "info" : s.icon === "cash" ? "neutral" : "jade"} />;
        })}
      </section>

      <section className="grid gap-[var(--d-s-4)] lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)]">
          <p className="d-eyebrow mb-3">Cơ cấu thanh toán</p>
          <DonutChart
            centerValue={formatVnd(totalPaid).replace("₫", "")}
            centerLabel="đã thu"
            slices={[
              { label: "VietQR", value: qrRevenue || 1, color: "var(--d-jade)" },
              { label: "Tiền mặt", value: cashRevenue || 1, color: "var(--d-orange)" },
              { label: "Chờ thu", value: waitingAmount || 1, color: "var(--d-sage)" }
            ]}
          />
        </div>
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-5)] shadow-[var(--d-sh-sm)]">
          <p className="d-eyebrow">Tài khoản nhận VietQR</p>
          <div className="mt-4 flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
            <span className="grid h-11 w-11 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]"><Wallet size={20} /></span>
            <div className="min-w-0">
              <p className="font-semibold text-[var(--d-text)]">{bankAccountName ?? restaurantName}</p>
              <p className="d-num truncate text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">{bankCode ?? "Chưa chọn ngân hàng"} · {bankAccount ?? "Chưa cấu hình STK"}</p>
            </div>
          </div>
          {!bankCode || !bankAccount ? <p className="mt-3 text-[length:var(--d-fs-xs)] text-[var(--d-danger-fg)]">Cần cấu hình ngân hàng ở Cài đặt → Thanh toán để nhận VietQR.</p> : null}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs active={tab} onChange={setTab} tabs={[{ key: "all", label: "Tất cả", count: transactions.length }, { key: "pending", label: "Chờ thu", count: pendingCount }, { key: "paid", label: "Đã thu", count: paidCount }]} />
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--d-text-faint)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm bàn, món..." className="h-9 w-56 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] pl-9 pr-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)]" />
        </div>
      </section>

      <DataTable columns={columns} rows={rows} onRowClick={setSelected} empty={<EmptyState icon={<Receipt size={20} />} title="Không có giao dịch" description="Giao dịch mới sẽ xuất hiện khi khách thanh toán." />} />

      <PaymentDrawer
        tx={selected}
        onClose={() => setSelected(null)}
        onConfirm={() => selected && void confirmPayment(selected.id)}
        confirming={confirming}
      />

    </div>
  );
}

function PaymentDrawer({ tx, onClose, onConfirm, confirming }: { tx: AdminPaymentTransaction | null; onClose: () => void; onConfirm: () => void; confirming: boolean }) {
  if (!tx) return null;
  const st = paymentTone(tx);
  return (
    <Drawer open onClose={onClose} title={tx.tableName} subtitle={`Giao dịch ${tx.id.slice(0, 8).toUpperCase()}`} headerMeta={<Badge tone={st.tone}>{st.label}</Badge>} footer={
      <div className="flex gap-2">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Đóng</Button>
        {tx.paymentStatus !== "paid" ? (
          <Button variant="primary" size="lg" className="flex-[2]" onClick={onConfirm} disabled={confirming}>
            <Check size={15} /> {confirming ? "Đang xử lý…" : "Xác nhận đã thu"}
          </Button>
        ) : null}
      </div>
    }>
      <div className="flex flex-col gap-[var(--d-s-4)]">
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <p className="d-eyebrow">Chi tiết món</p>
          <div className="mt-3 divide-y divide-[var(--d-line)] rounded-[var(--d-r-md)] border border-[var(--d-line)]">
            {tx.items.map((it, i) => (
              <div key={`${it.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{it.quantity}x {it.name}</span>
                <span className="d-num text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{formatVnd(it.lineTotal)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
          <div className="flex items-center justify-between"><span className="font-semibold">Tổng cộng</span><span className="d-num text-[length:var(--d-fs-h2)] font-bold">{formatVnd(tx.amount)}</span></div>
          <div className="mt-2 flex items-center justify-between text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]"><span>Phương thức</span><span>{tx.method ?? "Chưa xác định"}</span></div>
        </section>
      </div>
    </Drawer>
  );
}
