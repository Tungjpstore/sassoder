"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, ChevronUp, Clock3, CreditCard, History, LocateFixed, MapPinned, Minus, PackageCheck, Phone, Plus, ShoppingBag, Store, Tag, Truck, X } from "lucide-react";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import { RemotePaymentReceipt } from "@/components/customer/remote-payment-receipt";
import { RouteMiniMap } from "@/components/customer/route-mini-map";
import { Button } from "@/components/ui/button";
import { deliveryStatusLabel, paymentStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { DeliveryQuote } from "@/services/delivery-service";
import type { AiAgentAction } from "@/types/ai-agent";
import type { OrderDto } from "@/types/domain";
import type { PublicMenuCategory } from "@/types";

type FulfillmentMode = "PICKUP" | "DELIVERY";

type RemoteRestaurant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  hotline: string | null;
  contactEmail: string | null;
  receiptFooter: string | null;
  receiptShowQr: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryRadiusKm: number;
  minOrderForDelivery: number;
  pickupEtaMinutes: number;
  deliveryEtaMinutes: number;
  onlinePaymentMode: "PAY_AFTER" | "QR_PREPAID";
  deliveryTrackingEnabled: boolean;
};

type CartLine = {
  itemId: string;
  quantity: number;
};

type CreatedRemoteOrder = {
  order: OrderDto;
  payment?: {
    method: "QR" | "CASH";
    amount: number;
    url?: string;
    bank?: string;
    account?: string;
    accountName?: string;
    transferContent?: string;
    message?: string;
  } | null;
  deliveryQuote?: DeliveryQuote | null;
};

