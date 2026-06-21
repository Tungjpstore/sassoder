"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, CheckCircle2, ClipboardCopy, Clock3, CreditCard, Filter, Loader2, Printer, QrCode, RadioTower, ReceiptText, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardDrawer } from "@/components/dashboard/shared-drawer";
import { useToast } from "@/components/dashboard/toast-provider";
import { readDashboardApiResponse } from "@/lib/dashboard/api-response";
import { getDashboardActionErrorToast, resolveDashboardActionToast } from "@/lib/dashboard/order-actions";
import { paymentMethodLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { resolveOrderPaymentStatus } from "@/lib/orders/order-state-machine";
import { inferManualConfirmationMethod } from "@/lib/payments/manual-confirmation";
import { OPERATIONAL_REALTIME_EVENTS, useVpsRealtime } from "@/lib/realtime/vps-socket-client";
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

function paymentNeedsReview(order: AdminPaymentTransaction) {
  const state = effectivePaymentStatus(order);
  return state === "failed" || state === "refunded" || state === "cancelled";
}

function paymentNeedsAction(order: AdminPaymentTransaction) {
  const state = effectivePaymentStatus(order);
  return state === "waiting_confirm" || state === "waiting_payment";
}

function transactionTimestamp(order: AdminPaymentTransaction) {
  return new Date(order.createdAt).getTime();
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
  const toast = useToast();
  const [transactionOverrides, setTransactionOverrides] = useState<Record<string, Partial<AdminPaymentTransaction>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      .sort((a, b) => transactionTimestamp(b) - transactionTimestamp(a));
  }, [filter, localTransactions, methodFilter, query]);

  const selected = selectedId ? localTransactions.find((order) => order.id === selectedId) ?? null : null;

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
  const hasPaymentWork = waitingConfirmCount > 0 || unpaidCount > 0 || reviewCount > 0;
  const fallbackRefreshMs = realtimeState === "connected" ? 30_000 : 10_000;
  const pendingTone = waitingConfirmCount > 0 ? "yellow" : unpaidCount > 0 ? "blue" : reviewCount > 0 ? "red" : "green";
  const pendingLabel = waitingConfirmCount > 0 ? `${waitingConfirmCount} chờ xác nhận` : unpaidCount > 0 ? `${unpaidCount} chưa thu` : reviewCount > 0 ? `${reviewCount} cần rà soát` : "Dòng tiền ổn";
  const quickFilters: Array<{ label: string; value: string | number; tone: "neutral" | "green" | "yellow" | "blue" | "red"; filter: PaymentFilter }> = [
    { label: "Tất cả", value: localTransactions.length, tone: "neutral", filter: "all" },
    { label: "Chờ xác nhận", value: waitingConfirmCount, tone: "yellow", filter: "waiting_confirm" },
    { label: "Chưa thu", value: unpaidCount, tone: "blue", filter: "waiting_payment" },
    { label: "Đã thu", value: paidTodayCount, tone: "green", filter: "paid" },
    { label: "Cần rà soát", value: reviewCount, tone: "red", filter: "issues" }
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

  useVpsRealtime({
    restaurantId,
    events: OPERATIONAL_REALTIME_EVENTS,
    onStateChange: setRealtimeState,
    onEvent: () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        setLastSyncedAt(new Date());
        router.refresh();
      }, 220);
    }
  });

  const confirmPayment = useCallback(async (orderId: string) => {
    setMutatingId(orderId);
    setError(null);
    setNotice(null);
    const previousOverride = transactionOverrides[orderId];
    const target = localTransactions.find((transaction) => transaction.id === orderId);
    const paymentMethod = inferManualConfirmationMethod({
      currentMethod: target?.method,
      status: target?.status,
      paymentStatus: target?.paymentStatus as PaymentStatus | null
    });
    setTransactionOverrides((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        paymentStatus: "paid",
        method: paymentMethod ?? target?.method ?? null
      }
    }));

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/confirm-payment`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: paymentMethod ? { "Content-Type": "application/json" } : undefined,
        body: paymentMethod ? JSON.stringify({ paymentMethod }) : undefined
      });
      const data = await readDashboardApiResponse(response, "Không xác nhận được thanh toán");
      const confirmedPayload = readConfirmedPaymentPayload(data);
      setTransactionOverrides((current) => ({
        ...current,
        [orderId]: {
          ...current[orderId],
          ...confirmedPayload,
          paymentStatus: "paid",
          method: confirmedPayload.method ?? current[orderId]?.method ?? paymentMethod ?? target?.method ?? null
        }
      }));
      setNotice("Đã xác nhận đã nhận tiền. Nếu khách mất phiên hoặc thoát màn hình thanh toán, hệ thống vẫn chốt bill và đồng bộ về bếp.");
      toast.success(resolveDashboardActionToast("confirm-payment"));
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
      const message = err instanceof Error ? err.message : "Không xác nhận được thanh toán";
      setError(message);
      toast.error(getDashboardActionErrorToast(err, "Không xác nhận được thanh toán"));
    } finally {
      setMutatingId(null);
    }
  }, [localTransactions, router, toast, transactionOverrides]);

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
            <h2 className="dashboard-page-title mt-3">Thanh toán</h2>
            <p className="sr-only">Giao dịch mới nhất, VietQR và bill cần xác nhận.</p>
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
                <ReceiptText size={15} />
                Chờ tiền
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

      {error ? <div className="rounded-xl border border-[var(--tertiary)]/12 bg-[var(--danger-soft)] p-3 text-sm font-semibold text-[var(--tertiary)]">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] p-3 text-sm font-semibold text-[var(--primary)]">{notice}</div> : null}

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="dashboard-panel p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Giao dịch gần đây</h2>
              <p className="mt-1 text-sm font-medium text-[var(--muted-foreground)]">Mới nhất lên trước, lọc nhanh theo trạng thái hoặc phương thức.</p>
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
            <div className="dashboard-muted-header grid grid-cols-[150px_0.9fr_1.4fr_0.8fr_0.9fr_112px] gap-3 px-4 py-3 text-xs font-semibold uppercase max-lg:hidden">
              <span>Thời gian</span>
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
                    className={`dashboard-data-row dashboard-selectable-row grid w-full gap-3 border-l-4 px-4 py-3 text-left lg:grid-cols-[150px_0.9fr_1.4fr_0.8fr_0.9fr_112px] ${
                      paymentState === "waiting_confirm"
                        ? "border-l-[var(--accent)]"
                        : paymentState === "waiting_payment"
                          ? "border-l-[var(--primary)]"
                          : paymentNeedsReview(order)
                            ? "border-l-[var(--tertiary)]"
                          : "border-l-transparent"
                    } ${isSelected ? "dashboard-selected-row" : ""}`}
                  >
                    <span className="dashboard-data-field text-sm font-semibold" data-label="Thời gian">
                      <span className="block">{formatDateTime(order.createdAt)}</span>
                      <span className="mt-0.5 block font-mono text-xs text-[var(--muted-foreground)]">#PAY{order.id.slice(0, 8).toUpperCase()}</span>
                    </span>
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

        <aside className="grid content-start gap-3">
          <div className="dashboard-panel p-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Tóm tắt nhanh</h2>
            <div className="mt-3 grid gap-2">
              {quickFilters.map((item) => {
                const active = filter === item.filter && methodFilter === "all";
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setFilter(item.filter);
                      setMethodFilter("all");
                    }}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 text-left transition hover:border-[var(--primary)] ${
                      active ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] bg-[var(--surface)]"
                    }`}
                  >
                    <span className="text-sm font-semibold text-[var(--foreground)]">{item.label}</span>
                    <Badge tone={item.tone}>{item.value}</Badge>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">Tiền đang chờ</p>
              <p className="metric-number mt-1 text-xl font-semibold text-[var(--foreground)]">{formatVnd(pendingAmount)}</p>
            </div>
          </div>

          <div className="dashboard-panel p-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Phương thức hôm nay</h2>
            <div className="mt-4 grid gap-3">
              {methodRows.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="grid gap-2">
                    <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                      <span className="inline-flex min-w-0 items-center gap-2 text-[var(--foreground)]">
                        <Icon size={15} className="shrink-0 text-[var(--primary)]" />
                        <span className="truncate">{row.label}</span>
                      </span>
                      <span className="metric-number shrink-0">{formatVnd(row.value)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--soft-surface)]">
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${percent(row.value, totalPaid + waitingAmount)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dashboard-panel p-4">
            <div className="flex items-center gap-2">
              <QrCode size={18} className="text-[var(--primary)]" />
              <h2 className="text-lg font-semibold text-[var(--foreground)]">VietQR đang dùng</h2>
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Ngân hàng</span><strong>{bankCode || "Chưa cấu hình"}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Chủ tài khoản</span><strong className="text-right">{bankAccountName || restaurantName}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Số tài khoản</span><strong>{bankAccount || "Chưa cấu hình"}</strong></div>
            </div>
            <Link href="/dashboard/settings?section=payments" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white">
              <RefreshCw size={16} />
              Chỉnh thông tin nhận tiền
            </Link>
          </div>
        </aside>
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
                      {paymentState === "paid" ? "Đã thanh toán" : "Xác nhận đã nhận tiền"}
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
                  {(selected.items ?? []).length > 0 ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] text-sm">
                      {(selected.items ?? []).map((item, index) => (
                        <div key={`${item.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[var(--foreground)]">{item.name}</p>
                            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.quantity} x {formatVnd(item.price)}</p>
                          </div>
                          <p className="font-semibold tabular-nums text-[var(--foreground)]">{formatVnd(item.lineTotal)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm">
                      <p className="text-[var(--muted-foreground)]">Hóa đơn gồm</p>
                      <p className="mt-1 font-semibold text-[var(--foreground)]">{selected.itemSummary}</p>
                    </div>
                  )}
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
