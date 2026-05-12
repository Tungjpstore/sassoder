"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Banknote,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  CreditCard,
  Headphones,
  Home,
  MapPin,
  Menu,
  Minus,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Store,
  Trash2,
  Truck,
  WalletCards
} from "lucide-react";
import { CustomerDeliveryLocationPicker } from "@/components/location/customer-delivery-location-picker";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import { RouteMiniMap } from "@/components/customer/route-mini-map";
import { Button } from "@/components/ui/button";
import { useRemoteCart, useRemoteMenuBrowser } from "@/hooks/customer/use-customer-menu-browser";
import { deliveryStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import {
  buildRemoteCartFromOrderItems,
  updateRemoteCartQuantity,
  type RemoteCartLine
} from "@/lib/customer/cart-state";
import {
  remoteCheckoutReducer,
  validateRemoteCheckoutBasics,
  type RemoteCheckoutAction,
  type RemoteCheckoutScreen,
  type RemoteFulfillmentMode
} from "@/lib/customer/checkout-flow";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AiAgentAction } from "@/types/ai-agent";
import type { DeliveryQuote } from "@/services/delivery-service";
import type { OrderDto } from "@/types/domain";
import type { PublicMenuCategory, PublicMenuItem } from "@/types";

type FulfillmentMode = RemoteFulfillmentMode;
type RemoteScreen = RemoteCheckoutScreen;
type PaymentChoice = "vietqr" | "wallet" | "card" | "cash";

type RemoteRestaurant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  storeLat?: number | null;
  storeLng?: number | null;
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
  showStoreMarkerOnOrdering: boolean;
  showCustomerDistance: boolean;
  showDeliveryEta: boolean;
  serviceFeeEnabled: boolean;
  serviceFeePercent: number;
  serviceFeeMin: number;
  serviceFeeMax: number | null;
};

type MenuItemWithCategory = PublicMenuItem & {
  categoryName: string;
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

type CourierLiveLocation = {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  headingDegrees?: number | null;
  speedMps?: number | null;
  capturedAt?: string | null;
};

const categoryIcons = [Star, Coffee, Store, ShoppingBag, PackageCheck];
const stepLabels = ["Đặt món", "Đang chuẩn bị", "Đang giao", "Hoàn thành"];

function makeSessionId(restaurantId: string) {
  const key = `logivn-remote-session:${restaurantId}`;
  const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  if (existing) return existing;
  const next = globalThis.crypto.randomUUID();
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

function calculateClientServiceFee(restaurant: RemoteRestaurant, subtotal: number) {
  if (!restaurant.serviceFeeEnabled || restaurant.serviceFeePercent <= 0) return 0;
  const rawFee = Math.round((subtotal * restaurant.serviceFeePercent) / 100);
  const withMinimum = Math.max(rawFee, restaurant.serviceFeeMin);
  return restaurant.serviceFeeMax === null ? withMinimum : Math.min(withMinimum, restaurant.serviceFeeMax);
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

function flattenItems(categories: PublicMenuCategory[]) {
  return categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryName: category.name })));
}

function isRemoteOrderClosed(order: OrderDto) {
  if (order.status === "cancelled" || order.status === "paid") return true;
  return order.status === "completed" && order.paymentStatus === "paid";
}

function orderShortId(orderId: string) {
  return `#OD${orderId.replace(/-/g, "").slice(0, 9).toUpperCase()}`;
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function getOrderStepIndex(order?: OrderDto | null) {
  if (!order) return 0;
  if (order.status === "paid" || order.status === "completed" || order.deliveryStatus === "delivered") return 3;
  if (order.fulfillmentType === "DELIVERY" && order.deliveryStatus === "out_for_delivery") return 2;
  if (["pending", "ordering", "waiting_confirm"].includes(order.status)) return 1;
  return 0;
}

function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#fffdf7_0,#f8f2e7_44%,#eee7da_100%)] text-[#121813]">
      <section className={`mx-auto min-h-dvh w-full max-w-none bg-[#fffefa] shadow-[0_22px_70px_rgba(24,36,28,0.12)] sm:my-6 sm:min-h-[860px] sm:max-w-[430px] sm:overflow-hidden sm:rounded-[34px] ${className}`}>
        {children}
      </section>
    </main>
  );
}

