"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Banknote, Bike, Clock3, Compass, ExternalLink, MapPin, PackageCheck, QrCode, Settings2, ShoppingBag, Truck } from "lucide-react";
import { DashboardMetricCard } from "@/components/dashboard/primitives";
import { DashboardDrawer } from "@/components/dashboard/shared-drawer";
import { OnlineOrderingActions } from "@/components/dashboard/online-ordering-actions";
import { OrderingSettingsForm } from "@/components/dashboard/ordering-settings-form";
import { StoreDeliveryMapPreview } from "@/components/maps/store-delivery-map-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deliveryStatusLabel, orderStatusLabel, paymentStatusLabel } from "@/lib/labels";
import { resolveDeliveryQuoteSnapshotInsight } from "@/lib/delivery/quote-snapshot-insight";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { OrderingSettings } from "@/services/delivery-service";
import type { Json } from "@/types/supabase";

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
  recentOrders: Array<{
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
  }>;
  onlineUrl: string;
  qrSrc: string;
  menuItems: number;
  categories: number;
  mapboxReady: boolean;
};

type DrawerMode = "closed" | "settings" | "qr" | "orders";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusTone(status: string) {
  if (status === "paid" || status === "completed") return "green";
  if (status === "waiting_payment" || status === "waiting_confirm") return "yellow";
  if (status === "cancelled") return "red";
  return "blue";
}

