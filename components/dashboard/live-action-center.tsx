"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChefHat,
  Clock3,
  CreditCard,
  Loader2,
  RadioTower,
  ReceiptText,
  TimerReset,
  Utensils,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orderStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { OrderDto, ServiceRequestDto } from "@/types/domain";

type QuickActionKind = "accept" | "complete" | "timer" | "confirm-payment" | "resolve-request";
type RealtimeState = "connecting" | "connected" | "error";

type QuickAction = {
  key: string;
  orderId?: string;
  requestId?: string;
  billId?: string | null;
  kind: QuickActionKind;
  priority: number;
  title: string;
  subtitle: string;
  amount: number;
  label: string;
  icon: typeof Bell;
  tone: "green" | "yellow" | "blue" | "red";
  body?: unknown;
  href: string;
};

function minutesUntil(value?: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
}

function minutesSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function orderLocationLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return "Giao hàng";
  if (order.fulfillmentType === "PICKUP") return "Đến lấy";
  return order.table?.name ?? "Không rõ bàn";
}

function actionEndpoint(kind: QuickActionKind) {
  if (kind === "accept") return "accept";
  if (kind === "complete") return "complete";
  if (kind === "timer") return "timer";
  if (kind === "resolve-request") return "";
  return "confirm-payment";
}

function actionSummary(orders: OrderDto[], requests: ServiceRequestDto[]) {
  const paymentKeys = new Set<string>();
  let pending = 0;
  let serving = 0;
  let overdue = 0;

  for (const order of orders) {
    if (order.status === "pending") pending += 1;
    if (order.status === "ordering") serving += 1;
    const dueIn = minutesUntil(order.serviceDueAt);
    if (order.status === "ordering" && dueIn !== null && dueIn < 0) overdue += 1;
    const billStatus = order.bill?.status;
    if (
      billStatus === "waiting_confirm" ||
      billStatus === "waiting_payment" ||
      order.paymentStatus === "waiting_confirm" ||
      order.paymentStatus === "waiting_payment" ||
      order.status === "waiting_confirm" ||
      order.status === "waiting_payment"
    ) {
      paymentKeys.add(order.bill?.id ?? order.id);
    }
  }

  return { pending, serving, overdue, payment: paymentKeys.size, staff: requests.length, total: pending + serving + paymentKeys.size + requests.length };
}

