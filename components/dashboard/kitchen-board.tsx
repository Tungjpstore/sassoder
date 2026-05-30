"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChefHat,
  Clock3,
  Flame,
  PackageCheck,
  RadioTower,
  RefreshCw,
  TimerReset,
  Utensils
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchKitchenOrders, readCachedKitchenOrders, writeCachedKitchenOrders } from "@/components/dashboard/kitchen-orders-cache";
import { formatVnd } from "@/lib/money";
import { OPERATIONAL_REALTIME_EVENTS, useVpsRealtime } from "@/lib/realtime/vps-socket-client";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { OrderDto } from "@/types/domain";

type RealtimeState = "connecting" | "connected" | "error";
type KitchenAction = "accept" | "complete" | "timer";
type ColumnTone = "yellow" | "blue" | "red";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function minutesSinceAt(value: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 60_000));
}

function minutesUntilAt(value: string | null | undefined, nowMs: number) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - nowMs) / 60_000);
}

function isOverdueAt(order: OrderDto, nowMs: number) {
  const dueIn = minutesUntilAt(order.serviceDueAt, nowMs);
  return order.status === "ordering" && dueIn !== null && dueIn < 0;
}

function orderLocationLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return "Giao hàng";
  if (order.fulfillmentType === "PICKUP") return "Đến lấy";
  return order.table?.name ?? "Không rõ bàn";
}

function fulfillmentLabel(order: OrderDto) {
  if (order.fulfillmentType === "DELIVERY") return "Delivery";
  if (order.fulfillmentType === "PICKUP") return "Takeaway";
  return "Tại bàn";
}

function realtimeLabel(status: RealtimeState) {
  if (status === "connected") return "Bếp live";
  if (status === "error") return "Live gián đoạn";
  return "Đang nối live";
}

function realtimeTone(status: RealtimeState): "green" | "yellow" | "red" {
  if (status === "connected") return "green";
  if (status === "error") return "red";
  return "yellow";
}

function orderItemCount(order: OrderDto) {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}

function orderNoteCount(order: OrderDto) {
  return order.items.filter((item) => Boolean(item.note?.trim())).length;
}

function orderAgeAnchor(order: OrderDto) {
  return order.acceptedAt ?? order.createdAt;
}

function kitchenPriorityScore(order: OrderDto, nowMs: number) {
  const age = minutesSinceAt(orderAgeAnchor(order), nowMs);
  const dueIn = minutesUntilAt(order.serviceDueAt, nowMs);
  const items = orderItemCount(order);

  if (order.status === "pending") return 80 + age * 3 + items;
  if (dueIn !== null && dueIn < 0) return 130 + Math.abs(dueIn) * 4 + items;
  if (dueIn !== null && dueIn <= 5) return 100 + (5 - dueIn) * 6 + age + items;
  return 45 + age + items;
}

function priorityTone(score: number): "green" | "yellow" | "red" {
  if (score >= 120) return "red";
  if (score >= 85) return "yellow";
  return "green";
}

function applyOptimisticKitchenAction(orders: OrderDto[], orderId: string, action: KitchenAction, minutes: number) {
  const now = new Date();
  const nextServiceDueAt = new Date(now.getTime() + minutes * 60_000).toISOString();

  return orders
    .map((order) => {
      if (order.id !== orderId) return order;
      if (action === "accept") {
        const isFreshAccept = order.status === "pending";
        return {
          ...order,
          status: "ordering" as const,
          acceptedAt: order.acceptedAt ?? now.toISOString(),
          serviceDueAt: isFreshAccept ? nextServiceDueAt : order.serviceDueAt
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

function playKitchenNotice() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    window.setTimeout(() => void context.close().catch(() => undefined), 280);
  } catch {
    // Browser autoplay rules can block audio. Kitchen still updates visually.
  }
}



function KanbanColumn({
  title,
  count,
  tone,
  icon: Icon,
  children
}: {
  title: string;
  count: number;
  tone: ColumnTone;
  icon: ElementType;
  children: ReactNode;
}) {
  const toneMap = {
    yellow: "border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    blue: "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary-strong)]",
    red: "border-[var(--accent)]/30 bg-[var(--danger-soft)] text-[var(--accent-strong)]"
  };

  return (
    <section className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_14px_34px_rgba(15,77,58,0.05)] xl:min-h-[420px]">
      <header className={`flex items-center justify-between gap-3 border-b px-3 py-3 ${toneMap[tone]}`}>
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} />
          <h3 className="truncate text-sm font-semibold">{title}</h3>
        </div>
        <Badge tone={tone}>{count}</Badge>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--soft-surface)] p-3">
        {children}
      </div>
    </section>
  );
}