function StatusBar() {
  return (
    <div className="flex h-11 items-center justify-between px-5 text-[13px] font-black text-[#0f1712]">
      <span>9:41</span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-2.5 w-3.5 rounded-[3px] border-2 border-[#0f1712]" />
        <span className="h-2.5 w-3.5 rounded-[3px] bg-[#0f1712]" />
        <span className="h-2.5 w-5 rounded-[4px] border-2 border-[#0f1712] after:ml-[18px] after:block after:h-1.5 after:w-0.5 after:rounded-r after:bg-[#0f1712]" />
      </span>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  className = ""
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#e8eadf] bg-white text-[#102017] shadow-[0_8px_20px_rgba(16,32,23,0.05)] ${className}`}
    >
      {children}
    </button>
  );
}

function ScreenHeader({
  title,
  onBack,
  right
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <>
      <StatusBar />
      <header className="flex min-h-14 items-center gap-3 px-5">
        <IconButton label="Quay lại" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="min-w-0 flex-1 text-center text-[16px] font-black text-[#111713]">{title}</h1>
        <div className="flex h-11 w-11 items-center justify-end">{right}</div>
      </header>
    </>
  );
}

function BrandMark({ restaurant }: { restaurant: RemoteRestaurant }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#0f6b43] text-white shadow-[0_12px_26px_rgba(0,107,67,0.22)]">
        {restaurant.logoUrl ? (
          <Image src={restaurant.logoUrl} alt={restaurant.name} fill sizes="40px" className="object-cover" />
        ) : (
          <Coffee size={20} />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-black text-[#101712]">{restaurant.name}</p>
      </div>
    </div>
  );
}

function ProductThumb({ item, className = "" }: { item: MenuItemWithCategory; className?: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-2xl bg-[#f4efe6] ${className}`}>
      {item.image ? (
        <Image src={item.image} alt={item.name} fill sizes="160px" className="object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_35%_25%,#f7c06f,#f5efe2_46%,#e7ecdf)] text-[#0f6b43]">
          <Coffee size={24} />
        </div>
      )}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  className = ""
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-14 w-full rounded-2xl bg-[#006b3c] text-[15px] font-black text-white shadow-[0_16px_34px_rgba(0,107,60,0.26)] hover:bg-[#005f35] disabled:opacity-55 ${className}`}
    >
      {children}
    </Button>
  );
}

function PriceRow({
  label,
  value,
  strong = false,
  hint
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "text-[18px] font-black text-[#111713]" : "text-[13px] font-semibold text-[#536158]"}`}>
      <span className="inline-flex items-center gap-1.5">
        {label}
        {hint}
      </span>
      <span className={strong ? "font-black text-[#111713]" : "font-black text-[#111713]"}>{value}</span>
    </div>
  );
}

function QuantityStepper({
  value,
  onMinus,
  onPlus
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="inline-flex min-h-11 items-center overflow-hidden rounded-xl border border-[#e5e8dd] bg-white">
      <button type="button" onClick={onMinus} className="grid h-11 w-11 place-items-center text-[#667269]">
        <Minus size={14} />
      </button>
      <span className="min-w-8 text-center text-[14px] font-black text-[#101712]">{value}</span>
      <button type="button" onClick={onPlus} className="grid h-11 w-11 place-items-center text-[#0f6b43]">
        <Plus size={14} />
      </button>
    </div>
  );
}

function OrderProgress({ order }: { order?: OrderDto | null }) {
  const activeIndex = getOrderStepIndex(order);
  return (
    <div className="grid grid-cols-4 gap-0">
      {stepLabels.map((label, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <div key={label} className="relative flex flex-col items-center gap-2">
            {index > 0 ? <span className={`absolute right-1/2 top-4 h-0.5 w-full ${index <= activeIndex ? "bg-[#006b3c]" : "bg-[#e2e6dc]"}`} /> : null}
            <span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-[12px] font-black ${done || active ? "border-[#006b3c] bg-[#006b3c] text-white" : "border-[#e2e6dc] bg-white text-[#a0a99f]"}`}>
              {done ? <Check size={15} /> : index + 1}
            </span>
            <span className={`max-w-[70px] text-center text-[10px] font-black leading-3 ${done || active ? "text-[#006b3c]" : "text-[#929d94]"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PaymentMethodCard({
  icon,
  title,
  subtitle,
  selected,
  disabled,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border bg-white px-3 text-left transition ${selected ? "border-[#0f7b4b] shadow-[0_10px_26px_rgba(0,107,60,0.08)]" : "border-[#e7eadf]"} ${disabled ? "opacity-55" : "hover:border-[#0f7b4b]"}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#edf0e7] bg-[#fbfaf5] text-[#006b3c]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-black text-[#121813]">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-[#758076]">{subtitle}</span>
      </span>
      <span className={`grid h-6 w-6 place-items-center rounded-full border ${selected ? "border-[#006b3c] bg-[#006b3c] text-white" : "border-[#d8ddd2] text-transparent"}`}>
        <Check size={14} />
      </span>
    </button>
  );
}

function SoftCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-[#ebe9dd] bg-white p-4 shadow-[0_12px_34px_rgba(23,34,27,0.04)] ${className}`}>{children}</section>;
}

function BottomAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-[var(--z-customer-sticky)] mt-auto border-t border-[#f0eee4] bg-[#fffefa]/94 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {children}
    </div>
  );
}

function FloatingRemoteActions({
  cartCount,
  cartTotal,
  notice,
  onCart,
  onSupport
}: {
  cartCount: number;
  cartTotal: number;
  notice?: string | null;
  onCart: () => void;
  onSupport: () => void;
}) {
  return (
    <div
      className="customer-floating-actions customer-floating-actions--remote pointer-events-none fixed z-[var(--z-customer-cart)] flex max-w-[280px] flex-col items-end gap-2"
    >
      {notice ? (
        <div role="status" className="rounded-2xl border border-[#dce9df] bg-white/96 px-3 py-2 text-right text-[12px] font-black text-[#0f6b43] shadow-[0_12px_28px_rgba(16,32,23,0.12)] backdrop-blur">
          {notice}
        </div>
      ) : null}
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {cartCount > 0 ? (
          <button
            type="button"
            onClick={onCart}
            className="flex min-h-11 items-center gap-2 rounded-full border border-[#dbe7df] bg-white px-3 text-[#0f6b43] shadow-[0_12px_26px_rgba(16,32,23,0.12)] transition active:scale-95"
            aria-label="Mở giỏ hàng"
          >
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-[#edf7ef]">
              <ShoppingBag size={16} />
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#f28c28] px-1 text-[10px] font-black text-white">
                {cartCount}
              </span>
            </span>
            <span className="text-left">
              <span className="block text-[11px] font-black">Giỏ hàng</span>
              <span className="block text-[10px] font-black text-[#6c776e]">{formatVnd(cartTotal)}</span>
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSupport}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f6b43] px-3 text-[11px] font-black text-white shadow-[0_12px_24px_rgba(0,107,60,0.2)] transition active:scale-95"
        >
          <Headphones size={15} />
          Hỗ trợ
        </button>
      </div>
    </div>
  );
}

export function RemoteOrderClient({
  restaurant,
  categories
}: {
  restaurant: RemoteRestaurant;
  categories: PublicMenuCategory[];
}) {
  const allItems = useMemo(() => flattenItems(categories), [categories]);
  const [screen, setScreen] = useState<RemoteScreen>("menu");
  const { activeCategory, searchQuery, setActiveCategory, setSearchQuery, visibleItems } = useRemoteMenuBrowser(allItems);
  const [mode, setMode] = useState<FulfillmentMode>(restaurant.deliveryEnabled ? "DELIVERY" : "PICKUP");
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>(restaurant.onlinePaymentMode === "QR_PREPAID" ? "vietqr" : "cash");
  const { cart, cartLines, setCart } = useRemoteCart(allItems);
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
  const [courierLocations, setCourierLocations] = useState<Record<string, CourierLiveLocation>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerToast, setCustomerToast] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(10 * 60);
  const quoteTimerRef = useRef<number | null>(null);
  const quoteRequestSequenceRef = useRef(0);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const pendingCreateRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const actionInFlightRef = useRef<"submit" | "mark_paid" | null>(null);
  const customerToastTimerRef = useRef<number | null>(null);

  const cartItemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cartLines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const deliveryFee = mode === "DELIVERY" ? quote?.fee ?? 0 : 0;
  const serviceFee = mode === "DELIVERY" ? quote?.serviceFee ?? calculateClientServiceFee(restaurant, subtotal) : calculateClientServiceFee(restaurant, subtotal);
  const total = subtotal + deliveryFee + serviceFee;
  const requiresPrepaidQr = restaurant.onlinePaymentMode === "QR_PREPAID";
  const activeHistory = useMemo(() => history.filter((entry) => !isRemoteOrderClosed(entry.order)), [history]);
  const activeEntry = created ?? activeHistory[0] ?? null;
  const trackedOrder = activeEntry?.order ?? null;
  const featuredItems = allItems.slice(0, 3);
  const loyaltyPoints = Math.max(1, Math.floor(subtotal / 12000));
  const etaMinutes = mode === "DELIVERY" ? quote?.etaMinutes ?? restaurant.deliveryEtaMinutes : restaurant.pickupEtaMinutes;
  const canReorder = Boolean(trackedOrder?.items?.some((item) => item.menuItem?.id));
  const restaurantPoint = useMemo(() => {
    if (typeof restaurant.storeLat !== "number" || typeof restaurant.storeLng !== "number") return null;
    if (!Number.isFinite(restaurant.storeLat) || !Number.isFinite(restaurant.storeLng)) return null;
    return { lat: restaurant.storeLat, lng: restaurant.storeLng };
  }, [restaurant.storeLat, restaurant.storeLng]);

  function notifyCustomer(message: string) {
    if (customerToastTimerRef.current) window.clearTimeout(customerToastTimerRef.current);
    setCustomerToast(message);
    customerToastTimerRef.current = window.setTimeout(() => {
      setCustomerToast(null);
      customerToastTimerRef.current = null;
    }, 2800);
  }

  const loadQuote = useCallback(async () => {
    if (mode !== "DELIVERY" || subtotal <= 0) {
      quoteRequestSequenceRef.current += 1;
      quoteAbortRef.current?.abort();
      quoteAbortRef.current = null;
      setQuote(null);
      setQuoteError(null);
      setLoadingQuote(false);
      return;
    }

    const requestSequence = quoteRequestSequenceRef.current + 1;
    quoteRequestSequenceRef.current = requestSequence;
    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;
    setLoadingQuote(true);
    setQuoteError(null);
    try {
      const response = await fetch(`/api/restaurants/${restaurant.slug}/delivery-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          subtotal,
          deliveryAddress: deliveryAddress.trim(),
          deliveryLat,
          deliveryLng
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tính được phí giao hàng");
      if (requestSequence !== quoteRequestSequenceRef.current) return;
      setQuote(json.data as DeliveryQuote);
      if (!json.data.accepted) setQuoteError(json.data.reason ?? "Địa chỉ chưa nằm trong vùng nhận đơn.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (requestSequence !== quoteRequestSequenceRef.current) return;
      setQuote(null);
      setQuoteError(err instanceof Error ? err.message : "Không tính được phí giao hàng");
    } finally {
      if (requestSequence !== quoteRequestSequenceRef.current) return;
      if (quoteAbortRef.current === controller) quoteAbortRef.current = null;
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
      const orders = json.data.orders as CreatedRemoteOrder[];
      setHistory(orders);
      setCreated((current) => {
        if (!current) return current;
        return orders.find((entry) => entry.order.id === current.order.id) ?? current;
      });
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
    return () => quoteAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (customerToastTimerRef.current) window.clearTimeout(customerToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    if (screen !== "vietqr") return;
    const timer = window.setInterval(() => {
      setQrSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, activeEntry?.order.id]);

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
          total?: number;
          paid_at?: string | null;
          updated_at?: string | null;
          delivery_status?: OrderDto["deliveryStatus"];
          delivery_distance_km?: number | null;
          delivery_fee?: number | null;
          service_fee?: number | null;
          delivery_route_duration_minutes?: number | null;
          delivery_tracking_updated_at?: string | null;
        };
        const nextStatus = nextPayload.status;
        if (!nextStatus) return;
        const patchOrder = (order: OrderDto): OrderDto => ({
          ...order,
          status: nextStatus,
          paymentStatus: nextPayload.payment_status ?? order.paymentStatus,
          paymentMethod: nextPayload.payment_method ?? order.paymentMethod,
          total: nextPayload.total ?? order.total,
          paidAt: nextPayload.paid_at ?? order.paidAt,
          updatedAt: nextPayload.updated_at ?? order.updatedAt,
          deliveryStatus: nextPayload.delivery_status ?? order.deliveryStatus,
          deliveryDistanceKm: nextPayload.delivery_distance_km ?? order.deliveryDistanceKm,
          deliveryFee: nextPayload.delivery_fee ?? order.deliveryFee,
          serviceFee: nextPayload.service_fee ?? order.serviceFee,
          deliveryRouteDurationMinutes: nextPayload.delivery_route_duration_minutes ?? order.deliveryRouteDurationMinutes,
          deliveryTrackingUpdatedAt: nextPayload.delivery_tracking_updated_at ?? order.deliveryTrackingUpdatedAt
        });

        setCreated((current) => (current && current.order.id === orderId ? { ...current, order: patchOrder(current.order) } : current));
        setHistory((current) => current.map((entry) => (entry.order.id === orderId ? { ...entry, order: patchOrder(entry.order) } : entry)));
      })
      .on("broadcast", { event: "delivery_tracking" }, (payload) => {
        const nextPayload = payload.payload as {
          order_id?: string;
          latitude?: number | null;
          longitude?: number | null;
          accuracy_meters?: number | null;
          heading_degrees?: number | null;
          speed_mps?: number | null;
          created_at?: string | null;
          delivery_status?: OrderDto["deliveryStatus"] | null;
        };
        if (nextPayload.order_id !== orderId) return;

        if (typeof nextPayload.latitude === "number" && typeof nextPayload.longitude === "number") {
          setCourierLocations((current) => ({
            ...current,
            [orderId]: {
              lat: nextPayload.latitude!,
              lng: nextPayload.longitude!,
              accuracyMeters: nextPayload.accuracy_meters ?? null,
              headingDegrees: nextPayload.heading_degrees ?? null,
              speedMps: nextPayload.speed_mps ?? null,
              capturedAt: nextPayload.created_at ?? null
            }
          }));
        }

        if (nextPayload.delivery_status) {
          const patchDelivery = (order: OrderDto): OrderDto => ({
            ...order,
            deliveryStatus: nextPayload.delivery_status ?? order.deliveryStatus,
            deliveryTrackingUpdatedAt: nextPayload.created_at ?? order.deliveryTrackingUpdatedAt
          });
          setCreated((current) => (current && current.order.id === orderId ? { ...current, order: patchDelivery(current.order) } : current));
          setHistory((current) => current.map((entry) => (entry.order.id === orderId ? { ...entry, order: patchDelivery(entry.order) } : entry)));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trackedOrder?.id]);

  function updateQuantity(itemId: string, delta: number) {
    setCart((current) => updateRemoteCartQuantity(current, itemId, delta));
  }

  function applyCheckoutTransition(action: RemoteCheckoutAction) {
    const next = remoteCheckoutReducer({ screen, error: null }, action);
    setError(next.error);
    setScreen(next.screen);
    return next;
  }

  function validateCartBasics() {
    const validation = validateRemoteCheckoutBasics({
      cartLineCount: cartLines.length,
      customerName,
      customerPhone
    });
    setError(validation.ok ? null : validation.error);
    return validation.ok;
  }

  function continueFromCart() {
    if (!validateCartBasics()) return;
    applyCheckoutTransition({ type: "CONTINUE_FROM_CART", mode });
  }

  function continueFromDelivery() {
    applyCheckoutTransition({
      type: "CONTINUE_FROM_DELIVERY",
      mode,
      quoteAccepted: quote?.accepted === true,
      quoteError
    });
  }

  function reorderLastOrder() {
    if (!trackedOrder?.items) return;
    const nextCart = buildRemoteCartFromOrderItems(trackedOrder.items);
    if (Object.keys(nextCart).length === 0) return;
    setCart(nextCart);
    setCreated(null);
    setScreen("cart");
  }

  async function submitOrder() {
    if (submitting || actionInFlightRef.current) return;
    setError(null);
    if (!validateCartBasics()) {
      setScreen("cart");
      return;
    }
    const quoteGate = remoteCheckoutReducer(
      { screen, error: null },
      {
        type: "REQUIRE_DELIVERY_QUOTE",
        mode,
        quoteAccepted: quote?.accepted === true,
        quoteError
      }
    );
    if (quoteGate.error) {
      setError(quoteGate.error);
      setScreen(quoteGate.screen);
      return;
    }

    const orderFingerprint = JSON.stringify({
      mode,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: mode === "DELIVERY" ? deliveryAddress.trim() : "",
      deliveryLat: mode === "DELIVERY" ? deliveryLat ?? null : null,
      deliveryLng: mode === "DELIVERY" ? deliveryLng ?? null : null,
      customerNote: customerNote.trim(),
      promotionCode: promotionCode.trim().toUpperCase(),
      items: cartLines.map((line) => ({
        id: line.itemId,
        quantity: line.quantity
      }))
    });
    const existingPending = pendingCreateRequestRef.current;
    const idempotencyKey =
      existingPending?.fingerprint === orderFingerprint ? existingPending.idempotencyKey : globalThis.crypto.randomUUID();
    pendingCreateRequestRef.current = { fingerprint: orderFingerprint, idempotencyKey };
    actionInFlightRef.current = "submit";
    setSubmitting(true);
    try {
      const response = await fetch("/api/remote-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          fulfillmentType: mode,
          customerSessionId: sessionId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerNote: customerNote.trim(),
          promotionCode: promotionCode.trim().toUpperCase(),
          deliveryAddress: deliveryAddress.trim(),
          deliveryLat,
          deliveryLng,
          idempotencyKey,
          items: cartLines.map((line) => ({
            menuItemId: line.itemId,
            quantity: line.quantity
          }))
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không gửi được đơn");
      const next = json.data as CreatedRemoteOrder;
      setCreated(next);
      setHistory((current) => [next, ...current.filter((entry) => entry.order.id !== next.order.id)].slice(0, 20));
      pendingCreateRequestRef.current = null;
      setCart({});
      const nextCheckout = remoteCheckoutReducer(
        { screen, error: null },
        {
          type: "ORDER_SUBMITTED",
          paymentMethod: next.payment?.method,
          requiresPrepaidQr
        }
      );
      if (nextCheckout.screen === "vietqr") {
        setQrSecondsLeft(10 * 60);
      }
      setScreen(nextCheckout.screen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được đơn");
    } finally {
      actionInFlightRef.current = null;
      setSubmitting(false);
    }
  }

  async function markRemotePaid() {
    const orderId = activeEntry?.order.id;
    if (!orderId || submitting || actionInFlightRef.current) return;

    actionInFlightRef.current = "mark_paid";
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
      setHistory((current) => [next, ...current.filter((entry) => entry.order.id !== orderId)].slice(0, 20));
      setScreen("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được thanh toán");
    } finally {
      actionInFlightRef.current = null;
      setSubmitting(false);
    }
  }

  function handleCustomerAgentAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.href = action.href;
      return;
    }

    if (action.uiTarget === "add_item") {
      const body = action.body as { menuItemId?: string; categoryId?: string } | undefined;
      const item = allItems.find((menuItem) => menuItem.id === body?.menuItemId);
      if (!item) return;
      updateQuantity(item.id, 1);
      if (body?.categoryId) setActiveCategory(body.categoryId);
      notifyCustomer(`Đã thêm ${item.name} vào giỏ hàng.`);
      setScreen((current) => (current === "payment" || current === "vietqr" ? "menu" : current));
      setError(null);
      return;
    }

    if (action.uiTarget === "menu_category") {
      const body = action.body as { categoryId?: string } | undefined;
      if (body?.categoryId) setActiveCategory(body.categoryId);
      setScreen("menu");
      setError(null);
      return;
    }

    if (action.uiTarget === "menu") {
      setScreen("menu");
      setError(null);
      return;
    }

    if (action.uiTarget === "cart") {
      setScreen("cart");
      setError(null);
      return;
    }

    if (action.uiTarget === "orders") {
      void loadHistory().then(() => {
        if (trackedOrder) setScreen("tracking");
      });
      return;
    }

    if (action.uiTarget === "payment") {
      const body = action.body as { action?: string } | undefined;
      if (body?.action === "mark_paid") {
        void markRemotePaid();
        return;
      }
      if (activeEntry?.payment?.method === "QR") {
        setScreen("vietqr");
        return;
      }
      setScreen(activeEntry ? "tracking" : "payment");
      return;
    }

    if (action.uiTarget === "staff_call") {
      if (restaurant.hotline) {
        window.location.href = `tel:${restaurant.hotline}`;
        return;
      }
      notifyCustomer("Quán chưa có hotline hỗ trợ.");
      setError("Quán chưa cấu hình hotline. Bạn vui lòng ghi chú trong đơn để quán hỗ trợ.");
    }
  }

  function withLogibot(node: React.ReactNode) {
    const openSupport = () => {
      if (restaurant.hotline) {
        window.location.href = `tel:${restaurant.hotline}`;
        return;
      }
      notifyCustomer("Quán chưa có hotline hỗ trợ.");
      setError("Quán chưa cấu hình hotline. Bạn vui lòng ghi chú trong đơn để quán hỗ trợ.");
    };

    return (
      <>
        <CustomerAiAssistant
          restaurantSlug={restaurant.slug}
          customerSessionId={sessionId}
          cart={cartLines.map((line) => ({
            menuItemId: line.itemId,
            name: line.item.name,
            price: line.item.price,
            quantity: line.quantity
          }))}
          orderStatus={trackedOrder}
          onAgentAction={handleCustomerAgentAction}
        />
        {node}
        <FloatingRemoteActions
          cartCount={cartItemCount}
          cartTotal={total}
          notice={customerToast}
          onCart={() => setScreen("cart")}
          onSupport={openSupport}
        />
      </>
    );
  }

  function renderModeToggle() {
    return (
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f6f1e8] p-1">
        <button
          type="button"
          disabled={!restaurant.deliveryEnabled}
          onClick={() => restaurant.deliveryEnabled && setMode("DELIVERY")}
          className={`h-10 rounded-xl text-[13px] font-black ${mode === "DELIVERY" ? "bg-white text-[#006b3c] shadow-sm" : "text-[#6d766d] disabled:opacity-40"}`}
        >
          Giao hàng
        </button>
        <button
          type="button"
          disabled={!restaurant.pickupEnabled}
          onClick={() => restaurant.pickupEnabled && setMode("PICKUP")}
          className={`h-10 rounded-xl text-[13px] font-black ${mode === "PICKUP" ? "bg-white text-[#006b3c] shadow-sm" : "text-[#6d766d] disabled:opacity-40"}`}
        >
          Đến lấy
        </button>
      </div>
    );
  }

  function renderSummaryCard(showDetails = true) {
    return (
      <SoftCard className="grid gap-3">
        {showDetails ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-black text-[#121813]">{activeEntry ? `Đơn hàng ${orderShortId(activeEntry.order.id)}` : "Đơn hàng của bạn"}</h2>
              <p className="mt-1 text-[12px] font-semibold text-[#748076]">{cartLines.length || activeEntry?.order.items.length || 0} món</p>
            </div>
            <button type="button" onClick={() => setScreen("cart")} className="inline-flex items-center gap-1 text-[12px] font-black text-[#006b3c]">
              Xem chi tiết <ChevronRight size={14} />
            </button>
          </div>
        ) : null}
        <PriceRow label="Tạm tính" value={formatVnd(subtotal || activeEntry?.order.subtotal || 0)} />
        {serviceFee > 0 ? <PriceRow label={`Phí dịch vụ (${restaurant.serviceFeePercent || 0}%)`} value={formatVnd(serviceFee)} hint={<span className="grid h-4 w-4 place-items-center rounded-full border border-[#cdd5c8] text-[10px]">i</span>} /> : null}
        <PriceRow label="Phí giao hàng" value={formatVnd(deliveryFee || activeEntry?.order.deliveryFee || 0)} hint={<span className="grid h-4 w-4 place-items-center rounded-full border border-[#cdd5c8] text-[10px]">i</span>} />
        <div className="h-px bg-[#eef0e7]" />
        <PriceRow label="Tổng cộng" value={formatVnd(total || activeEntry?.order.total || 0)} strong />
      </SoftCard>
    );
  }

  function renderError() {
    return error ? <p className="rounded-2xl bg-[#fff3e3] px-4 py-3 text-[13px] font-bold text-[#be5d00]">{error}</p> : null;
  }

  function renderMenuScreen() {
    return (
      <PhoneFrame>
        <StatusBar />
        <div className="flex min-h-[calc(100dvh-44px)] flex-col">
          <header className="flex items-center justify-between gap-3 px-5 pb-3">
            <IconButton label="Mở menu">
              <Menu size={19} />
            </IconButton>
            <BrandMark restaurant={restaurant} />
            <button type="button" onClick={() => activeEntry && setScreen("tracking")} className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white text-[#0e2117] shadow-[0_8px_20px_rgba(16,32,23,0.05)]">
              <Bell size={18} />
              {activeEntry ? <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#ef3b2d] text-[10px] font-black text-white">1</span> : null}
            </button>
          </header>

          <div className="flex-1 space-y-5 px-5 pb-5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#59665f]">
              <MapPin size={14} className="text-[#f28c28]" />
              {quote?.distanceKm ? `Cách bạn ${quote.distanceKm} km` : `Giao trong ${restaurant.deliveryRadiusKm} km`}
              <span>·</span>
              <span>{etaMinutes} phút dự kiến</span>
            </div>

            <button type="button" className="group flex min-h-[68px] w-full items-center justify-between rounded-2xl bg-[linear-gradient(135deg,#007a46,#004b2c)] px-4 text-left text-white shadow-[0_18px_34px_rgba(0,107,60,0.24)]">
              <span className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
                  <Coffee size={20} />
                </span>
                <span>
                  <span className="block text-[13px] font-black">Ưu đãi hôm nay</span>
                  <span className="mt-1 block text-[12px] font-semibold text-white/82">Đặt online nhanh hơn tại {restaurant.name}</span>
                </span>
              </span>
              <ChevronRight size={18} className="transition group-hover:translate-x-0.5" />
            </button>

            <div className="grid grid-cols-[1fr_44px] gap-2">
              <label className="relative">
                <span className="sr-only">Tìm món trong menu</span>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa49a]" size={18} aria-hidden="true" />
                <input
                  name="menuSearch"
                  type="search"
                  aria-label="Tìm món trong menu"
                  autoComplete="off"
                  enterKeyHint="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Tìm món, vd: cà phê, trà sữa..."
                  className="h-12 w-full rounded-2xl border border-[#ebe9dd] bg-white pl-10 pr-3 text-[13px] font-semibold text-[#182219] outline-none focus:border-[#0f7b4b]"
                />
              </label>
              <IconButton label="Bộ lọc" onClick={() => setActiveCategory("all")} className="h-12 w-12">
                <SlidersHorizontal size={18} className="text-[#006b3c]" />
              </IconButton>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ id: "all", name: "Đề xuất" }, ...categories].slice(0, 7).map((category, index) => {
                const Icon = categoryIcons[index % categoryIcons.length];
                const selected = activeCategory === category.id;
                return (
                  <button key={category.id} type="button" onClick={() => setActiveCategory(category.id)} className="grid min-w-[64px] justify-items-center gap-2">
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl border ${selected ? "border-[#0f7b4b] bg-[#edf6ef] text-[#006b3c]" : "border-[#ecefe6] bg-white text-[#69756d]"}`}>
                      <Icon size={19} />
                    </span>
                    <span className={`max-w-[72px] truncate text-[11px] font-black ${selected ? "text-[#006b3c]" : "text-[#56625a]"}`}>{category.name}</span>
                  </button>
                );
              })}
            </div>

            {featuredItems.length > 0 ? (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[17px] font-black text-[#111713]">Đề xuất cho bạn</h2>
                  <button type="button" onClick={() => setActiveCategory("all")} className="text-[12px] font-black text-[#006b3c]">
                    Xem tất cả
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {featuredItems.map((item) => (
                    <article key={item.id} className="min-w-0">
                      <ProductThumb item={item} className="aspect-square w-full" />
                      <p className="mt-2 truncate text-[12px] font-black text-[#141b16]">{item.name}</p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-black text-[#141b16]">{formatVnd(item.price)}</span>
                        <button type="button" onClick={() => updateQuantity(item.id, 1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#006b3c] text-white">
                          <Plus size={13} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[17px] font-black text-[#111713]">{activeCategory === "all" ? "Cà phê" : categories.find((category) => category.id === activeCategory)?.name ?? "Menu"}</h2>
                <button type="button" onClick={() => setActiveCategory("all")} className="text-[12px] font-black text-[#006b3c]">
                  Xem tất cả
                </button>
              </div>
              <div className="space-y-3">
                {visibleItems.map((item) => (
                  <article key={item.id} className="flex items-center gap-3 rounded-3xl bg-white p-2.5 shadow-[0_10px_24px_rgba(23,34,27,0.04)]">
                    <ProductThumb item={item} className="h-[72px] w-[72px]" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[14px] font-black text-[#111713]">{item.name}</h3>
                      <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-[#7c867e]">{item.categoryName}</p>
                      <p className="mt-2 text-[13px] font-black text-[#111713]">{formatVnd(item.price)}</p>
                    </div>
                    <button type="button" onClick={() => updateQuantity(item.id, 1)} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f6f4ee] text-[#006b3c]">
                      <Plus size={18} />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>

          {(cartItemCount > 0 || activeEntry) ? (
            <BottomAction>
              <button
                type="button"
                onClick={() => setScreen(cartItemCount > 0 ? "cart" : "tracking")}
                className="flex h-14 w-full items-center justify-between rounded-2xl bg-[#006b3c] px-4 text-white shadow-[0_18px_34px_rgba(0,107,60,0.24)]"
              >
                <span className="flex items-center gap-3">
                  <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-white/12">
                    <ShoppingBag size={19} />
                    {cartItemCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#f28c28] text-[10px] font-black">{cartItemCount}</span> : null}
                  </span>
                  <span className="text-left">
                    <span className="block text-[14px] font-black">{cartItemCount > 0 ? "Xem giỏ hàng" : "Theo dõi đơn"}</span>
                    <span className="block text-[12px] font-bold text-white/78">{cartItemCount > 0 ? formatVnd(total) : orderStatusText(activeEntry!.order)}</span>
                  </span>
                </span>
                <ChevronRight size={18} />
              </button>
            </BottomAction>
          ) : null}
        </div>
      </PhoneFrame>
    );
  }

  function renderCartScreen() {
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader title="Giỏ hàng của bạn" onBack={() => setScreen("menu")} right={<button type="button" className="text-[12px] font-black text-[#006b3c]">Chỉnh sửa</button>} />
          <div className="flex-1 space-y-4 px-5 pb-5">
            <button type="button" className="flex min-h-[64px] w-full items-center justify-between rounded-2xl border border-[#f3e4ca] bg-[#fff8ed] px-4 text-left">
              <span className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ff9800] text-white">
                  <Star size={16} />
                </span>
                <span>
                  <span className="block text-[13px] font-black text-[#121813]">Bạn sẽ tích lũy {loyaltyPoints} điểm</span>
                  <span className="mt-1 block text-[12px] font-semibold text-[#6d756d]">100 điểm = 10.000đ</span>
                </span>
              </span>
              <ChevronRight size={17} />
            </button>

            {renderModeToggle()}

            <div className="space-y-3">
              {cartLines.length === 0 ? (
                <SoftCard>
                  <p className="text-center text-[13px] font-semibold text-[#68746b]">Giỏ hàng đang trống. Quay lại menu để chọn món nhé.</p>
                </SoftCard>
              ) : (
                cartLines.map((line) => (
                  <article key={line.itemId} className="flex items-center gap-3 rounded-3xl bg-white p-2.5 shadow-[0_10px_24px_rgba(23,34,27,0.04)]">
                    <ProductThumb item={line.item} className="h-[64px] w-[64px]" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[14px] font-black text-[#111713]">{line.item.name}</h3>
                      <p className="mt-2 text-[13px] font-black text-[#111713]">{formatVnd(line.item.price)}</p>
                    </div>
                    <div className="grid justify-items-end gap-2">
                      <QuantityStepper value={line.quantity} onMinus={() => updateQuantity(line.itemId, -1)} onPlus={() => updateQuantity(line.itemId, 1)} />
                      <button type="button" aria-label={`Xóa ${line.item.name} khỏi giỏ hàng`} onClick={() => updateQuantity(line.itemId, -line.quantity)} className="grid h-11 w-11 place-items-center rounded-xl text-[#6d766d]">
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <SoftCard className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                  Tên khách
                  <input name="customerName" autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Tên của bạn" className="h-11 rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                  Số điện thoại
                  <input name="customerPhone" type="tel" inputMode="tel" autoComplete="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="09xx xxx xxx" className="h-11 rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                </label>
              </div>
              <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                Ghi chú cho quán
                <div className="relative">
                  <textarea name="customerNote" autoComplete="off" value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Ví dụ: ít đá, không đường..." className="min-h-20 w-full rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 py-3 pr-10 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                  <Pencil className="absolute bottom-3 right-3 text-[#69766d]" size={16} aria-hidden="true" />
                </div>
              </label>
              <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                Mã ưu đãi
                <input name="promotionCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={promotionCode} onChange={(event) => setPromotionCode(event.target.value.toUpperCase())} placeholder="Nhập mã nếu có" className="h-11 rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[13px] font-black uppercase outline-none focus:border-[#0f7b4b]" />
              </label>
            </SoftCard>

            {renderSummaryCard(false)}
            {renderError()}
          </div>
          <BottomAction>
            <PrimaryButton onClick={continueFromCart} disabled={cartLines.length === 0}>
              Đặt hàng
            </PrimaryButton>
          </BottomAction>
        </div>
      </PhoneFrame>
    );
  }

  function renderDeliveryScreen() {
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader title="Thông tin giao hàng" onBack={() => setScreen("cart")} />
          <div className="flex-1 space-y-4 px-5 pb-5">
            <CustomerDeliveryLocationPicker
              address={deliveryAddress}
              latitude={deliveryLat}
              longitude={deliveryLng}
              restaurantPoint={restaurantPoint}
              route={quote?.routeGeometry?.coordinates ?? null}
              onAddressChange={setDeliveryAddress}
              onCoordinateChange={(point) => {
                setDeliveryLat(point.lat);
                setDeliveryLng(point.lng);
              }}
            />

            <SoftCard className="grid gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#e7eadf] bg-[#fbfaf5] text-[#006b3c]">
                  <MapPin size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-[#121813]">{deliveryAddress || "Chưa chọn địa chỉ giao"}</p>
                  <button type="button" className="mt-1 text-[12px] font-black text-[#006b3c]">Thay đổi</button>
                </div>
              </div>
            </SoftCard>

            <SoftCard className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-3 text-[14px] font-black text-[#121813]">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl border border-[#e7eadf] bg-[#fbfaf5] text-[#006b3c]">
                    <Clock3 size={18} />
                  </span>
                  Thời gian giao hàng
                </span>
                <ChevronRight size={18} className="text-[#6f7a70]" />
              </div>
              <p className="pl-[52px] text-[12px] font-semibold text-[#6f7a70]">Giao càng sớm càng tốt · dự kiến {etaMinutes} phút</p>
            </SoftCard>

            <div className="flex items-center justify-between px-1 text-[13px] font-semibold text-[#536158]">
              <span>Phí giao hàng</span>
              <span className="font-black text-[#111713]">{loadingQuote ? "Đang tính..." : formatVnd(deliveryFee)}</span>
            </div>

            <SoftCard>
              <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                Ghi chú cho tài xế
                <div className="relative">
                  <textarea name="deliveryNote" autoComplete="off" value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Ví dụ: Gọi trước khi đến..." className="min-h-20 w-full rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 py-3 pr-10 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                  <Pencil className="absolute bottom-3 right-3 text-[#69766d]" size={16} aria-hidden="true" />
                </div>
              </label>
            </SoftCard>

            {quote?.accepted ? (
              <p className="rounded-2xl bg-[#edf7ef] px-4 py-3 text-[13px] font-bold text-[#006b3c]">
                Địa chỉ nằm trong vùng giao. {quote.distanceKm ? `Khoảng cách ${quote.distanceKm} km.` : ""}
              </p>
            ) : null}
            {quoteError ? <p className="rounded-2xl bg-[#fff3e3] px-4 py-3 text-[13px] font-bold text-[#be5d00]">{quoteError}</p> : null}
            {renderError()}
          </div>
          <BottomAction>
            <PrimaryButton onClick={continueFromDelivery} disabled={mode === "DELIVERY" && (!quote?.accepted || loadingQuote)}>
              Xác nhận
            </PrimaryButton>
          </BottomAction>
        </div>
      </PhoneFrame>
    );
  }

  function renderPaymentScreen() {
    const qrAvailable = requiresPrepaidQr;
    const cashAvailable = !requiresPrepaidQr;
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader title="Thanh toán" onBack={() => setScreen(mode === "DELIVERY" ? "delivery" : "cart")} />
          <div className="flex-1 space-y-4 px-5 pb-5">
            {renderSummaryCard()}

            <section>
              <h2 className="mb-3 text-[15px] font-black text-[#121813]">Phương thức thanh toán</h2>
              <div className="space-y-3">
                <PaymentMethodCard
                  icon={<span className="text-[18px] font-black text-[#e11d1d]">V</span>}
                  title="VietQR"
                  subtitle={qrAvailable ? "Quét mã VietQR" : "Khả dụng khi quán bật trả trước"}
                  selected={paymentChoice === "vietqr"}
                  disabled={!qrAvailable}
                  onClick={() => setPaymentChoice("vietqr")}
                />
                <PaymentMethodCard
                  icon={<WalletCards size={18} />}
                  title="Ví điện tử"
                  subtitle="MoMo, ZaloPay, VNPay..."
                  disabled
                />
                <PaymentMethodCard
                  icon={<CreditCard size={18} />}
                  title="Thẻ ngân hàng"
                  subtitle="Visa, Mastercard, JCB..."
                  disabled
                />
                <PaymentMethodCard
                  icon={<Banknote size={18} />}
                  title="Tiền mặt"
                  subtitle="Thanh toán khi nhận hàng"
                  selected={paymentChoice === "cash"}
                  disabled={!cashAvailable}
                  onClick={() => setPaymentChoice("cash")}
                />
              </div>
            </section>

            {renderError()}
          </div>
          <BottomAction>
            <PrimaryButton onClick={submitOrder} disabled={submitting || cartLines.length === 0}>
              {submitting ? "Đang tạo đơn..." : requiresPrepaidQr ? `Thanh toán ${formatVnd(total)}` : `Đặt hàng ${formatVnd(total)}`}
            </PrimaryButton>
            <p className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-[#7c867e]">
              <ShieldCheck size={15} className="text-[#006b3c]" />
              Thông tin thanh toán được bảo mật tuyệt đối
            </p>
          </BottomAction>
        </div>
      </PhoneFrame>
    );
  }

  function renderVietQrScreen() {
    const payment = activeEntry?.payment;
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader title="Thanh toán qua VietQR" onBack={() => setScreen("payment")} />
          <div className="flex-1 space-y-5 px-5 pb-5 text-center">
            <div>
              <p className="text-[13px] font-black text-[#121813]">Quét mã để thanh toán</p>
              <p className="mt-4 text-[28px] font-black text-[#121813]">{formatVnd(payment?.amount ?? total)}</p>
            </div>
            <div className="mx-auto grid aspect-square w-[250px] place-items-center rounded-3xl border border-[#ecefe6] bg-white p-3 shadow-[0_18px_42px_rgba(23,34,27,0.06)]">
              {payment?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={payment.url} alt="Mã VietQR thanh toán" className="h-full w-full rounded-2xl object-contain" />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-2xl bg-[repeating-linear-gradient(45deg,#111_0_6px,#fff_6px_12px)]">
                  <span className="rounded-xl bg-white px-3 py-2 text-[12px] font-black text-[#006b3c]">VietQR</span>
                </div>
              )}
            </div>
            <div className="text-[12px] font-black text-[#006b3c]">
              <span>{payment?.bank ?? "Ngân hàng"}</span>
              <span className="mx-2 text-[#c4cabb]">·</span>
              <span>napas247</span>
            </div>
            <SoftCard className="text-center">
              <p className="text-[12px] font-semibold leading-5 text-[#6e7a70]">Đơn hàng sẽ được xác nhận ngay sau khi thanh toán thành công.</p>
            </SoftCard>
            <SoftCard className="text-center">
              <p className="text-[12px] font-semibold text-[#9aa49a]">Thời gian còn lại</p>
              <p className="mt-2 text-[24px] font-black text-[#f28c28]">{formatCountdown(qrSecondsLeft)}</p>
            </SoftCard>
            <section className="text-left">
              <h2 className="mb-4 text-[15px] font-black text-[#121813]">Hướng dẫn</h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Mở ứng dụng ngân hàng", WalletCards],
                  ["Quét mã VietQR", CreditCard],
                  ["Xác nhận thanh toán", CheckCircle2]
                ].map(([label, Icon], index) => {
                  const StepIcon = Icon as typeof WalletCards;
                  return (
                    <div key={String(label)} className="grid justify-items-center gap-2">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f7f4ed] text-[#111713]">
                        <StepIcon size={18} />
                      </span>
                      <span className="text-[10px] font-semibold leading-4 text-[#56625a]">{String(label)}</span>
                      {index < 2 ? <span className="hidden" /> : null}
                    </div>
                  );
                })}
              </div>
            </section>
            {payment?.transferContent ? (
              <p className="rounded-2xl bg-[#fbfaf5] px-4 py-3 text-[12px] font-semibold text-[#6f7a70]">Nội dung chuyển khoản: <span className="font-black text-[#111713]">{payment.transferContent}</span></p>
            ) : null}
            {renderError()}
          </div>
          <BottomAction>
            <PrimaryButton onClick={markRemotePaid} disabled={submitting || activeEntry?.order.paymentStatus === "waiting_confirm"}>
              {activeEntry?.order.paymentStatus === "waiting_confirm" ? "Đang chờ quán xác nhận" : submitting ? "Đang cập nhật..." : "Tôi đã thanh toán"}
            </PrimaryButton>
          </BottomAction>
        </div>
      </PhoneFrame>
    );
  }

  function renderSuccessScreen() {
    const order = activeEntry?.order;
    return (
      <PhoneFrame className="bg-[#006b3c]">
        <div className="flex min-h-dvh flex-col bg-[#006b3c] text-white">
          <StatusBar />
          <div className="flex-1 px-5 pb-5">
            <button type="button" onClick={() => setScreen("menu")} className="mt-1 grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white">
              <ArrowLeft size={20} />
            </button>
            <div className="mt-8 grid justify-items-center text-center">
              <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-[#006b3c] shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
                <Check size={52} strokeWidth={3} />
              </div>
              <h1 className="mt-7 text-[24px] font-black">Đặt hàng thành công!</h1>
              <p className="mt-4 max-w-[260px] text-[15px] font-semibold leading-6 text-white/84">
                Cảm ơn bạn đã đặt hàng tại <span className="font-black text-white">{restaurant.name}</span>
              </p>
            </div>
          </div>
          <div className="rounded-t-[32px] bg-[#fffefa] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6 text-[#121813]">
            <SoftCard className="text-center">
              <h2 className="text-[17px] font-black">{order ? `Đơn hàng ${orderShortId(order.id)}` : "Đơn hàng của bạn"}</h2>
              <p className="mt-2 text-[13px] font-semibold text-[#667269]">Thời gian dự kiến: {etaMinutes - 5 > 0 ? `${etaMinutes - 5} - ${etaMinutes}` : etaMinutes} phút</p>
              <div className="mt-6">
                <OrderProgress order={order} />
              </div>
            </SoftCard>
            <SoftCard className="mt-4 text-center">
              <p className="text-[13px] font-semibold leading-5 text-[#667269]">Bạn sẽ nhận thông báo khi đơn hàng đang được giao</p>
            </SoftCard>
            <button type="button" onClick={() => setScreen("tracking")} className="mt-4 h-14 w-full rounded-2xl bg-[#f8f6ef] text-[14px] font-black text-[#006b3c]">
              Xem chi tiết đơn hàng
            </button>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  function renderTrackingScreen() {
    const order = trackedOrder;
    if (!order) return renderMenuScreen();
    const courierLocation = courierLocations[order.id] ?? order.deliveryCourierLocation ?? null;
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader
            title="Theo dõi đơn hàng"
            onBack={() => setScreen("menu")}
            right={
              <button type="button" onClick={() => restaurant.hotline && (window.location.href = `tel:${restaurant.hotline}`)} className="grid h-11 w-11 place-items-center rounded-2xl text-[#102017]">
                <Headphones size={19} />
              </button>
            }
          />
          <div className="flex-1 space-y-4 px-5 pb-5">
            <SoftCard>
              <h2 className="text-[17px] font-black text-[#121813]">Đơn hàng {orderShortId(order.id)}</h2>
              <span className="mt-3 inline-flex rounded-lg bg-[#edf7ef] px-2.5 py-1 text-[11px] font-black text-[#006b3c]">{orderStatusText(order)}</span>
              <p className="mt-3 text-[12px] font-semibold text-[#6e7a70]">Thời gian dự kiến: {etaMinutes - 5 > 0 ? `${etaMinutes - 5} - ${etaMinutes}` : etaMinutes} phút</p>
              <div className="mt-5">
                <OrderProgress order={order} />
              </div>
            </SoftCard>

            {order.fulfillmentType === "DELIVERY" && restaurant.deliveryTrackingEnabled ? (
              <RouteMiniMap
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
                courierLocation={courierLocation}
                title="Tuyến giao đơn hàng"
                originLabel={restaurant.name}
                destinationLabel="Bạn"
                compact
              />
            ) : (
              <SoftCard>
                <h3 className="text-[15px] font-black text-[#121813]">Đang chuẩn bị món</h3>
                <p className="mt-2 text-[12px] font-semibold leading-5 text-[#6e7a70]">Quán đang chuẩn bị những món của bạn.</p>
                <div className="mt-4 h-40 rounded-3xl bg-[radial-gradient(circle_at_25%_30%,#f8d7a1,transparent_24%),radial-gradient(circle_at_76%_35%,#d7ead9,transparent_27%),linear-gradient(135deg,#f8f5ed,#ffffff)]" />
              </SoftCard>
            )}

            <section>
              <h2 className="mb-3 text-[15px] font-black text-[#121813]">Thông tin đơn hàng</h2>
              <SoftCard className="grid gap-3">
                {order.items.map((item, index) => {
                  const matched = item.menuItem?.id ? allItems.find((menuItem) => menuItem.id === item.menuItem?.id) : null;
                  return (
                    <div key={`${item.menuItem?.name ?? "item"}-${index}`} className="flex items-center gap-3">
                      {matched ? <ProductThumb item={matched} className="h-10 w-10 rounded-xl" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4efe6] text-[#006b3c]"><Coffee size={17} /></span>}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-black text-[#121813]">{item.menuItem?.name ?? "Món đã đặt"}</span>
                      <span className="text-[12px] font-black text-[#111713]">x{item.quantity}</span>
                      <span className="min-w-[72px] text-right text-[12px] font-black text-[#111713]">{formatVnd(item.price)}</span>
                    </div>
                  );
                })}
              </SoftCard>
            </section>
          </div>
          <BottomAction>
            <PrimaryButton onClick={() => setScreen(getOrderStepIndex(order) >= 3 ? "complete" : "menu")}>
              {getOrderStepIndex(order) >= 3 ? "Hoàn thành" : "Về trang chủ"}
            </PrimaryButton>
          </BottomAction>
        </div>
      </PhoneFrame>
    );
  }

  function renderCompleteScreen() {
    const order = trackedOrder;
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader
            title="Hoàn thành"
            onBack={() => setScreen("tracking")}
            right={
              <button type="button" onClick={() => restaurant.hotline && (window.location.href = `tel:${restaurant.hotline}`)} className="grid h-11 w-11 place-items-center rounded-2xl text-[#102017]">
                <Headphones size={19} />
              </button>
            }
          />
          <div className="flex-1 space-y-4 px-5 pb-5 text-center">
            <div className="mx-auto grid h-[210px] w-full place-items-center rounded-[32px] bg-[radial-gradient(circle_at_28%_32%,#e6f1e6_0_26%,transparent_27%),radial-gradient(circle_at_68%_32%,#fff1d8_0_23%,transparent_24%),linear-gradient(180deg,#fbfaf5,#ffffff)]">
              <div className="flex items-end justify-center gap-5">
                <span className="grid h-28 w-20 place-items-center rounded-t-full bg-[#006b3c] text-white">
                  <Truck size={32} />
                </span>
                <span className="grid h-24 w-20 place-items-center rounded-t-full bg-[#f7c474] text-[#006b3c]">
                  <ShoppingBag size={30} />
                </span>
              </div>
            </div>

            <SoftCard>
              <h2 className="text-[16px] font-black text-[#121813]">{order ? `Đơn hàng ${orderShortId(order.id)}` : "Đơn hàng của bạn"}</h2>
              <span className="mt-3 inline-flex rounded-lg bg-[#edf7ef] px-2.5 py-1 text-[11px] font-black text-[#006b3c]">Hoàn thành</span>
              <p className="mt-3 text-[13px] font-semibold leading-5 text-[#667269]">Cảm ơn bạn đã đặt hàng! Hẹn gặp lại bạn lần sau.</p>
            </SoftCard>

            <SoftCard>
              <p className="text-[13px] font-semibold text-[#667269]">Bạn đánh giá thế nào về đơn hàng?</p>
              <div className="mt-4 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setRating(star)} className="text-[#f59f00]">
                    <Star size={26} fill={star <= rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[13px] font-semibold text-[#667269]">{rating >= 5 ? "Tuyệt vời!" : "Cảm ơn đánh giá của bạn"}</p>
            </SoftCard>
          </div>
          <BottomAction>
            <button type="button" onClick={reorderLastOrder} disabled={!canReorder} className="mb-3 inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-[#dbe4d9] bg-white text-[14px] font-black text-[#006b3c] disabled:opacity-50">
              <RefreshCcw size={17} />
              Đặt lại đơn hàng
            </button>
            <PrimaryButton onClick={() => setScreen("menu")}>
              <Home size={18} />
              Về trang chủ
            </PrimaryButton>
          </BottomAction>
        </div>
      </PhoneFrame>
    );
  }

  if (screen === "cart") return withLogibot(renderCartScreen());
  if (screen === "delivery") return withLogibot(renderDeliveryScreen());
  if (screen === "payment") return withLogibot(renderPaymentScreen());
  if (screen === "vietqr") return withLogibot(renderVietQrScreen());
  if (screen === "success") return withLogibot(renderSuccessScreen());
  if (screen === "tracking") return withLogibot(renderTrackingScreen());
  if (screen === "complete") return withLogibot(renderCompleteScreen());
  return withLogibot(renderMenuScreen());
}
