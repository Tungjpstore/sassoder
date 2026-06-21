"use client";

/* RealOrdersWorkspaceV2 — production /dashboard/orders.
 * Orders Command Board theo fulfillment lane: DINE_IN / PICKUP / DELIVERY.
 * Backend wiring giữ thật:
 *  - Supabase realtime channel `admin-orders:<restaurantId>`
 *  - Optimistic mutations POST /api/admin/orders/:id/{accept,complete,confirm-payment,cancel}
 *  - Service requests qua /api/admin/service-requests/:id/{ack,resolve}
 *  - AdminLiveActionCenter mở qua Drawer riêng (Bell button trên Toolbar)
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  Clock3,
  CreditCard,
  Eye,
  Filter,
  Hash,
  MapPin,
  Phone,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  Utensils,
  X
} from "lucide-react";
import { Toolbar } from "../workspace-ui";
import { EmptyState, Badge } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { RealtimeStatusBadge, playOrderChime, type RealtimeState } from "../realtime";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { RouteMiniMap } from "@/components/customer/route-mini-map";
import { useToast } from "@/components/dashboard/toast-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { deliveryStatusLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderDto } from "@/types/domain";

type OrderMutationAction = "accept" | "confirm-payment" | "complete" | "cancel" | "timer";
type Tab = "all" | "new" | "cooking" | "ready" | "payment";
type FulfillmentLane = "DINE_IN" | "PICKUP" | "DELIVERY";
type LaneStatusFilter = "all" | "needs_action" | "preparing" | "ready" | "payment" | "issue";

type Props = {
  initialOrders: OrderDto[];
  initialRequests: Parameters<typeof AdminLiveActionCenter>[0]["initialRequests"];
  restaurantId: string;
  canManageTestOrders: boolean;
};

function statusToTab(status: string): Tab {
  if (status === "pending") return "new";
  if (status === "ordering") return "cooking";
  if (status === "completed") return "ready";
  if (status === "waiting_payment" || status === "waiting_confirm") return "payment";
  return "all";
}

function nextActionFor(status: string): OrderMutationAction | null {
  if (status === "pending") return "accept";
  if (status === "ordering") return "complete";
  if (status === "completed" || status === "waiting_confirm" || status === "waiting_payment") return "confirm-payment";
  return null;
}

/* Đơn đã kết thúc → loại khỏi "cần xử lý", ngừng đếm giờ.
 * - status paid/cancelled: đã đóng.
 * - đã thu tiền (paymentStatus paid) và không còn ở bếp (không pending/ordering):
 *   coi như xong (tránh đơn đã thanh toán vẫn nằm chờ + đếm quá hạn).
 * - Giữ lại đơn prepaid đang nấu (paid + pending/ordering) vì vẫn cần ra món. */
function isOrderClosed(o: OrderDto): boolean {
  if (o.status === "paid" || o.status === "cancelled") return true;
  if (o.paymentStatus === "paid" && o.status !== "pending" && o.status !== "ordering") return true;
  return false;
}

function elapsedMin(createdAt: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(createdAt).getTime()) / 60_000));
}

function applyOptimistic(orders: OrderDto[], orderId: string, action: OrderMutationAction): OrderDto[] {
  if (action === "cancel") {
    return orders.map((o) => (o.id === orderId ? { ...o, status: "cancelled" as const } : o));
  }
  return orders
    .map((o) => {
      if (o.id !== orderId) return o;
      if (action === "accept") return { ...o, status: "ordering" as const, acceptedAt: o.acceptedAt ?? new Date().toISOString() };
      if (action === "complete") return { ...o, status: "completed" as const };
      if (action === "confirm-payment") return { ...o, status: "paid" as const, paymentStatus: "paid" as const };
      return o;
    })
    .filter((o) => !(o.id === orderId && action === "complete" && false));
}

function summarizeItems(o: OrderDto): string {
  return o.items.map((it) => `${it.quantity}x ${it.menuItem?.name ?? "Món"}`).join(" · ");
}

function totalQty(o: OrderDto) {
  return o.items.reduce((s, it) => s + it.quantity, 0);
}

const lanes: Array<{ key: FulfillmentLane; label: string; shortLabel: string; description: string }> = [
  { key: "DINE_IN", label: "Tại quán / QR bàn", shortLabel: "Tại quán", description: "Theo bàn, thời gian phục vụ và thu tiền tại bàn" },
  { key: "PICKUP", label: "Online đến lấy", shortLabel: "Pickup", description: "Theo khách, mã lấy hàng và thời điểm giao món" },
  { key: "DELIVERY", label: "Giao hàng", shortLabel: "Giao hàng", description: "Theo địa chỉ, ETA, phí giao và tracking" }
];

const laneIcons: Record<FulfillmentLane, ReactNode> = {
  DINE_IN: <QrCode size={16} />,
  PICKUP: <ShoppingBag size={16} />,
  DELIVERY: <Truck size={16} />
};

const laneAccent: Record<FulfillmentLane, string> = {
  DINE_IN: "var(--d-jade)",
  PICKUP: "var(--d-orange)",
  DELIVERY: "var(--d-info-fg)"
};

