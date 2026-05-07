"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Bike, Clock3, Compass, ExternalLink, MapPin, PackageCheck, QrCode, Settings2, ShoppingBag, Truck, X } from "lucide-react";
import { OnlineOrderingActions } from "@/components/dashboard/online-ordering-actions";
import { OrderingSettingsForm } from "@/components/dashboard/ordering-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deliveryStatusLabel, orderStatusLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import type { OrderingSettings } from "@/services/delivery-service";

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
    { label: "Bản đồ giao hàng", value: mapboxReady ? "Mapbox OK" : "Chưa đủ", helper: mapboxReady ? "Đã sẵn sàng tính tuyến giao thật" : "Cần token hoặc tọa độ quán" },
    { label: "Định vị quán", value: deliveryReady ? "Đã có" : "Thiếu tọa độ", helper: deliveryReady ? "Có thể tính khoảng cách giao hàng" : "Dùng nút tự lấy tọa độ trong cấu hình" }
  ];
}

function drawerTitle(mode: DrawerMode) {
  if (mode === "settings") return "Cấu hình bán online";
  if (mode === "qr") return "QR & link chia sẻ";
  if (mode === "orders") return "Đơn online gần đây";
  return "";
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
  const [drawer, setDrawer] = useState<DrawerMode>("closed");
  const readiness = useMemo(() => readinessItems({ restaurant, mapboxReady, menuItems, categories }), [restaurant, mapboxReady, menuItems, categories]);
  const topOrders = recentOrders.slice(0, 4);

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
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">Bán online gọn nhẹ</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
                  Một nơi để bật link đặt món, cấu hình giao hàng, chia sẻ QR và theo dõi đơn khách đến lấy hoặc giao tận nơi.
                </p>
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
                const Icon = card.icon;
                return (
                  <article key={card.label} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-4">
                    <span className="dashboard-stat-icon">
                      <Icon size={17} />
                    </span>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{card.label}</p>
                    <p className="metric-number mt-1 truncate text-2xl font-semibold text-[var(--foreground)]">{card.value}</p>
                    <p className="mt-1 truncate text-xs font-medium text-[var(--muted-foreground)]">{card.helper}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="dashboard-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">Đơn mới cần nhìn nhanh</h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">Giữ cho màn này gọn, chỉ hiển thị những đơn mới nhất và đáng chú ý.</p>
                </div>
                <button type="button" onClick={() => setDrawer("orders")} className="text-sm font-semibold text-[var(--primary)]">
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
                      className="grid gap-3 rounded-xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--primary)]"
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
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Checklist vận hành</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {readiness.map((item) => (
                  <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
                      <span className="text-xs font-semibold text-[var(--primary)]">{item.value}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{item.helper}</p>
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
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Link public</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">Kênh chia sẻ cho khách</h2>
              </div>
              <a href={onlineUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--primary)]">
                <ExternalLink size={15} />
                Mở
              </a>
            </div>

            <code className="mt-4 block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-3 text-sm font-semibold text-[var(--foreground)]">
              {onlineUrl}
            </code>

            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => setDrawer("qr")} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)]">
                <span className="flex items-center gap-2"><QrCode size={16} className="text-[var(--primary)]" /> Mở QR chia sẻ</span>
                <ArrowRight size={16} />
              </button>
              <button type="button" onClick={() => setDrawer("settings")} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)]">
                <span className="flex items-center gap-2"><MapPin size={16} className="text-[var(--primary)]" /> Tọa độ & giao hàng</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

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

      {drawer !== "closed" ? (
        <div className="fixed inset-0 z-[80]">
          <button type="button" className="absolute inset-0 bg-slate-950/24" onClick={() => setDrawer("closed")} aria-label="Đóng drawer" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[540px] flex-col border-l border-[var(--border)] bg-white shadow-[0_20px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Online workspace</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">{drawerTitle(drawer)}</h2>
              </div>
              <button type="button" onClick={() => setDrawer("closed")} className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-white text-[var(--muted-foreground)]">
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {drawer === "settings" ? (
                <OrderingSettingsForm settings={restaurant} onlineUrl={onlineUrl} compact />
              ) : null}

              {drawer === "qr" ? (
                <div className="grid gap-4">
                  <div className="mx-auto w-full max-w-[280px] rounded-2xl border border-[var(--border)] bg-[var(--soft-surface)] p-4 text-center">
                    <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-white">
                      <QrCode size={19} />
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrSrc} alt="QR đặt món online" width={240} height={240} className="mx-auto rounded-xl border border-[var(--border)] bg-white p-2" />
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
                      <div key={order.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
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
                          <p className="mt-3 text-xs font-medium text-[var(--muted-foreground)]">
                            {order.deliveryDistanceKm ? `${order.deliveryDistanceKm} km` : "Chưa có khoảng cách"} · {order.deliveryRouteDurationMinutes ? `${order.deliveryRouteDurationMinutes} phút` : "Chưa có ETA"} · {order.deliveryAddress || "Chưa có địa chỉ"}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                  <Link href="/dashboard/orders" className="dashboard-primary-action">
                    Mở bảng đơn hàng đầy đủ
                    <ArrowRight size={15} />
                  </Link>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