function buildQuickActions(orders: OrderDto[], requests: ServiceRequestDto[]): QuickAction[] {
  const actions: QuickAction[] = [];
  const paymentKeys = new Set<string>();

  for (const request of requests) {
    const minutes = minutesSince(request.createdAt);
    actions.push({
      key: `staff:${request.id}`,
      requestId: request.id,
      kind: "resolve-request",
      priority: minutes >= 3 ? 0 : 1,
      title: `Khách gọi nhân viên - ${request.tableName ?? "Không rõ bàn"}`,
      subtitle: request.message || `${minutes} phút trước · cần hỗ trợ tại bàn`,
      amount: 0,
      label: "Đã hỗ trợ",
      icon: Bell,
      tone: minutes >= 3 ? "red" : "yellow",
      href: "/dashboard/tables"
    });
  }

  for (const order of orders) {
    const location = orderLocationLabel(order);
    const dueIn = minutesUntil(order.serviceDueAt);
    const billStatus = order.bill?.status;
    const paymentStatus = billStatus ?? order.paymentStatus ?? order.status;
    const paymentKey = order.bill?.id ?? order.id;

    if (
      !paymentKeys.has(paymentKey) &&
      (paymentStatus === "waiting_confirm" || paymentStatus === "waiting_payment")
    ) {
      paymentKeys.add(paymentKey);
      actions.push({
        key: `payment:${paymentKey}`,
        orderId: order.id,
        billId: order.bill?.id ?? null,
        kind: "confirm-payment",
        priority: paymentStatus === "waiting_confirm" ? 0 : 1,
        title: paymentStatus === "waiting_confirm" ? `Cần xác nhận thanh toán ${location}` : `Kiểm tra thanh toán ${location}`,
        subtitle: `${order.paymentMethod ?? order.bill?.paymentMethod ?? "Chưa chọn"} · ${orderStatusLabel(order.status)}`,
        amount: order.bill?.total ?? order.total,
        label: "Xác nhận thanh toán",
        icon: CreditCard,
        tone: paymentStatus === "waiting_confirm" ? "yellow" : "blue",
        href: "/dashboard/payments"
      });
      continue;
    }

    if (order.status === "pending") {
      actions.push({
        key: `accept:${order.id}`,
        orderId: order.id,
        kind: "accept",
        priority: 2,
        title: `Đơn mới từ ${location}`,
        subtitle: `${order.items.length} món · ${minutesSince(order.createdAt)} phút trước`,
        amount: order.total,
        label: "Nhận đơn",
        icon: Utensils,
        tone: "green",
        body: { minutes: 15 },
        href: "/dashboard/orders"
      });
      continue;
    }

    if (order.status === "ordering") {
      const isLate = dueIn !== null && dueIn < 0;
      actions.push({
        key: `complete:${order.id}`,
        orderId: order.id,
        kind: "complete",
        priority: isLate ? 2 : 3,
        title: isLate ? `${location} quá giờ ra món` : `${location} đang ra món`,
        subtitle: isLate
          ? `Trễ ${Math.abs(dueIn ?? 0)} phút · ${order.items.length} món`
          : `${order.items.length} món · ${dueIn === null ? "chưa hẹn giờ" : `còn ${Math.max(dueIn, 0)} phút`}`,
        amount: order.total,
        label: "Đã phục vụ",
        icon: isLate ? AlertTriangle : ChefHat,
        tone: isLate ? "red" : "green",
        href: "/dashboard/kitchen"
      });
      actions.push({
        key: `timer:${order.id}`,
        orderId: order.id,
        kind: "timer",
        priority: isLate ? 4 : 5,
        title: isLate ? `Gia hạn ${location}` : `Hẹn giờ ${location}`,
        subtitle: "Cộng thêm 10 phút cho bếp",
        amount: order.total,
        label: "+10 phút",
        icon: TimerReset,
        tone: "yellow",
        body: { minutes: 10 },
        href: "/dashboard/kitchen"
      });
    }
  }

  return actions.sort((a, b) => a.priority - b.priority || b.amount - a.amount).slice(0, 8);
}

function realtimeLabel(state: RealtimeState) {
  if (state === "connected") return "Realtime";
  if (state === "error") return "Mất kết nối";
  return "Đang nối";
}