function statusLabel(status: string) {
  if (status === "pending") return "Chờ xác nhận";
  if (status === "ordering") return "Đang chuẩn bị";
  if (status === "completed") return "Sẵn sàng";
  if (status === "waiting_payment") return "Chờ thanh toán";
  if (status === "waiting_confirm") return "Chờ xác nhận tiền";
  if (status === "paid") return "Đã thu";
  if (status === "cancelled") return "Đã huỷ";
  return status;
}

function statusTone(status: string): "jade" | "orange" | "danger" | "info" | "ok" | "neutral" {
  if (status === "pending") return "orange";
  if (status === "ordering") return "info";
  if (status === "completed") return "ok";
  if (status === "waiting_payment" || status === "waiting_confirm") return "jade";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function laneLabel(lane: FulfillmentLane) {
  return lanes.find((item) => item.key === lane)?.label ?? lane;
}

function laneShortLabel(lane: FulfillmentLane) {
  return lanes.find((item) => item.key === lane)?.shortLabel ?? lane;
}

function primaryIdentity(order: OrderDto) {
  if (order.fulfillmentType === "DINE_IN") return order.table?.name ? `Bàn ${order.table.name}` : "QR tại bàn";
  if (order.fulfillmentType === "PICKUP") return order.customerName || "Khách đến lấy";
  return order.customerName || "Khách giao hàng";
}

function paymentNeedsAttention(order: OrderDto) {
  return order.status === "waiting_payment" || order.status === "waiting_confirm" || order.paymentStatus === "waiting_confirm";
}

function deliveryNeedsAttention(order: OrderDto) {
  if (order.fulfillmentType !== "DELIVERY") return false;
  if (order.deliveryStatus === "rejected") return true;
  if (!order.deliveryAddress || !order.deliveryLat || !order.deliveryLng) return true;
  if (order.deliveryTrackingSnapshot?.locationIsStale) return true;
  return false;
}

function laneStatusMatches(order: OrderDto, filter: LaneStatusFilter) {
  if (filter === "all") return true;
  if (filter === "needs_action") return order.status === "pending" || paymentNeedsAttention(order) || deliveryNeedsAttention(order);
  if (filter === "preparing") return order.status === "ordering";
  if (filter === "ready") return order.status === "completed";
  if (filter === "payment") return paymentNeedsAttention(order);
  if (filter === "issue") return deliveryNeedsAttention(order) || elapsedMin(order.createdAt, Date.now()) >= 15;
  return true;
}

function actionLabelFor(order: OrderDto) {
  if (order.status === "pending") return order.fulfillmentType === "DINE_IN" ? "Nhận đơn" : "Xác nhận đơn";
  if (order.status === "ordering") {
    if (order.fulfillmentType === "PICKUP") return "Sẵn sàng lấy";
    if (order.fulfillmentType === "DELIVERY") return "Sẵn sàng giao";
    return "Báo ra món";
  }
  if (order.status === "completed") {
    if (order.fulfillmentType === "PICKUP") return "Hoàn tất pickup";
    if (order.fulfillmentType === "DELIVERY") return "Xác nhận thu";
    return "Thu tiền";
  }
  if (order.status === "waiting_payment" || order.status === "waiting_confirm") return "Thu tiền";
  return "Đóng đơn";
}

function hasDeliveryMap(order: OrderDto) {
  return (
    order.fulfillmentType === "DELIVERY" &&
    typeof order.restaurant?.storeLat === "number" &&
    typeof order.restaurant?.storeLng === "number" &&
    typeof order.deliveryLat === "number" &&
    typeof order.deliveryLng === "number"
  );
}

export function RealOrdersWorkspaceV2({ initialOrders, initialRequests, restaurantId, canManageTestOrders }: Props) {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderDto[]>(initialOrders);
  const [activeLane, setActiveLane] = useState<FulfillmentLane>("DINE_IN");
  const [laneFilters, setLaneFilters] = useState<Record<FulfillmentLane, LaneStatusFilter>>({
    DINE_IN: "all",
    PICKUP: "all",
    DELIVERY: "all"
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "DINE_IN" | "PICKUP" | "DELIVERY">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "unpaid" | "waiting_confirm" | "paid">("all");
  const [rtState, setRtState] = useState<RealtimeState>("connecting");
  const [cleaning, setCleaning] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const mutatingRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /* Phát hiện đơn mới đến từ realtime để báo âm + toast (không tính đơn do mình tạo/optimistic). */
  function ingestOrders(next: OrderDto[]) {
    const known = knownIdsRef.current;
    const freshActive = next.filter((o) => !known.has(o.id) && !isOrderClosed(o));
    for (const o of next) known.add(o.id);
    if (freshActive.length > 0) {
      playOrderChime("new");
      const first = freshActive[0];
      const where = first.table?.name ?? (first.fulfillmentType === "DELIVERY" ? "Giao hàng" : first.fulfillmentType === "PICKUP" ? "Mang đi" : "Đơn mới");
      toast.info(
        freshActive.length === 1
          ? `Đơn mới · ${where} · ${formatVnd(first.total)}`
          : `${freshActive.length} đơn mới vừa vào`
      );
    }
    setOrders(next);
  }

  /* Realtime supabase channel — đồng bộ board + báo đơn mới + trạng thái kết nối. */
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const sched = (delay = 220) => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(async () => {
        // Không refetch đè khi đang có mutation in-flight → tránh ghi đè optimistic.
        if (mutatingRef.current) return;
        try {
          const res = await fetch(`/api/admin/orders?restaurantId=${restaurantId}`, { cache: "no-store" });
          const json = await res.json();
          // API trả qua ok() → shape { ok, data }. (trước đây đọc nhầm json.orders nên board không bao giờ cập nhật)
          const next = Array.isArray(json?.data) ? json.data : Array.isArray(json?.orders) ? json.orders : null;
          if (next && !mutatingRef.current) ingestOrders(next);
        } catch (err) {
          /* silent */
        }
      }, delay);
    };
    const channel = supabase
      .channel(`admin-orders-v2:${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => sched())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => sched())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRtState("connected");
          sched(0); // đồng bộ ngay khi kết nối/khôi phục để không bỏ lỡ sự kiện lúc mất sóng
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRtState("error");
        }
      });
    // Fallback: khi tab hiện lại / online lại thì đồng bộ.
    const onVisible = () => {
      if (document.visibilityState !== "hidden" && window.navigator.onLine) sched(0);
    };
    const fallback = window.setInterval(onVisible, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  async function mutateOrder(orderId: string, action: OrderMutationAction, body?: unknown) {
    if (mutatingId) return;
    const previous = orders;
    setOrders(applyOptimistic(previous, orderId, action));
    setMutatingId(orderId);
    mutatingRef.current = orderId;
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${action}`, {
        method: "POST",
        cache: "no-store",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
    } catch (err) {
      setOrders(previous);
      setError(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setMutatingId(null);
      mutatingRef.current = null;
      // Hợp nhất với trạng thái server thật (paymentStatus, paidAt...) sau optimistic.
      try {
        const res = await fetch(`/api/admin/orders?restaurantId=${restaurantId}`, { cache: "no-store" });
        const json = await res.json();
        const next = Array.isArray(json?.data) ? json.data : Array.isArray(json?.orders) ? json.orders : null;
        if (next && !mutatingRef.current) ingestOrders(next);
      } catch {
        /* silent */
      }
    }
  }

  async function cleanupTestOrders() {
    if (cleaning) return;
    if (!window.confirm("Xoá toàn bộ đơn test (đơn do quán tự tạo để thử)? Hành động này không thể hoàn tác.")) return;
    setCleaning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/cleanup", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "delete_test" })
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      const json = await res.json().catch(() => null);
      const removed = json?.data?.deleted ?? json?.data?.affected ?? null;
      toast.success(typeof removed === "number" ? `Đã dọn ${removed} đơn test.` : "Đã dọn đơn test.");
      // Đồng bộ lại board.
      const list = await fetch(`/api/admin/orders?restaurantId=${restaurantId}`, { cache: "no-store" });
      const listJson = await list.json();
      const next = Array.isArray(listJson?.data) ? listJson.data : null;
      if (next) {
        knownIdsRef.current = new Set(next.map((o: OrderDto) => o.id));
        setOrders(next);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không dọn được đơn test.";
      setError(message);
      toast.error(message);
    } finally {
      setCleaning(false);
    }
  }

  const statusCounts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, new: 0, cooking: 0, ready: 0, payment: 0 };
    for (const o of orders) {
      if (isOrderClosed(o)) continue;
      c.all += 1;
      const k = statusToTab(o.status);
      if (k !== "all") c[k] += 1;
    }
    return c;
  }, [orders]);

  const activeOrders = useMemo(() => {
    const live = orders.filter((o) => !isOrderClosed(o));
    let list = live;
    if (channelFilter !== "all") list = list.filter((o) => o.fulfillmentType === channelFilter);
    if (paymentFilter !== "all") {
      list = list.filter((o) => {
        if (paymentFilter === "paid") return o.paymentStatus === "paid";
        if (paymentFilter === "waiting_confirm") return o.paymentStatus === "waiting_confirm";
        return o.paymentStatus !== "paid" && o.paymentStatus !== "waiting_confirm";
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) =>
        (o.table?.name ?? "").toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        summarizeItems(o).toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, channelFilter, paymentFilter, search]);

  const laneOrders = useMemo(() => {
    const grouped: Record<FulfillmentLane, OrderDto[]> = { DINE_IN: [], PICKUP: [], DELIVERY: [] };
    for (const order of activeOrders) {
      grouped[order.fulfillmentType].push(order);
    }
    for (const lane of lanes) {
      grouped[lane.key] = grouped[lane.key]
        .filter((order) => laneStatusMatches(order, laneFilters[lane.key]))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return grouped;
  }, [activeOrders, laneFilters]);

  const laneTotals = useMemo(() => {
    const totals: Record<FulfillmentLane, number> = { DINE_IN: 0, PICKUP: 0, DELIVERY: 0 };
    for (const order of activeOrders) totals[order.fulfillmentType] += 1;
    return totals;
  }, [activeOrders]);

  const detail = orders.find((o) => o.id === detailId) ?? null;
  const openRequestsCount = initialRequests?.length ?? 0;

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow={`Realtime · ${statusCounts.all} đơn đang mở`} title="Đơn hàng">
        <RealtimeStatusBadge state={rtState} />
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--d-text-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm bàn, khách, mã đơn, món…"
            className="h-10 w-full rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] pl-9 pr-3 text-[length:var(--d-fs-sm)] outline-none transition focus:border-[var(--d-jade)] sm:w-56"
          />
        </div>
        {/* Dòng realtime là panel cạnh phải chỉ hiển thị ở xl → ẩn nút trên mobile/tablet để bớt vùng thừa. */}
        <Button variant="secondary" size="md" onClick={() => setLiveOpen((v) => !v)} className="hidden xl:inline-flex">
          <Bell size={15} />
          {liveOpen ? "Ẩn dòng realtime" : "Hiện dòng realtime"}
          {openRequestsCount > 0 ? (
            <span className="d-num grid h-5 min-w-5 place-items-center rounded-full bg-[var(--d-orange)] px-1 text-[length:var(--d-fs-2xs)] font-bold text-white">{openRequestsCount}</span>
          ) : null}
        </Button>
        <Button variant={channelFilter !== "all" || paymentFilter !== "all" ? "primary" : "secondary"} size="md" onClick={() => setFilterOpen(true)}>
          <Filter size={15} /> Lọc nâng cao
          {(channelFilter !== "all" || paymentFilter !== "all") ? (
            <span className="d-num grid h-5 min-w-5 place-items-center rounded-full bg-[var(--d-on-jade)] px-1 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-jade)]">
              {(channelFilter !== "all" ? 1 : 0) + (paymentFilter !== "all" ? 1 : 0)}
            </span>
          ) : null}
        </Button>
        {canManageTestOrders ? (
          <Button variant="ghost" size="md" onClick={() => void cleanupTestOrders()} disabled={cleaning}>
            <Trash2 size={15} /> {cleaning ? "Đang dọn…" : "Dọn đơn test"}
          </Button>
        ) : null}
      </Toolbar>

      {error ? (
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] px-[var(--d-s-4)] py-2.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-danger-fg)]">
          {error}
        </div>
      ) : null}

      <div className={liveOpen ? "grid gap-[var(--d-s-4)] xl:grid-cols-[minmax(0,1fr)_360px]" : "flex flex-col gap-[var(--d-s-4)]"}>
        <div className="flex min-w-0 flex-col gap-[var(--d-s-4)]">
          <OrderFlowBoard
            activeLane={activeLane}
            laneFilters={laneFilters}
            laneOrders={laneOrders}
            laneTotals={laneTotals}
            nowMs={nowMs}
            mutatingId={mutatingId}
            onActiveLaneChange={setActiveLane}
            onLaneFilterChange={(lane, filter) => setLaneFilters((current) => ({ ...current, [lane]: filter }))}
            onAdvance={(order) => {
              const action = nextActionFor(order.status);
              if (action) void mutateOrder(order.id, action);
            }}
            onDetail={(order) => setDetailId(order.id)}
          />
        </div>

        {liveOpen ? (
          <aside className="hidden self-start overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] xl:sticky xl:top-[calc(var(--d-topbar-h)+var(--d-s-4))] xl:block xl:max-h-[calc(100vh-var(--d-topbar-h)-var(--d-s-6))] xl:overflow-y-auto">
            <header className="flex items-center justify-between gap-2 border-b border-[var(--d-line)] px-[var(--d-s-4)] py-[var(--d-s-3)]">
              <div className="min-w-0">
                <p className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-orange-600)]">Realtime</p>
                <p className="mt-0.5 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Yêu cầu khách &amp; đơn live</p>
              </div>
              <button
                type="button"
                onClick={() => setLiveOpen(false)}
                aria-label="Đóng dòng realtime"
                className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)] transition hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="px-[var(--d-s-3)] py-[var(--d-s-3)]">
              <AdminLiveActionCenter
                initialOrders={orders}
                initialRequests={initialRequests}
                restaurantId={restaurantId}
                variant="panel"
              />
            </div>
          </aside>
        ) : null}
      </div>

      <OrderFlowDetail
        order={detail}
        open={Boolean(detail)}
        nowMs={nowMs}
        busy={detail ? mutatingId === detail.id : false}
        onClose={() => setDetailId(null)}
        onAdvance={detail ? () => {
          const action = nextActionFor(detail.status);
          if (action) void mutateOrder(detail.id, action);
        } : undefined}
        onCancel={detail ? () => {
          if (window.confirm("Huỷ đơn này? Hành động không thể hoàn tác.")) void mutateOrder(detail.id, "cancel");
        } : undefined}
        onTimer={detail ? () => void mutateOrder(detail.id, "timer", { minutes: 10 }) : undefined}
      />

      {/* Mobile/tablet: realtime panel mở dạng Drawer (sidebar chỉ hiện ở xl) */}
      <div className="xl:hidden">
        <Drawer
          open={liveOpen}
          onClose={() => setLiveOpen(false)}
          width="md"
          title="Yêu cầu khách & đơn live"
          subtitle="Realtime"
        >
          <AdminLiveActionCenter
            initialOrders={orders}
            initialRequests={initialRequests}
            restaurantId={restaurantId}
            variant="panel"
          />
        </Drawer>
      </div>

      <AdvancedFilterModal
        key={`${filterOpen ? "open" : "closed"}-${channelFilter}-${paymentFilter}`}
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        channel={channelFilter}
        payment={paymentFilter}
        onChange={(c, p) => {
          setChannelFilter(c);
          if (c !== "all") setActiveLane(c);
          setPaymentFilter(p);
        }}
      />

    </div>
  );
}