function DeliveryQuoteSummary({
  address,
  distanceKm,
  durationMinutes,
  snapshot
}: {
  address: string | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  snapshot: Json | null;
}) {
  const insight = resolveDeliveryQuoteSnapshotInsight(snapshot);

  return (
    <div className="mt-3 grid gap-2 text-xs font-medium text-[var(--muted-foreground)]">
      <p>
        {distanceKm ? `${distanceKm} km` : "Chưa có khoảng cách"} · {durationMinutes ? `${durationMinutes} phút` : "Chưa có ETA"} · {address || "Chưa có địa chỉ"}
      </p>
      {insight ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={insight.tone}>{insight.label}</Badge>
          {insight.badges.slice(0, 4).map((badge) => (
            <span key={badge} className="rounded-full border border-[var(--border)] bg-[var(--soft-surface)] px-2 py-1 text-[11px] font-semibold">
              {badge}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function readinessItems({
  restaurant,
  mapboxReady,
  menuItems,
  categories
}: {
  restaurant: OrderingSettings;
  mapboxReady: boolean;
  menuItems: number;
  categories: number;
}) {
  const onlineReady = restaurant.online_ordering_enabled && (restaurant.pickup_enabled || restaurant.delivery_enabled);
  const deliveryReady = !restaurant.delivery_enabled || (restaurant.store_lat !== null && restaurant.store_lng !== null);

  return [
    { label: "Sẵn sàng nhận đơn", value: onlineReady ? "Đang bật" : "Chưa bật", helper: onlineReady ? "Link online đang hoạt động" : "Bật đặt online và ít nhất 1 hình thức nhận đơn" },
    { label: "Menu", value: `${menuItems} món`, helper: `${categories} danh mục đang bán` },
    { label: "Bản đồ giao hàng", value: mapboxReady ? "Sẵn sàng" : "Chưa đủ", helper: mapboxReady ? "Đã sẵn sàng định vị, tính tuyến và báo phí" : "Cần cấu hình bản đồ hoặc tọa độ quán" },
    { label: "Định vị quán", value: deliveryReady ? "Đã có" : "Thiếu tọa độ", helper: deliveryReady ? "Có thể tính khoảng cách giao hàng" : "Dùng nút tự lấy tọa độ trong cấu hình" }
  ];
}

function drawerTitle(mode: DrawerMode) {
  if (mode === "settings") return "Cấu hình bán online";
  if (mode === "qr") return "QR & link chia sẻ";
  if (mode === "orders") return "Đơn online gần đây";
  return "";
}

function readDrawerMode(value: string | null): DrawerMode {
  return value === "settings" || value === "qr" || value === "orders" ? value : "closed";
}

function onlineOrderAgeMinutes(value: string, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 60_000));
}

function OnlineIntakeStatusPanel({
  restaurant,
  stats,
  recentOrders,
  readiness,
  mapboxReady,
  menuItems,
  categories,
  nowMs,
  onOpenSettings,
  onOpenQr,
  onOpenOrders
}: {
  restaurant: OrderingSettings;
  stats: OnlineWorkspaceProps["stats"];
  recentOrders: OnlineWorkspaceProps["recentOrders"];
  readiness: ReturnType<typeof readinessItems>;
  mapboxReady: boolean;
  menuItems: number;
  categories: number;
  nowMs: number;
  onOpenSettings: () => void;
  onOpenQr: () => void;
  onOpenOrders: () => void;
}) {
  const oldestOpenAge = recentOrders
    .filter((order) => !["paid", "completed", "cancelled"].includes(order.status))
    .reduce((max, order) => Math.max(max, onlineOrderAgeMinutes(order.createdAt, nowMs)), 0);
  const readinessGaps = readiness.filter((item) => item.value.includes("Chưa") || item.value.includes("Thiếu")).length;
  const intakeScore = Math.max(
    0,
    100 -
      stats.pending * 12 -
      stats.waitingPayment * 8 -
      stats.prepaidWaitingConfirm * 12 -
      readinessGaps * 10 -
      Math.max(0, oldestOpenAge - 20)
  );
  const intakeTone = intakeScore >= 84 ? "green" : intakeScore >= 64 ? "yellow" : "red";
  const firstOrder = recentOrders
    .filter((order) => !["paid", "completed", "cancelled"].includes(order.status))
    .sort((left, right) => onlineOrderAgeMinutes(right.createdAt, nowMs) - onlineOrderAgeMinutes(left.createdAt, nowMs))[0] ?? null;
  const checks = [
    {
      id: "enabled",
      label: "Online đang nhận đơn",
      value: restaurant.online_ordering_enabled ? "Bật" : "Tắt",
      done: restaurant.online_ordering_enabled && (restaurant.pickup_enabled || restaurant.delivery_enabled),
      action: onOpenSettings
    },
    {
      id: "menu",
      label: "Menu online có món",
      value: menuItems.toLocaleString("vi-VN"),
      done: menuItems > 0 && categories > 0,
      action: onOpenSettings
    },
    {
      id: "map",
      label: "Giao hàng đủ định vị",
      value: mapboxReady ? "OK" : "Thiếu",
      done: !restaurant.delivery_enabled || mapboxReady,
      action: onOpenSettings
    },
    {
      id: "payment",
      label: "Thanh toán treo được gom",
      value: (stats.waitingPayment + stats.prepaidWaitingConfirm).toLocaleString("vi-VN"),
      done: stats.waitingPayment + stats.prepaidWaitingConfirm === 0,
      action: onOpenOrders
    }
  ];

  return (
    <section className="dashboard-panel p-3">
      <div className="grid gap-3 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow">Bán online</p>
              <h2 className="dashboard-section-title mt-1">Đầu vào pickup/delivery</h2>
            </div>
            <Badge tone={intakeTone}>Sẵn sàng {intakeScore}/100</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Đơn active</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{stats.activeOnline}</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Đơn lâu nhất</p>
              <p className="metric-number mt-1 text-2xl font-semibold text-[var(--foreground)]">{oldestOpenAge}p</p>
            </div>
            <div className="rounded-lg bg-[var(--soft-surface)] p-3">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">Pickup/Delivery</p>
              <p className="metric-number mt-1 text-lg font-semibold text-[var(--foreground)]">{stats.pickupOpen}/{stats.deliveryOpen}</p>
            </div>
            <button type="button" onClick={onOpenQr} className="rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:border-[var(--primary)]">
              <p className="text-xs font-semibold text-[var(--muted-foreground)]">QR/link bán online</p>
              <p className="mt-1 text-sm font-semibold text-[var(--primary)]">Mở để chia sẻ</p>
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Checklist nhận đơn online</p>
              <Badge tone={checks.every((item) => item.done) ? "green" : "yellow"}>{checks.filter((item) => !item.done).length || "Xong"}</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map((item) => (
                <button key={item.id} type="button" onClick={item.action} className="flex min-h-[48px] items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--primary)]">
                  <span className="truncate text-xs font-semibold text-[var(--foreground)]">{item.label}</span>
                  <Badge tone={item.done ? "green" : "yellow"}>{item.value}</Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">Đơn cần nhìn trước</p>
              <Badge tone={firstOrder ? statusTone(firstOrder.status) : "green"}>{firstOrder ? "Có đơn" : "Sạch"}</Badge>
            </div>
            {firstOrder ? (
              <button type="button" onClick={onOpenOrders} className="w-full rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-[var(--shadow-soft)]">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{firstOrder.customerName || "Khách online"}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted-foreground)]">
                      {firstOrder.fulfillmentType === "DELIVERY" ? "Giao hàng" : "Đến lấy"} · {onlineOrderAgeMinutes(firstOrder.createdAt, nowMs)} phút
                    </span>
                  </span>
                  <Badge tone={statusTone(firstOrder.status)}>{orderStatusLabel(firstOrder.status)}</Badge>
                </div>
                <p className="metric-number mt-2 text-lg font-semibold text-[var(--accent)]">{formatVnd(firstOrder.total)}</p>
                <p className="mt-1 truncate text-xs font-semibold text-[var(--muted-foreground)]">{firstOrder.itemSummary}</p>
              </button>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-sm font-semibold text-[var(--muted-foreground)]">
                Không có đơn online cần xử lý ngay.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function OnlineWorkspace({
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
  const [drawer, setDrawerState] = useState<DrawerMode>(() => readDrawerMode(searchParams.get("panel")));
  const refreshTimerRef = useRef<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const readiness = useMemo(() => readinessItems({ restaurant, mapboxReady, menuItems, categories }), [restaurant, mapboxReady, menuItems, categories]);
  const topOrders = recentOrders.slice(0, 4);

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
    const syncDrawerFromHistory = () => {
      setDrawerState(readDrawerMode(new URLSearchParams(window.location.search).get("panel")));
    };
    window.addEventListener("popstate", syncDrawerFromHistory);
    return () => window.removeEventListener("popstate", syncDrawerFromHistory);
  }, []);

  function setDrawer(nextDrawer: DrawerMode) {
    setDrawerState(nextDrawer);
    const params = new URLSearchParams(searchParams.toString());
    if (nextDrawer === "closed") {
      params.delete("panel");
    } else {
      params.set("panel", nextDrawer);
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <section className="dashboard-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <Badge tone={restaurant.online_ordering_enabled ? "green" : "yellow"}>
                  {restaurant.online_ordering_enabled ? "Đang nhận khách online" : "Đang tắt bán online"}
                </Badge>
                <h1 className="dashboard-page-title mt-3">Bán online</h1>
                <p className="sr-only">Bật link đặt món, cấu hình giao hàng, chia sẻ QR và theo dõi đơn online.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setDrawer("settings")}>
                  <Settings2 size={16} />
                  Cấu hình
                </Button>
                <Button type="button" onClick={() => setDrawer("qr")}>
                  <QrCode size={16} />
                  Xem QR
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                { label: "Đơn hôm nay", value: stats.todayOrders, helper: formatVnd(stats.todayRevenue), icon: ShoppingBag },
                { label: "Đang xử lý", value: stats.activeOnline, helper: `${stats.pending} đơn mới`, icon: PackageCheck },
                { label: "Chờ xác nhận CK", value: stats.prepaidWaitingConfirm, helper: restaurant.online_payment_mode === "QR_PREPAID" ? "Luồng trả trước" : "Không bắt buộc", icon: Banknote },
                { label: "Vé trung bình", value: formatVnd(stats.averageTicket), helper: `${stats.deliveryOpen} giao · ${stats.pickupOpen} lấy`, icon: Clock3 }
              ].map((card) => {
                return (
                  <DashboardMetricCard key={card.label} icon={card.icon} label={card.label} value={card.value} meta={card.helper} tone="blue" />
                );
              })}
            </div>
          </section>

          <OnlineIntakeStatusPanel
            restaurant={restaurant}
            stats={stats}
            recentOrders={recentOrders}
            readiness={readiness}
            mapboxReady={mapboxReady}
            menuItems={menuItems}
            categories={categories}
            nowMs={nowMs}
            onOpenSettings={() => setDrawer("settings")}
            onOpenQr={() => setDrawer("qr")}
            onOpenOrders={() => setDrawer("orders")}
          />

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="dashboard-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">Đơn mới</h2>
                </div>
                <button type="button" onClick={() => setDrawer("orders")} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--primary)]">
                  Xem đầy đủ
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {topOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-6 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                    Chưa có đơn online mới.
                  </div>
                ) : (
                  topOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setDrawer("orders")}
                      className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--primary)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--foreground)]">{order.customerName || "Khách online"}</p>
                          <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
                            {order.customerPhone || "Chưa có SĐT"} · {formatTime(order.createdAt)}
                          </p>
                        </div>
                        <Badge tone={order.fulfillmentType === "DELIVERY" ? "blue" : "green"}>
                          {order.fulfillmentType === "DELIVERY" ? "Giao hàng" : "Đến lấy"}
                        </Badge>
                      </div>
                      <p className="truncate text-sm text-[var(--muted-foreground)]">{order.itemSummary}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
                          <Badge tone={statusTone(order.paymentStatus ?? "pending")}>{paymentStatusLabel(order.paymentStatus)}</Badge>
                          {order.fulfillmentType === "DELIVERY" ? (
                            <Badge tone={order.deliveryStatus === "delivered" ? "green" : order.deliveryStatus === "out_for_delivery" ? "blue" : "yellow"}>
                              {deliveryStatusLabel(order.deliveryStatus)}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="metric-number font-semibold text-[var(--foreground)]">{formatVnd(order.total)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="dashboard-panel p-4">
              <div className="flex items-center gap-2">
                <Compass className="text-[var(--primary)]" size={18} />
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Điều kiện bán online</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {readiness.map((item) => (
                  <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
                      <span className="text-xs font-semibold text-[var(--primary)]">{item.value}</span>
                    </div>
                    <p className="sr-only">{item.helper}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <section className="dashboard-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="dashboard-eyebrow text-[var(--muted-foreground)]">Link public</p>
                <h2 className="dashboard-section-title mt-1">Kênh chia sẻ cho khách</h2>
              </div>
              <a href={onlineUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--primary)]">
                <ExternalLink size={15} />
                Mở
              </a>
            </div>

            <code className="mt-4 block overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-3 text-sm font-semibold text-[var(--foreground)]">
              {onlineUrl}
            </code>

            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => setDrawer("qr")} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)]">
                <span className="flex items-center gap-2"><QrCode size={16} className="text-[var(--primary)]" /> Mở QR chia sẻ</span>
                <ArrowRight size={16} />
              </button>
              <button type="button" onClick={() => setDrawer("settings")} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)]">
                <span className="flex items-center gap-2"><MapPin size={16} className="text-[var(--primary)]" /> Tọa độ & giao hàng</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          <StoreDeliveryMapPreview
            latitude={restaurant.store_lat}
            longitude={restaurant.store_lng}
            radiusKm={Number(restaurant.delivery_radius_km)}
            address={restaurant.address}
          />

          <section className="dashboard-panel p-4">
            <div className="flex items-center gap-2">
              <Truck className="text-[var(--primary)]" size={18} />
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Chính sách đang áp dụng</h2>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <p className="font-semibold text-[var(--foreground)]">Thanh toán</p>
                <p className="mt-1 text-[var(--muted-foreground)]">
                  {restaurant.online_payment_mode === "QR_PREPAID" ? "Bắt buộc chuyển khoản rồi mới nhận đơn." : "Khách có thể thanh toán sau."}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <p className="font-semibold text-[var(--foreground)]">Giao hàng</p>
                <p className="mt-1 text-[var(--muted-foreground)]">
                  {restaurant.delivery_enabled
                    ? `${restaurant.delivery_radius_km} km · miễn phí ${restaurant.free_delivery_radius_km} km · ${formatVnd(restaurant.delivery_base_fee)} phí gốc`
                    : "Đang tắt giao hàng"}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <p className="font-semibold text-[var(--foreground)]">Đến lấy</p>
                <p className="mt-1 text-[var(--muted-foreground)]">
                  {restaurant.pickup_enabled ? `Khách đến lấy sau khoảng ${restaurant.pickup_eta_minutes} phút.` : "Đang tắt đến lấy"}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {drawer === "settings" ? (
        <DashboardDrawer
          open
          onClose={() => setDrawer("closed")}
          title="Cấu hình bán online"
          subtitle="Bán online"
          width="lg"
          closeLabel="Đóng cấu hình bán online"
          contentClassName="px-3 sm:px-4"
        >
          <OrderingSettingsForm settings={restaurant} onlineUrl={onlineUrl} compact />
        </DashboardDrawer>
      ) : drawer !== "closed" ? (
        <DashboardDrawer
          open
          onClose={() => setDrawer("closed")}
          title={drawerTitle(drawer)}
          subtitle="Bán online"
          width="md"
        >
          {drawer === "qr" ? (
            <div className="grid gap-4">
              <div className="mx-auto w-full max-w-[280px] rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-center">
                <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white">
                  <QrCode size={19} aria-hidden="true" />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="QR đặt món online" width={240} height={240} className="mx-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2" />
                <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">{restaurant.name}</p>
                <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">Quét để đặt món online</p>
              </div>
              <OnlineOrderingActions onlineUrl={onlineUrl} restaurantName={restaurant.name} qrSrc={qrSrc} />
            </div>
          ) : null}

          {drawer === "orders" ? (
            <div className="grid gap-3">
              {recentOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-6 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chưa có đơn online gần đây.
                </div>
              ) : (
                recentOrders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--foreground)]">{order.customerName || "Khách online"}</p>
                        <p className="mt-1 text-xs font-medium text-[var(--muted-foreground)]">
                          {order.customerPhone || "Chưa có SĐT"} · {formatTime(order.createdAt)}
                        </p>
                      </div>
                      <span className="metric-number font-semibold text-[var(--accent)]">{formatVnd(order.total)}</span>
                    </div>
                    <p className="mt-3 text-sm text-[var(--muted-foreground)]">{order.itemSummary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone={order.fulfillmentType === "DELIVERY" ? "blue" : "green"}>
                        {order.fulfillmentType === "DELIVERY" ? "Giao hàng" : "Đến lấy"}
                      </Badge>
                      <Badge tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</Badge>
                      <Badge tone={statusTone(order.paymentStatus ?? "pending")}>{paymentStatusLabel(order.paymentStatus)}</Badge>
                      {order.fulfillmentType === "DELIVERY" ? (
                        <Badge tone={order.deliveryStatus === "delivered" ? "green" : order.deliveryStatus === "out_for_delivery" ? "blue" : "yellow"}>
                          {deliveryStatusLabel(order.deliveryStatus)}
                        </Badge>
                      ) : null}
                    </div>
                    {order.fulfillmentType === "DELIVERY" ? (
                      <DeliveryQuoteSummary
                        address={order.deliveryAddress}
                        distanceKm={order.deliveryDistanceKm}
                        durationMinutes={order.deliveryRouteDurationMinutes}
                        snapshot={order.deliveryQuoteSnapshot}
                      />
                    ) : null}
                  </div>
                ))
              )}
              <Link href="/dashboard/orders" className="dashboard-primary-action">
                Mở bảng đơn hàng đầy đủ
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </DashboardDrawer>
      ) : null}
    </>
  );
}
