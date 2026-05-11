"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, CheckCircle2, Clock3, CreditCard, Loader2, Printer, QrCode, RefreshCw, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardDrawer } from "@/components/dashboard/shared-drawer";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import type { AdminPaymentTransaction } from "@/services/dashboard-report-service";
import type { OrderStatus, PaymentMethod } from "@/types/domain";

type PaymentStat = {
  label: string;
  value: string | number;
  meta: string;
  icon: "credit" | "cash" | "qr" | "clock";
};

type PaymentWorkspaceProps = {
  stats: PaymentStat[];
  transactions: AdminPaymentTransaction[];
  bankCode: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
  restaurantName: string;
  totalPaid: number;
  waitingAmount: number;
  cashRevenue: number;
  qrRevenue: number;
};

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function buildClientVietQrUrl({
  bank,
  account,
  amount,
  orderId
}: {
  bank: string;
  account: string;
  amount: number;
  orderId: string;
}) {
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo: `ORDER-${orderId}`
  });

  return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?${params.toString()}`;
}

function statusTone(status: string): "green" | "yellow" | "blue" | "red" | "neutral" {
  if (status === "paid") return "green";
  if (status === "waiting_confirm") return "yellow";
  if (status === "waiting_payment") return "blue";
  if (status === "failed" || status === "refunded") return "red";
  if (status === "cancelled") return "red";
  return "neutral";
}

function effectivePaymentStatus(order: Pick<AdminPaymentTransaction, "status" | "paymentStatus">): OrderStatus | "unpaid" | "failed" | "refunded" {
  const paymentStatus = order.paymentStatus;
  if (paymentStatus === "paid" || paymentStatus === "waiting_confirm" || paymentStatus === "waiting_payment") {
    return paymentStatus;
  }
  if (paymentStatus === "failed" || paymentStatus === "refunded") {
    return paymentStatus;
  }
  return order.status;
}

function firstActionablePaymentId(transactions: AdminPaymentTransaction[]) {
  return transactions.find((order) => {
    const paymentState = effectivePaymentStatus(order);
    return paymentState === "waiting_confirm" || paymentState === "waiting_payment";
  })?.id ?? transactions[0]?.id ?? null;
}

export function PaymentsWorkspace({
  stats,
  transactions,
  bankCode,
  bankAccount,
  bankAccountName,
  restaurantName,
  totalPaid,
  waitingAmount,
  cashRevenue,
  qrRevenue
}: PaymentWorkspaceProps) {
  const router = useRouter();
  const [transactionOverrides, setTransactionOverrides] = useState<Record<string, Partial<AdminPaymentTransaction>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(firstActionablePaymentId(transactions));
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const localTransactions = useMemo(
    () =>
      transactions.map((transaction) => ({
        ...transaction,
        ...transactionOverrides[transaction.id]
      })),
    [transactionOverrides, transactions]
  );

  const selected = localTransactions.find((order) => order.id === selectedId) ?? localTransactions[0] ?? null;
  const qrUrl =
    selected && bankCode && bankAccount
      ? buildClientVietQrUrl({ bank: bankCode, account: bankAccount, amount: selected.amount, orderId: selected.id })
      : null;

  const methodRows = useMemo(
    () => [
      { label: "Tiền mặt", value: cashRevenue, color: "bg-[var(--primary)]", icon: Banknote },
      { label: "VietQR", value: qrRevenue, color: "bg-[var(--accent)]", icon: QrCode },
      { label: "Chưa thanh toán", value: waitingAmount, color: "bg-[#A9C5A1]", icon: Clock3 }
    ],
    [cashRevenue, qrRevenue, waitingAmount]
  );
  const waitingConfirmCount = localTransactions.filter((order) => effectivePaymentStatus(order) === "waiting_confirm").length;
  const unpaidCount = localTransactions.filter((order) => effectivePaymentStatus(order) === "waiting_payment").length;
  const paidTodayCount = localTransactions.filter((order) => effectivePaymentStatus(order) === "paid").length;
  const statIcons = {
    credit: CreditCard,
    cash: Banknote,
    qr: QrCode,
    clock: Clock3
  };

  async function confirmPayment(orderId: string) {
    setMutatingId(orderId);
    setError(null);
    const previousOverride = transactionOverrides[orderId];
    const target = localTransactions.find((transaction) => transaction.id === orderId);
    setTransactionOverrides((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        status: "paid" as const,
        paymentStatus: "paid",
        method: target?.method ?? "QR"
      }
    }));

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/confirm-payment`, { method: "POST" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không xác nhận được thanh toán");
    } catch (err) {
      setTransactionOverrides((current) => {
        const next = { ...current };
        if (previousOverride) {
          next[orderId] = previousOverride;
        } else {
          delete next[orderId];
        }
        return next;
      });
      setError(err instanceof Error ? err.message : "Không xác nhận được thanh toán");
    } finally {
      setMutatingId(null);
    }
  }

  return (
    <div className="grid gap-3">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = statIcons[stat.icon];
          return (
            <div key={stat.label} className="admin-stat-tile rounded-[14px] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{stat.label}</p>
                <span className="dashboard-stat-icon">
                  <Icon size={18} />
                </span>
              </div>
              <p className="metric-number mt-3 text-2xl font-semibold text-[var(--foreground)]">{stat.value}</p>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">{stat.meta}</p>
            </div>
          );
        })}
      </section>

      {error ? <div className="rounded-xl border border-[var(--tertiary)]/12 bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--tertiary)]">{error}</div> : null}

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="dashboard-panel p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Giao dịch gần đây</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Chạm vào từng giao dịch để mở chi tiết và xác nhận thanh toán nhanh.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/orders?status=waiting_confirm" className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]">
                Chờ xác nhận
              </Link>
              <Link href="/dashboard/settings?section=payments" className="inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white">
                Cấu hình VietQR
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="dashboard-muted-header grid grid-cols-[1.2fr_0.9fr_1.5fr_0.9fr_1fr_112px] gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] max-lg:hidden">
              <span>Mã thanh toán</span>
              <span>Bàn/Đơn</span>
              <span>Hóa đơn gồm</span>
              <span>Phương thức</span>
              <span>Trạng thái</span>
              <span>Số tiền</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {localTransactions.length === 0 && (
                <div className="grid min-h-48 place-items-center px-5 py-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có giao dịch thật trong tháng này.
                </div>
              )}
              {localTransactions.map((order) => {
                const isSelected = selected?.id === order.id;
                const paymentState = effectivePaymentStatus(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className={`dashboard-selectable-row grid w-full gap-3 px-4 py-3 text-left lg:grid-cols-[1.2fr_0.9fr_1.5fr_0.9fr_1fr_112px] ${isSelected ? "dashboard-selected-row" : ""}`}
                  >
                    <span className="font-mono text-sm font-semibold">#PAY{order.id.slice(0, 8).toUpperCase()}</span>
                    <span className="text-sm font-semibold">{order.tableName}</span>
                    <span className="truncate text-sm font-medium text-[var(--muted-foreground)]">{order.itemSummary}</span>
                    <span><Badge tone={order.method === "QR" ? "green" : "neutral"}>{paymentMethodLabel(order.method as PaymentMethod | null)}</Badge></span>
                    <span><Badge tone={statusTone(paymentState)}>{paymentStatusLabel(paymentState)}</Badge></span>
                    <span className="flex items-center justify-between gap-3 lg:justify-end">
                      <span className="metric-number font-semibold">{formatVnd(order.amount)}</span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)] lg:hidden">
                        <ArrowRight size={15} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--muted-foreground)]">
              <span>Đang hiển thị {localTransactions.length} giao dịch từ dữ liệu thật.</span>
              <button type="button" onClick={() => router.refresh()} className="font-semibold text-[var(--primary)]">Làm mới</button>
            </div>
          </div>
        </div>

        <aside className="grid gap-3">
          <div className="dashboard-panel p-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Ưu tiên xử lý</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">Chờ xác nhận tiền</p>
                <p className="metric-number mt-2 text-2xl font-semibold text-[var(--foreground)]">{waitingConfirmCount}</p>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Các bill khách đã báo chuyển khoản.</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">Chưa thu tiền</p>
                <p className="metric-number mt-2 text-2xl font-semibold text-[var(--foreground)]">{unpaidCount}</p>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Theo dõi các bill còn mở hoặc chờ khách thanh toán.</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">Đã thu hôm nay</p>
                <p className="metric-number mt-2 text-2xl font-semibold text-[var(--foreground)]">{paidTodayCount}</p>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Tổng số giao dịch đã hoàn tất trong danh sách hiện tại.</p>
              </div>
            </div>
          </div>

          <div className="dashboard-panel p-4">
            <div className="flex items-center gap-2">
              <QrCode size={18} className="text-[var(--primary)]" />
              <h2 className="text-lg font-semibold text-[var(--foreground)]">VietQR đang dùng</h2>
            </div>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Ngân hàng</span><strong>{bankCode || "Chưa cấu hình"}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Chủ tài khoản</span><strong>{bankAccountName || restaurantName}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Số tài khoản</span><strong>{bankAccount || "Chưa cấu hình"}</strong></div>
            </div>
            <div className="mt-4 grid gap-2">
              <Link href="/dashboard/settings?section=payments" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white">
                <RefreshCw size={16} />
                Chỉnh thông tin nhận tiền
              </Link>
              <Link href="/dashboard/orders?status=waiting_confirm" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]">
                <CheckCircle2 size={16} />
                Mở danh sách chờ xác nhận
              </Link>
            </div>
          </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="dashboard-panel p-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Tỷ lệ phương thức thanh toán</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-[170px_1fr]">
            <div
              className="grid h-40 w-40 place-items-center rounded-full"
              style={{
                background: `conic-gradient(#0F4D3A 0 ${Math.max(percent(cashRevenue, totalPaid), 8)}%, #F28C28 ${Math.max(percent(cashRevenue, totalPaid), 8)}% ${Math.max(percent(cashRevenue, totalPaid), 8) + Math.max(percent(qrRevenue, totalPaid), 10)}%, #A9C5A1 0 100%)`
              }}
            >
              <div className="grid h-24 w-24 place-items-center rounded-full bg-[var(--surface)] text-center">
                <span>
                  <span className="metric-number block text-lg font-semibold text-[var(--primary)]">{formatVnd(totalPaid)}</span>
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">Tổng doanh thu</span>
                </span>
              </div>
            </div>
            <div className="grid content-center gap-3">
              {methodRows.map((row) => (
                <div key={row.label} className="grid grid-cols-[12px_1fr_auto_auto] items-center gap-3 text-sm">
                  <span className={`h-3 w-3 rounded ${row.color}`} />
                  <span className="font-semibold text-[var(--muted-foreground)]">{row.label}</span>
                  <span className="metric-number font-semibold">{percent(row.value, totalPaid + waitingAmount)}%</span>
                  <span className="metric-number font-semibold">{formatVnd(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dashboard-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Doanh thu theo phương thức</h2>
            <span className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--primary)]">Hôm nay</span>
          </div>
          <div className="mt-6 grid gap-4">
            {methodRows.map((row) => (
              <div key={row.label} className="grid gap-2">
                <div className="flex items-center justify-between gap-4 text-sm font-semibold">
                  <span>{row.label}</span>
                  <span className="metric-number">{formatVnd(row.value)}</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-[var(--soft-surface)]">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${percent(row.value, totalPaid + waitingAmount)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {selected ? (
        <DashboardDrawer
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
          title={`#PAY${selected.id.slice(0, 8).toUpperCase()}`}
          subtitle="Chi tiết thanh toán"
          footer={
            (() => {
              const paymentState = effectivePaymentStatus(selected);
              return (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    disabled={mutatingId === selected.id || paymentState === "paid"}
                    onClick={() => confirmPayment(selected.id)}
                    className="shadow-none hover:shadow-none sm:col-span-2"
                  >
                    {mutatingId === selected.id ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    {paymentState === "paid" ? "Đã thanh toán" : "Xác nhận thanh toán"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => window.print()} className="shadow-none hover:shadow-none">
                    <Printer size={16} />
                    In hóa đơn
                  </Button>
                  <Link href="/dashboard/settings?section=payments" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-4 text-sm font-bold text-[var(--primary-strong)]">
                    <RefreshCw size={16} />
                    Cấu hình QR
                  </Link>
                </div>
              );
            })()
          }
        >
          {(() => {
            const paymentState = effectivePaymentStatus(selected);
            return (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Badge tone={statusTone(paymentState)}>{paymentStatusLabel(paymentState)}</Badge>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Tổng quan bill</p>
                      <p className="metric-number mt-2 text-3xl font-semibold text-[var(--accent)]">{formatVnd(selected.amount)}</p>
                    </div>
                    <Badge tone={selected.method === "QR" ? "green" : "neutral"}>{paymentMethodLabel(selected.method as PaymentMethod | null)}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="text-[var(--muted-foreground)]">Nhận khách</p>
                      <p className="mt-1 font-semibold text-[var(--foreground)]">{formatDateTime(selected.createdAt)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="text-[var(--muted-foreground)]">Bàn / kênh</p>
                      <p className="mt-1 font-semibold text-[var(--foreground)]">{selected.tableName}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="text-[var(--muted-foreground)]">Số món</p>
                      <p className="mt-1 font-semibold text-[var(--foreground)]">{selected.itemCount}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="text-[var(--muted-foreground)]">Trạng thái tiền</p>
                      <p className="mt-1 font-semibold text-[var(--foreground)]">{paymentStatusLabel(paymentState)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Chi tiết đơn trong bill</h3>
                  <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm">
                    <p className="text-[var(--muted-foreground)]">Hóa đơn gồm</p>
                    <p className="mt-1 font-semibold text-[var(--foreground)]">{selected.itemSummary}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Thông tin chuyển khoản</h3>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Ngân hàng</span><strong>{bankCode || "Chưa cấu hình"}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Chủ tài khoản</span><strong>{bankAccountName || restaurantName}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Số TK</span><strong>{bankAccount || "Chưa cấu hình"}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Nội dung CK</span><strong>ORDER-{selected.id}</strong></div>
                  </div>
                  {qrUrl ? (
                    <Image src={qrUrl} alt="Mã VietQR thanh toán" width={260} height={260} className="mx-auto mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3" />
                  ) : (
                    <div className="mt-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-center text-sm font-medium text-[var(--muted-foreground)]">
                      Chưa đủ thông tin ngân hàng hoặc chưa có giao dịch để tạo VietQR thật.
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DashboardDrawer>
      ) : null}
    </div>
  );
}