function OrderFlowBoard({
  activeLane,
  laneFilters,
  laneOrders,
  laneTotals,
  nowMs,
  mutatingId,
  onActiveLaneChange,
  onLaneFilterChange,
  onAdvance,
  onDetail
}: {
  activeLane: FulfillmentLane;
  laneFilters: Record<FulfillmentLane, LaneStatusFilter>;
  laneOrders: Record<FulfillmentLane, OrderDto[]>;
  laneTotals: Record<FulfillmentLane, number>;
  nowMs: number;
  mutatingId: string | null;
  onActiveLaneChange: (lane: FulfillmentLane) => void;
  onLaneFilterChange: (lane: FulfillmentLane, filter: LaneStatusFilter) => void;
  onAdvance: (order: OrderDto) => void;
  onDetail: (order: OrderDto) => void;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-[var(--d-s-3)]">
      <div className="grid grid-cols-3 gap-1 rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-1 shadow-[var(--d-sh-sm)] xl:hidden">
        {lanes.map((lane) => {
          const active = activeLane === lane.key;
          return (
            <button
              key={lane.key}
              type="button"
              onClick={() => onActiveLaneChange(lane.key)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--d-r-md)] px-2 text-[length:var(--d-fs-xs)] font-bold transition-colors",
                active ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
              )}
            >
              {laneIcons[lane.key]}
              <span className="truncate">{lane.shortLabel}</span>
              <span className={cn("d-num grid h-5 min-w-5 place-items-center rounded-full px-1 text-[length:var(--d-fs-2xs)]", active ? "bg-white/20" : "bg-[var(--d-surface-2)] text-[var(--d-text-faint)]")}>{laneTotals[lane.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="xl:hidden">
        <OrderFlowColumn
          lane={activeLane}
          orders={laneOrders[activeLane]}
          total={laneTotals[activeLane]}
          filter={laneFilters[activeLane]}
          nowMs={nowMs}
          mutatingId={mutatingId}
          onFilterChange={(filter) => onLaneFilterChange(activeLane, filter)}
          onAdvance={onAdvance}
          onDetail={onDetail}
        />
      </div>

      <div className="hidden min-w-0 grid-cols-3 gap-[var(--d-s-3)] xl:grid">
        {lanes.map((lane) => (
          <OrderFlowColumn
            key={lane.key}
            lane={lane.key}
            orders={laneOrders[lane.key]}
            total={laneTotals[lane.key]}
            filter={laneFilters[lane.key]}
            nowMs={nowMs}
            mutatingId={mutatingId}
            onFilterChange={(filter) => onLaneFilterChange(lane.key, filter)}
            onAdvance={onAdvance}
            onDetail={onDetail}
          />
        ))}
      </div>
    </section>
  );
}

function OrderFlowColumn({
  lane,
  orders,
  total,
  filter,
  nowMs,
  mutatingId,
  onFilterChange,
  onAdvance,
  onDetail
}: {
  lane: FulfillmentLane;
  orders: OrderDto[];
  total: number;
  filter: LaneStatusFilter;
  nowMs: number;
  mutatingId: string | null;
  onFilterChange: (filter: LaneStatusFilter) => void;
  onAdvance: (order: OrderDto) => void;
  onDetail: (order: OrderDto) => void;
}) {
  const filters: Array<{ key: LaneStatusFilter; label: string }> = [
    { key: "all", label: "Tất cả" },
    { key: "needs_action", label: "Cần xử lý" },
    { key: "preparing", label: "Đang làm" },
    { key: "ready", label: "Sẵn sàng" },
    { key: "payment", label: "Chờ thu" },
    { key: "issue", label: "Sự cố" }
  ];

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
      <header className="border-b border-[var(--d-line)] px-[var(--d-s-4)] py-[var(--d-s-4)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">
              <span className="grid h-8 w-8 place-items-center rounded-[var(--d-r-md)] text-white" style={{ background: laneAccent[lane] }}>{laneIcons[lane]}</span>
              <span className="truncate">{laneLabel(lane)}</span>
            </p>
            <p className="mt-1 line-clamp-2 text-[length:var(--d-fs-xs)] leading-5 text-[var(--d-text-muted)]">{lanes.find((item) => item.key === lane)?.description}</p>
          </div>
          <span className="d-num grid h-8 min-w-8 place-items-center rounded-full bg-[var(--d-surface-2)] px-2 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text-muted)]">{total}</span>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {filters.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onFilterChange(item.key)}
                className={cn(
                  "h-9 shrink-0 rounded-[var(--d-r-pill)] px-3 text-[length:var(--d-fs-xs)] font-bold transition-colors",
                  active ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "border border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)] hover:text-[var(--d-text)]"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[var(--d-s-3)] overflow-y-auto bg-[var(--d-surface-2)]/35 p-[var(--d-s-3)]">
        {orders.length === 0 ? (
          <EmptyState icon={laneIcons[lane]} title={`Không có đơn ${laneShortLabel(lane).toLowerCase()}`} description="Khi có đơn mới, hệ thống sẽ đưa vào đúng luồng vận hành tại đây." />
        ) : (
          orders.map((order) => {
            const common = {
              order,
              nowMs,
              mutating: mutatingId === order.id,
              onAdvance: () => onAdvance(order),
              onDetail: () => onDetail(order)
            };
            if (lane === "PICKUP") return <PickupOrderCard key={order.id} {...common} />;
            if (lane === "DELIVERY") return <DeliveryOrderCard key={order.id} {...common} />;
            return <DineInOrderCard key={order.id} {...common} />;
          })
        )}
      </div>
    </section>
  );
}

function CardShell({ order, nowMs, mutating, onAdvance, onDetail, children, accent }: {
  order: OrderDto;
  nowMs: number;
  mutating: boolean;
  onAdvance: () => void;
  onDetail: () => void;
  children: ReactNode;
  accent: string;
}) {
  const action = nextActionFor(order.status);
  const min = elapsedMin(order.createdAt, nowMs);
  const overdue = min >= 15;

  return (
    <article className="relative flex min-w-0 flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="flex min-w-0 flex-col gap-3 p-[var(--d-s-4)] pb-3">
        {children}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--d-line)] pt-3">
          <span className={cn("inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold", overdue ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text-faint)]")}>
            <Clock3 size={13} /> {min === 0 ? "vừa xong" : `${min}'`}
          </span>
          <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(order.total)}</span>
        </div>
      </div>
      <div className="sticky bottom-0 grid grid-cols-[44px_1fr] border-t border-[var(--d-line)] bg-[var(--d-surface)]">
        <button type="button" onClick={onDetail} className="grid h-12 place-items-center border-r border-[var(--d-line)] text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]" aria-label="Xem chi tiết đơn">
          <Eye size={16} />
        </button>
        <button
          type="button"
          onClick={onAdvance}
          disabled={mutating || action === null}
          className="flex h-12 items-center justify-center gap-2 px-3 text-[length:var(--d-fs-sm)] font-bold text-white transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: action ? accent : "var(--d-line-strong)" }}
        >
          <Check size={15} />
          <span className="truncate">{action ? actionLabelFor(order) : "Đã xử lý"}</span>
        </button>
      </div>
    </article>
  );
}

function DineInOrderCard(props: { order: OrderDto; nowMs: number; mutating: boolean; onAdvance: () => void; onDetail: () => void }) {
  const { order } = props;
  const prepared = order.items.filter((item) => item.preparedAt).length;
  return (
    <CardShell {...props} accent={laneAccent.DINE_IN}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{primaryIdentity(order)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]"><QrCode size={13} /> QR tại bàn · <span className="d-num">{totalQty(order)} món</span></p>
        </div>
        <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
      </div>
      <p className="line-clamp-2 text-[length:var(--d-fs-sm)] leading-5 text-[var(--d-text-muted)]">{summarizeItems(order)}</p>
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Món xong" value={`${prepared}/${order.items.length}`} />
        <MiniMetric label="Thanh toán" value={paymentStatusLabel(order.paymentStatus)} />
      </div>
    </CardShell>
  );
}

function PickupOrderCard(props: { order: OrderDto; nowMs: number; mutating: boolean; onAdvance: () => void; onDetail: () => void }) {
  const { order } = props;
  return (
    <CardShell {...props} accent={laneAccent.PICKUP}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{primaryIdentity(order)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]"><ShoppingBag size={13} /> Online đến lấy · mã {order.id.slice(0, 6).toUpperCase()}</p>
        </div>
        <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
      </div>
      <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2">
        <p className="flex items-center gap-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]"><Phone size={13} /> {order.customerPhone || "Chưa có SĐT"}</p>
        <p className="mt-1 line-clamp-1 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{summarizeItems(order)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniMetric label="Mã lấy" value={order.id.slice(0, 8).toUpperCase()} />
        <MiniMetric label="Số món" value={`${totalQty(order)} món`} />
      </div>
    </CardShell>
  );
}

function DeliveryOrderCard(props: { order: OrderDto; nowMs: number; mutating: boolean; onAdvance: () => void; onDetail: () => void }) {
  const { order } = props;
  const issue = deliveryNeedsAttention(order);
  return (
    <CardShell {...props} accent={issue ? "var(--d-danger-fg)" : laneAccent.DELIVERY}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{primaryIdentity(order)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]"><Truck size={13} /> {deliveryStatusLabel(order.deliveryStatus)}</p>
        </div>
        <Badge tone={issue ? "danger" : statusTone(order.status)}>{issue ? "Cần xem" : statusLabel(order.status)}</Badge>
      </div>
      <p className="line-clamp-2 text-[length:var(--d-fs-sm)] leading-5 text-[var(--d-text-muted)]"><MapPin size={13} className="mr-1 inline text-[var(--d-orange-600)]" />{order.deliveryAddress || "Chưa có địa chỉ giao hàng"}</p>
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Km" value={order.deliveryDistanceKm ? `${order.deliveryDistanceKm}km` : "--"} />
        <MiniMetric label="ETA" value={order.deliveryRouteDurationMinutes ? `${order.deliveryRouteDurationMinutes}'` : "--"} />
        <MiniMetric label="Phí" value={formatVnd(order.deliveryFee ?? 0)} />
      </div>
      {order.deliveryTrackingSnapshot ? (
        <p className={cn("line-clamp-2 rounded-[var(--d-r-md)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold", order.deliveryTrackingSnapshot.locationIsStale ? "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]" : "bg-[var(--d-info-bg)] text-[var(--d-info-fg)]")}>{order.deliveryTrackingSnapshot.label} · {order.deliveryTrackingSnapshot.detail}</p>
      ) : null}
    </CardShell>
  );
}

function MiniMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2">
      <p className="truncate text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</p>
      <p className="mt-0.5 truncate text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text)]">{value}</p>
    </div>
  );
}

