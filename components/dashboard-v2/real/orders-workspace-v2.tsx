"use client";

/* RealOrdersWorkspaceV2 — production /dashboard/orders.
 * Layout 100% theo demo orders-demo.tsx (Toolbar + FilterTabs + card grid).
 * Backend wiring giữ thật:
 *  - Supabase realtime channel `admin-orders:<restaurantId>`
 *  - Optimistic mutations POST /api/admin/orders/:id/{accept,complete,confirm-payment,cancel}
 *  - Service requests qua /api/admin/service-requests/:id/{ack,resolve}
 *  - AdminLiveActionCenter mở qua Drawer riêng (Bell button trên Toolbar)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChefHat, Clock3, CreditCard, Eye, Filter, QrCode, Search, Trash2, Truck, Utensils, X } from "lucide-react";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { EmptyState, Badge } from "../primitives";
import { Button } from "../button";
import { Drawer, Modal } from "../overlay";
import { OrderDetailDrawer, type OrderDetail } from "../order-detail-drawer";
import { RealtimeStatusBadge, playOrderChime, type RealtimeState } from "../realtime";
import { NextSteps } from "../cross-link";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { useToast } from "@/components/dashboard/toast-provider";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { OrderDto } from "@/types/domain";

type OrderMutationAction = "accept" | "confirm-payment" | "complete" | "cancel" | "timer";
type Tab = "all" | "new" | "cooking" | "ready" | "payment";

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

function statusToDetail(status: string): OrderDetail["status"] {
  if (status === "pending") return "new";
  if (status === "ordering") return "cooking";
  if (status === "completed") return "ready";
  if (status === "waiting_payment" || status === "waiting_confirm") return "payment";
  return "new";
}

function nextActionFor(status: string): OrderMutationAction | null {
  if (status === "pending") return "accept";
  if (status === "ordering") return "complete";
  if (status === "completed" || status === "waiting_confirm" || status === "waiting_payment") return "confirm-payment";
  return null;
}

function channelOf(o: OrderDto): "qr" | "takeaway" | "delivery" | "reservation" {
  if (o.fulfillmentType === "DELIVERY") return "delivery";
  if (o.fulfillmentType === "PICKUP") return "takeaway";
  return "qr";
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

export function RealOrdersWorkspaceV2({ initialOrders, initialRequests, restaurantId, canManageTestOrders }: Props) {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderDto[]>(initialOrders);
  const [tab, setTab] = useState<Tab>("all");
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

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, new: 0, cooking: 0, ready: 0, payment: 0 };
    for (const o of orders) {
      if (isOrderClosed(o)) continue;
      c.all += 1;
      const k = statusToTab(o.status);
      if (k !== "all") c[k] += 1;
    }
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const live = orders.filter((o) => !isOrderClosed(o));
    let list = tab === "all" ? live : live.filter((o) => statusToTab(o.status) === tab);
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
  }, [orders, tab, channelFilter, paymentFilter, search]);

  const detail = orders.find((o) => o.id === detailId) ?? null;
  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "Tất cả" },
    { key: "new", label: "Đơn mới" },
    { key: "cooking", label: "Đang làm" },
    { key: "ready", label: "Sẵn sàng" },
    { key: "payment", label: "Chờ thu" }
  ];
  const openRequestsCount = initialRequests?.length ?? 0;

  return (
    <div className="flex flex-col gap-[var(--d-s-4)]">
      <Toolbar eyebrow={`Realtime · ${counts.all} đơn đang mở`} title="Đơn hàng">
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
          <FilterTabs
            active={tab}
            onChange={(k) => setTab(k as Tab)}
            tabs={[
              { key: "all", label: "Tất cả", count: counts.all },
              { key: "new", label: "Đơn mới", count: counts.new },
              { key: "cooking", label: "Đang làm", count: counts.cooking },
              { key: "ready", label: "Sẵn sàng", count: counts.ready },
              { key: "payment", label: "Chờ thu", count: counts.payment }
            ]}
          />

          {visible.length === 0 ? (
            <EmptyState icon={<Utensils size={22} />} title="Không có đơn ở mục này" description="Đơn mới sẽ hiện ngay khi khách gọi món." />
          ) : (
            <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  nowMs={nowMs}
                  mutating={mutatingId === o.id}
                  onAdvance={() => {
                    const action = nextActionFor(o.status);
                    if (action) void mutateOrder(o.id, action);
                  }}
                  onDetail={() => setDetailId(o.id)}
                />
              ))}
            </div>
          )}
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

      <OrderDetailDrawer
        order={detail ? buildDetail(detail, nowMs) : null}
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        busy={detail ? mutatingId === detail.id : false}
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
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        channel={channelFilter}
        payment={paymentFilter}
        onChange={(c, p) => {
          setChannelFilter(c);
          setPaymentFilter(p);
        }}
      />

      <NextSteps
        items={[
          { href: "/dashboard/kitchen", label: "Vào bếp", hint: "Hàng đợi món", icon: <ChefHat size={14} /> },
          { href: "/dashboard/payments", label: "Đối soát thu", hint: "Bill chờ thanh toán", icon: <CreditCard size={14} /> },
          { href: "/dashboard/tables", label: "Sơ đồ bàn", hint: "Trạng thái bàn realtime", icon: <Utensils size={14} /> },
          { href: "/dashboard/online", label: "Đơn online", hint: "Pickup & giao hàng", icon: <Truck size={14} /> }
        ]}
      />
    </div>
  );
}

function OrderCard({
  order,
  nowMs,
  mutating,
  onAdvance,
  onDetail
}: {
  order: OrderDto;
  nowMs: number;
  mutating: boolean;
  onAdvance: () => void;
  onDetail: () => void;
}) {
  const tab = statusToTab(order.status);
  const accent =
    tab === "new"
      ? "var(--d-orange)"
      : tab === "cooking"
      ? "var(--d-info-fg)"
      : tab === "ready"
      ? "var(--d-ok-fg)"
      : tab === "payment"
      ? "var(--d-jade)"
      : "var(--d-line-strong)";
  const chipBg =
    tab === "new"
      ? "var(--d-accent-soft)"
      : tab === "cooking"
      ? "var(--d-info-bg)"
      : tab === "ready"
      ? "var(--d-ok-bg)"
      : tab === "payment"
      ? "var(--d-primary-soft)"
      : "var(--d-surface-2)";
  const chipText =
    tab === "new"
      ? "var(--d-orange-600)"
      : tab === "cooking"
      ? "var(--d-info-fg)"
      : tab === "ready"
      ? "var(--d-ok-fg)"
      : tab === "payment"
      ? "var(--d-primary)"
      : "var(--d-text-muted)";
  const min = elapsedMin(order.createdAt, nowMs);
  const overdue = min >= 10;
  const ch = channelOf(order);

  return (
    <article className="relative flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <header className="flex items-start justify-between gap-3 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="text-[length:var(--d-fs-h2)] font-bold leading-tight text-[var(--d-text)]">{order.table?.name ?? (ch === "delivery" ? "Giao hàng" : ch === "takeaway" ? "Mang đi" : "Bàn")}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {ch === "delivery" ? <Truck size={13} /> : ch === "takeaway" ? <Utensils size={13} /> : <QrCode size={13} />}
            {ch === "delivery" ? "Giao hàng" : ch === "takeaway" ? "Mang đi" : "QR tại bàn"}
            <span className="text-[var(--d-text-faint)]">·</span>
            <span className="d-num">{totalQty(order)} món</span>
          </span>
        </div>
        <span className="inline-flex items-center rounded-[var(--d-r-pill)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)]" style={{ background: chipBg, color: chipText }}>
          {tab === "new" ? "Đơn mới" : tab === "cooking" ? "Đang làm" : tab === "ready" ? "Sẵn sàng" : tab === "payment" ? "Chờ thu" : order.status}
        </span>
      </header>

      <p className="line-clamp-2 px-[var(--d-s-4)] pb-3 text-[length:var(--d-fs-sm)] leading-snug text-[var(--d-text-muted)]">
        {summarizeItems(order)}
      </p>

      <div className="flex items-center justify-between border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2.5">
        <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(order.total)}</span>
        <span className={cn("inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] font-semibold", overdue ? "text-[var(--d-danger-fg)]" : "text-[var(--d-text-faint)]")}>
          <Clock3 size={13} />
          {min === 0 ? "vừa xong" : `${min}'`}
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr]">
        <button type="button" onClick={onDetail} className="flex h-12 items-center justify-center gap-1.5 border-r border-[var(--d-line)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]">
          <Eye size={16} /><span className="hidden sm:inline">Chi tiết</span>
        </button>
        <button
          type="button"
          onClick={onAdvance}
          disabled={mutating || nextActionFor(order.status) === null}
          className="flex h-12 items-center justify-center gap-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-on-jade)] transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: accent }}
        >
          {tab === "new" ? "Nhận đơn" : tab === "cooking" ? "Báo đã ra món" : tab === "ready" ? "Giao cho khách" : tab === "payment" ? "Thu tiền" : "Đóng đơn"}
        </button>
      </div>
    </article>
  );
}

function buildDetail(o: OrderDto, nowMs: number): OrderDetail {
  const ch = channelOf(o);
  const elapsed = elapsedMin(o.createdAt, nowMs);
  return {
    id: o.id,
    code: o.id.slice(0, 8).toUpperCase(),
    table: o.table?.name ?? (ch === "delivery" ? "Giao hàng" : ch === "takeaway" ? "Mang đi" : "Bàn"),
    channel: ch,
    customer: o.customerName
      ? { name: o.customerName, phone: o.customerPhone ?? undefined, address: o.deliveryAddress ?? undefined }
      : undefined,
    items: o.items.map((it) => ({
      name: it.menuItem?.name ?? "Món",
      qty: it.quantity,
      price: formatVnd((it.price + (it.modifiers?.reduce((s, m) => s + m.lineTotal, 0) ?? 0)) * it.quantity),
      note: it.note ?? undefined
    })),
    subtotal: formatVnd(o.subtotal ?? o.total),
    discount: o.discountAmount ? formatVnd(o.discountAmount) : undefined,
    total: formatVnd(o.total),
    paymentMethod: o.paymentMethod === "QR" ? "VietQR" : o.paymentMethod === "CASH" ? "Tiền mặt" : undefined,
    paymentStatus: o.paymentStatus === "paid" ? "paid" : o.paymentStatus === "waiting_confirm" ? "pending" : "unpaid",
    elapsedMin: elapsed,
    status: statusToDetail(o.status),
    delivery: ch === "delivery" && o.deliveryDistanceKm
      ? {
          distanceKm: o.deliveryDistanceKm,
          etaMin: o.deliveryRouteDurationMinutes ?? 0,
          driverName: o.deliveryCourier?.name ?? undefined,
          driverPhone: o.deliveryCourier?.phone ?? undefined,
          progress: o.deliveryStatus === "delivered" ? 1 : o.deliveryStatus === "out_for_delivery" ? 0.6 : o.deliveryStatus === "accepted" ? 0.3 : 0.1
        }
      : undefined
  };
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
  useEffect(() => {
    setLocalChannel(channel);
    setLocalPayment(payment);
  }, [channel, payment, open]);

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
