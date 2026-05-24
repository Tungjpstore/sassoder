"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, ClipboardCopy, Clock3, CreditCard, Filter, ListChecks, Loader2, Printer, QrCode, RadioTower, ReceiptText, RefreshCw, Search, ShieldCheck, TimerReset, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardDrawer } from "@/components/dashboard/shared-drawer";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { resolveOrderPaymentStatus } from "@/lib/orders/order-state-machine";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AdminPaymentTransaction } from "@/services/dashboard-report-service";
import type { PaymentMethod, PaymentStatus } from "@/types/domain";

type PaymentStat = {
  label: string;
  value: string | number;
  meta: string;
  icon: "credit" | "cash" | "qr" | "clock";
};

type PaymentWorkspaceProps = {
  stats: PaymentStat[];
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

type PaymentFilter = "all" | "waiting_confirm" | "waiting_payment" | "paid" | "issues";
type MethodFilter = "all" | PaymentMethod;
type RealtimeState = "connecting" | "connected" | "error";

const paymentFilters: Array<{ label: string; value: PaymentFilter }> = [
  { label: "Tất cả", value: "all" },
  { label: "Chờ xác nhận", value: "waiting_confirm" },
  { label: "Chưa thu", value: "waiting_payment" },
  { label: "Đã thu", value: "paid" },
  { label: "Cần rà soát", value: "issues" }
];

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function formatClock(value: Date | null) {
  if (!value) return "Đang đồng bộ";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
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

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Realtime thanh toán đang bật";
  if (status === "error") return "Realtime thanh toán gián đoạn";
  return "Đang kết nối realtime";
}

function effectivePaymentStatus(order: Pick<AdminPaymentTransaction, "status" | "paymentStatus">): PaymentStatus | "cancelled" {
  if (order.status === "cancelled") return "cancelled";
  return resolveOrderPaymentStatus({
    status: order.status,
    paymentStatus: order.paymentStatus as PaymentStatus | null
  });
}

function readConfirmedPaymentPayload(value: unknown): Partial<AdminPaymentTransaction> {
  if (!value || typeof value !== "object") {
    return { status: "paid", paymentStatus: "paid" };
  }

  const payload = value as {
    status?: AdminPaymentTransaction["status"];
    payment_status?: PaymentStatus | null;
    payment_method?: PaymentMethod | null;
    total?: number;
  };

  return {
    status: payload.status ?? "paid",
    paymentStatus: payload.payment_status ?? "paid",
    method: payload.payment_method ?? undefined,
    amount: typeof payload.total === "number" ? payload.total : undefined
  };
}

function minutesSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function paymentNeedsReview(order: AdminPaymentTransaction) {
  const state = effectivePaymentStatus(order);
  return state === "failed" || state === "refunded" || state === "cancelled";
}

function paymentNeedsAction(order: AdminPaymentTransaction) {
  const state = effectivePaymentStatus(order);
  return state === "waiting_confirm" || state === "waiting_payment";
}

function paymentPriorityScore(order: AdminPaymentTransaction) {
  const state = effectivePaymentStatus(order);
  const age = minutesSince(order.createdAt);
  if (state === "waiting_confirm") return 1000 + age * 4 + Math.round(order.amount / 10_000);
  if (state === "waiting_payment") return 620 + age * 3 + Math.round(order.amount / 20_000);
  if (paymentNeedsReview(order)) return 520 + age;
  return age;
}

function paymentAgeLabel(order: AdminPaymentTransaction) {
  const age = minutesSince(order.createdAt);
  if (age >= 60) return `${Math.floor(age / 60)} giờ ${age % 60} phút`;
  return `${age} phút`;
}

function ageTone(order: AdminPaymentTransaction): "green" | "yellow" | "red" | "blue" | "neutral" {
  const state = effectivePaymentStatus(order);
  const age = minutesSince(order.createdAt);
  if (state === "waiting_confirm" && age >= 10) return "red";
  if (state === "waiting_payment" && age >= 20) return "red";
  if (paymentNeedsAction(order)) return age >= 8 ? "yellow" : "blue";
  if (paymentNeedsReview(order)) return "red";
  return "green";
}

function firstActionablePaymentId(transactions: AdminPaymentTransaction[]) {
  return transactions.find((order) => {
    const paymentState = effectivePaymentStatus(order);
    return paymentState === "waiting_confirm" || paymentState === "waiting_payment";
  })?.id ?? transactions[0]?.id ?? null;
}

function matchesPaymentFilter(order: AdminPaymentTransaction, filter: PaymentFilter, methodFilter: MethodFilter, keyword: string) {
  const state = effectivePaymentStatus(order);
  const matchesStatus =
    filter === "all" ||
    state === filter ||
    (filter === "issues" && paymentNeedsReview(order));
  const matchesMethod = methodFilter === "all" || order.method === methodFilter;
  const matchesKeyword =
    !keyword ||
    order.id.toLowerCase().includes(keyword) ||
    order.tableName.toLowerCase().includes(keyword) ||
    order.itemSummary.toLowerCase().includes(keyword) ||
    paymentMethodLabel(order.method).toLowerCase().includes(keyword);

  return matchesStatus && matchesMethod && matchesKeyword;
}

function TreasuryCommandCenter({
  bankReady,
  paymentHealthScore,
  waitingConfirmCount,
  unpaidCount,
  reviewCount,
  pendingAmount,
  staleWaitingTransactions,
  urgentTransactions,
  cashRevenue,
  qrRevenue,
  totalPaid,
  waitingAmount,
  onFilter,
  onSelect
}: {
  bankReady: boolean;
  paymentHealthScore: number;
  waitingConfirmCount: number;
  unpaidCount: number;
  reviewCount: number;
  pendingAmount: number;
  staleWaitingTransactions: AdminPaymentTransaction[];
  urgentTransactions: AdminPaymentTransaction[];
  cashRevenue: number;
  qrRevenue: number;
  totalPaid: number;
  waitingAmount: number;
  onFilter: (filter: PaymentFilter, method: MethodFilter) => void;
  onSelect: (id: string) => void;
}) {
  const staleAmount = staleWaitingTransactions.reduce((sum, order) => sum + order.amount, 0);
  const treasuryTone = paymentHealthScore >= 85 ? "green" : paymentHealthScore >= 65 ? "yellow" : "red";
  const firstUrgent = urgentTransactions[0] ?? staleWaitingTransactions[0] ?? null;
  const checks = [
    {
      id: "confirm",
      label: "Chuyển khoản đã xác nhận",
      value: waitingConfirmCount.toLocaleString("vi-VN"),
      done: waitingConfirmCount === 0,
      action: () => onFilter("waiting_confirm", "all")
    },
    {
      id: "unpaid",
      label: "Bill chưa thu được gom",
      value: unpaidCount.toLocaleString("vi-VN"),
      done: unpaidCount === 0,
      action: () => onFilter("waiting_payment", "all")
    },
    {
      id: "issues",
      label: "Giao dịch lỗi đã rà",
      value: reviewCount.toLocaleString("vi-VN"),
      done: reviewCount === 0,
      action: () => onFilter("issues", "all")
    },
    {
      id: "qr",
      label: "VietQR đủ cấu hình",
      value: bankReady ? "OK" : "Thiếu",
      done: bankReady,
      action: () => onFilter("all", "QR")
    }
  ];

  return (
    <section className="dashboard-panel dashboard-command-center p-3">
      <div className="grid gap-3 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow">Treasury command</p>
              <h2 className="dashboard-section-title mt-1">Điều phối tiền trong ca</h2>
            </div>
            <Badge tone={treasuryTone}>Health {paymentHealthScore}%</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Tiền chờ xử lý</p>
              <p className="metric-number mt-1 text-lg font-semibold text-[var(--foreground)]">{formatVnd(pendingAmount)}</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Quá ngưỡng</p>
              <p className="metric-number mt-1 text-lg font-semibold text-[var(--foreground)]">{formatVnd(staleAmount)}</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Tỷ trọng VietQR</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{percent(qrRevenue, totalPaid)}%</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Tiền mặt</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{percent(cashRevenue, totalPaid + waitingAmount)}%</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Checklist chốt quỹ</p>
              <Badge tone={checks.every((item) => item.done) ? "green" : "yellow"}>{checks.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--primary)]"
                >
                  <span className="truncate text-xs font-semibold text-[var(--foreground)]">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Bill cần thu trước</p>
              <Badge tone={firstUrgent ? ageTone(firstUrgent) : "green"}>{firstUrgent ? "Có bill" : "Sạch"}</Badge>
            </div>
            {firstUrgent ? (
              <button
                type="button"
                onClick={() => onSelect(firstUrgent.id)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{firstUrgent.tableName}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted-foreground)]">
                      #{firstUrgent.id.slice(0, 8).toUpperCase()} · {paymentAgeLabel(firstUrgent)}
                    </span>
                  </span>
                  <Badge tone={ageTone(firstUrgent)}>{paymentStatusLabel(effectivePaymentStatus(firstUrgent))}</Badge>
                </div>
                <p className="metric-number mt-2 text-xl font-semibold text-[var(--accent)]">{formatVnd(firstUrgent.amount)}</p>
                <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">{firstUrgent.itemSummary}</p>
              </button>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                Không còn bill cần thu hoặc đối soát ngay.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PaymentsWorkspace({
  stats,
  transactions,
  restaurantId,
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
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [query, setQuery] = useState("");
  const [copiedTransferId, setCopiedTransferId] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => new Date());
  const [networkOnline, setNetworkOnline] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const refreshTimerRef = useRef<number | null>(null);
  const localTransactions = useMemo(
    () =>
      transactions.map((transaction) => ({
        ...transaction,
        ...transactionOverrides[transaction.id]
      })),
    [transactionOverrides, transactions]
  );

  const visibleTransactions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return localTransactions
      .filter((order) => matchesPaymentFilter(order, filter, methodFilter, keyword))
      .sort((a, b) => paymentPriorityScore(b) - paymentPriorityScore(a));
  }, [filter, localTransactions, methodFilter, query]);

  const selected = localTransactions.find((order) => order.id === selectedId) ?? localTransactions[0] ?? null;
  const qrUrl =
    selected && bankCode && bankAccount
      ? buildClientVietQrUrl({ bank: bankCode, account: bankAccount, amount: selected.amount, orderId: selected.id })
      : null;

  const methodRows = useMemo(
    () => [
      { label: "Tiền mặt", value: cashRevenue, color: "bg-[var(--primary)]", icon: Banknote },
      { label: "VietQR", value: qrRevenue, color: "bg-[var(--accent)]", icon: QrCode },
      { label: "Chưa thanh toán", value: waitingAmount, color: "bg-[var(--secondary)]", icon: Clock3 }
    ],
    [cashRevenue, qrRevenue, waitingAmount]
  );
  const waitingConfirmCount = localTransactions.filter((order) => effectivePaymentStatus(order) === "waiting_confirm").length;
  const unpaidCount = localTransactions.filter((order) => effectivePaymentStatus(order) === "waiting_payment").length;
  const paidTodayCount = localTransactions.filter((order) => effectivePaymentStatus(order) === "paid").length;
  const reviewCount = localTransactions.filter(paymentNeedsReview).length;
  const pendingAmount = localTransactions
    .filter(paymentNeedsAction)
    .reduce((sum, order) => sum + order.amount, 0);
  const staleWaitingTransactions = localTransactions.filter((order) => {
    const state = effectivePaymentStatus(order);
    const age = minutesSince(order.createdAt);
    return (state === "waiting_confirm" && age >= 10) || (state === "waiting_payment" && age >= 20);
  });
  const staleWaitingAmount = staleWaitingTransactions.reduce((sum, order) => sum + order.amount, 0);
  const urgentTransactions = localTransactions
    .filter(paymentNeedsAction)
    .sort((a, b) => paymentPriorityScore(b) - paymentPriorityScore(a))
    .slice(0, 3);
  const hasPaymentWork = waitingConfirmCount > 0 || unpaidCount > 0 || reviewCount > 0;
  const fallbackRefreshMs = realtimeState === "connected" ? 30_000 : 10_000;
  const pendingTone = waitingConfirmCount > 0 ? "yellow" : unpaidCount > 0 ? "blue" : reviewCount > 0 ? "red" : "green";
  const pendingLabel = waitingConfirmCount > 0 ? `${waitingConfirmCount} chờ xác nhận` : unpaidCount > 0 ? `${unpaidCount} chưa thu` : reviewCount > 0 ? `${reviewCount} cần rà soát` : "Dòng tiền ổn";
  const paymentHealthScore = Math.max(0, 100 - waitingConfirmCount * 12 - unpaidCount * 7 - reviewCount * 10 - staleWaitingTransactions.length * 8);
  const closeChecklist = [
    {
      label: "Xác nhận chuyển khoản",
      helper: waitingConfirmCount > 0 ? `${waitingConfirmCount} bill cần đối chiếu ngân hàng` : "Không còn bill báo chuyển khoản",
      done: waitingConfirmCount === 0,
      href: "/dashboard/orders?status=waiting_confirm"
    },
    {
      label: "Thu các bill còn mở",
      helper: unpaidCount > 0 ? `${unpaidCount} bill chưa thu · ${formatVnd(pendingAmount)}` : "Không có bill chưa thu trong danh sách",
      done: unpaidCount === 0,
      href: "/dashboard/orders?status=waiting_payment"
    },
    {
      label: "Rà soát giao dịch lỗi",
      helper: reviewCount > 0 ? `${reviewCount} giao dịch cần kiểm tra thủ công` : "Không có giao dịch lỗi/hoàn tiền",
      done: reviewCount === 0,
      href: "/dashboard/payments"
    },
    {
      label: "Cấu hình VietQR",
      helper: bankCode && bankAccount ? `${bankCode} · ${bankAccount}` : "Thiếu ngân hàng hoặc số tài khoản nhận tiền",
      done: Boolean(bankCode && bankAccount),
      href: "/dashboard/settings?section=payments"
    }
  ];
  const statIcons = {
    credit: CreditCard,
    cash: Banknote,
    qr: QrCode,
    clock: Clock3
  };

  useEffect(() => {
    const updateNetworkStatus = () => setNetworkOnline(window.navigator.onLine);
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    updateNetworkStatus();
    return () => {
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("focus", updateVisibility);
    updateVisibility();
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("focus", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!networkOnline || !pageVisible || !hasPaymentWork) return;
    const timer = window.setInterval(() => {
      setLastSyncedAt(new Date());
      router.refresh();
    }, fallbackRefreshMs);
    return () => window.clearInterval(timer);
  }, [fallbackRefreshMs, hasPaymentWork, networkOnline, pageVisible, router]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        setLastSyncedAt(new Date());
        router.refresh();
      }, 420);
    };

    const channel = supabase
      .channel(`admin-payments:${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_logs", filter: `restaurant_id=eq.${restaurantId}` },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
      });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  const confirmPayment = useCallback(async (orderId: string) => {
    setMutatingId(orderId);
    setError(null);
    setNotice(null);
    const previousOverride = transactionOverrides[orderId];
    const target = localTransactions.find((transaction) => transaction.id === orderId);
    setTransactionOverrides((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        paymentStatus: "paid",
        method: target?.method ?? "QR"
      }
    }));

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/confirm-payment`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin"
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không xác nhận được thanh toán");
      const confirmedPayload = readConfirmedPaymentPayload(json.data);
      setTransactionOverrides((current) => ({
        ...current,
        [orderId]: {
          ...current[orderId],
          ...confirmedPayload,
          paymentStatus: "paid",
          method: confirmedPayload.method ?? current[orderId]?.method ?? target?.method ?? "QR"
        }
      }));
      setNotice("Đã xác nhận thanh toán. Nếu là đơn online trả trước, đơn sẽ quay về bước quán xác nhận để bếp xử lý.");
      setLastSyncedAt(new Date());
      router.refresh();
      window.setTimeout(() => router.refresh(), 900);
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
  }, [localTransactions, router, transactionOverrides]);

  async function copyTransferContent(order: AdminPaymentTransaction) {
    const content = `ORDER-${order.id}`;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTransferId(order.id);
      window.setTimeout(() => setCopiedTransferId(null), 1800);
    } catch {
      setError("Không copy được nội dung chuyển khoản. Vui lòng copy thủ công trong chi tiết bill.");
    }
  }

  return (
    <div className="dashboard-operations-stack grid gap-3">
      <section className="admin-hero-panel rounded-[14px] p-4">
        <div className="relative z-[1] grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
                <span className="inline-flex items-center gap-1.5">
                  <RadioTower size={13} />
                  {realtimeLabel(realtimeState)}
                </span>
              </Badge>
              <Badge tone={pendingTone}>{pendingLabel}</Badge>
              <Badge tone={bankCode && bankAccount ? "green" : "yellow"}>{bankCode && bankAccount ? "VietQR sẵn sàng" : "Thiếu cấu hình QR"}</Badge>
            </div>
            <h2 className="dashboard-page-title mt-3">Trung tâm thanh toán & VietQR</h2>
            <p className="dashboard-body-copy mt-2 max-w-3xl">
              Gom toàn bộ tiền mặt, VietQR, bill chờ xác nhận và giao dịch cần rà soát vào một màn để thu tiền nhanh, rõ, ít nhầm lúc đông khách.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/85 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-[var(--muted-foreground)]">
              <span>Cập nhật</span>
              <strong className="text-[var(--foreground)]">{formatClock(lastSyncedAt)}</strong>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilter(waitingConfirmCount > 0 ? "waiting_confirm" : unpaidCount > 0 ? "waiting_payment" : "all");
                  setMethodFilter("all");
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary-strong)] px-3 text-sm font-semibold text-[var(--background)]"
              >
                <ShieldCheck size={15} />
                Ưu tiên
              </button>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)]"
              >
                <RefreshCw size={15} />
                Làm mới
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-mobile-metric-grid grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = statIcons[stat.icon];
          return (
            <div key={stat.label} className="admin-stat-tile rounded-[14px] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">{stat.label}</p>
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

      <TreasuryCommandCenter
        bankReady={Boolean(bankCode && bankAccount)}
        paymentHealthScore={paymentHealthScore}
        waitingConfirmCount={waitingConfirmCount}
        unpaidCount={unpaidCount}
        reviewCount={reviewCount}
        pendingAmount={pendingAmount}
        staleWaitingTransactions={staleWaitingTransactions}
        urgentTransactions={urgentTransactions}
        cashRevenue={cashRevenue}
        qrRevenue={qrRevenue}
        totalPaid={totalPaid}
        waitingAmount={waitingAmount}
        onFilter={(nextFilter, nextMethod) => {
          setFilter(nextFilter);
          setMethodFilter(nextMethod);
        }}
        onSelect={setSelectedId}
      />

      <section className="dashboard-mobile-hide grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="dashboard-panel p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="dashboard-eyebrow">Cash close</p>
              <h2 className="dashboard-section-title mt-1">Checklist chốt tiền trong ca</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Những điểm cần sạch trước khi chủ quán đóng quỹ hoặc bàn giao ca.</p>
            </div>
            <span className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)]">
              <ListChecks size={16} />
              Sức khoẻ tiền {paymentHealthScore}%
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {closeChecklist.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`group flex min-h-[92px] items-start gap-3 rounded-xl border p-3 transition hover:border-[var(--primary)] ${
                  item.done
                    ? "border-[var(--primary)]/15 bg-[var(--primary-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${
                  item.done
                    ? "border-[var(--primary)]/20 bg-[var(--surface)] text-[var(--primary)]"
                    : "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                }`}>
                  {item.done ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--foreground)]">{item.label}</span>
                  <span className="mt-1 block text-xs font-medium leading-5 text-[var(--muted-foreground)]">{item.helper}</span>
                </span>
                <ArrowRight size={15} className="ml-auto mt-1 shrink-0 text-[var(--muted-foreground)] transition group-hover:text-[var(--primary)]" />
              </Link>
            ))}
          </div>
        </div>

        <div className="dashboard-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow">Aging risk</p>
              <h2 className="dashboard-section-title mt-1">Bill chậm xử lý</h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <TimerReset size={18} />
            </span>
          </div>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--foreground)]">Quá ngưỡng</span>
              <span className="metric-number text-lg font-semibold text-[var(--accent)]">{staleWaitingTransactions.length}</span>
            </div>
            <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">{formatVnd(staleWaitingAmount)} đang cần đối soát nhanh.</p>
          </div>
          <div className="mt-3 grid gap-2">
            {staleWaitingTransactions.slice(0, 3).length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                Không có bill quá ngưỡng xử lý.
              </div>
            ) : (
              staleWaitingTransactions.slice(0, 3).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedId(order.id)}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--primary)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{order.tableName}</span>
                    <span className="block text-xs font-medium text-[var(--muted-foreground)]">{paymentAgeLabel(order)} · {paymentStatusLabel(effectivePaymentStatus(order))}</span>
                  </span>
                  <span className="metric-number shrink-0 text-sm font-semibold text-[var(--accent)]">{formatVnd(order.amount)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-white">
                <ReceiptText size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">Hàng chờ thu tiền</p>
                <p className="text-xs font-medium text-[var(--muted-foreground)]">Ưu tiên bill khách đã báo chuyển khoản hoặc chưa hoàn tất thanh toán.</p>
              </div>
            </div>
            <span className="metric-number rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
              {formatVnd(pendingAmount)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {urgentTransactions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)] lg:col-span-3">
                Không có bill cần thu ngay.
              </div>
            ) : (
              urgentTransactions.map((order) => {
                const paymentState = effectivePaymentStatus(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className="min-h-[104px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-[var(--shadow-soft)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{order.tableName}</span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted-foreground)]">#{order.id.slice(0, 8).toUpperCase()} · {paymentAgeLabel(order)}</span>
                      </span>
                      <Badge tone={ageTone(order)}>{paymentStatusLabel(paymentState)}</Badge>
                    </div>
                    <p className="metric-number mt-2 text-lg font-semibold text-[var(--accent)]">{formatVnd(order.amount)}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">{order.itemSummary}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <WalletCards size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Đối soát nhanh</p>
              <p className="text-xs font-medium text-[var(--muted-foreground)]">Tỷ trọng tiền đã thu hôm nay.</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-sm font-semibold">
            <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">VietQR</span><strong>{percent(qrRevenue, totalPaid)}%</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Tiền mặt</span><strong>{percent(cashRevenue, totalPaid)}%</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Cần rà soát</span><strong>{reviewCount}</strong></div>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-[var(--tertiary)]/12 bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--tertiary)]">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3 text-sm font-semibold text-[var(--primary)]">{notice}</div> : null}

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="dashboard-panel p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Giao dịch gần đây</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Chạm vào từng giao dịch để mở chi tiết và xác nhận thanh toán nhanh.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/orders?status=waiting_confirm" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)]">
                Chờ xác nhận
              </Link>
              <Link href="/dashboard/settings?section=payments" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white">
                Cấu hình VietQR
              </Link>
            </div>
          </div>

          <div className="dashboard-ops-toolbar mb-3 grid gap-2 xl:grid-cols-[180px_160px_minmax(0,1fr)_110px]">
            <label className="grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Trạng thái
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as PaymentFilter)}
                className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
              >
                {paymentFilters.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Phương thức
              <select
                value={methodFilter}
                onChange={(event) => setMethodFilter(event.target.value as MethodFilter)}
                className="h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)] outline-none"
              >
                <option value="all">Tất cả</option>
                <option value="QR">VietQR</option>
                <option value="CASH">Tiền mặt</option>
              </select>
            </label>
            <label className="relative block self-end">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--outline)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm mã bill, bàn, món, phương thức..."
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-sm font-medium outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setMethodFilter("all");
                setQuery("");
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)]"
            >
              <Filter size={16} />
              Xoá lọc
            </button>
          </div>

          <div className="dashboard-data-surface overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="dashboard-muted-header grid grid-cols-[1.2fr_0.9fr_1.5fr_0.9fr_1fr_112px] gap-3 px-4 py-3 text-xs font-semibold uppercase max-lg:hidden">
              <span>Mã thanh toán</span>
              <span>Bàn/Đơn</span>
              <span>Hóa đơn gồm</span>
              <span>Phương thức</span>
              <span>Trạng thái</span>
              <span>Số tiền</span>
            </div>
            <div className="dashboard-data-list divide-y divide-[var(--border)]">
              {visibleTransactions.length === 0 && (
                <div className="grid min-h-48 place-items-center px-5 py-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  <div className="max-w-md">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
                      <Search size={18} />
                    </span>
                    <h3 className="mt-3 text-base font-semibold text-[var(--foreground)]">Không có giao dịch trong bộ lọc này</h3>
                    <p className="mt-1 leading-6">Đổi trạng thái, phương thức hoặc xoá lọc để xem lại toàn bộ thanh toán.</p>
                  </div>
                </div>
              )}
              {visibleTransactions.map((order) => {
                const isSelected = selected?.id === order.id;
                const paymentState = effectivePaymentStatus(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className={`dashboard-data-row dashboard-selectable-row grid w-full gap-3 border-l-4 px-4 py-3 text-left lg:grid-cols-[1.2fr_0.9fr_1.5fr_0.9fr_1fr_112px] ${
                      paymentState === "waiting_confirm"
                        ? "border-l-[var(--accent)]"
                        : paymentState === "waiting_payment"
                          ? "border-l-[var(--primary)]"
                          : paymentNeedsReview(order)
                            ? "border-l-[var(--tertiary)]"
                            : "border-l-transparent"
                    } ${isSelected ? "dashboard-selected-row" : ""}`}
                  >
                    <span className="dashboard-data-field font-mono text-sm font-semibold" data-label="Mã thanh toán">#PAY{order.id.slice(0, 8).toUpperCase()}</span>
                    <span className="dashboard-data-field text-sm font-semibold" data-label="Bàn/Đơn">{order.tableName}</span>
                    <span className="dashboard-data-field truncate text-sm font-medium text-[var(--muted-foreground)]" data-label="Hóa đơn gồm">{order.itemSummary}</span>
                    <span className="dashboard-data-field" data-label="Phương thức"><Badge tone={order.method === "QR" ? "green" : "neutral"}>{paymentMethodLabel(order.method as PaymentMethod | null)}</Badge></span>
                    <span className="dashboard-data-field" data-label="Trạng thái"><Badge tone={statusTone(paymentState)}>{paymentStatusLabel(paymentState)}</Badge></span>
                    <span className="dashboard-data-field flex items-center justify-between gap-3 lg:justify-end" data-label="Số tiền">
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
              <span>Đang hiển thị {visibleTransactions.length} / {localTransactions.length} giao dịch từ dữ liệu thật.</span>
              <button type="button" onClick={() => router.refresh()} className="font-semibold text-[var(--primary)]">Làm mới</button>
            </div>
          </div>
        </div>

        <aside className="grid gap-3">
          <div className="dashboard-panel p-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Ưu tiên xử lý</h2>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Chờ xác nhận tiền</p>
                <p className="metric-number mt-2 text-2xl font-semibold text-[var(--foreground)]">{waitingConfirmCount}</p>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Các bill khách đã báo chuyển khoản.</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Chưa thu tiền</p>
                <p className="metric-number mt-2 text-2xl font-semibold text-[var(--foreground)]">{unpaidCount}</p>
                <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Theo dõi các bill còn mở hoặc chờ khách thanh toán.</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Đã thu hôm nay</p>
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
                <div className="grid gap-2">
                  {error ? (
                    <div role="alert" className="rounded-xl border border-[var(--tertiary)]/12 bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--tertiary)]">
                      {error}
                    </div>
                  ) : null}
                  {notice ? (
                    <div role="status" className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3 text-sm font-semibold text-[var(--primary)]">
                      {notice}
                    </div>
                  ) : null}
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
                    <Button type="button" variant="secondary" onClick={() => copyTransferContent(selected)} className="shadow-none hover:shadow-none">
                      <ClipboardCopy size={16} />
                      {copiedTransferId === selected.id ? "Đã copy" : "Copy nội dung"}
                    </Button>
                    <Link href="/dashboard/settings?section=payments" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-4 text-sm font-semibold text-[var(--primary-strong)] sm:col-span-2">
                      <RefreshCw size={16} />
                      Cấu hình QR
                    </Link>
                  </div>
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
                      <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Tổng quan bill</p>
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
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted-foreground)]">Nội dung CK</span>
                      <button
                        type="button"
                        onClick={() => copyTransferContent(selected)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 text-xs font-semibold text-[var(--primary)]"
                      >
                        <ClipboardCopy size={13} />
                        {copiedTransferId === selected.id ? "Đã copy" : `ORDER-${selected.id}`}
                      </button>
                    </div>
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