function OrderFlowDetail({
  order,
  open,
  nowMs,
  busy,
  onClose,
  onAdvance,
  onCancel,
  onTimer
}: {
  order: OrderDto | null;
  open: boolean;
  nowMs: number;
  busy: boolean;
  onClose: () => void;
  onAdvance?: () => void;
  onCancel?: () => void;
  onTimer?: () => void;
}) {
  if (!order) return null;
  const action = nextActionFor(order.status);
  const canCancel = Boolean(onCancel) && order.paymentStatus !== "paid";
  const canTimer = Boolean(onTimer) && (order.status === "pending" || order.status === "ordering");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={primaryIdentity(order)}
      subtitle={`${laneLabel(order.fulfillmentType)} · mã ${order.id.slice(0, 8).toUpperCase()}`}
      headerMeta={
        <>
          <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
          <span className="inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]"><Clock3 size={12} />{elapsedMin(order.createdAt, nowMs)} phút</span>
        </>
      }
      footer={
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>Đóng</Button>
            {onAdvance ? <Button variant="primary" size="lg" onClick={onAdvance} disabled={busy || !action}><Check size={16} />{action ? actionLabelFor(order) : "Đã xử lý"}</Button> : null}
          </div>
          {(canTimer || canCancel) ? (
            <div className="grid grid-cols-2 gap-2">
              {canTimer ? <Button variant="secondary" size="md" onClick={onTimer} disabled={busy}><Clock3 size={15} />+10 phút bếp</Button> : null}
              {canCancel ? <Button variant="danger" size="md" onClick={onCancel} disabled={busy}><X size={15} />Huỷ đơn</Button> : null}
            </div>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--d-s-4)]">
        {order.fulfillmentType === "DINE_IN" ? <DineInDetail order={order} /> : null}
        {order.fulfillmentType === "PICKUP" ? <PickupDetail order={order} /> : null}
        {order.fulfillmentType === "DELIVERY" ? <DeliveryDetail order={order} /> : null}
        <ItemsDetail order={order} />
        <PaymentDetail order={order} />
      </div>
    </Drawer>
  );
}

function DetailSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="inline-flex items-center gap-2 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]"><span className="text-[var(--d-primary)]">{icon}</span>{title}</p>
      {children}
    </section>
  );
}

function DineInDetail({ order }: { order: OrderDto }) {
  return (
    <DetailSection title="Vận hành tại bàn" icon={<QrCode size={14} />}>
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Bàn" value={order.table?.name || "Chưa rõ"} />
        <MiniMetric label="Món" value={`${totalQty(order)} món`} />
        <MiniMetric label="Bill" value={order.bill?.status ?? "Đơn lẻ"} />
      </div>
    </DetailSection>
  );
}

function PickupDetail({ order }: { order: OrderDto }) {
  return (
    <DetailSection title="Thông tin pickup" icon={<Hash size={14} />}>
      <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-5)]">
        <p className="d-eyebrow text-[var(--d-orange-600)]">Mã lấy hàng</p>
        <p className="d-num mt-1 text-[length:var(--d-fs-display)] font-bold text-[var(--d-text)]">{order.id.slice(0, 8).toUpperCase()}</p>
        <div className="mt-3 grid gap-2 text-[length:var(--d-fs-sm)] sm:grid-cols-2">
          <InfoRow label="Khách" value={order.customerName || "Chưa có tên"} />
          <InfoRow label="Điện thoại" value={order.customerPhone || "Chưa có SĐT"} />
        </div>
      </div>
    </DetailSection>
  );
}

