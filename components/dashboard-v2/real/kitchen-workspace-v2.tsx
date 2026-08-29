"use client";

/* RealKitchenWorkspaceV2 — production /dashboard/kitchen.
 * Layout: Toolbar + alert + KPI + FilterTabs + ticket card grid (giống demo v2).
 * Backend giữ nguyên 1:1 từ legacy KitchenBoard:
 *   - Supabase realtime + VPS realtime
 *   - Optimistic mutations POST /api/admin/orders/:id/{accept|complete|timer}
 *   - kitchen-orders-cache (read/write/fetch)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ChefHat, Clock3, Flame, RefreshCw, TimerReset, Utensils, X } from "lucide-react";
import { Badge, EmptyState } from "../primitives";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { Button } from "../button";
import { RealtimeStatusBadge } from "../realtime";
import { fetchKitchenOrders, useToast, writeCachedKitchenOrders } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { getDashboardActionErrorToast, resolveDashboardActionToast } from "@/lib/dashboard/order-actions";
import { readDashboardApiResponse } from "@/lib/dashboard/api-response";
import { formatVnd } from "@/lib/money";
import { OPERATIONAL_REALTIME_EVENTS, useVpsRealtime } from "@/lib/realtime/vps-socket-client";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { OrderDto } from "@/types/domain";

type RealtimeState = "connecting" | "connected" | "error";
type KitchenAction = "accept" | "complete" | "timer" | "cancel";
type StationFilter = "all" | "dinein" | "takeaway";

function minutesSinceAt(value: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 60_000));
}

function minutesUntilAt(value: string | null | undefined, nowMs: number) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - nowMs) / 60_000);
}

function orderAgeAnchor(order: OrderDto) {
  return order.acceptedAt ?? order.createdAt;
}

function orderItemCount(order: OrderDto) {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}

function orderNoteCount(order: OrderDto) {
  return order.items.filter((item) => Boolean(item.note?.trim())).length;
}

function fulfillmentLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return "Giao hàng";
  if (order.fulfillmentType === "PICKUP") return "Đến lấy";
  return "Tại bàn";
}

function tableLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return order.customerName ?? "Đơn giao";
  if (order.fulfillmentType === "PICKUP") return order.customerName ?? "Đơn pickup";
  return order.table?.name ?? "Bàn";
}

function fmtMMSS(order: OrderDto, nowMs: number) {
  const sec = Math.max(0, Math.floor((nowMs - new Date(orderAgeAnchor(order)).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function urgencyOf(min: number) {
  if (min < 5) return { bar: "var(--d-ok-fg)", chipBg: "var(--d-ok-bg)", chipFg: "var(--d-ok-fg)", border: "var(--d-line)" };
  if (min < 10) return { bar: "var(--d-warn-fg)", chipBg: "var(--d-warn-bg)", chipFg: "var(--d-warn-fg)", border: "var(--d-line)" };
  if (min < 15) return { bar: "var(--d-orange)", chipBg: "var(--d-accent-soft)", chipFg: "var(--d-orange-600)", border: "var(--d-orange)" };
  return { bar: "var(--d-danger-fg)", chipBg: "var(--d-danger-bg)", chipFg: "var(--d-danger-fg)", border: "var(--d-danger-fg)" };
}

function applyOptimistic(orders: OrderDto[], orderId: string, action: KitchenAction, minutes: number): OrderDto[] {
  const now = new Date();
  const nextDue = new Date(now.getTime() + minutes * 60_000).toISOString();
  return orders
    .map((order) => {
      if (order.id !== orderId) return order;
      if (action === "accept") {
        const fresh = order.status === "pending";
        return {
          ...order,
          status: "ordering" as const,
          acceptedAt: order.acceptedAt ?? now.toISOString(),
          serviceDueAt: fresh ? nextDue : order.serviceDueAt
        };
      }
      if (action === "timer") {
        return { ...order, serviceDueAt: nextDue };
      }
      return order;
    })
    .filter((order) => !(order.id === orderId && (action === "complete" || action === "cancel")));
}

function actionMinutes(body?: unknown) {
  return typeof body === "object" && body !== null && "minutes" in body && typeof body.minutes === "number" ? body.minutes : undefined;
}

export function RealKitchenWorkspaceV2({
  initialOrders,
  restaurantId,
  initialNowMs,
  deferInitialLoad = false
}: {
  initialOrders: OrderDto[];
  restaurantId: string;
  initialNowMs: number;
  deferInitialLoad?: boolean;
}) {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderDto[]>(initialOrders);
  const [loading, setLoading] = useState(deferInitialLoad);
  const [mutatingOrderId, setMutatingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(initialNowMs);
  const [rtState, setRtState] = useState<RealtimeState>("connecting");
  const [tab, setTab] = useState<StationFilter>("all");
  const refreshTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const loadOrdersRef = useRef<((opts?: { silent?: boolean; force?: boolean }) => Promise<void>) | null>(null);

  const loadOrders = useCallback(async (opts: { silent?: boolean; force?: boolean } = {}) => {
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchKitchenOrders({ force: opts.force });
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hàng đợi bếp");
    } finally {
      inFlightRef.current = false;
      if (!opts.silent) setLoading(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current?.({ silent: true, force: true }), 180);
      }
    }
  }, []);

  useEffect(() => {
    loadOrdersRef.current = loadOrders;
  }, [loadOrders]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!deferInitialLoad) return;
    const timer = window.setTimeout(() => void loadOrders({ force: true }), 0);
    return () => window.clearTimeout(timer);
  }, [deferInitialLoad, loadOrders]);

  function scheduleRefresh(delay = 300) {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current?.({ silent: true, force: true }), delay);
  }

  async function mutateOrder(orderId: string, action: KitchenAction, body?: unknown) {
    if (mutatingOrderId) return;
    const previous = orders;
    const minutes = typeof body === "object" && body && "minutes" in body && typeof (body as { minutes: number }).minutes === "number" ? (body as { minutes: number }).minutes : 15;
    const optimistic = applyOptimistic(previous, orderId, action, minutes);
    setOrders(optimistic);
    writeCachedKitchenOrders(optimistic);
    setMutatingOrderId(orderId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/${action}`, {
        method: "POST",
        cache: "no-store",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      await readDashboardApiResponse(response, "Thao tác thất bại");
      toast.success(resolveDashboardActionToast(action, { minutes: actionMinutes(body) }));
      scheduleRefresh(80);
    } catch (err) {
      setOrders(previous);
      writeCachedKitchenOrders(previous);
      const message = err instanceof Error ? err.message : "Thao tác thất bại";
      setError(message);
      toast.error(getDashboardActionErrorToast(err));
    } finally {
      setMutatingOrderId(null);
    }
  }

  async function toggleItemPrepared(orderId: string, itemId: string, prepared: boolean) {
    const previous = orders;
    const optimistic = (previous ?? []).map((o) =>
      o.id === orderId
        ? { ...o, items: o.items.map((it) => (it.id === itemId ? { ...it, preparedAt: prepared ? new Date().toISOString() : null } : it)) }
        : o
    );
    setOrders(optimistic);
    writeCachedKitchenOrders(optimistic);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prepared })
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `${response.status} ${response.statusText}`);
      }
      scheduleRefresh(80);
    } catch (err) {
      setOrders(previous);
      writeCachedKitchenOrders(previous);
      setError(err instanceof Error ? err.message : "Không cập nhật được món");
    }
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const sched = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current?.({ silent: true, force: true }), 260);
    };
    const channel = supabase
      .channel(`admin-kitchen:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, sched)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, sched)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRtState("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRtState("error");
          sched();
        }
      });
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  useVpsRealtime({
    restaurantId,
    events: OPERATIONAL_REALTIME_EVENTS,
    onStateChange: setRtState,
    onEvent: () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current?.({ silent: true, force: true }), 180);
    }
  });

  const queue = useMemo(
    () => orders.filter((o) => o.status === "pending" || o.status === "ordering").sort((a, b) => new Date(orderAgeAnchor(a)).getTime() - new Date(orderAgeAnchor(b)).getTime()),
    [orders]
  );
  const counts = {
    all: queue.length,
    dinein: queue.filter((o) => o.fulfillmentType === "DINE_IN" || !o.fulfillmentType).length,
    takeaway: queue.filter((o) => o.fulfillmentType === "PICKUP" || o.fulfillmentType === "DELIVERY").length
  };
  const visible = useMemo(() => {
    if (tab === "all") return queue;
    if (tab === "dinein") return queue.filter((o) => o.fulfillmentType === "DINE_IN" || !o.fulfillmentType);
    return queue.filter((o) => o.fulfillmentType === "PICKUP" || o.fulfillmentType === "DELIVERY");
  }, [queue, tab]);

  const oldestMin = queue[0] ? minutesSinceAt(orderAgeAnchor(queue[0]), nowMs) : 0;
  const oldestMMSS = queue[0] ? fmtMMSS(queue[0], nowMs) : "0:00";
  const urgentCount = queue.filter((o) => minutesSinceAt(orderAgeAnchor(o), nowMs) >= 10).length;
  const totalItems = useMemo(() => orders.reduce((t, o) => t + orderItemCount(o), 0), [orders]);
  const totalNotes = useMemo(() => orders.reduce((t, o) => t + orderNoteCount(o), 0), [orders]);

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow="Kitchen Display System" title="Màn hình bếp">
        <RealtimeStatusBadge state={rtState} />
        <Button variant="secondary" size="md" onClick={() => void loadOrders({ force: true })} disabled={loading}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Làm mới
        </Button>
      </Toolbar>

      {error ? (
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">
          {error}
        </div>
      ) : null}

      {urgentCount > 0 ? (
        <div className="flex items-center gap-3 rounded-[var(--d-r-lg)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] p-[var(--d-s-4)]">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--d-danger-fg)] text-white"><Bell size={18} /></span>
          <div className="flex-1">
            <p className="text-[length:var(--d-fs-sm)] font-bold text-[var(--d-danger-fg)]">{urgentCount} đơn quá 10 phút</p>
            <p className="text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">Đơn lâu nhất: {oldestMMSS} — ưu tiên xử lý ngay.</p>
          </div>
        </div>
      ) : null}

      <section className="grid grid-cols-3 gap-[var(--d-s-3)]">
        <SmallKpi icon={<ChefHat size={16} />} label="Đang chờ" value={String(queue.length)} tone="orange" />
        <SmallKpi icon={<Clock3 size={16} />} label="Lâu nhất" value={oldestMMSS} tone={oldestMin >= 10 ? "danger" : oldestMin >= 7 ? "orange" : "info"} />
        <SmallKpi icon={<Utensils size={16} />} label="Món · Ghi chú" value={`${totalItems} · ${totalNotes}`} tone="jade" />
      </section>

      <FilterTabs
        active={tab}
        onChange={(k) => setTab(k as StationFilter)}
        tabs={[
          { key: "all", label: "Tất cả", count: counts.all },
          { key: "dinein", label: "Tại bàn", count: counts.dinein },
          { key: "takeaway", label: "Mang đi", count: counts.takeaway }
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState icon={<Check size={22} />} title="Hết món cần làm" description="Bếp đã xử lý hết hàng đợi cho ca này." />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((order) => (
            <TicketCard key={order.id} order={order} nowMs={nowMs} mutating={mutatingOrderId === order.id} onMutate={mutateOrder} onToggleItem={toggleItemPrepared} />
          ))}
        </div>
      )}

    </div>
  );
}

function SmallKpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "jade" | "orange" | "danger" | "info" }) {
  const toneCls: Record<string, string> = {
    jade: "bg-[var(--d-primary-soft)] text-[var(--d-primary)]",
    orange: "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]",
    danger: "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]",
    info: "bg-[var(--d-info-bg)] text-[var(--d-info-fg)]"
  };
  return (
    <div className="flex items-center gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-[var(--d-s-4)] py-[var(--d-s-3)]">
      <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-[var(--d-r-md)]", toneCls[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[length:var(--d-fs-2xs)] uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
        <p className="d-num text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{value}</p>
      </div>
    </div>
  );
}

function TicketCard({
  order,
  nowMs,
  mutating,
  onMutate,
  onToggleItem
}: {
  order: OrderDto;
  nowMs: number;
  mutating: boolean;
  onMutate: (orderId: string, action: KitchenAction, body?: unknown) => void;
  onToggleItem: (orderId: string, itemId: string, prepared: boolean) => void;
}) {
  const min = minutesSinceAt(orderAgeAnchor(order), nowMs);
  const u = urgencyOf(min);
  const dueIn = minutesUntilAt(order.serviceDueAt, nowMs);
  const itemCount = orderItemCount(order);
  const notes = orderNoteCount(order);
  const isPending = order.status === "pending";
  const preparedCount = order.items.filter((it) => Boolean(it.preparedAt)).length;

  return (
    <article className="relative flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border-2 bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]" style={{ borderColor: u.border }}>
      <div className="h-1.5 w-full" style={{ background: u.bar }} />
      <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-3)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{tableLabel(order)}</span>
            {order.fulfillmentType && order.fulfillmentType !== "DINE_IN" ? (
              <Badge tone={order.fulfillmentType === "DELIVERY" ? "info" : "jade"}>{fulfillmentLabel(order)}</Badge>
            ) : null}
          </div>
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            <Flame size={13} />
            {itemCount} món
            {order.items.length > 0 && preparedCount > 0 ? <><span className="text-[var(--d-text-faint)]">·</span><span className={preparedCount === order.items.length ? "font-semibold text-[var(--d-primary)]" : "text-[var(--d-primary)]"}>{preparedCount}/{order.items.length} xong</span></> : null}
            {notes ? <><span className="text-[var(--d-text-faint)]">·</span><span className="text-[var(--d-orange-600)]">{notes} ghi chú</span></> : null}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-[var(--d-r-md)] px-2.5 py-1.5 text-[length:var(--d-fs-sm)] font-bold" style={{ background: u.chipBg, color: u.chipFg }}>
          <Clock3 size={14} />
          <span className="d-num tabular-nums">{fmtMMSS(order, nowMs)}</span>
        </span>
      </header>

      <div className="flex items-center justify-between gap-2 px-[var(--d-s-4)] pb-2 text-[length:var(--d-fs-2xs)] text-[var(--d-text-faint)]">
        {dueIn !== null ? (
          dueIn < 0 ? <span className="font-semibold text-[var(--d-danger-fg)]">Quá giờ {Math.abs(dueIn)}p</span> : <span className="inline-flex items-center gap-1"><TimerReset size={11} />Còn {dueIn}p</span>
        ) : (
          <span>Chưa đặt timer</span>
        )}
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Huỷ đơn ${tableLabel(order)}? Món sẽ bị gỡ khỏi hàng đợi bếp.`)) onMutate(order.id, "cancel");
          }}
          disabled={mutating}
          className="inline-flex items-center gap-1 rounded-[var(--d-r-pill)] px-2 py-0.5 font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-danger-bg)] hover:text-[var(--d-danger-fg)] disabled:opacity-50"
        >
          <X size={11} /> Huỷ đơn
        </button>
      </div>

      <ul className="flex flex-col gap-1 px-[var(--d-s-3)] pb-2">
        {order.items.map((it, i) => {
          const lineTotal = (it.price + (it.modifiers?.reduce((s, m) => s + m.lineTotal, 0) ?? 0)) * it.quantity;
          const done = Boolean(it.preparedAt);
          const canToggle = Boolean(it.id);
          return (
            <li
              key={`${it.id ?? it.menuItem?.id ?? "item"}-${i}`}
              onClick={canToggle ? () => onToggleItem(order.id, it.id as string, !done) : undefined}
              role={canToggle ? "button" : undefined}
              aria-pressed={canToggle ? done : undefined}
              className={cn(
                "flex items-start gap-2.5 rounded-[var(--d-r-md)] px-2.5 py-2 transition",
                canToggle ? "cursor-pointer hover:bg-[var(--d-surface-2)] active:scale-[0.99]" : "",
                done ? "bg-[var(--d-primary-soft)]/40" : ""
              )}
            >
              <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-[var(--d-r-sm)] border-2", done ? "border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "border-[var(--d-line-strong)]")}>
                {done ? <Check size={15} /> : <span className="d-num text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text-muted)]">{it.quantity}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[length:var(--d-fs-sm)] font-semibold", done ? "text-[var(--d-text-faint)] line-through" : "text-[var(--d-text)]")}>{it.menuItem?.name ?? "Món"}</span>
                {it.modifierSummary ? <span className="mt-0.5 block text-[length:var(--d-fs-2xs)] text-[var(--d-text-muted)]">{it.modifierSummary}</span> : null}
                {it.note ? <span className="mt-0.5 inline-block rounded-[var(--d-r-sm)] bg-[var(--d-accent-soft)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-orange-600)]">⚠ {it.note}</span> : null}
              </span>
              <span className="d-num text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">{formatVnd(lineTotal)}</span>
            </li>
          );
        })}
      </ul>

      {isPending ? (
        <button
          type="button"
          onClick={() => onMutate(order.id, "accept", { minutes: 15 })}
          disabled={mutating}
          className="flex h-12 items-center justify-center gap-2 bg-[var(--d-jade)] text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] transition active:scale-[0.99] disabled:opacity-60"
        >
          <Utensils size={16} /> Nhận đơn
        </button>
      ) : (
        <div className="border-t border-[var(--d-line)]">
          <div className="grid grid-cols-3 gap-1 px-[var(--d-s-3)] py-2">
            {[5, 10, 15].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => onMutate(order.id, "timer", { minutes })}
                disabled={mutating}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)] transition hover:border-[var(--d-jade)] disabled:opacity-60"
              >
                <TimerReset size={12} /> {minutes}p
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onMutate(order.id, "complete")}
            disabled={mutating}
            className="flex h-12 w-full items-center justify-center gap-2 bg-[var(--d-jade)] text-[length:var(--d-fs-sm)] font-bold text-[var(--d-on-jade)] transition active:scale-[0.99] disabled:opacity-60"
          >
            <Check size={17} /> Xong món
          </button>
        </div>
      )}
    </article>
  );
}