function EmptyKitchenColumn({ icon: Icon, title, detail }: { icon: ElementType; title: string; detail: string }) {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 text-center">
      <div>
        <Icon size={30} className="mx-auto text-[var(--primary)]/55" />
        <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{title}</p>
        <p className="mt-0.5 text-xs font-semibold text-[var(--muted-foreground)]">{detail}</p>
      </div>
    </div>
  );
}



function KitchenCard({
  order,
  mutatingOrderId,
  nowMs,
  onMutate
}: {
  order: OrderDto;
  mutatingOrderId: string | null;
  nowMs: number;
  onMutate: (orderId: string, action: KitchenAction, body?: unknown) => void;
}) {
  const dueIn = minutesUntilAt(order.serviceDueAt, nowMs);
  const overdue = isOverdueAt(order, nowMs);
  const age = minutesSinceAt(orderAgeAnchor(order), nowMs);
  const score = kitchenPriorityScore(order, nowMs);
  const notes = orderNoteCount(order);
  const items = orderItemCount(order);
  const isMutating = mutatingOrderId === order.id;

  return (
    <article
      className={cn(
        "row-enter overflow-hidden rounded-xl border bg-[var(--surface)] transition",
        overdue
          ? "border-[var(--accent)] shadow-[0_14px_34px_rgba(242,140,40,0.12)] ring-1 ring-[var(--accent)]/20"
          : order.status === "pending"
            ? "border-[var(--accent)]/30"
            : "border-[var(--border)] hover:border-[var(--primary)]/45"
      )}
    >
      <div className={cn("h-1.5", overdue ? "bg-[var(--accent)]" : order.status === "pending" ? "bg-[var(--accent)]/70" : "bg-[var(--primary)]/70")} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <p className="truncate text-base font-semibold text-[var(--foreground)]">{orderLocationLabel(order)}</p>
              <Badge tone={priorityTone(score)}>{score >= 120 ? "Gấp" : score >= 85 ? "Ưu tiên" : "Ổn"}</Badge>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-[var(--muted-foreground)]">
              {formatTime(order.createdAt)} · {age}p · {fulfillmentLabel(order)}
              {order.fulfillmentType !== "DINE_IN" && order.customerName ? ` · ${order.customerName}` : ""}
            </p>
          </div>
          <span className="metric-number shrink-0 text-sm font-semibold text-[var(--foreground)]">{formatVnd(order.total)}</span>
        </div>

        <div className="mt-3 grid gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-2.5 text-sm">
          {order.items.map((item, index) => (
            <div key={`${order.id}-${index}`} className="min-w-0">
              <p className="truncate font-semibold text-[var(--foreground)]">
                {item.quantity}x {item.menuItem?.name ?? "Không rõ món"}
              </p>
              {item.modifierSummary ? <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-[var(--primary)]">{item.modifierSummary}</p> : null}
              {item.note ? <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-[var(--accent-strong)]">{item.note}</p> : null}
            </div>
          ))}
          {order.fulfillmentType === "DELIVERY" && order.deliveryAddress ? (
            <div className="mt-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
              {order.deliveryAddress}
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <span className="rounded-lg bg-[var(--soft-surface)] px-2 py-1.5">
            <strong className="block text-sm font-semibold text-[var(--foreground)]">{items}</strong>
            <small className="text-[10px] font-medium text-[var(--muted-foreground)]">món</small>
          </span>
          <span className="rounded-lg bg-[var(--soft-surface)] px-2 py-1.5">
            <strong className="block text-sm font-semibold text-[var(--foreground)]">{notes}</strong>
            <small className="text-[10px] font-medium text-[var(--muted-foreground)]">note</small>
          </span>
          <span className="rounded-lg bg-[var(--soft-surface)] px-2 py-1.5">
            <strong className={cn("block text-sm font-semibold", overdue ? "text-[var(--accent-strong)]" : "text-[var(--foreground)]")}>
              {order.status === "pending" ? age : dueIn ?? "--"}
            </strong>
            <small className="text-[10px] font-medium text-[var(--muted-foreground)]">{order.status === "pending" ? "phút chờ" : "phút còn"}</small>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
          {order.status === "pending" ? (
            <>
              <Flame size={14} className="text-[var(--accent)]" /> Chờ bếp nhận
            </>
          ) : overdue ? (
            <>
              <AlertTriangle size={14} className="text-[var(--accent-strong)]" /> Quá giờ {Math.abs(dueIn ?? 0)}p
            </>
          ) : dueIn !== null ? (
            <>
              <TimerReset size={14} className="text-[var(--primary)]" /> Còn {dueIn}p
            </>
          ) : (
            <>
              <Clock3 size={14} /> Chưa đặt giờ
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {order.status === "pending" ? (
            <Button size="sm" className="min-h-10 w-full shadow-none" onClick={() => onMutate(order.id, "accept", { minutes: 15 })} disabled={isMutating}>
              <Utensils size={14} />
              Nhận đơn
            </Button>
          ) : null}
          {order.status === "ordering" ? (
            <>
              <div className="grid flex-1 grid-cols-3 gap-1.5">
                {[10, 15, 20].map((minutes) => (
                  <Button
                    key={minutes}
                    size="sm"
                    variant="secondary"
                    className="min-h-10 px-2 shadow-none"
                    onClick={() => onMutate(order.id, "timer", { minutes })}
                    disabled={isMutating}
                  >
                    {minutes}p
                  </Button>
                ))}
              </div>
              <Button size="sm" className="min-h-10 w-full shadow-none" onClick={() => onMutate(order.id, "complete")} disabled={isMutating}>
                <CheckCircle2 size={14} />
                Xong món
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

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
  const [networkOnline, setNetworkOnline] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refreshTimerRef = useRef<number | null>(null);
  const inFlightRefreshRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const loadOrdersRef = useRef<({ silent, force }?: { silent?: boolean; force?: boolean }) => Promise<void>>(async () => undefined);
  const fallbackRefreshMs = realtimeState === "connected" ? 30_000 : 10_000;

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
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (!networkOnline || !pageVisible) return;
    const timer = window.setInterval(() => void loadOrdersRef.current({ silent: true, force: true }), fallbackRefreshMs);
    return () => window.clearInterval(timer);
  }, [fallbackRefreshMs, networkOnline, pageVisible]);

  useEffect(() => {
    if (networkOnline && pageVisible) void loadOrdersRef.current({ silent: true, force: true });
  }, [networkOnline, pageVisible]);

  useEffect(() => {
    const nextIds = new Set(orders.map((order) => order.id));
    if (!knownOrderIdsRef.current) {
      knownOrderIdsRef.current = nextIds;
      return;
    }

    const hasNewPendingOrder = orders.some((order) => order.status === "pending" && !knownOrderIdsRef.current?.has(order.id));
    knownOrderIdsRef.current = nextIds;
    if (hasNewPendingOrder) playKitchenNotice();
  }, [orders]);

  useEffect(() => {
    if (!deferInitialLoad || cachedInitialOrders) return;
    const timer = window.setTimeout(() => void loadOrders({ force: true }), 0);
    return () => window.clearTimeout(timer);
  }, [cachedInitialOrders, deferInitialLoad, loadOrders]);

  function scheduleRefresh(delay = 300) {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true, force: true }), delay);
  }

  async function mutateOrder(orderId: string, action: KitchenAction, body?: unknown) {
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
        cache: "no-store",
        credentials: "same-origin",
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
      refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true, force: true }), 260);
    };

    const channel = supabase
      .channel(`admin-kitchen:${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        scheduleRealtimeRefresh
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleRealtimeRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(
            "[logivn-observability]",
            JSON.stringify({
              area: "ops",
              event: "kitchen_realtime_reconnect",
              restaurantId,
              realtimeStatus: status,
              status: "warn",
              ts: new Date().toISOString()
            })
          );
          setRealtimeState("error");
          scheduleRealtimeRefresh();
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
    onStateChange: setRealtimeState,
    onEvent: () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void loadOrdersRef.current({ silent: true, force: true }), 180);
    }
  });

  const pendingOrders = useMemo(() => orders.filter((order) => order.status === "pending"), [orders]);
  const cookingOrders = useMemo(() => orders.filter((order) => order.status === "ordering"), [orders]);
  const overdueOrders = useMemo(() => cookingOrders.filter((order) => isOverdueAt(order, nowMs)), [cookingOrders, nowMs]);
  const onTimeCookingOrders = useMemo(() => cookingOrders.filter((order) => !isOverdueAt(order, nowMs)), [cookingOrders, nowMs]);
  const priorityOrders = useMemo(
    () => [...orders].sort((left, right) => kitchenPriorityScore(right, nowMs) - kitchenPriorityScore(left, nowMs)).slice(0, 4),
    [orders, nowMs]
  );
  const totalItems = useMemo(() => orders.reduce((total, order) => total + orderItemCount(order), 0), [orders]);
  const totalNotes = useMemo(() => orders.reduce((total, order) => total + orderNoteCount(order), 0), [orders]);
  const oldestAge = useMemo(() => orders.reduce((max, order) => Math.max(max, minutesSinceAt(orderAgeAnchor(order), nowMs)), 0), [orders, nowMs]);
  const dueSoonCount = useMemo(
    () => cookingOrders.filter((order) => {
      const dueIn = minutesUntilAt(order.serviceDueAt, nowMs);
      return dueIn !== null && dueIn >= 0 && dueIn <= 5;
    }).length,
    [cookingOrders, nowMs]
  );
  const channelRows = useMemo(
    () => [
      {
        key: "DINE_IN",
        label: "Tại bàn",
        orders: orders.filter((order) => order.fulfillmentType === "DINE_IN"),
        icon: Utensils
      },
      {
        key: "PICKUP",
        label: "Đến lấy",
        orders: orders.filter((order) => order.fulfillmentType === "PICKUP"),
        icon: PackageCheck
      },
      {
        key: "DELIVERY",
        label: "Giao hàng",
        orders: orders.filter((order) => order.fulfillmentType === "DELIVERY"),
        icon: Bell
      }
    ],
    [orders]
  );
  const noteOrders = useMemo(
    () => orders
      .filter((order) => orderNoteCount(order) > 0)
      .sort((left, right) => kitchenPriorityScore(right, nowMs) - kitchenPriorityScore(left, nowMs))
      .slice(0, 4),
    [orders, nowMs]
  );

  return (
    <div className="dashboard-operations-stack dashboard-kitchen-workspace grid gap-3">
      <section className="admin-hero-panel rounded-[14px] p-4">
        <div className="relative z-[1] flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="dashboard-page-title">Màn hình bếp</h1>
            <Badge tone={realtimeTone(realtimeState)}>
              <span className="inline-flex items-center gap-1.5"><RadioTower size={13} />{realtimeLabel(realtimeState)}</span>
            </Badge>
          </div>
          <button
            type="button"
            onClick={() => void loadOrders({ force: true })}
            disabled={loading}
            className="dashboard-refresh-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--primary-strong)] disabled:opacity-50"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
            Làm mới
          </button>
        </div>
      </section>

      {(() => {
        const readyScore = Math.max(0, 100 - pendingOrders.length * 12 - overdueOrders.length * 18 - dueSoonCount * 9 - Math.max(0, oldestAge - 20));
        const readyTone = readyScore >= 82 ? "green" : readyScore >= 62 ? "yellow" : "red";
        return (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <Badge tone={readyTone}>{readyScore}/100</Badge>
            <span className="text-xs font-semibold text-[var(--muted-foreground)]">Đơn mới {pendingOrders.length}</span>
            <span className="mx-0.5 text-[var(--border)]">·</span>
            <span className="text-xs font-semibold text-[var(--muted-foreground)]">Đang làm {cookingOrders.length}</span>
            <span className="mx-0.5 text-[var(--border)]">·</span>
            <span className={`text-xs font-semibold ${overdueOrders.length > 0 ? 'text-[var(--accent-strong)]' : 'text-[var(--muted-foreground)]'}`}>Quá giờ {overdueOrders.length}</span>
            <span className="mx-0.5 text-[var(--border)]">·</span>
            <span className="text-xs font-semibold text-[var(--muted-foreground)]">{totalItems} món · {totalNotes} note</span>
          </div>
        );
      })()}

      <section className="dashboard-ops-split grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <div className="dashboard-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow">Kitchen lanes</p>
              <h2 className="dashboard-section-title mt-1">Tải bếp theo kênh</h2>
            </div>
            <Badge tone={totalNotes > 0 ? "yellow" : "green"}>{totalNotes} ghi chú</Badge>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {channelRows.map((row) => {
              const Icon = row.icon;
              const items = row.orders.reduce((total, order) => total + orderItemCount(order), 0);
              const overdue = row.orders.filter((order) => isOverdueAt(order, nowMs)).length;
              const width = orders.length > 0 ? Math.max(6, Math.round((row.orders.length / orders.length) * 100)) : 0;
              return (
                <div key={row.key} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{row.label}</span>
                        <span className="block text-xs font-medium text-[var(--muted-foreground)]">{items} món · {overdue} trễ</span>
                      </span>
                    </span>
                    <span className="metric-number text-xl font-semibold text-[var(--foreground)]">{row.orders.length}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-container)]">
                    <div className={cn("h-full rounded-full", overdue ? "bg-[var(--accent)]" : "bg-[var(--primary)]")} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dashboard-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow">Special notes</p>
              <h2 className="dashboard-section-title mt-1">Món cần chú ý</h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="mt-4 grid gap-2">
            {noteOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                Không có món kèm ghi chú trong hàng đợi.
              </div>
            ) : (
              noteOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{orderLocationLabel(order)}</span>
                      <span className="block text-xs font-medium text-[var(--muted-foreground)]">{orderNoteCount(order)} ghi chú · {orderItemCount(order)} món</span>
                    </span>
                    <Badge tone={priorityTone(kitchenPriorityScore(order, nowMs))}>{fulfillmentLabel(order)}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {priorityOrders.length ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_14px_34px_rgba(15,77,58,0.045)]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="dashboard-eyebrow">Priority queue</p>
              <h2 className="dashboard-section-title">Việc bếp cần nhìn trước</h2>
            </div>
            <Badge tone={priorityTone(kitchenPriorityScore(priorityOrders[0], nowMs))}>{priorityOrders.length} việc</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {priorityOrders.map((order) => {
              const dueIn = minutesUntilAt(order.serviceDueAt, nowMs);
              const score = kitchenPriorityScore(order, nowMs);
              return (
                <button key={order.id} type="button" className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:border-[var(--primary)]/45">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{orderLocationLabel(order)}</span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-[var(--muted-foreground)]">{orderItemCount(order)} món · {order.status === "pending" ? "chờ nhận" : dueIn !== null && dueIn < 0 ? `trễ ${Math.abs(dueIn)}p` : `còn ${dueIn ?? "--"}p`}</span>
                    </span>
                    <Badge tone={priorityTone(score)}>{score}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {error ? <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-strong)]">{error}</div> : null}

      <section className="dashboard-kanban-board dashboard-kitchen-board-grid grid gap-3 xl:min-h-[calc(100vh-380px)] xl:grid-cols-3">
        <KanbanColumn title="Chờ nhận" count={pendingOrders.length} tone="yellow" icon={Flame}>
          {pendingOrders.length ? (
            pendingOrders.map((order) => (
              <KitchenCard key={order.id} order={order} mutatingOrderId={mutatingOrderId} nowMs={nowMs} onMutate={mutateOrder} />
            ))
          ) : (
            <EmptyKitchenColumn icon={PackageCheck} title="Không có đơn chờ" detail="Đơn mới sẽ nổi lên cùng âm báo live." />
          )}
        </KanbanColumn>

        <KanbanColumn title="Đang làm" count={onTimeCookingOrders.length} tone="blue" icon={ChefHat}>
          {onTimeCookingOrders.length ? (
            onTimeCookingOrders.map((order) => (
              <KitchenCard key={order.id} order={order} mutatingOrderId={mutatingOrderId} nowMs={nowMs} onMutate={mutateOrder} />
            ))
          ) : (
            <EmptyKitchenColumn icon={CheckCircle2} title="Không có món đang làm" detail="Các món đã nhận nhưng chưa quá giờ sẽ nằm tại đây." />
          )}
        </KanbanColumn>

        <KanbanColumn title="Quá giờ" count={overdueOrders.length} tone="red" icon={AlertTriangle}>
          {overdueOrders.length ? (
            overdueOrders.map((order) => (
              <KitchenCard key={order.id} order={order} mutatingOrderId={mutatingOrderId} nowMs={nowMs} onMutate={mutateOrder} />
            ))
          ) : (
            <EmptyKitchenColumn icon={Bell} title="Không có món trễ" detail="Đơn quá giờ ra món sẽ tách riêng vào cột này." />
          )}
        </KanbanColumn>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-semibold text-[var(--muted-foreground)]">
        <span className="inline-flex items-center gap-2"><RadioTower size={16} className="text-[var(--primary)]" />{realtimeLabel(realtimeState)}</span>
        <span>{new Date(nowMs).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}