function DeliveryDetail({ order }: { order: OrderDto }) {
  return (
    <DetailSection title="Giao hàng" icon={<Truck size={14} />}>
      <div className="grid gap-3">
        <DeliveryRouteSummary order={order} />
        <div className="grid gap-2 sm:grid-cols-3">
          <MiniMetric label="Khoảng cách" value={order.deliveryDistanceKm ? `${order.deliveryDistanceKm} km` : "Chưa có"} />
          <MiniMetric label="ETA" value={order.deliveryRouteDurationMinutes ? `${order.deliveryRouteDurationMinutes} phút` : "Chưa có"} />
          <MiniMetric label="Phí giao" value={formatVnd(order.deliveryFee ?? 0)} />
        </div>
        <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
          <InfoRow label="Khách" value={order.customerName || "Chưa có tên"} />
          <InfoRow label="Điện thoại" value={order.customerPhone || "Chưa có SĐT"} />
          <InfoRow label="Địa chỉ" value={order.deliveryAddress || "Chưa có địa chỉ"} />
          <InfoRow label="Trạng thái giao" value={deliveryStatusLabel(order.deliveryStatus)} />
        </div>
      </div>
    </DetailSection>
  );
}

function DeliveryRouteSummary({ order }: { order: OrderDto }) {
  if (hasDeliveryMap(order)) {
    return (
      <RouteMiniMap
        origin={{ lat: order.restaurant?.storeLat, lng: order.restaurant?.storeLng }}
        destination={{ lat: order.deliveryLat, lng: order.deliveryLng }}
        route={order.deliveryRouteGeometry?.coordinates}
        distanceKm={order.deliveryDistanceKm}
        durationMinutes={order.deliveryRouteDurationMinutes}
        status={order.deliveryStatus}
        courierLocation={order.deliveryCourierLocation}
        title="Tuyến giao của đơn này"
        compact
      />
    );
  }

  return (
    <div className="rounded-[var(--d-r-lg)] border border-dashed border-[var(--d-line-strong)] bg-[var(--d-surface-2)] p-[var(--d-s-4)]">
      <p className="flex items-center gap-2 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]"><AlertTriangle size={16} className="text-[var(--d-orange-600)]" />Chưa đủ dữ liệu bản đồ</p>
      <p className="mt-1 text-[length:var(--d-fs-xs)] leading-5 text-[var(--d-text-muted)]">Cần tọa độ quán và tọa độ khách để hiển thị tuyến giao realtime. Đơn vẫn có thể xử lý bằng địa chỉ văn bản bên dưới.</p>
    </div>
  );
}