export function AdminLiveActionCenter({
  restaurantId,
  variant = "popover"
}: {
  restaurantId: string;
  variant?: "popover" | "panel";
}) {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [requests, setRequests] = useState<ServiceRequestDto[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [noticeAction, setNoticeAction] = useState<QuickAction | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const knownActionKeysRef = useRef<Set<string> | null>(null);
  const dismissedNoticeKeysRef = useRef(new Set<string>());

  const loadOrders = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [ordersResponse, requestsResponse] = await Promise.all([
        fetch("/api/admin/orders", { cache: "no-store" }),
        fetch("/api/admin/service-requests", { cache: "no-store" })
      ]);
      const [ordersJson, requestsJson] = await Promise.all([ordersResponse.json(), requestsResponse.json()]);
      if (!ordersJson.ok) throw new Error(ordersJson.error ?? "Không tải được luồng đơn hàng");
      if (!requestsJson.ok) throw new Error(requestsJson.error ?? "Không tải được yêu cầu gọi nhân viên");
      setOrders(ordersJson.data as OrderDto[]);
      setRequests(requestsJson.data as ServiceRequestDto[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được luồng vận hành");
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  const scheduleRefresh = useCallback((delay = 220) => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => void loadOrders({ silent: true }), delay);
  }, [loadOrders]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void loadOrders(), 0);

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`admin-action-center:${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "table_bills", filter: `restaurant_id=eq.${restaurantId}` },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_requests", filter: `restaurant_id=eq.${restaurantId}` },
        () => scheduleRefresh()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
      });

    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadOrders({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(initialLoadTimer);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, [loadOrders, restaurantId, scheduleRefresh]);

  const summary = useMemo(() => actionSummary(orders, requests), [orders, requests]);
  const actions = useMemo(() => buildQuickActions(orders, requests), [orders, requests]);
  const primaryActions = actions.slice(0, 3);

  useEffect(() => {
    const nextKeys = new Set(actions.map((action) => action.key));
    const knownKeys = knownActionKeysRef.current;

    if (!knownKeys) {
      knownActionKeysRef.current = nextKeys;
      return;
    }

    const freshAction = actions.find((action) => !knownKeys.has(action.key) && !dismissedNoticeKeysRef.current.has(action.key));
    if (freshAction) setNoticeAction(freshAction);

    setNoticeAction((current) => {
      if (!current) return current;
      return nextKeys.has(current.key) ? current : null;
    });

    knownActionKeysRef.current = nextKeys;
  }, [actions]);

  function dismissNotice(actionKey?: string) {
    if (actionKey) dismissedNoticeKeysRef.current.add(actionKey);
    setNoticeAction(null);
  }

  async function runAction(action: QuickAction) {
    setMutatingKey(action.key);
    dismissNotice(action.key);
    setError(null);
    const previousOrders = orders;
    const previousRequests = requests;
    const now = new Date();
    const nextDue = new Date(now.getTime() + 10 * 60_000).toISOString();

    if (action.kind === "resolve-request") {
      if (!action.requestId) {
        setMutatingKey(null);
        return;
      }
      setRequests((current) => current.filter((request) => request.id !== action.requestId));
      try {
        const response = await fetch(`/api/admin/service-requests/${action.requestId}/resolve`, {
          method: "POST"
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không xử lý được yêu cầu hỗ trợ");
        scheduleRefresh(80);
      } catch (err) {
        setRequests(previousRequests);
        setError(err instanceof Error ? err.message : "Không xử lý được yêu cầu hỗ trợ");
      } finally {
        setMutatingKey(null);
      }
      return;
    }

    if (!action.orderId) {
      setMutatingKey(null);
      return;
    }

    setOrders((current) =>
      current
        .map((order) => {
          const sameOrder = order.id === action.orderId;
          const sameBill = action.billId && order.bill?.id === action.billId;
          if (action.kind === "confirm-payment" && (sameOrder || sameBill)) return { ...order, status: "paid" as const };
          if (action.kind === "accept" && sameOrder) return { ...order, status: "ordering" as const, acceptedAt: now.toISOString(), serviceDueAt: new Date(now.getTime() + 15 * 60_000).toISOString() };
          if (action.kind === "complete" && sameOrder) return { ...order, status: "completed" as const, servedAt: now.toISOString() };
          if (action.kind === "timer" && sameOrder) return { ...order, serviceDueAt: nextDue };
          return order;
        })
        .filter((order) => order.status !== "paid")
    );

    try {
      const response = await fetch(`/api/admin/orders/${action.orderId}/${actionEndpoint(action.kind)}`, {
        method: "POST",
        ...(action.body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(action.body)
            }
          : {})
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Thao tác thất bại");
      scheduleRefresh(80);
    } catch (err) {
      setOrders(previousOrders);
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setMutatingKey(null);
    }
  }

  if (variant === "panel") {
    return (
      <>
        <section className="dashboard-minimal-card flex min-h-0 flex-col p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Realtime queue</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">Việc cần xử lý</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Đơn mới, thanh toán, gọi nhân viên và bàn quá giờ.
              </p>
            </div>
            <Badge tone={realtimeState === "connected" ? "green" : realtimeState === "error" ? "red" : "yellow"}>
              <RadioTower size={13} />
              {realtimeLabel(realtimeState)}
            </Badge>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { label: "Đơn mới", value: summary.pending, tone: "green" as const },
              { label: "Đang phục vụ", value: summary.serving, tone: summary.overdue > 0 ? "red" as const : "green" as const },
              { label: "Thanh toán", value: summary.payment, tone: "yellow" as const },
              { label: "Nhân viên", value: summary.staff, tone: "blue" as const }
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2">
                <p className="truncate text-[11px] font-medium text-[var(--muted-foreground)]">{item.label}</p>
                <p className="metric-number mt-0.5 text-xl font-semibold text-[var(--foreground)]">{item.value}</p>
                {item.label === "Đang phục vụ" && summary.overdue > 0 ? (
                  <p className="text-[10px] font-semibold text-[#BE123C]">{summary.overdue} quá giờ</p>
                ) : null}
              </div>
            ))}
          </div>

          {error ? <div className="mt-3 rounded-lg border border-[#E11D48]/30 bg-[#FFF1F2] p-3 text-xs font-semibold text-[#BE123C]">{error}</div> : null}

          <div className="mt-3 grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1">
            {loading && actions.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center gap-2 rounded-lg bg-[var(--soft-surface)] p-5 text-sm font-medium text-[var(--muted-foreground)]">
                <Loader2 className="animate-spin" size={17} />
                Đang tải luồng vận hành...
              </div>
            ) : actions.length === 0 ? (
              <div className="grid min-h-[120px] place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-5 text-center">
                <div>
                  <CheckCircle2 className="mx-auto text-[var(--primary)]" size={28} />
                  <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">Không có việc gấp</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">Ca bán đang ổn.</p>
                </div>
              </div>
            ) : (
              actions.slice(0, 6).map((action) => (
                <QuickActionRow key={action.key} action={action} pending={mutatingKey === action.key} onRun={() => runAction(action)} />
              ))
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs text-[var(--muted-foreground)]">{summary.total} việc đang chờ</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/orders" className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white">
                Mở đơn hàng
              </Link>
              <Link href="/dashboard/kitchen" className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)]">
                Mở bếp
              </Link>
            </div>
          </div>
        </section>

        {noticeAction ? (
          <FloatingActionNotice
            action={noticeAction}
            pending={mutatingKey === noticeAction.key}
            onRun={() => runAction(noticeAction)}
            onClose={() => dismissNotice(noticeAction.key)}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "relative inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--soft-surface)]",
            summary.total > 0 && "border-[#F28C28]/55 bg-[#FFF7ED] text-[#C76312]"
          )}
          aria-label="Luồng thao tác nhanh"
        >
          <Bell size={18} />
          <span className="hidden xl:inline">{summary.total > 0 ? "Cần xử lý" : "Thông báo"}</span>
          {summary.total > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white">
              {summary.total}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+10px)] z-[70] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">Luồng thao tác nhanh</p>
                <p className="text-xs text-[var(--muted-foreground)]">{summary.pending} đơn mới · {summary.serving} đang phục vụ · {summary.payment} thanh toán · {summary.staff} gọi nhân viên</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--soft-surface)]">
                <X size={17} />
              </button>
            </div>
            {error && <div className="mx-4 mt-3 rounded-xl border border-[#E11D48]/30 bg-[#E11D48]/8 p-3 text-xs font-bold text-[#BE123C]">{error}</div>}
            <div className="max-h-[460px] overflow-y-auto p-3">
              {loading && actions.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-[var(--soft-surface)] p-5 text-sm font-medium text-[var(--muted-foreground)]">
                  <Loader2 className="animate-spin" size={17} />
                  Đang tải luồng vận hành...
                </div>
              ) : actions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-5 text-center text-sm text-[var(--muted-foreground)]">
                  Chưa có đơn, thanh toán hoặc yêu cầu gọi nhân viên cần xử lý ngay.
                </div>
              ) : (
                <div className="grid gap-2">
                  {actions.map((action) => (
                    <QuickActionRow key={action.key} action={action} pending={mutatingKey === action.key} onRun={() => runAction(action)} />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-1.5"><RadioTower size={14} />{realtimeLabel(realtimeState)}</span>
              <Link href="/dashboard/orders" className="font-black text-[var(--primary)]" onClick={() => setOpen(false)}>Mở bảng đơn hàng</Link>
            </div>
          </div>
        )}
      </div>

      {primaryActions.length > 0 && (
        <section className="fixed bottom-4 right-4 z-[55] hidden w-[380px] overflow-hidden rounded-xl border border-[#F28C28]/34 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)] xl:block">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Cần xử lý ngay</p>
              <p className="text-xs text-[var(--muted-foreground)]">{summary.total} việc đang chờ</p>
            </div>
            <Badge tone={summary.payment > 0 ? "yellow" : summary.overdue > 0 ? "red" : "green"}>{realtimeLabel(realtimeState)}</Badge>
          </div>
          <div className="grid gap-2 p-3">
            {primaryActions.map((action) => (
              <QuickActionRow key={action.key} action={action} pending={mutatingKey === action.key} compact onRun={() => runAction(action)} />
            ))}
          </div>
        </section>
      )}

      {noticeAction ? (
        <FloatingActionNotice
          action={noticeAction}
          pending={mutatingKey === noticeAction.key}
          onRun={() => runAction(noticeAction)}
          onClose={() => dismissNotice(noticeAction.key)}
        />
      ) : null}
    </>
  );
}

function FloatingActionNotice({
  action,
  pending,
  onRun,
  onClose
}: {
  action: QuickAction;
  pending: boolean;
  onRun: () => void;
  onClose: () => void;
}) {
  const Icon = action.icon;
  const toneClass =
    action.tone === "red"
      ? "border-[#E11D48]/36 bg-[#FFF1F2] text-[#BE123C]"
      : action.tone === "yellow"
        ? "border-[#F28C28]/42 bg-[#FFF7EB] text-[#C76312]"
        : action.tone === "blue"
          ? "border-[#38A5E8]/32 bg-[#EFF8FF] text-[#1672A8]"
          : "border-[#15945B]/28 bg-[#F4FBF6] text-[#0F4D3A]";

  return (
    <aside className="dashboard-notice-pop fixed inset-x-3 top-[70px] z-[90] mx-auto max-w-[430px] overflow-hidden rounded-xl border border-[#F28C28]/34 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.14)] md:inset-x-auto md:right-6 md:top-[70px] md:mx-0">
      <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneClass}`}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Yêu cầu mới</p>
          <h3 className="mt-1 whitespace-normal break-words text-base font-semibold leading-snug text-[var(--foreground)]">{action.title}</h3>
          <p className="mt-1 whitespace-normal break-words text-sm leading-snug text-[var(--muted-foreground)]">{action.subtitle}</p>
          {action.kind !== "resolve-request" ? (
            <p className="metric-number mt-1 text-sm font-black text-[var(--accent)]">{formatVnd(action.amount)}</p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-white" aria-label="Đóng thông báo">
          <X size={17} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <Link href={action.href} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--foreground)]">
          <ReceiptText size={15} />
          Xem chi tiết
        </Link>
        <Button type="button" onClick={onRun} disabled={pending} className="min-h-10 shadow-none hover:shadow-none">
          {pending ? <Loader2 className="animate-spin" size={15} /> : action.kind === "complete" ? <CheckCircle2 size={15} /> : action.kind === "accept" ? <ChefHat size={15} /> : action.kind === "timer" ? <Clock3 size={15} /> : action.kind === "resolve-request" ? <Bell size={15} /> : <CreditCard size={15} />}
          {action.label}
        </Button>
      </div>
    </aside>
  );
}

