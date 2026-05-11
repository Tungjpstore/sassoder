"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChefHat, Clock3, Flame, RadioTower, RefreshCw, TimerReset, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DongSonDrum } from "@/components/decor/vietnamese-motifs";
import { fetchKitchenOrders, readCachedKitchenOrders, writeCachedKitchenOrders } from "@/components/dashboard/kitchen-orders-cache";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { OrderDto } from "@/types/domain";

type RealtimeState = "connecting" | "connected" | "error";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function minutesSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
}

function minutesUntil(value?: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
}

function isOverdue(order: OrderDto) {
  const dueIn = minutesUntil(order.serviceDueAt);
  return order.status === "ordering" && dueIn !== null && dueIn < 0;
}

function orderLocationLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return "Giao hàng";
  if (order.fulfillmentType === "PICKUP") return "Đến lấy";
  return order.table?.name ?? "Không rõ bàn";
}

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Bếp đang nhận đơn realtime";
  if (status === "error") return "Realtime gián đoạn";
  return "Đang kết nối bếp";
}

function realtimeTone(status: RealtimeState): "green" | "yellow" | "red" {
  if (status === "connected") return "green";
  if (status === "error") return "red";
  return "yellow";
}

function applyOptimisticKitchenAction(orders: OrderDto[], orderId: string, action: "accept" | "complete" | "timer", minutes: number) {
  const now = new Date();
  const nextServiceDueAt = new Date(now.getTime() + minutes * 60_000).toISOString();

  return orders
    .map((order) => {
      if (order.id !== orderId) return order;
      if (action === "accept") {
        return {
          ...order,
          status: "ordering" as const,
          acceptedAt: now.toISOString(),
          serviceDueAt: nextServiceDueAt
        };
      }
      if (action === "timer") {
        return {
          ...order,
          serviceDueAt: nextServiceDueAt
        };
      }
      return order;
    })
    .filter((order) => !(order.id === orderId && action === "complete"));
}