function ItemsDetail({ order }: { order: OrderDto }) {
  return (
    <DetailSection title={`Món đã gọi (${order.items.length})`} icon={<Utensils size={14} />}>
      <div className="overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)]">
        {order.items.map((item, index) => (
          <div key={item.id ?? index} className={cn("flex items-start justify-between gap-3 px-[var(--d-s-4)] py-[var(--d-s-3)]", index > 0 && "border-t border-[var(--d-line)]")}>
            <div className="flex min-w-0 items-start gap-3">
              <span className="d-num grid h-6 min-w-6 place-items-center rounded-[var(--d-r-sm)] bg-[var(--d-primary-soft)] px-1 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-primary)]">{item.quantity}</span>
              <div className="min-w-0">
                <p className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{item.menuItem?.name ?? "Món"}</p>
                {item.note ? <p className="mt-0.5 text-[length:var(--d-fs-xs)] text-[var(--d-orange-600)]">{item.note}</p> : null}
              </div>
            </div>
            <span className="d-num shrink-0 text-[length:var(--d-fs-sm)] font-bold text-[var(--d-text)]">{formatVnd((item.price + (item.modifiers?.reduce((sum, modifier) => sum + modifier.lineTotal, 0) ?? 0)) * item.quantity)}</span>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function PaymentDetail({ order }: { order: OrderDto }) {
  return (
    <DetailSection title="Thanh toán" icon={<CreditCard size={14} />}>
      <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)]">
        <InfoRow label="Tạm tính" value={formatVnd(order.subtotal ?? order.total)} />
        {order.discountAmount ? <InfoRow label="Giảm giá" value={`- ${formatVnd(order.discountAmount)}`} /> : null}
        {order.deliveryFee ? <InfoRow label="Phí giao" value={formatVnd(order.deliveryFee)} /> : null}
        <div className="my-3 border-t border-[var(--d-line)]" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">Tổng cộng</span>
          <span className="d-num text-[length:var(--d-fs-h2)] font-bold text-[var(--d-text)]">{formatVnd(order.total)}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">{order.paymentMethod === "QR" ? "VietQR" : order.paymentMethod === "CASH" ? "Tiền mặt" : "Chưa chọn phương thức"}</span>
          <Badge tone={order.paymentStatus === "paid" ? "ok" : order.paymentStatus === "waiting_confirm" ? "orange" : "neutral"}>{paymentStatusLabel(order.paymentStatus)}</Badge>
        </div>
      </div>
    </DetailSection>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[length:var(--d-fs-sm)]">
      <span className="shrink-0 text-[var(--d-text-muted)]">{label}</span>
      <strong className="min-w-0 text-right font-semibold text-[var(--d-text)]">{value}</strong>
    </div>
  );
}

function AdvancedFilterModal({
  open,
  onClose,
  channel,
  payment,
  onChange
}: {
  open: boolean;
  onClose: () => void;
  channel: "all" | "DINE_IN" | "PICKUP" | "DELIVERY";
  payment: "all" | "unpaid" | "waiting_confirm" | "paid";
  onChange: (channel: "all" | "DINE_IN" | "PICKUP" | "DELIVERY", payment: "all" | "unpaid" | "waiting_confirm" | "paid") => void;
}) {
  const [localChannel, setLocalChannel] = useState(channel);
  const [localPayment, setLocalPayment] = useState(payment);

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lọc đơn nâng cao"
      subtitle="Đơn hàng realtime"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setLocalChannel("all");
              setLocalPayment("all");
            }}
          >
            Đặt lại
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              onChange(localChannel, localPayment);
              onClose();
            }}
          >
            Áp dụng lọc
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Kênh</span>
          <select
            value={localChannel}
            onChange={(e) => setLocalChannel(e.target.value as typeof localChannel)}
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          >
            <option value="all">Tất cả kênh</option>
            <option value="DINE_IN">QR tại bàn</option>
            <option value="PICKUP">Mang đi</option>
            <option value="DELIVERY">Giao hàng</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">Thanh toán</span>
          <select
            value={localPayment}
            onChange={(e) => setLocalPayment(e.target.value as typeof localPayment)}
            className="h-10 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 text-[length:var(--d-fs-sm)] outline-none focus:border-[var(--d-jade)]"
          >
            <option value="all">Tất cả</option>
            <option value="unpaid">Chưa thu</option>
            <option value="waiting_confirm">Chờ xác nhận VietQR</option>
            <option value="paid">Đã thu</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