function QuickActionRow({
  action,
  pending,
  compact = false,
  onRun
}: {
  action: QuickAction;
  pending: boolean;
  compact?: boolean;
  onRun: () => void;
}) {
  const Icon = action.icon;

  return (
    <article className="rounded-lg border border-[var(--border)] bg-white p-2.5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            action.tone === "red" && "bg-[#E11D48]/10 text-[#BE123C]",
            action.tone === "yellow" && "bg-[#F28C28]/12 text-[#C76312]",
            action.tone === "blue" && "bg-[#38A5E8]/10 text-[#1672A8]",
            action.tone === "green" && "bg-[#15945B]/10 text-[#0F4D3A]"
          )}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-[var(--foreground)]">{action.title}</p>
          <p className="mt-1 whitespace-normal break-words text-xs leading-snug text-[var(--muted-foreground)]">{action.subtitle}</p>
          {!compact && action.kind !== "resolve-request" ? (
            <p className="metric-number mt-1 text-xs font-semibold text-[var(--accent)]">{formatVnd(action.amount)}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link href={action.href} className="inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-center text-xs font-semibold leading-tight text-[var(--foreground)]">
          <ReceiptText size={14} />
          Chi tiết
        </Link>
        <Button type="button" size="sm" onClick={onRun} disabled={pending} className="min-w-0 px-2 text-center leading-tight shadow-none hover:shadow-none">
          {pending ? <Loader2 className="animate-spin" size={14} /> : action.kind === "complete" ? <CheckCircle2 size={14} /> : action.kind === "accept" ? <ChefHat size={14} /> : action.kind === "timer" ? <Clock3 size={14} /> : action.kind === "resolve-request" ? <Bell size={14} /> : <CreditCard size={14} />}
          {action.label}
        </Button>
      </div>
    </article>
  );
}