function makeSessionId(restaurantId: string) {
  const key = `logivn-remote-session:${restaurantId}`;
  const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

function statusLabel(status: OrderDto["status"]) {
  const map: Record<OrderDto["status"], string> = {
    pending: "Đã gửi, chờ quán xác nhận",
    ordering: "Quán đang chuẩn bị",
    waiting_payment: "Chờ thanh toán",
    waiting_confirm: "Chờ quán xác nhận thanh toán",
    paid: "Đã thanh toán",
    completed: "Đã hoàn tất",
    cancelled: "Đã huỷ"
  };
  return map[status];
}

function orderStatusText(order: OrderDto) {
  if (order.paymentStatus === "paid" && order.status === "pending") {
    return "Đã thanh toán, chờ quán nhận đơn";
  }
  if (order.paymentStatus === "waiting_confirm") return "Đã báo chuyển khoản, chờ quán xác nhận";
  if (order.paymentStatus === "waiting_payment") return "Vui lòng chuyển khoản để quán nhận đơn";
  if (order.fulfillmentType === "DELIVERY" && order.deliveryStatus && order.deliveryStatus !== "none") {
    return `${statusLabel(order.status)} · ${deliveryStatusLabel(order.deliveryStatus)}`;
  }
  return statusLabel(order.status);
}

function remoteStepState(order: OrderDto, step: "created" | "paid" | "processing" | "delivery") {
  if (step === "created") return "done";
  if (step === "paid") {
    if (order.paymentStatus === "paid") return "done";
    if (order.paymentStatus === "waiting_confirm" || order.paymentStatus === "waiting_payment") return "active";
    return "pending";
  }
  if (step === "processing") {
    if (order.status === "completed" || order.status === "paid") return "done";
    if (order.status === "ordering" || order.status === "pending") return "active";
    return "pending";
  }
  if (order.fulfillmentType !== "DELIVERY") {
    return order.status === "completed" || order.status === "paid" ? "done" : "pending";
  }
  if (order.deliveryStatus === "delivered") return "done";
  if (order.deliveryStatus === "accepted" || order.deliveryStatus === "out_for_delivery") return "active";
  return "pending";
}

function trackerTone(state: "done" | "active" | "pending") {
  if (state === "done") return "border-[#15945B]/35 bg-[#EEF7F2] text-[#0F4D3A]";
  if (state === "active") return "border-[#F28C28]/35 bg-[#FFF7ED] text-[#C76312]";
  return "border-[rgba(169,197,161,0.35)] bg-white text-[var(--muted-foreground)]";
}

function formatTrackingMoment(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function ActiveOrderTracker({
  order,
  restaurant
}: {
  order: OrderDto;
  restaurant: RemoteRestaurant;
}) {
  const steps = [
    { key: "created", label: "Đã gửi", icon: ShoppingBag },
    { key: "paid", label: order.paymentMethod === "QR" ? "Thanh toán" : "Chờ thu tiền", icon: CreditCard },
    { key: "processing", label: "Quán xử lý", icon: PackageCheck },
    { key: "delivery", label: order.fulfillmentType === "DELIVERY" ? "Giao hàng" : "Nhận tại quán", icon: order.fulfillmentType === "DELIVERY" ? Truck : Store }
  ] as const;
  const trackingMoment = formatTrackingMoment(order.deliveryTrackingUpdatedAt ?? order.paidAt ?? order.updatedAt);

  return (
    <section className="rounded-2xl border border-[rgba(169,197,161,0.34)] bg-white/78 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">Đơn đang theo dõi</p>
          <h3 className="mt-1 text-lg font-black text-[var(--primary)]">#{order.id.slice(0, 8).toUpperCase()}</h3>
          <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">{orderStatusText(order)}</p>
        </div>
        <div className="rounded-full border border-[rgba(169,197,161,0.34)] bg-[#FFF7EB] px-3 py-1.5 text-xs font-black text-[var(--primary)]">
          {order.fulfillmentType === "DELIVERY" ? "Giao hàng" : "Đến lấy"}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {steps.map((step) => {
          const Icon = step.icon;
          const state = remoteStepState(order, step.key);
          return (
            <div key={step.key} className={`rounded-xl border px-3 py-3 ${trackerTone(state)}`}>
              <div className="flex items-center gap-2">
                <Icon size={15} />
                <span className="text-sm font-black">{step.label}</span>
              </div>
              <p className="mt-2 text-xs font-semibold">
                {state === "done" ? "Hoàn tất" : state === "active" ? "Đang diễn ra" : "Chưa tới bước này"}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        {order.fulfillmentType === "DELIVERY" && restaurant.deliveryTrackingEnabled ? (
          <RouteMiniMap
            compact
            origin={{
              lat: order.restaurant?.storeLat,
              lng: order.restaurant?.storeLng
            }}
            destination={{
              lat: order.deliveryLat,
              lng: order.deliveryLng
            }}
            route={order.deliveryRouteGeometry?.coordinates}
            distanceKm={order.deliveryDistanceKm}
            durationMinutes={order.deliveryRouteDurationMinutes ?? restaurant.deliveryEtaMinutes}
            status={order.deliveryStatus}
          />
        ) : (
          <div className="rounded-xl border border-[rgba(169,197,161,0.35)] bg-[#FFF7EB]/80 p-4 text-sm font-semibold text-[var(--muted-foreground)]">
            {order.fulfillmentType === "DELIVERY"
              ? "Quán đang giao hàng cho đơn của bạn. Bản đồ sẽ hiện rõ hơn khi quán bắt đầu cập nhật tuyến giao."
              : "Đơn của bạn sẽ được chuẩn bị tại quán. Chủ quán có thể xác nhận và cập nhật tiến độ ngay trên dashboard."}
          </div>
        )}

        <div className="rounded-xl border border-[rgba(169,197,161,0.35)] bg-[#FFF7EB]/80 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted-foreground)]">Tổng thanh toán</span>
            <strong className="metric-number text-[var(--accent)]">{formatVnd(order.total)}</strong>
          </div>
          <div className="mt-3 flex justify-between gap-3">
            <span className="text-[var(--muted-foreground)]">Tiền hàng</span>
            <strong>{formatVnd(order.subtotal ?? order.total - (order.deliveryFee ?? 0))}</strong>
          </div>
          {order.fulfillmentType === "DELIVERY" ? (
            <div className="mt-3 flex justify-between gap-3">
              <span className="text-[var(--muted-foreground)]">Phí giao</span>
              <strong>{formatVnd(order.deliveryFee ?? 0)}</strong>
            </div>
          ) : null}
          <div className="mt-3 flex justify-between gap-3">
            <span className="text-[var(--muted-foreground)]">Cập nhật gần nhất</span>
            <strong>{trackingMoment ?? "Vừa tạo đơn"}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function flattenItems(categories: PublicMenuCategory[]) {
  return categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryName: category.name })));
}

function isRemoteOrderClosed(order: OrderDto) {
  if (order.status === "cancelled" || order.status === "paid") return true;
  return order.status === "completed" && order.paymentStatus === "paid";
}

export function RemoteOrderClient({
  restaurant,
  categories
}: {
  restaurant: RemoteRestaurant;
  categories: PublicMenuCategory[];
}) {
  const allItems = useMemo(() => flattenItems(categories), [categories]);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? "all");
  const [mode, setMode] = useState<FulfillmentMode>(restaurant.deliveryEnabled ? "DELIVERY" : "PICKUP");
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLat, setDeliveryLat] = useState<number | undefined>();
  const [deliveryLng, setDeliveryLng] = useState<number | undefined>();
  const [customerNote, setCustomerNote] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  const [sessionId] = useState(() => (typeof window === "undefined" ? "" : makeSessionId(restaurant.id)));
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedRemoteOrder | null>(null);
  const [history, setHistory] = useState<CreatedRemoteOrder[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quoteTimerRef = useRef<number | null>(null);

  const visibleItems = useMemo(() => {
    if (activeCategory === "all") return allItems;
    return allItems.filter((item) => item.categoryId === activeCategory);
  }, [activeCategory, allItems]);

  const cartLines = useMemo(() => {
    return Object.values(cart)
      .map((line) => {
        const item = allItems.find((menuItem) => menuItem.id === line.itemId);
        return item ? { ...line, item } : null;
      })
      .filter(Boolean) as Array<CartLine & { item: (typeof allItems)[number] }>;
  }, [allItems, cart]);

  const subtotal = cartLines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const deliveryFee = mode === "DELIVERY" ? quote?.fee ?? 0 : 0;
  const total = subtotal + deliveryFee;
  const requiresPrepaidQr = restaurant.onlinePaymentMode === "QR_PREPAID";

  const activeHistory = useMemo(() => history.filter((entry) => !isRemoteOrderClosed(entry.order)), [history]);
  const activeEntry = created ?? activeHistory[0] ?? null;
  const trackedOrder = activeEntry?.order ?? null;

  function updateQuantity(itemId: string, delta: number) {
    setCart((current) => {
      const currentLine = current[itemId];
      const nextQuantity = Math.max(0, (currentLine?.quantity ?? 0) + delta);
      const next = { ...current };
      if (nextQuantity === 0) {
        delete next[itemId];
      } else {
        next[itemId] = { itemId, quantity: nextQuantity };
      }
      return next;
    });
  }

  const loadQuote = useCallback(async () => {
    if (mode !== "DELIVERY" || subtotal <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setLoadingQuote(true);
    setQuoteError(null);
    try {
      const response = await fetch(`/api/restaurants/${restaurant.slug}/delivery-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtotal,
          deliveryAddress,
          deliveryLat,
          deliveryLng
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tính được phí giao hàng");
      setQuote(json.data as DeliveryQuote);
      if (!json.data.accepted) setQuoteError(json.data.reason ?? "Địa chỉ chưa nằm trong vùng nhận đơn.");
    } catch (err) {
      setQuote(null);
      setQuoteError(err instanceof Error ? err.message : "Không tính được phí giao hàng");
    } finally {
      setLoadingQuote(false);
    }
  }, [deliveryAddress, deliveryLat, deliveryLng, mode, restaurant.slug, subtotal]);

  const loadHistory = useCallback(async () => {
    if (!sessionId) return;

    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        restaurantSlug: restaurant.slug,
        customerSessionId: sessionId
      });
      const response = await fetch(`/api/remote-orders/history?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được lịch sử đơn online");
      setHistory(json.data.orders as CreatedRemoteOrder[]);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [restaurant.slug, sessionId]);

  useEffect(() => {
    if (quoteTimerRef.current) window.clearTimeout(quoteTimerRef.current);
    quoteTimerRef.current = window.setTimeout(() => void loadQuote(), 450);
    return () => {
      if (quoteTimerRef.current) window.clearTimeout(quoteTimerRef.current);
    };
  }, [loadQuote]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  function useCurrentLocation() {
    setQuoteError(null);
    if (!navigator.geolocation) {
      setQuoteError("Trình duyệt không hỗ trợ lấy vị trí.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDeliveryLat(position.coords.latitude);
        setDeliveryLng(position.coords.longitude);
      },
      () => setQuoteError("Không lấy được vị trí. Vui lòng cho phép quyền vị trí trên trình duyệt."),
      { enableHighAccuracy: true, timeout: 9000 }
    );
  }

  function handleCustomerAgentAction(action: AiAgentAction) {
    if (action.uiTarget === "add_item") {
      const item = action.body as { menuItemId?: string; categoryId?: string } | undefined;
      if (!item?.menuItemId) return;
      setCart((current) => {
        const currentLine = current[item.menuItemId!];
        return {
          ...current,
          [item.menuItemId!]: {
            itemId: item.menuItemId!,
            quantity: (currentLine?.quantity ?? 0) + 1
          }
        };
      });
      if (item.categoryId) setActiveCategory(item.categoryId);
      setCartOpen(true);
      return;
    }

    if (action.uiTarget === "menu_category") {
      const body = action.body as { categoryId?: string } | undefined;
      if (body?.categoryId) setActiveCategory(body.categoryId);
      setCartOpen(false);
      return;
    }

    if (action.uiTarget === "cart" || action.uiTarget === "orders" || action.uiTarget === "payment") {
      const body = action.body as { action?: string } | undefined;
      if (body?.action === "mark_paid") {
        void markRemotePaid();
        return;
      }
      setCartOpen(true);
      return;
    }

    if (action.uiTarget === "menu") {
      setCartOpen(false);
      return;
    }

    if (action.uiTarget === "delivery") {
      if (restaurant.deliveryEnabled) setMode("DELIVERY");
      setCartOpen(true);
      return;
    }

    if (action.uiTarget === "staff_call" && restaurant.hotline) {
      window.location.href = `tel:${restaurant.hotline}`;
    }
  }

  async function submitOrder() {
    setError(null);
    if (cartLines.length === 0) {
      setError("Vui lòng chọn ít nhất một món.");
      return;
    }
    if (mode === "DELIVERY" && (!quote || !quote.accepted)) {
      setError(quoteError ?? "Vui lòng tính phí giao hàng trước khi đặt.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/remote-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          fulfillmentType: mode,
          customerSessionId: sessionId,
          customerName,
          customerPhone,
          customerNote,
          promotionCode,
          deliveryAddress,
          deliveryLat,
          deliveryLng,
          idempotencyKey: `${sessionId}:${Date.now()}`,
          items: cartLines.map((line) => ({
            menuItemId: line.itemId,
            quantity: line.quantity
          }))
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không gửi được đơn");
      setCreated(json.data as CreatedRemoteOrder);
      setHistory((current) => {
        const next = json.data as CreatedRemoteOrder;
        return [next, ...current.filter((entry) => entry.order.id !== next.order.id)].slice(0, 20);
      });
      setCart({});
      setCartOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được đơn");
    } finally {
      setSubmitting(false);
    }
  }

  async function markRemotePaid() {
    const orderId = activeEntry?.order.id;
    if (!orderId) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/remote-orders/${orderId}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          customerSessionId: sessionId
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không cập nhật được thanh toán");
      const next = json.data as CreatedRemoteOrder;
      setCreated(next);
      setHistory((current) =>
        [next, ...current.filter((entry) => entry.order.id !== orderId)].slice(0, 20)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được thanh toán");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const orderId = trackedOrder?.id;
    if (!orderId) return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`customer-order:${orderId}`)
      .on("broadcast", { event: "order_status" }, (payload) => {
        const nextPayload = payload.payload as {
          status?: OrderDto["status"];
          payment_status?: OrderDto["paymentStatus"];
          payment_method?: OrderDto["paymentMethod"];
          paid_at?: string | null;
          delivery_status?: OrderDto["deliveryStatus"];
          delivery_distance_km?: number | null;
          delivery_fee?: number | null;
          delivery_route_duration_minutes?: number | null;
          delivery_tracking_updated_at?: string | null;
        };
        const nextStatus = nextPayload.status;
        if (!nextStatus) return;
        setCreated((current) =>
          current
            ? {
                ...current,
                order: {
                  ...current.order,
                  status: nextStatus,
                  paymentStatus: nextPayload.payment_status ?? current.order.paymentStatus,
                  paymentMethod: nextPayload.payment_method ?? current.order.paymentMethod,
                  paidAt: nextPayload.paid_at ?? current.order.paidAt,
                  deliveryStatus: nextPayload.delivery_status ?? current.order.deliveryStatus,
                  deliveryDistanceKm: nextPayload.delivery_distance_km ?? current.order.deliveryDistanceKm,
                  deliveryFee: nextPayload.delivery_fee ?? current.order.deliveryFee,
                  deliveryRouteDurationMinutes: nextPayload.delivery_route_duration_minutes ?? current.order.deliveryRouteDurationMinutes,
                  deliveryTrackingUpdatedAt: nextPayload.delivery_tracking_updated_at ?? current.order.deliveryTrackingUpdatedAt
                }
              }
            : current
        );
        setHistory((current) =>
          current.map((entry) =>
            entry.order.id === orderId
              ? {
                  ...entry,
                  order: {
                    ...entry.order,
                    status: nextStatus,
                    paymentStatus: nextPayload.payment_status ?? entry.order.paymentStatus,
                    paymentMethod: nextPayload.payment_method ?? entry.order.paymentMethod,
                    paidAt: nextPayload.paid_at ?? entry.order.paidAt,
                    deliveryStatus: nextPayload.delivery_status ?? entry.order.deliveryStatus,
                    deliveryDistanceKm: nextPayload.delivery_distance_km ?? entry.order.deliveryDistanceKm,
                    deliveryFee: nextPayload.delivery_fee ?? entry.order.deliveryFee,
                    deliveryRouteDurationMinutes: nextPayload.delivery_route_duration_minutes ?? entry.order.deliveryRouteDurationMinutes,
                    deliveryTrackingUpdatedAt: nextPayload.delivery_tracking_updated_at ?? entry.order.deliveryTrackingUpdatedAt
                  }
                }
              : entry
          )
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trackedOrder?.id]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <CustomerAiAssistant
        restaurantSlug={restaurant.slug}
        customerSessionId={sessionId}
        cart={cartLines.map((line) => ({ name: line.item.name, quantity: line.quantity, price: line.item.price }))}
        orderStatus={trackedOrder}
        onAgentAction={handleCustomerAgentAction}
      />
      <header className="sticky top-0 z-20 border-b border-[rgba(169,197,161,0.28)] bg-[#FFF7EB]/92 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">LogiVN Online</p>
            <h1 className="text-xl font-black text-[var(--primary)]">{restaurant.name}</h1>
          </div>
          <a href={`tel:${restaurant.hotline ?? ""}`} className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary)] text-white">
            <Phone size={18} />
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-4">
          <div className="rounded-2xl border border-[rgba(169,197,161,0.34)] bg-white/74 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-[var(--primary)]">Đặt món từ xa</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">
                  {restaurant.address ?? "Quán chưa cập nhật địa chỉ"}
                </p>
              </div>
              <div className="grid gap-2">
                <div className="inline-flex rounded-xl border border-[rgba(169,197,161,0.38)] bg-[#FFF7EB]/80 p-1">
                  {restaurant.deliveryEnabled && (
                    <button
                      type="button"
                      onClick={() => setMode("DELIVERY")}
                      className={`h-10 rounded-lg px-4 text-sm font-black ${mode === "DELIVERY" ? "bg-[var(--accent)] text-white" : "text-[var(--muted-foreground)]"}`}
                    >
                      Giao hàng
                    </button>
                  )}
                  {restaurant.pickupEnabled && (
                    <button
                      type="button"
                      onClick={() => setMode("PICKUP")}
                      className={`h-10 rounded-lg px-4 text-sm font-black ${mode === "PICKUP" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"}`}
                    >
                      Đến lấy
                    </button>
                  )}
                </div>
                <div className="inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(169,197,161,0.38)] bg-white px-3 py-1.5 text-xs font-black text-[var(--primary)]">
                  <CreditCard size={14} />
                  {requiresPrepaidQr ? "Chuyển khoản trước khi quán nhận đơn" : "Thanh toán sau khi nhận món"}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {restaurant.deliveryEnabled ? (
                <span className="inline-flex h-9 items-center rounded-full border border-[rgba(169,197,161,0.38)] bg-white px-3 text-xs font-black text-[var(--primary)]">
                  <Truck size={14} className="mr-2" />
                  Giao trong {restaurant.deliveryRadiusKm} km
                </span>
              ) : null}
              {restaurant.pickupEnabled ? (
                <span className="inline-flex h-9 items-center rounded-full border border-[rgba(169,197,161,0.38)] bg-white px-3 text-xs font-black text-[var(--primary)]">
                  <Store size={14} className="mr-2" />
                  Đến lấy sau {restaurant.pickupEtaMinutes} phút
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="inline-flex h-9 items-center rounded-full bg-[var(--accent)] px-3 text-xs font-black text-white lg:hidden"
              >
                <ShoppingBag size={14} className="mr-2" />
                Mở giỏ món
              </button>
            </div>
          </div>

          {trackedOrder ? <ActiveOrderTracker order={trackedOrder} restaurant={restaurant} /> : null}

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCategory("all")}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-black ${activeCategory === "all" ? "bg-[var(--primary)] text-white" : "border border-[rgba(169,197,161,0.38)] bg-white/72 text-[var(--primary)]"}`}
            >
              Tất cả
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-black ${activeCategory === category.id ? "bg-[var(--primary)] text-white" : "border border-[rgba(169,197,161,0.38)] bg-white/72 text-[var(--primary)]"}`}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {visibleItems.map((item) => {
              const quantity = cart[item.id]?.quantity ?? 0;
              return (
                <article key={item.id} className="rounded-2xl border border-[rgba(169,197,161,0.34)] bg-white/78 p-4 shadow-sm">
                  <div className="flex gap-3">
                    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#FFF7EB] text-[var(--primary)]">
                      {item.image ? (
                        <Image src={item.image} alt={item.name} width={80} height={80} className="h-full w-full object-cover" />
                      ) : (
                        <Store size={26} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-black">{item.name}</p>
                      <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{item.categoryName}</p>
                      <p className="metric-number mt-2 font-black text-[var(--accent)]">{formatVnd(item.price)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <button onClick={() => updateQuantity(item.id, -1)} disabled={!quantity} className="grid h-10 w-10 place-items-center rounded-xl border border-[rgba(169,197,161,0.36)] bg-white text-[var(--primary)] disabled:opacity-40">
                      <Minus size={16} />
                    </button>
                    <span className="metric-number text-lg font-black">{quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-white">
                      <Plus size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside
          className={`${
            cartOpen ? "fixed inset-0 z-40 overflow-y-auto bg-[rgba(15,77,58,0.26)] p-3 backdrop-blur-sm" : "hidden"
          } lg:sticky lg:top-20 lg:block lg:h-fit lg:overflow-visible lg:bg-transparent lg:p-0 lg:backdrop-blur-0`}
        >
          <section className="mx-auto max-w-md rounded-2xl border border-[rgba(169,197,161,0.36)] bg-white/95 p-5 shadow-sm lg:max-w-none lg:bg-white/86">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[var(--primary)]">Giỏ món</h2>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#FFF7EB] px-3 py-1 text-sm font-black text-[var(--accent)]">{cartLines.length} món</span>
                <button type="button" onClick={() => setCartOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-[rgba(169,197,161,0.34)] text-[var(--primary)] lg:hidden" aria-label="Đóng giỏ món">
                  <X size={17} />
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {cartLines.length === 0 && (
                <div className="rounded-xl border border-dashed border-[rgba(169,197,161,0.45)] p-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
                  Chọn món để bắt đầu đặt.
                </div>
              )}
              {cartLines.map((line) => (
                <div key={line.itemId} className="flex items-center justify-between gap-3 rounded-xl bg-[#FFF7EB]/80 px-3 py-2 text-sm">
                  <div>
                    <p className="font-black">{line.item.name}</p>
                    <p className="metric-number text-xs font-semibold text-[var(--muted-foreground)]">{line.quantity} x {formatVnd(line.item.price)}</p>
                  </div>
                  <button onClick={() => updateQuantity(line.itemId, -line.quantity)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted-foreground)]">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3">
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Tên của bạn" className="h-11 rounded-xl border border-[rgba(169,197,161,0.45)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]" />
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Số điện thoại" className="h-11 rounded-xl border border-[rgba(169,197,161,0.45)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]" />
              {mode === "DELIVERY" && (
                <>
                  <textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Địa chỉ giao hàng" className="min-h-20 rounded-xl border border-[rgba(169,197,161,0.45)] bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--primary)]" />
                  <button type="button" onClick={useCurrentLocation} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(169,197,161,0.42)] bg-white text-sm font-black text-[var(--primary)]">
                    <LocateFixed size={17} />
                    Dùng vị trí hiện tại để tính ship
                  </button>
                  <div className="rounded-xl bg-[#FFF7EB]/80 p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                    {loadingQuote ? (
                      "Đang tính phí giao hàng..."
                    ) : quote?.accepted ? (
                      <span className="text-[var(--primary)]">Nhận giao trong {quote.distanceKm} km · Phí ship {formatVnd(quote.fee)} · ETA {quote.etaMinutes} phút</span>
                    ) : (
                      quoteError ?? `Quán nhận giao trong bán kính ${restaurant.deliveryRadiusKm} km.`
                    )}
                  </div>
                  {quote?.accepted && restaurant.deliveryTrackingEnabled && (
                    <RouteMiniMap
                      compact
                      origin={quote.origin ?? { lat: null, lng: null }}
                      destination={quote.destination ?? { lat: deliveryLat, lng: deliveryLng }}
                      route={quote.routeGeometry?.coordinates}
                      distanceKm={quote.distanceKm}
                      durationMinutes={quote.routeDurationMinutes ?? quote.etaMinutes}
                      status="requested"
                    />
                  )}
                </>
              )}
              <div className="relative">
                <Tag className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={16} />
                <input value={promotionCode} onChange={(event) => setPromotionCode(event.target.value.toUpperCase())} placeholder="Mã khuyến mãi nếu có" className="h-11 w-full rounded-xl border border-[rgba(169,197,161,0.45)] bg-white pl-10 pr-3 text-sm font-semibold uppercase outline-none focus:border-[var(--primary)]" />
              </div>
              <textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Ghi chú cho quán" className="min-h-20 rounded-xl border border-[rgba(169,197,161,0.45)] bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--primary)]" />
            </div>

            <div className="mt-5 grid gap-2 rounded-xl border border-[rgba(169,197,161,0.34)] bg-white/70 p-3 text-sm">
              <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Tạm tính</span><strong>{formatVnd(subtotal)}</strong></div>
              <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Phí giao hàng</span><strong>{formatVnd(deliveryFee)}</strong></div>
              <div className="flex justify-between border-t border-[rgba(169,197,161,0.28)] pt-2 text-base"><span className="font-black">Tổng cộng</span><strong className="metric-number text-[var(--accent)]">{formatVnd(total)}</strong></div>
            </div>

            {error && <p className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm font-bold text-[var(--accent-strong)]">{error}</p>}

            <Button onClick={submitOrder} disabled={submitting || cartLines.length === 0 || !customerName || !customerPhone} className="mt-5 w-full">
              <ShoppingBag size={17} />
              {submitting
                ? "Đang gửi đơn…"
                : requiresPrepaidQr
                  ? "Tạo đơn & nhận mã VietQR"
                  : mode === "DELIVERY"
                    ? "Đặt giao hàng"
                    : "Đặt món đến lấy"}
            </Button>

            {activeEntry && (
              <div className="mt-5 rounded-2xl border border-[rgba(169,197,161,0.42)] bg-[#FFF7EB]/90 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary)] text-white">
                    <CheckCircle2 size={20} />
                  </span>
                  <div>
                    <h3 className="font-black text-[var(--primary)]">Đơn đang theo dõi</h3>
                    <p className="mt-1 text-sm font-semibold text-[var(--muted-foreground)]">#{activeEntry.order.id.slice(0, 8).toUpperCase()} · {orderStatusText(activeEntry.order)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm font-bold text-[var(--muted-foreground)]">
                  <Clock3 size={16} />
                  Dự kiến {activeEntry.order.fulfillmentType === "DELIVERY" ? restaurant.deliveryEtaMinutes : restaurant.pickupEtaMinutes} phút
                </div>
                {activeEntry.payment?.method === "QR" && activeEntry.payment.url && activeEntry.order.paymentStatus !== "paid" && (
                  <div className="mt-4 rounded-2xl border border-[#F28C28]/35 bg-white p-3">
                    <div className="flex gap-3">
                      <Image src={activeEntry.payment.url} alt="Mã VietQR thanh toán" width={112} height={112} className="h-28 w-28 rounded-xl border border-[rgba(169,197,161,0.34)] bg-white p-1" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-black text-[var(--primary)]">Chuyển khoản VietQR</p>
                        <p className="metric-number mt-1 text-lg font-black text-[var(--accent)]">{formatVnd(activeEntry.payment.amount)}</p>
                        <p className="mt-1 break-words text-xs font-semibold text-[var(--muted-foreground)]">
                          {activeEntry.payment.bank} · {activeEntry.payment.account}
                        </p>
                        <p className="mt-1 break-words text-xs font-semibold text-[var(--muted-foreground)]">
                          Nội dung: {activeEntry.payment.transferContent}
                        </p>
                      </div>
                    </div>
                    <Button onClick={markRemotePaid} disabled={submitting || activeEntry.order.paymentStatus === "waiting_confirm"} className="customer-cta mt-3 h-11 w-full rounded-xl">
                      <CheckCircle2 size={17} />
                      {activeEntry.order.paymentStatus === "waiting_confirm" ? "Đang chờ quán xác nhận" : "Tôi đã chuyển khoản"}
                    </Button>
                  </div>
                )}
                {activeEntry.order.paymentStatus === "paid" && (
                  <div className="mt-4 rounded-xl border border-[rgba(169,197,161,0.4)] bg-white px-3 py-2 text-sm font-black text-[var(--primary)]">
                    {paymentStatusLabel(activeEntry.order.paymentStatus)}. Quán sẽ tiếp tục xử lý đơn của bạn và hóa đơn đã hiện ngay bên dưới.
                  </div>
                )}
                {activeEntry.order.fulfillmentType === "DELIVERY" && restaurant.deliveryTrackingEnabled && (
                  <div className="mt-4">
                    <RouteMiniMap
                      origin={{
                        lat: activeEntry.order.restaurant?.storeLat,
                        lng: activeEntry.order.restaurant?.storeLng
                      }}
                      destination={{
                        lat: activeEntry.order.deliveryLat,
                        lng: activeEntry.order.deliveryLng
                      }}
                      route={activeEntry.order.deliveryRouteGeometry?.coordinates}
                      distanceKm={activeEntry.order.deliveryDistanceKm}
                      durationMinutes={activeEntry.order.deliveryRouteDurationMinutes ?? restaurant.deliveryEtaMinutes}
                      status={activeEntry.order.deliveryStatus}
                      compact
                    />
                  </div>
                )}

                {activeEntry.order.paymentStatus === "paid" && (
                  <div className="mt-4">
                    <RemotePaymentReceipt
                      restaurant={{
                        name: restaurant.name,
                        logoUrl: restaurant.logoUrl,
                        address: restaurant.address,
                        hotline: restaurant.hotline,
                        contactEmail: restaurant.contactEmail,
                        receiptFooter: restaurant.receiptFooter,
                        receiptShowQr: restaurant.receiptShowQr
                      }}
                      order={activeEntry.order}
                      payment={activeEntry.payment}
                    />
                  </div>
                )}
              </div>
            )}

            {(historyLoading || history.length > 0) && (
              <div className="mt-5 rounded-2xl border border-[rgba(169,197,161,0.36)] bg-white/78 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History size={17} className="text-[var(--primary)]" />
                    <h3 className="font-black text-[var(--primary)]">Đơn gần đây</h3>
                  </div>
                  <button type="button" onClick={() => void loadHistory()} className="text-xs font-black text-[var(--accent)]">
                    Làm mới
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {historyLoading && history.length === 0 ? (
                    <p className="rounded-xl bg-[#FFF7EB]/80 px-3 py-3 text-sm font-semibold text-[var(--muted-foreground)]">Đang tải lịch sử đơn...</p>
                  ) : (
                    history.slice(0, 4).map((entry) => (
                      <div key={entry.order.id} className="rounded-xl border border-[rgba(169,197,161,0.32)] bg-[#FFF7EB]/60 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-black text-[var(--foreground)]">#{entry.order.id.slice(0, 6).toUpperCase()}</span>
                          <span className="metric-number font-black text-[var(--accent)]">{formatVnd(entry.order.total)}</span>
                        </div>
                        <p className="mt-1 font-semibold text-[var(--muted-foreground)]">{orderStatusText(entry.order)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-[rgba(169,197,161,0.36)] bg-white/78 p-4 text-sm">
              <h3 className="font-black text-[var(--primary)]">Hỗ trợ nhanh</h3>
              <div className="mt-3 grid gap-2">
                {restaurant.hotline ? (
                  <a href={`tel:${restaurant.hotline}`} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[rgba(169,197,161,0.34)] bg-[#FFF7EB]/80 px-3 font-semibold text-[var(--foreground)]">
                    <span className="flex items-center gap-2"><Phone size={16} className="text-[var(--primary)]" /> Gọi quán ngay</span>
                    <span className="text-[var(--muted-foreground)]">{restaurant.hotline}</span>
                  </a>
                ) : null}
                {restaurant.address ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-between rounded-xl border border-[rgba(169,197,161,0.34)] bg-[#FFF7EB]/80 px-3 font-semibold text-[var(--foreground)]"
                  >
                    <span className="flex items-center gap-2"><MapPinned size={16} className="text-[var(--primary)]" /> Xem đường đến quán</span>
                    <LocateFixed size={15} className="text-[var(--muted-foreground)]" />
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        </aside>
      </div>

      {!cartOpen && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-4 z-30 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-[var(--primary)] px-4 text-left text-white shadow-[0_14px_38px_rgba(15,77,58,0.28)] lg:hidden"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/14">
              <ShoppingBag size={18} />
            </span>
            <span>
              <span className="block text-sm font-black">
                {cartLines.length > 0 ? `${cartLines.length} món trong giỏ` : activeHistory.length > 0 ? `${activeHistory.length} đơn đang theo dõi` : "Mở giỏ món"}
              </span>
              <span className="metric-number block text-xs font-bold text-white/78">{cartLines.length > 0 ? formatVnd(total) : "Theo dõi và gửi đơn online"}</span>
            </span>
          </span>
          <ChevronUp size={18} />
        </button>
      )}
    </main>
  );
}