/* ── Kanban Column ── */
function KanbanColumn({
  title,
  count,
  tone,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  tone: "yellow" | "blue" | "green";
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const toneMap = {
    yellow: "border-[var(--accent)]/20 bg-[var(--accent-soft)]",
    blue: "border-[var(--primary)]/15 bg-[var(--primary-soft)]",
    green: "border-[var(--secondary)]/30 bg-[var(--secondary-soft)]",
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className={`flex items-center justify-between gap-3 rounded-t-xl border px-4 py-3 ${toneMap[tone]}`}>
        <div className="flex items-center gap-2">
          <Icon size={16} />
          <h3 className="text-sm font-bold">{title}</h3>
        </div>
        <Badge tone={tone === "yellow" ? "yellow" : tone === "blue" ? "blue" : "green"}>
          {count}
        </Badge>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto rounded-b-xl border border-t-0 border-[var(--border)] bg-[var(--soft-surface)] p-3">
        {children}
      </div>
    </div>
  );
}

/* ── Kitchen Order Card ── */
function KitchenCard({
  order,
  mutatingOrderId,
  onMutate,
}: {
  order: OrderDto;
  mutatingOrderId: string | null;
  onMutate: (orderId: string, action: "accept" | "complete" | "timer", body?: unknown) => void;
}) {
  const dueIn = minutesUntil(order.serviceDueAt);
  const overdue = isOverdue(order);

  return (
    <article
      className={cn(
        "row-enter rounded-xl border bg-[var(--surface)] p-4 transition",
        overdue ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/20" : "border-[var(--border)] hover:border-[var(--primary)]"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold text-[var(--foreground)]">{orderLocationLabel(order)}</p>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {formatTime(order.createdAt)} · {minutesSince(order.createdAt)}p trước
            {order.fulfillmentType !== "DINE_IN" && order.customerName ? ` · ${order.customerName}` : ""}
          </p>
        </div>
        <span className="metric-number shrink-0 text-sm font-bold text-[var(--foreground)]">{formatVnd(order.total)}</span>
      </div>

      {/* Items */}
      <div className="mt-3 grid gap-1 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-2.5 text-sm">
        {order.items.map((item, index) => (
          <div key={`${order.id}-${index}`}>
            <p className="font-semibold">
              {item.quantity}x {item.menuItem?.name ?? "Không rõ món"}
            </p>
            {item.note && <p className="text-xs text-[var(--muted-foreground)]">{item.note}</p>}
          </div>
        ))}
        {order.fulfillmentType === "DELIVERY" && order.deliveryAddress && (
          <div className="mt-1 rounded-md bg-[var(--surface-container-high)]/30 px-2 py-1 text-xs text-[var(--muted-foreground)]">
            📍 {order.deliveryAddress}
          </div>
        )}
      </div>

      {/* Timer + Status */}
      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
        {order.status === "pending" ? (
          <><Flame size={14} className="text-[var(--accent)]" /> Chờ bếp nhận đơn</>
        ) : overdue ? (
          <><AlertTriangle size={14} className="text-[var(--accent-strong)]" /> Quá giờ {Math.abs(dueIn!)} phút</>
        ) : dueIn !== null ? (
          <><TimerReset size={14} className="text-[var(--primary)]" /> Còn {dueIn} phút</>
        ) : (
          <><Clock3 size={14} /> Chưa đặt giờ</>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === "pending" && (
          <Button size="sm" className="w-full shadow-none" onClick={() => onMutate(order.id, "accept", { minutes: 15 })} disabled={mutatingOrderId === order.id}>
            <Utensils size={14} />
            Nhận đơn
          </Button>
        )}
        {order.status === "ordering" && (
          <>
            <div className="flex gap-1.5">
              {[10, 15, 20].map((minutes) => (
                <Button
                  key={minutes}
                  size="sm"
                  variant="secondary"
                  className="shadow-none"
                  onClick={() => onMutate(order.id, "timer", { minutes })}
                  disabled={mutatingOrderId === order.id}
                >
                  {minutes}p
                </Button>
              ))}
            </div>
            <Button size="sm" className="flex-1 shadow-none" onClick={() => onMutate(order.id, "complete")} disabled={mutatingOrderId === order.id}>
              <CheckCircle2 size={14} />
              Đã phục vụ
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

/* ── Main Board ── */
export function KitchenBoard({
  initialOrders,
  restaurantId,
  deferInitialLoad = false
}: {
  initialOrders: OrderDto[];
  restaurantId: string;
  deferInitialLoad?: boolean;
}) {
  const cachedInitialOrders = readCachedKitchenOrders();
  const [orders, setOrders] = useState(cachedInitialOrders ?? initialOrders);
  const [loading, setLoading] = useState(deferInitialLoad && !cachedInitialOrders);
  const [mutatingOrderId, setMutatingOrderId] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const inFlightRefreshRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const loadOrdersRef = useRef<({ silent, force }?: { silent?: boolean; force?: boolean }) => Promise<void>>(async () => undefined);

  const loadOrders = useCallback(async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
    if (inFlightRefreshRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    inFlightRefreshRef.current = true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchKitchenOrders({ force });
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được hàng đợi bếp");
    } finally {
      inFlightRefreshRef.current = false;
      if (!silent) setLoading(false);

      if (queuedRefreshRef.current) {
        queuedRefreshRef.current = false;
        refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true, force: true }), 180);
      }
    }
  }, []);

  useEffect(() => {
    loadOrdersRef.current = loadOrders;
  }, [loadOrders]);

  useEffect(() => {
    if (!deferInitialLoad || cachedInitialOrders) return;
    const timer = window.setTimeout(() => void loadOrders({ force: true }), 0);
    return () => window.clearTimeout(timer);
  }, [cachedInitialOrders, deferInitialLoad, loadOrders]);

  function scheduleRefresh(delay = 300) {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true, force: true }), delay);
  }

  async function mutateOrder(orderId: string, action: "accept" | "complete" | "timer", body?: unknown) {
    const previousOrders = orders;
    const minutes = typeof body === "object" && body && "minutes" in body && typeof body.minutes === "number" ? body.minutes : 15;
    const optimisticOrders = applyOptimisticKitchenAction(previousOrders, orderId, action, minutes);

    setOrders(optimisticOrders);
    writeCachedKitchenOrders(optimisticOrders);
    setMutatingOrderId(orderId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/${action}`, {
        method: "POST",
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            }
          : {})
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Thao tác thất bại");
      scheduleRefresh(80);
    } catch (err) {
      setOrders(previousOrders);
      writeCachedKitchenOrders(previousOrders);
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setMutatingOrderId(null);
    }
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRealtimeRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true }), 260);
    };

    const channel = supabase
      .channel(`admin-kitchen:${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        scheduleRealtimeRefresh
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeState("error");
        }
      });

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const cookingOrders = useMemo(() => orders.filter((o) => o.status === "ordering"), [orders]);
  const overdueOrders = useMemo(() => orders.filter(isOverdue), [orders]);

  return (
    <div className="grid gap-4">
      {/* ── Hero header ── */}
      <section className="admin-hero-panel rounded-[14px] p-5">
        <DongSonDrum className="hidden" />
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Hàng đợi bếp</p>
            <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">
              {orders.length} lượt gọi · {overdueOrders.length} quá giờ
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={realtimeTone(realtimeState)}>{realtimeLabel(realtimeState)}</Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadOrders({ force: true })}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
            Làm mới
          </button>
        </div>
      </section>

      {error && <div className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{error}</div>}

      {/* ── Kanban Board: 3 columns ── */}
      <section className="grid gap-4 lg:grid-cols-3" style={{ minHeight: "calc(100vh - 320px)" }}>
        <KanbanColumn title="Chờ nhận" count={pendingOrders.length} tone="yellow" icon={Flame}>
          {pendingOrders.length === 0 ? (
            <div className="grid min-h-[120px] place-items-center text-sm text-[var(--muted-foreground)]">
              Không có đơn chờ nhận
            </div>
          ) : (
            pendingOrders.map((order) => (
              <KitchenCard key={order.id} order={order} mutatingOrderId={mutatingOrderId} onMutate={mutateOrder} />
            ))
          )}
        </KanbanColumn>

        <KanbanColumn title="Đang làm" count={cookingOrders.length - overdueOrders.length} tone="blue" icon={ChefHat}>
          {cookingOrders.filter((o) => !isOverdue(o)).length === 0 ? (
            <div className="grid min-h-[120px] place-items-center text-sm text-[var(--muted-foreground)]">
              Không có đơn đang làm
            </div>
          ) : (
            cookingOrders.filter((o) => !isOverdue(o)).map((order) => (
              <KitchenCard key={order.id} order={order} mutatingOrderId={mutatingOrderId} onMutate={mutateOrder} />
            ))
          )}
          {/* Overdue section within cooking column */}
          {overdueOrders.length > 0 && (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--tertiary)]/12 bg-[var(--danger-soft)] px-3 py-2 text-xs font-bold text-[var(--tertiary)]">
                <AlertTriangle size={14} />
                {overdueOrders.length} đơn quá giờ
              </div>
              {overdueOrders.map((order) => (
                <KitchenCard key={order.id} order={order} mutatingOrderId={mutatingOrderId} onMutate={mutateOrder} />
              ))}
            </>
          )}
        </KanbanColumn>

        <KanbanColumn title="Đã phục vụ" count={0} tone="green" icon={CheckCircle2}>
          <div className="grid min-h-[120px] place-items-center text-center text-sm text-[var(--muted-foreground)]">
            <div>
              <CheckCircle2 size={32} className="mx-auto mb-2 text-[var(--primary)]/40" />
              <p>Đơn hoàn tất sẽ tự động được dọn khỏi hàng đợi bếp.</p>
            </div>
          </div>
        </KanbanColumn>
      </section>

      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        <RadioTower size={16} className="text-[var(--primary)]" />
        Màn bếp chỉ tải đơn cần xử lý, giúp dashboard chính nhẹ hơn trong giờ cao điểm.
      </div>
    </div>
  );
}
