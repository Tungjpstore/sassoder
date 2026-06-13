"use client";

/* RealOnlineWorkspaceV2 — production /dashboard/online.
 * Layout: Toolbar + KPI + FilterTabs + card grid + Drawer (giống demo v2).
 * Backend giữ nguyên 1:1 từ legacy OnlineWorkspace.
 * Card có action: Nhận / Báo đã ra / Cập nhật giao / Huỷ.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Banknote,
  Bike,
  Check,
  Clock3,
  ExternalLink,
  Eye,
  MapPin,
  Package,
  PackageCheck,
  QrCode,
  Settings2,
  ShoppingBag,
  Truck,
  X
} from "lucide-react";
import { Badge, EmptyState, MetricCard } from "../primitives";
import { FilterTabs, Toolbar } from "../workspace-ui";
import { Button } from "../button";
import { Drawer } from "../overlay";
import { NextSteps } from "../cross-link";
import { OnlineOrderingActions } from "@/components/dashboard/online-ordering-actions";
import { StoreDeliveryMapPreview } from "@/components/maps/store-delivery-map-preview";
import { useToast } from "@/components/dashboard/toast-provider";
import { deliveryStatusLabel, orderStatusLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { OrderingSettings } from "@/services/delivery-service";
import type { Json } from "@/types/supabase";

type OnlineOrder = {
  id: string;
  status: string;
  total: number;
  fulfillmentType: "PICKUP" | "DELIVERY";
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryDistanceKm: number | null;
  deliveryFee: number;
  deliveryStatus: string | null;
  deliveryRouteDurationMinutes: number | null;
  deliveryQuoteSnapshot: Json | null;
  paymentStatus: string | null;
  createdAt: string;
  acceptedAt: string | null;
  serviceDueAt: string | null;
  itemSummary: string;
};

type OnlineWorkspaceProps = {
  restaurant: OrderingSettings;
  stats: {
    todayOrders: number;
    todayRevenue: number;
    pending: number;
    preparing: number;
    waitingPayment: number;
    prepaidWaitingConfirm: number;
    pickupOpen: number;
    deliveryOpen: number;
    activeOnline: number;
    averageTicket: number;
  };
  recentOrders: OnlineOrder[];
  onlineUrl: string;
  qrSrc: string;
  menuItems: number;
  categories: number;
  mapboxReady: boolean;
};

type DrawerMode = "closed" | "qr" | "orders";
type Tab = "all" | "pickup" | "delivery";

function readDrawerMode(value: string | null): DrawerMode {
  return value === "qr" || value === "orders" ? value : "closed";
}

function ageMinutes(value: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 60_000));
}

function statusBadgeTone(status: string): "ok" | "orange" | "danger" | "info" | "neutral" {
  if (status === "paid" || status === "completed") return "ok";
  if (status === "waiting_payment" || status === "waiting_confirm") return "orange";
  if (status === "cancelled") return "danger";
  return "info";
}

export function RealOnlineWorkspaceV2({
  restaurant,
  stats,
  recentOrders,
  onlineUrl,
  qrSrc,
  menuItems,
  categories,
  mapboxReady
}: OnlineWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [drawer, setDrawerState] = useState<DrawerMode>(() => readDrawerMode(searchParams.get("panel")));
  const [tab, setTab] = useState<Tab>("all");
  const [pending, startTransition] = useTransition();
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  function actOnOrder(orderId: string, action: "accept" | "complete" | "cancel" | "confirm-payment") {
    if (mutatingId) return;
    setMutatingId(orderId);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/${action}`, { method: "POST", cache: "no-store" });
        if (!res.ok) throw new Error(await res.text().catch(() => `${res.status}`));
        toast.success(
          action === "accept" ? "Đã nhận đơn" :
          action === "complete" ? "Đã báo ra món" :
          action === "cancel" ? "Đã huỷ đơn" :
          "Đã xác nhận thanh toán"
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không thực hiện được thao tác");
      } finally {
        setMutatingId(null);
      }
    });
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const scheduleRefresh = (delay = 260) => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => router.refresh(), delay);
    };

    const channel = supabase
      .channel(`admin-online:${restaurant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories", filter: `restaurant_id=eq.${restaurant.id}` }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `restaurant_id=eq.${restaurant.id}` }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_modifier_groups", filter: `restaurant_id=eq.${restaurant.id}` }, () => scheduleRefresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_modifier_options", filter: `restaurant_id=eq.${restaurant.id}` }, () => scheduleRefresh())
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") scheduleRefresh(0);
      });

    const refreshIfVisible = () => {
      if (document.visibilityState !== "hidden" && window.navigator.onLine) scheduleRefresh(0);
    };
    const fallbackTimer = window.setInterval(refreshIfVisible, 30_000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      supabase.removeChannel(channel);
    };
  }, [restaurant.id, router]);

  useEffect(() => {
    const sync = () => setDrawerState(readDrawerMode(new URLSearchParams(window.location.search).get("panel")));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function setDrawer(next: DrawerMode) {
    setDrawerState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "closed") params.delete("panel");
    else params.set("panel", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const counts = useMemo(
    () => ({
      all: recentOrders.length,
      pickup: recentOrders.filter((o) => o.fulfillmentType === "PICKUP").length,
      delivery: recentOrders.filter((o) => o.fulfillmentType === "DELIVERY").length
    }),
    [recentOrders]
  );
  const visible = useMemo(
    () => (tab === "all" ? recentOrders : recentOrders.filter((o) => (tab === "pickup" ? o.fulfillmentType === "PICKUP" : o.fulfillmentType === "DELIVERY"))),
    [recentOrders, tab]
  );

  return (
    <div className="flex flex-col gap-[var(--d-s-5)]">
      <Toolbar eyebrow="Pickup & giao hàng" title="Đặt online">
        <a
          href="/dashboard/settings?section=online"
          className="inline-flex h-10 items-center gap-1.5 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-4 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)] transition hover:border-[var(--d-jade)] hover:text-[var(--d-primary)]"
        >
          <Settings2 size={15} /> Cấu hình
        </a>
        <Button variant="primary" onClick={() => setDrawer("qr")}>
          <QrCode size={15} /> QR &amp; Link
        </Button>
      </Toolbar>

      <section className="grid grid-cols-2 gap-[var(--d-s-3)] lg:grid-cols-4">
        <MetricCard icon={<ShoppingBag size={18} />} label="Đơn hôm nay" value={String(stats.todayOrders)} helper={formatVnd(stats.todayRevenue)} tone="jade" />
        <MetricCard icon={<PackageCheck size={18} />} label="Đang xử lý" value={String(stats.activeOnline)} helper={`${stats.pending} đơn mới`} tone="info" />
        <MetricCard icon={<Banknote size={18} />} label="Chờ xác nhận CK" value={String(stats.prepaidWaitingConfirm)} helper={restaurant.online_payment_mode === "QR_PREPAID" ? "Trả trước" : "Tuỳ chọn"} tone="orange" />
        <MetricCard icon={<Bike size={18} />} label="Vé trung bình" value={formatVnd(stats.averageTicket)} helper={`${stats.deliveryOpen} giao · ${stats.pickupOpen} lấy`} tone="neutral" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          active={tab}
          onChange={(k) => setTab(k as Tab)}
          tabs={[
            { key: "all", label: "Tất cả", count: counts.all },
            { key: "pickup", label: "Đến lấy", count: counts.pickup },
            { key: "delivery", label: "Giao hàng", count: counts.delivery }
          ]}
        />
        <span className="inline-flex items-center gap-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
          <Badge tone={restaurant.online_ordering_enabled ? "ok" : "orange"}>
            {restaurant.online_ordering_enabled ? "Đang nhận khách" : "Đang tắt"}
          </Badge>
          <span>{menuItems} món · {categories} mục · {mapboxReady ? "Map sẵn sàng" : "Map chưa đủ"}</span>
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<Package size={22} />} title="Chưa có đơn online" description="Đơn pickup và giao hàng sẽ hiện ở đây ngay khi khách đặt." />
      ) : (
        <div className="grid gap-[var(--d-s-3)] sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((order) => (
            <OnlineOrderCard
              key={order.id}
              order={order}
              nowMs={nowMs}
              mutating={mutatingId === order.id}
              onDetail={() => setDrawer("orders")}
              onAction={(action) => actOnOrder(order.id, action)}
            />
          ))}
        </div>
      )}

      {drawer === "qr" ? (
        <Drawer
          open
          onClose={() => setDrawer("closed")}
          title="QR & link chia sẻ"
          subtitle="Bán online"
          width="md"
          headerMeta={
            <a
              href={onlineUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--d-r-pill)] bg-[var(--d-primary-soft)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold text-[var(--d-primary)]"
            >
              <ExternalLink size={12} /> Mở trang khách
            </a>
          }
        >
          <div className="grid gap-[var(--d-s-4)]">
            <div className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-[var(--d-s-4)] text-center">
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-jade)] text-[var(--d-on-jade)]">
                <QrCode size={19} aria-hidden="true" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt="QR đặt món online"
                width={240}
                height={240}
                className="mx-auto rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] p-2"
              />
              <p className="mt-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">{restaurant.name}</p>
              <code className="mt-2 block break-all rounded-[var(--d-r-sm)] bg-[var(--d-surface)] px-2 py-1.5 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
                {onlineUrl}
              </code>
            </div>
            <OnlineOrderingActions onlineUrl={onlineUrl} restaurantName={restaurant.name} qrSrc={qrSrc} />
            <StoreDeliveryMapPreview
              latitude={restaurant.store_lat}
              longitude={restaurant.store_lng}
              radiusKm={Number(restaurant.delivery_radius_km)}
              address={restaurant.address}
            />
            <div className="grid gap-2">
              <PolicyRow icon={<Banknote size={14} />} label="Thanh toán" value={restaurant.online_payment_mode === "QR_PREPAID" ? "Bắt buộc CK trước" : "Có thể trả sau"} />
              <PolicyRow icon={<Truck size={14} />} label="Giao hàng" value={restaurant.delivery_enabled ? `${restaurant.delivery_radius_km}km · miễn phí ${restaurant.free_delivery_radius_km}km · ${formatVnd(restaurant.delivery_base_fee)}` : "Đang tắt"} />
              <PolicyRow icon={<MapPin size={14} />} label="Đến lấy" value={restaurant.pickup_enabled ? `${restaurant.pickup_eta_minutes} phút` : "Đang tắt"} />
            </div>
          </div>
        </Drawer>
      ) : null}

      {drawer === "orders" ? (
        <Drawer open onClose={() => setDrawer("closed")} title="Đơn online gần đây" subtitle="Bán online" width="md">
          <div className="grid gap-[var(--d-s-3)]">
            {recentOrders.length === 0 ? (
              <EmptyState icon={<PackageCheck size={20} />} title="Chưa có đơn" description="Khi khách đặt online, đơn sẽ xuất hiện ở đây." />
            ) : (
              recentOrders.map((order) => <OnlineOrderCard key={order.id} order={order} nowMs={nowMs} compact />)
            )}
          </div>
        </Drawer>
      ) : null}

      <NextSteps
        items={[
          { href: "/dashboard/settings?section=online", label: "Cấu hình bán online", hint: "Map, vùng giao, phí ship", icon: <Settings2 size={14} /> },
          { href: "/dashboard/orders", label: "Đơn hàng", hint: "Tất cả kênh", icon: <ShoppingBag size={14} /> },
          { href: "/dashboard/kitchen", label: "Bếp", hint: "Chuẩn bị món", icon: <PackageCheck size={14} /> },
          { href: "/dashboard/menu", label: "Menu món", hint: "Bật/tắt món bán online", icon: <Package size={14} /> }
        ]}
      />
    </div>
  );
}

function PolicyRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2">
      <span className="inline-flex items-center gap-2 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text)]">
        <span className="text-[var(--d-jade)]">{icon}</span>
        {label}
      </span>
      <span className="text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{value}</span>
    </div>
  );
}

function OnlineOrderCard({
  order,
  nowMs,
  compact = false,
  mutating = false,
  onDetail,
  onAction
}: {
  order: OnlineOrder;
  nowMs: number;
  compact?: boolean;
  mutating?: boolean;
  onDetail?: () => void;
  onAction?: (action: "accept" | "complete" | "cancel" | "confirm-payment") => void;
}) {
  const isDelivery = order.fulfillmentType === "DELIVERY";
  const accent =
    order.status === "completed" || order.status === "paid"
      ? "var(--d-ok-fg)"
      : order.status === "cancelled"
      ? "var(--d-danger-fg)"
      : isDelivery
      ? "var(--d-info-fg)"
      : "var(--d-jade)";

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] shadow-[var(--d-sh-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--d-sh-md)]">
      <span className="h-1" style={{ background: accent }} />
      <header className="flex items-start justify-between gap-2 px-[var(--d-s-4)] pb-2 pt-[var(--d-s-4)]">
        <div className="min-w-0">
          <p className="truncate text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{order.customerName ?? "Khách online"}</p>
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-[length:var(--d-fs-xs)] text-[var(--d-text-muted)]">
            {isDelivery ? <Bike size={13} /> : <Package size={13} />}
            {order.customerPhone ?? "Chưa có SĐT"} · {ageMinutes(order.createdAt, nowMs)}'
          </span>
        </div>
        <Badge tone={statusBadgeTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
      </header>

      <p className="line-clamp-2 px-[var(--d-s-4)] pb-2 text-[length:var(--d-fs-sm)] text-[var(--d-text-muted)]">{order.itemSummary}</p>

      {isDelivery && order.deliveryAddress ? (
        <p className="line-clamp-1 px-[var(--d-s-4)] pb-2 text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">
          <MapPin size={11} className="mr-1 inline" />
          {order.deliveryAddress}
          {order.deliveryDistanceKm ? ` · ${order.deliveryDistanceKm}km` : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 px-[var(--d-s-4)] pb-2">
        <Badge tone={statusBadgeTone(order.paymentStatus ?? "pending")}>{paymentStatusLabel(order.paymentStatus)}</Badge>
        {isDelivery ? (
          <Badge tone={order.deliveryStatus === "delivered" ? "ok" : order.deliveryStatus === "out_for_delivery" ? "info" : "orange"}>
            {deliveryStatusLabel(order.deliveryStatus)}
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--d-line)] bg-[var(--d-surface-2)]/40 px-[var(--d-s-4)] py-2.5">
        <span className="d-num text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">{formatVnd(order.total)}</span>
        <span className="inline-flex items-center gap-1 text-[length:var(--d-fs-xs)] text-[var(--d-text-faint)]">
          <Clock3 size={12} />
          {ageMinutes(order.createdAt, nowMs)}'
        </span>
      </div>

      {!compact ? (
        <div className="grid grid-cols-3 border-t border-[var(--d-line)]">
          <button
            type="button"
            onClick={onDetail}
            className="flex h-11 items-center justify-center gap-1.5 border-r border-[var(--d-line)] text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
          >
            <Eye size={14} /> Chi tiết
          </button>
          <button
            type="button"
            onClick={() => onAction?.("cancel")}
            disabled={mutating}
            className="flex h-11 items-center justify-center gap-1.5 border-r border-[var(--d-line)] text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)] transition hover:bg-[var(--d-danger-bg)] hover:text-[var(--d-danger-fg)] disabled:opacity-50"
          >
            <X size={14} /> Huỷ
          </button>
          {nextActionFor(order) ? (
            <button
              type="button"
              onClick={() => onAction?.(nextActionFor(order)!.action)}
              disabled={mutating}
              className="flex h-11 items-center justify-center gap-1.5 bg-[var(--d-jade)] text-[length:var(--d-fs-xs)] font-bold text-[var(--d-on-jade)] transition active:scale-[0.99] disabled:opacity-60"
            >
              <Check size={14} /> {nextActionFor(order)!.label}
            </button>
          ) : (
            <span className="flex h-11 items-center justify-center gap-1 bg-[var(--d-surface-2)] text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-faint)]">
              Xong
            </span>
          )}
        </div>
      ) : null}
    </article>
  );
}

function nextActionFor(o: OnlineOrder): { action: "accept" | "complete" | "confirm-payment"; label: string } | null {
  if (o.status === "pending") return { action: "accept", label: "Nhận đơn" };
  if (o.status === "ordering") return { action: "complete", label: "Báo đã ra món" };
  if (o.status === "completed" || o.status === "waiting_confirm" || o.status === "waiting_payment") {
    return { action: "confirm-payment", label: "Xác nhận thu" };
  }
  return null;
}
