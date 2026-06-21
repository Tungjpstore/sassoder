"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  AlertTriangle,
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
  WalletCards,
  X
} from "lucide-react";
import { CustomerDeliveryLocationPicker } from "@/components/location/customer-delivery-location-picker";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import {
  FlowImage,
  FlowVisualCard,
  orderFlowImageSources
} from "@/components/customer/order-flow-visuals";
import { RouteMiniMap } from "@/components/customer/route-mini-map";
import { Button } from "@/components/ui/button";
import { useRemoteCart, useRemoteMenuBrowser } from "@/hooks/customer/use-customer-menu-browser";
import { deliveryStatusLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import {
  addRemoteCartLine,
  buildRemoteCartFromOrderItems,
  setRemoteCartItemNote,
  updateRemoteCartQuantity,
  type RemoteCartLine
} from "@/lib/customer/cart-state";
import {
  defaultModifierSelectionsForGroups,
  resolveModifierOptionPricing,
  resolveModifierSelections,
  type CustomerModifierSelection,
  type PublicModifierGroup
} from "@/lib/customer/modifier-pricing";
import {
  buildDeliveryQuoteFingerprint,
  formatDeliveryQuoteUpdatedAt,
  remoteCheckoutReducer,
  resolveDeliveryQuoteCustomerInsight,
  resolveDeliveryQuoteCheckoutState,
  validateRemoteCheckoutBasics,
  type RemoteCheckoutAction,
  type RemoteCheckoutScreen,
  type RemoteFulfillmentMode
} from "@/lib/customer/checkout-flow";
import {
  getCustomerOrderLifecycle,
  getCustomerOrderTimeline,
  getOrderProgressLabels,
  type CustomerOrderTimelineItem,
  type CustomerOrderTimelineItemKey
} from "@/lib/customer/order-lifecycle";
import {
  getCustomerOrderPollingInterval,
  hasCustomerOrderSnapshotChanged
} from "@/lib/customer/order-sync";
import {
  clearPendingOrderIdempotency,
  pendingOrderIdempotencyStorageKey,
  resolvePendingOrderIdempotency
} from "@/lib/customer/pending-order-idempotency";
import {
  evaluatePublicPromotion,
  findPublicPromotionByCode,
  normalizePromotionCode,
  promotionEligibilityMessage,
  promotionDescription
} from "@/lib/customer/promotion-preview";
import {
  hasRemoteCustomerProfileValue,
  restoreRemoteCustomerProfileSnapshot,
  serializeRemoteCustomerProfile,
  type RemoteCustomerProfile
} from "@/lib/customer/remote-customer-profile";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AiAgentAction } from "@/types/ai-agent";
import type { DeliveryQuote } from "@/services/delivery-service";
import type { OrderDto } from "@/types/domain";
import type { PublicMenuCategory, PublicMenuItem, PublicPromotion, PublicStoreBranch } from "@/types";

type FulfillmentMode = RemoteFulfillmentMode;
type RemoteScreen = RemoteCheckoutScreen;
type PaymentChoice = "vietqr" | "wallet" | "card" | "cash";
type OrderNotificationPermission = NotificationPermission | "unsupported";

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
  branches: PublicStoreBranch[];
  promotions: PublicPromotion[];
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
function makeSessionId(restaurantId: string) {
  const key = `logivn-remote-session:${restaurantId}`;
  const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  if (existing) return existing;
  const next = globalThis.crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

function remoteCustomerProfileStorageKey(restaurantId: string) {
  return `logivn-remote-customer:${restaurantId}`;
}

function readStoredCustomerProfile(restaurantId: string): RemoteCustomerProfile {
  if (typeof window === "undefined") {
    return {
      customerName: "",
      customerPhone: "",
      deliveryAddress: ""
    };
  }

  return restoreRemoteCustomerProfileSnapshot(window.localStorage.getItem(remoteCustomerProfileStorageKey(restaurantId)));
}

function calculateClientServiceFee(restaurant: RemoteRestaurant, subtotal: number) {
  if (!restaurant.serviceFeeEnabled || restaurant.serviceFeePercent <= 0) return 0;
  const rawFee = Math.round((subtotal * restaurant.serviceFeePercent) / 100);
  const withMinimum = Math.max(rawFee, restaurant.serviceFeeMin);
  return restaurant.serviceFeeMax === null ? withMinimum : Math.min(withMinimum, restaurant.serviceFeeMax);
}

function orderStatusText(order: OrderDto) {
  const lifecycle = getCustomerOrderLifecycle(order);
  if (order.fulfillmentType === "DELIVERY" && order.deliveryStatus && order.deliveryStatus !== "none" && !lifecycle.isClosed) {
    return `${lifecycle.label} · ${deliveryStatusLabel(order.deliveryStatus)}`;
  }
  return lifecycle.label;
}

function flattenItems(categories: PublicMenuCategory[]) {
  return categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryName: category.name })));
}

function hasMenuModifiers(item: Pick<PublicMenuItem, "modifierGroups">) {
  return (item.modifierGroups?.some((group) => group.options.length > 0) ?? false);
}

function modifierMinSelect(group: PublicModifierGroup) {
  return typeof group.minSelect === "number" ? group.minSelect : group.required ? 1 : 0;
}

function modifierMaxSelect(group: PublicModifierGroup) {
  if (group.selectionType === "SINGLE") return 1;
  return group.maxSelect ?? Number.POSITIVE_INFINITY;
}

function shouldUseOptionQuantity(group: PublicModifierGroup) {
  return group.selectionType === "QUANTITY" || group.allowQuantity === true;
}

function modifierOptionPriceText(itemPrice: number, option: PublicModifierGroup["options"][number]) {
  const pricing = resolveModifierOptionPricing(option, { basePrice: itemPrice });
  if (pricing.pricingMode === "ABSOLUTE") {
    return pricing.priceValue ? `Giá ${formatVnd(pricing.priceValue)}` : "Theo giá món";
  }
  return pricing.priceDelta > 0 ? `+${formatVnd(pricing.priceDelta)}` : "Không thêm phí";
}

function modifierSummary(selections: ReturnType<typeof resolveModifierSelections>) {
  if (!selections.ok || selections.selections.length === 0) return "";
  return selections.selections
    .map((selection) => `${selection.optionName}${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`)
    .join(", ");
}

function isRemoteOrderClosed(order: OrderDto) {
  return getCustomerOrderLifecycle(order).isClosed;
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

function getInitialNotificationPermission(): OrderNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

function getInitialNetworkStatus() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function getInitialPageVisibility() {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

function getOrderStepIndex(order?: OrderDto | null) {
  if (!order) return 0;
  return getCustomerOrderLifecycle(order).stepIndex;
}

function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main className="stitch-customer customer-app-shell min-h-dvh text-[var(--customer-text)]">
      <section className={`customer-app-frame mx-auto min-h-dvh w-full max-w-none bg-[var(--customer-surface)] ${className}`}>
        {children}
      </section>
    </main>
  );
}

function StatusBar() {
  return <div className="h-[max(env(safe-area-inset-top),0.75rem)]" aria-hidden="true" />;
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
        <div className="flex h-11 min-w-11 items-center justify-end">{right}</div>
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
  const stepLabels = getOrderProgressLabels(order?.fulfillmentType);
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

function orderTimelineMarkerClass(item: CustomerOrderTimelineItem) {
  if (item.blocked) return "border-[#f2c5bc] bg-[#fff2ee] text-[#b94724]";
  if (item.done) return "border-[#006b3c] bg-[#006b3c] text-white";
  if (item.current) return "border-[#006b3c] bg-[#edf7ef] text-[#006b3c]";
  return "border-[#e0e5dc] bg-white text-[#96a099]";
}

function orderTimelineConnectorClass(item: CustomerOrderTimelineItem) {
  if (item.blocked) return "bg-[#f2c5bc]";
  if (item.done) return "bg-[#006b3c]";
  return "bg-[#e4e8df]";
}

function orderTimelineTitleClass(item: CustomerOrderTimelineItem) {
  if (item.blocked) return "text-[#a33a23]";
  if (item.done || item.current) return "text-[#121813]";
  return "text-[#858f86]";
}

function orderTimelineIcon(item: CustomerOrderTimelineItem, fulfillmentType?: OrderDto["fulfillmentType"] | null) {
  if (item.blocked) return <X size={15} />;
  if (item.done) return <Check size={15} />;
  if (item.key === "payment") return <WalletCards size={15} />;
  if (item.key === "payment_confirmation") return <ShieldCheck size={15} />;
  if (item.key === "restaurant_confirmation") return <Store size={15} />;
  if (item.key === "preparing") return <Coffee size={15} />;
  if (item.key === "handoff") return fulfillmentType === "DELIVERY" ? <Truck size={15} /> : <ShoppingBag size={15} />;
  return <PackageCheck size={15} />;
}

const timelineIllustrations: Record<CustomerOrderTimelineItemKey, Record<"DELIVERY" | "DINE_IN" | "PICKUP" | "default", string>> = {
  payment: {
    default: orderFlowImageSources.paymentVietqr,
    DELIVERY: orderFlowImageSources.paymentVietqr,
    DINE_IN: orderFlowImageSources.paymentVietqr,
    PICKUP: orderFlowImageSources.paymentVietqr
  },
  payment_confirmation: {
    default: orderFlowImageSources.paymentConfirmation,
    DELIVERY: orderFlowImageSources.paymentConfirmation,
    DINE_IN: orderFlowImageSources.paymentConfirmation,
    PICKUP: orderFlowImageSources.paymentConfirmation
  },
  restaurant_confirmation: {
    default: orderFlowImageSources.restaurantConfirmation,
    DELIVERY: orderFlowImageSources.restaurantConfirmation,
    DINE_IN: orderFlowImageSources.restaurantConfirmation,
    PICKUP: orderFlowImageSources.restaurantConfirmation
  },
  preparing: {
    default: orderFlowImageSources.preparing,
    DELIVERY: orderFlowImageSources.preparing,
    DINE_IN: orderFlowImageSources.preparing,
    PICKUP: orderFlowImageSources.preparing
  },
  handoff: {
    default: orderFlowImageSources.deliveryHandoff,
    DELIVERY: orderFlowImageSources.deliveryHandoff,
    DINE_IN: orderFlowImageSources.completed,
    PICKUP: orderFlowImageSources.pickupHandoff
  },
  completed: {
    default: orderFlowImageSources.completed,
    DELIVERY: orderFlowImageSources.completed,
    DINE_IN: orderFlowImageSources.completed,
    PICKUP: orderFlowImageSources.completed
  },
  closed: {
    default: orderFlowImageSources.cancelled,
    DELIVERY: orderFlowImageSources.cancelled,
    DINE_IN: orderFlowImageSources.cancelled,
    PICKUP: orderFlowImageSources.cancelled
  }
};

function timelineIllustrationSrc(item: CustomerOrderTimelineItem, fulfillmentType?: OrderDto["fulfillmentType"] | null) {
  const byType = timelineIllustrations[item.key];
  return byType[fulfillmentType ?? "default"] ?? byType.default;
}

function TimelineIllustration({
  item,
  fulfillmentType
}: {
  item: CustomerOrderTimelineItem;
  fulfillmentType?: OrderDto["fulfillmentType"] | null;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-[#ebe9dd] bg-[#fbfaf5] shadow-[0_10px_22px_rgba(23,34,27,0.06)] sm:h-16 sm:w-16">
      <Image
        src={timelineIllustrationSrc(item, fulfillmentType)}
        alt=""
        fill
        sizes="64px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function OrderTimeline({ order }: { order?: OrderDto | null }) {
  if (!order) return null;
  const timeline = getCustomerOrderTimeline(order);

  return (
    <div className="space-y-0 text-left">
      {timeline.map((item, index) => (
        <div key={item.key} className="relative flex gap-3 pb-4 last:pb-0">
          {index < timeline.length - 1 ? <span className={`absolute bottom-0 left-4 top-9 w-0.5 rounded-full ${orderTimelineConnectorClass(item)}`} /> : null}
          <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${orderTimelineMarkerClass(item)}`}>
            {orderTimelineIcon(item, order.fulfillmentType)}
          </span>
          <span className="flex min-w-0 flex-1 items-start gap-3 pt-0.5">
            <span className="min-w-0 flex-1">
              <span className={`block text-[13px] font-black leading-4 ${orderTimelineTitleClass(item)}`}>{item.label}</span>
              <span className={`mt-1 block text-[12px] font-semibold leading-5 ${item.blocked ? "text-[#a75a49]" : "text-[#6e7a70]"}`}>
                {item.description}
              </span>
            </span>
            <TimelineIllustration item={item} fulfillmentType={order.fulfillmentType} />
          </span>
        </div>
      ))}
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

function deliveryInsightToneClass(tone: "green" | "yellow" | "red" | "neutral") {
  if (tone === "green") return "border-[#cfe8d4] bg-[#f2fbf4] text-[#0a6b3e]";
  if (tone === "red") return "border-[#f0c7b7] bg-[#fff5ef] text-[#9a3412]";
  if (tone === "yellow") return "border-[#edd9a4] bg-[#fff9e8] text-[#805a00]";
  return "border-[#ebe9dd] bg-[#fbfaf5] text-[#536158]";
}

function trackingSnapshotToneClass(state?: string | null) {
  if (state === "stale") return "border-[#edd9a4] bg-[#fff9e8] text-[#805a00]";
  if (state === "arriving" || state === "moving" || state === "completed") return "border-[#cfe8d4] bg-[#f2fbf4] text-[#0a6b3e]";
  return "border-[#ebe9dd] bg-[#fbfaf5] text-[#536158]";
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
  const defaultPickupBranchId = useMemo(
    () => restaurant.branches.find((branch) => branch.isPrimary)?.id ?? restaurant.branches[0]?.id ?? "",
    [restaurant.branches]
  );
  const [selectedPickupBranchId, setSelectedPickupBranchId] = useState(defaultPickupBranchId);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>(restaurant.onlinePaymentMode === "QR_PREPAID" ? "vietqr" : "cash");
  const remoteCartStorageKey = useMemo(() => `logivn-remote-cart:${restaurant.id}`, [restaurant.id]);
  const customerProfileStorageKey = useMemo(() => remoteCustomerProfileStorageKey(restaurant.id), [restaurant.id]);
  const { cart, cartLines, setCart } = useRemoteCart(allItems, { storageKey: remoteCartStorageKey });
  const [customerProfile, setCustomerProfile] = useState<RemoteCustomerProfile>(() => readStoredCustomerProfile(restaurant.id));
  const [customerNote, setCustomerNote] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  const [sessionId] = useState(() => (typeof window === "undefined" ? "" : makeSessionId(restaurant.id)));
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteFingerprint, setQuoteFingerprint] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedRemoteOrder | null>(null);
  const [history, setHistory] = useState<CreatedRemoteOrder[]>([]);
  const [courierLocations, setCourierLocations] = useState<Record<string, CourierLiveLocation>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerToast, setCustomerToast] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<{ key: number; itemName: string } | null>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<{
    item: MenuItemWithCategory;
    selections: CustomerModifierSelection[];
    quantity: number;
    note: string;
  } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<OrderNotificationPermission>(() => getInitialNotificationPermission());
  const [networkOnline, setNetworkOnline] = useState(() => getInitialNetworkStatus());
  const [pageVisible, setPageVisible] = useState(() => getInitialPageVisibility());
  const [trackingPollError, setTrackingPollError] = useState(false);
  const [lastOrderSyncAt, setLastOrderSyncAt] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [rating, setRating] = useState(5);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(10 * 60);
  const quoteTimerRef = useRef<number | null>(null);
  const quoteRetryTimerRef = useRef<number | null>(null);
  const quoteRequestSequenceRef = useRef(0);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const loadQuoteRef = useRef<() => Promise<void>>(async () => undefined);
  const quoteRetryStateRef = useRef<{ fingerprint: string | null; attempts: number }>({ fingerprint: null, attempts: 0 });
  const pendingCreateRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const actionInFlightRef = useRef<"submit" | "mark_paid" | null>(null);
  const customerToastTimerRef = useRef<number | null>(null);
  const cartFeedbackTimerRef = useRef<number | null>(null);
  const trackedOrderRef = useRef<OrderDto | null>(null);
  const notifyOrderUpdateRef = useRef<(order: OrderDto) => void>(() => undefined);
  const pendingOrderStorageKey = useMemo(
    () => pendingOrderIdempotencyStorageKey("remote", restaurant.id),
    [restaurant.id]
  );

  const { customerName, customerPhone, deliveryAddress, deliveryLat, deliveryLng } = customerProfile;
  function resolveCartLineModifiers(line: RemoteCartLine & { item: MenuItemWithCategory }) {
    return resolveModifierSelections(line.item.modifierGroups ?? [], line.modifiers ?? [], { basePrice: line.item.price });
  }

  function cartLineUnitPrice(line: RemoteCartLine & { item: MenuItemWithCategory }) {
    const resolved = resolveCartLineModifiers(line);
    return line.item.price + (resolved.ok ? resolved.totalDelta : 0);
  }

  const cartItemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cartLines.reduce((sum, line) => sum + cartLineUnitPrice(line) * line.quantity, 0);
  const deliveryQuoteFingerprint = useMemo(
    () => buildDeliveryQuoteFingerprint({ subtotal, deliveryAddress, deliveryLat, deliveryLng }),
    [deliveryAddress, deliveryLat, deliveryLng, subtotal]
  );
  const currentQuote = quoteFingerprint === deliveryQuoteFingerprint ? quote : null;
  const currentQuoteError = quoteFingerprint === deliveryQuoteFingerprint ? quoteError : null;
  const currentQuoteInsight = useMemo(() => resolveDeliveryQuoteCustomerInsight(currentQuote), [currentQuote]);
  const quoteFreshnessLabel = useMemo(() => formatDeliveryQuoteUpdatedAt(quoteUpdatedAt, clockTick), [clockTick, quoteUpdatedAt]);
  const deliveryQuoteState = useMemo(
    () =>
      resolveDeliveryQuoteCheckoutState({
        mode,
        expectedFingerprint: deliveryQuoteFingerprint,
        quoteFingerprint,
        quoteAccepted: quote?.accepted,
        quoteError,
        loadingQuote
      }),
    [deliveryQuoteFingerprint, loadingQuote, mode, quote?.accepted, quoteError, quoteFingerprint]
  );
  const selectedPromotion = useMemo(
    () => findPublicPromotionByCode(restaurant.promotions, promotionCode),
    [promotionCode, restaurant.promotions]
  );
  const deliveryFee = mode === "DELIVERY" ? currentQuote?.fee ?? 0 : 0;
  const serviceFee = mode === "DELIVERY" ? currentQuote?.serviceFee ?? calculateClientServiceFee(restaurant, subtotal) : calculateClientServiceFee(restaurant, subtotal);
  const selectedPickupBranch = useMemo(
    () => restaurant.branches.find((branch) => branch.id === selectedPickupBranchId) ?? restaurant.branches.find((branch) => branch.isPrimary) ?? restaurant.branches[0] ?? null,
    [restaurant.branches, selectedPickupBranchId]
  );
  const promotionEvaluation = useMemo(
    () =>
      evaluatePublicPromotion({
        itemSubtotal: subtotal,
        deliveryFee,
        promotion: selectedPromotion
      }),
    [deliveryFee, selectedPromotion, subtotal]
  );
  const previewDiscount = promotionEvaluation.discountAmount;
  const normalizedPromotionCode = normalizePromotionCode(promotionCode);
  const effectivePromotionCode = selectedPromotion
    ? promotionEvaluation.eligible
      ? selectedPromotion.code
      : ""
    : normalizedPromotionCode;
  const total = Math.max(0, subtotal + deliveryFee + serviceFee - previewDiscount);
  const requiresPrepaidQr = restaurant.onlinePaymentMode === "QR_PREPAID";
  const activeHistory = useMemo(() => history.filter((entry) => !isRemoteOrderClosed(entry.order)), [history]);
  const activeEntry = created ?? activeHistory[0] ?? null;
  const trackedOrder = activeEntry?.order ?? null;
  const loyaltyPoints = Math.max(1, Math.floor(subtotal / 12000));
  const etaMinutes = mode === "DELIVERY" ? currentQuote?.etaMinutes ?? restaurant.deliveryEtaMinutes : selectedPickupBranch?.pickupEtaMinutes ?? restaurant.pickupEtaMinutes;
  const canReorder = Boolean(trackedOrder?.items?.some((item) => item.menuItem?.id));
  const restaurantPoint = useMemo(() => {
    if (typeof restaurant.storeLat !== "number" || typeof restaurant.storeLng !== "number") return null;
    if (!Number.isFinite(restaurant.storeLat) || !Number.isFinite(restaurant.storeLng)) return null;
    return { lat: restaurant.storeLat, lng: restaurant.storeLng };
  }, [restaurant.storeLat, restaurant.storeLng]);
  const trackingPollingInterval = useMemo(
    () => getCustomerOrderPollingInterval(trackedOrder, { networkOnline, pageVisible }),
    [networkOnline, pageVisible, trackedOrder]
  );

  function notifyCustomer(message: string) {
    if (customerToastTimerRef.current) window.clearTimeout(customerToastTimerRef.current);
    setCustomerToast(message);
    customerToastTimerRef.current = window.setTimeout(() => {
      setCustomerToast(null);
      customerToastTimerRef.current = null;
    }, 2800);
  }

  function notifyAddedToCart(itemName: string) {
    if (cartFeedbackTimerRef.current) window.clearTimeout(cartFeedbackTimerRef.current);
    setCartFeedback({ key: Date.now(), itemName });
    notifyCustomer(`Đã thêm ${itemName} vào giỏ hàng.`);
    cartFeedbackTimerRef.current = window.setTimeout(() => {
      setCartFeedback(null);
      cartFeedbackTimerRef.current = null;
    }, 1900);
  }

  function notifyOrderUpdate(order: OrderDto) {
    const message = orderStatusText(order);
    notifyCustomer(message);
    if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") return;

    try {
      new window.Notification(`${restaurant.name} · ${orderShortId(order.id)}`, {
        body: message,
        tag: `logivn-order-${order.id}`,
        icon: restaurant.logoUrl ?? undefined
      });
    } catch {
      // Toast already covered the status update when the browser refuses a notification.
    }
  }

  async function requestOrderNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      notifyCustomer("Trình duyệt này chưa hỗ trợ thông báo đơn hàng.");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    notifyCustomer(permission === "granted" ? "Đã bật thông báo đơn hàng." : "Bạn vẫn có thể theo dõi đơn ngay trong trang này.");
  }

  function updateCustomerProfile(patch: Partial<RemoteCustomerProfile>) {
    setCustomerProfile((current) => ({
      ...current,
      ...patch
    }));
  }

  const mergeRemoteOrderEntry = useCallback((next: CreatedRemoteOrder, options?: { notify?: boolean }) => {
    const previousOrder = trackedOrderRef.current?.id === next.order.id ? trackedOrderRef.current : null;
    const changed = hasCustomerOrderSnapshotChanged(previousOrder, next.order);

    setCreated((current) => (current && current.order.id === next.order.id ? next : current));
    setHistory((current) => {
      const exists = current.some((entry) => entry.order.id === next.order.id);
      const merged = exists ? current.map((entry) => (entry.order.id === next.order.id ? next : entry)) : [next, ...current];
      return merged.slice(0, 20);
    });
    if (next.order.deliveryCourierLocation) {
      setCourierLocations((current) => ({
        ...current,
        [next.order.id]: next.order.deliveryCourierLocation!
      }));
    }
    if (changed) {
      trackedOrderRef.current = next.order;
      if (options?.notify && previousOrder) notifyOrderUpdateRef.current(next.order);
    }
    setLastOrderSyncAt(Date.now());
    setTrackingPollError(false);
  }, []);

  const fetchTrackedOrderSnapshot = useCallback(
    async (orderId: string) => {
      if (!sessionId || !networkOnline) return;

      const params = new URLSearchParams({
        restaurantSlug: restaurant.slug,
        customerSessionId: sessionId
      });
      const response = await fetch(`/api/remote-orders/${orderId}?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được trạng thái đơn");
      mergeRemoteOrderEntry(json.data as CreatedRemoteOrder, { notify: true });
    },
    [mergeRemoteOrderEntry, networkOnline, restaurant.slug, sessionId]
  );

  const loadQuote = useCallback(async () => {
    if (mode !== "DELIVERY" || subtotal <= 0) {
      quoteRequestSequenceRef.current += 1;
      quoteAbortRef.current?.abort();
      if (quoteRetryTimerRef.current) window.clearTimeout(quoteRetryTimerRef.current);
      quoteAbortRef.current = null;
      quoteRetryTimerRef.current = null;
      quoteRetryStateRef.current = { fingerprint: null, attempts: 0 };
      setQuote(null);
      setQuoteFingerprint(null);
      setQuoteError(null);
      setQuoteUpdatedAt(null);
      setLoadingQuote(false);
      return;
    }

    if (!networkOnline) {
      quoteRequestSequenceRef.current += 1;
      quoteAbortRef.current?.abort();
      if (quoteRetryTimerRef.current) window.clearTimeout(quoteRetryTimerRef.current);
      quoteAbortRef.current = null;
      quoteRetryTimerRef.current = null;
      setQuote(null);
      setQuoteFingerprint(deliveryQuoteFingerprint);
      setQuoteError("Mạng đang mất kết nối. Bạn kiểm tra lại 4G/Wi-Fi rồi tính phí giao hàng.");
      setQuoteUpdatedAt(Date.now());
      setLoadingQuote(false);
      return;
    }

    const requestSequence = quoteRequestSequenceRef.current + 1;
    const requestFingerprint = deliveryQuoteFingerprint;
    if (quoteRetryStateRef.current.fingerprint !== requestFingerprint) {
      quoteRetryStateRef.current = { fingerprint: requestFingerprint, attempts: 0 };
    }
    quoteRequestSequenceRef.current = requestSequence;
    quoteAbortRef.current?.abort();
    const controller = new AbortController();
    quoteAbortRef.current = controller;
    if (quoteRetryTimerRef.current) {
      window.clearTimeout(quoteRetryTimerRef.current);
      quoteRetryTimerRef.current = null;
    }
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
      setQuoteFingerprint(requestFingerprint);
      setQuoteUpdatedAt(Date.now());
      quoteRetryStateRef.current = { fingerprint: requestFingerprint, attempts: 0 };
      if (!json.data.accepted) setQuoteError(json.data.reason ?? "Địa chỉ chưa nằm trong vùng nhận đơn.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (requestSequence !== quoteRequestSequenceRef.current) return;
      setQuote(null);
      setQuoteFingerprint(requestFingerprint);
      setQuoteError(err instanceof Error ? err.message : "Không tính được phí giao hàng");
      setQuoteUpdatedAt(Date.now());
      if (networkOnline && quoteRetryStateRef.current.attempts < 2) {
        quoteRetryStateRef.current = {
          fingerprint: requestFingerprint,
          attempts: quoteRetryStateRef.current.attempts + 1
        };
        quoteRetryTimerRef.current = window.setTimeout(() => {
          quoteRetryTimerRef.current = null;
          void loadQuoteRef.current();
        }, 1600);
      }
    } finally {
      if (requestSequence !== quoteRequestSequenceRef.current) return;
      if (quoteAbortRef.current === controller) quoteAbortRef.current = null;
      setLoadingQuote(false);
    }
  }, [deliveryAddress, deliveryLat, deliveryLng, deliveryQuoteFingerprint, mode, networkOnline, restaurant.slug, subtotal]);

  useEffect(() => {
    loadQuoteRef.current = loadQuote;
  }, [loadQuote]);

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
      setLastOrderSyncAt(Date.now());
      setTrackingPollError(false);
      setCreated((current) => {
        if (!current) return current;
        return orders.find((entry) => entry.order.id === current.order.id) ?? current;
      });
    } catch {
      setTrackingPollError(Boolean(trackedOrderRef.current));
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
    const timer = window.setInterval(() => setClockTick(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (customerToastTimerRef.current) window.clearTimeout(customerToastTimerRef.current);
      if (cartFeedbackTimerRef.current) window.clearTimeout(cartFeedbackTimerRef.current);
      if (quoteRetryTimerRef.current) window.clearTimeout(quoteRetryTimerRef.current);
    };
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
    const snapshot = serializeRemoteCustomerProfile(customerProfile);
    if (!hasRemoteCustomerProfileValue(snapshot)) {
      window.localStorage.removeItem(customerProfileStorageKey);
      return;
    }

    window.localStorage.setItem(customerProfileStorageKey, JSON.stringify(snapshot));
  }, [customerProfile, customerProfileStorageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    trackedOrderRef.current = trackedOrder;
  }, [trackedOrder]);

  useEffect(() => {
    notifyOrderUpdateRef.current = notifyOrderUpdate;
  });

  useEffect(() => {
    const orderId = trackedOrder?.id;
    if (!orderId || !trackingPollingInterval) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        await fetchTrackedOrderSnapshot(orderId);
      } catch {
        if (!cancelled) setTrackingPollError(true);
      }
    };

    const warmupTimer = window.setTimeout(() => void poll(), 1200);
    const intervalTimer = window.setInterval(() => void poll(), trackingPollingInterval);
    return () => {
      cancelled = true;
      window.clearTimeout(warmupTimer);
      window.clearInterval(intervalTimer);
    };
  }, [fetchTrackedOrderSnapshot, trackedOrder?.id, trackingPollingInterval]);

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
        const previousOrder = trackedOrderRef.current;
        const patchedOrder = previousOrder?.id === orderId ? patchOrder(previousOrder) : null;

        setCreated((current) => (current && current.order.id === orderId ? { ...current, order: patchOrder(current.order) } : current));
        setHistory((current) => current.map((entry) => (entry.order.id === orderId ? { ...entry, order: patchOrder(entry.order) } : entry)));
        setLastOrderSyncAt(Date.now());
        setTrackingPollError(false);
        if (
          previousOrder &&
          patchedOrder &&
          (previousOrder.status !== patchedOrder.status ||
            previousOrder.paymentStatus !== patchedOrder.paymentStatus ||
            previousOrder.deliveryStatus !== patchedOrder.deliveryStatus)
        ) {
          trackedOrderRef.current = patchedOrder;
          notifyOrderUpdateRef.current(patchedOrder);
        }
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
          const previousOrder = trackedOrderRef.current;
          const patchedOrder = previousOrder?.id === orderId ? patchDelivery(previousOrder) : null;
          setCreated((current) => (current && current.order.id === orderId ? { ...current, order: patchDelivery(current.order) } : current));
          setHistory((current) => current.map((entry) => (entry.order.id === orderId ? { ...entry, order: patchDelivery(entry.order) } : entry)));
          setLastOrderSyncAt(Date.now());
          setTrackingPollError(false);
          if (previousOrder && patchedOrder && previousOrder.deliveryStatus !== patchedOrder.deliveryStatus) {
            trackedOrderRef.current = patchedOrder;
            notifyOrderUpdateRef.current(patchedOrder);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trackedOrder?.id]);

  function updateQuantity(lineId: string, delta: number) {
    setCart((current) => updateRemoteCartQuantity(current, lineId, delta));
  }

  function updateItemNote(lineId: string, note: string) {
    setCart((current) => setRemoteCartItemNote(current, lineId, note));
  }

  function addMenuItem(item: MenuItemWithCategory) {
    if (hasMenuModifiers(item)) {
      setCustomizingItem({
        item,
        selections: defaultModifierSelectionsForGroups(item.modifierGroups ?? []),
        quantity: 1,
        note: ""
      });
      setError(null);
      return;
    }

    setCart((current) => updateRemoteCartQuantity(current, item.id, 1));
    notifyAddedToCart(item.name);
  }

  function toggleModifierOption(group: PublicModifierGroup, optionId: string) {
    setCustomizingItem((current) => {
      if (!current) return current;
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option || option.isAvailable === false) return current;

      const selectionsOutsideGroup = current.selections.filter((selection) => selection.groupId !== group.id);
      const groupSelections = current.selections.filter((selection) => selection.groupId === group.id);
      const selected = groupSelections.some((selection) => selection.optionId === optionId);
      const maxSelect = modifierMaxSelect(group);

      if (selected) {
        return {
          ...current,
          selections: [...selectionsOutsideGroup, ...groupSelections.filter((selection) => selection.optionId !== optionId)]
        };
      }

      if (maxSelect <= 1) {
        return {
          ...current,
          selections: [...selectionsOutsideGroup, { groupId: group.id, optionId, quantity: 1 }]
        };
      }

      if (groupSelections.length >= maxSelect) return current;
      return {
        ...current,
        selections: [...current.selections, { groupId: group.id, optionId, quantity: 1 }]
      };
    });
  }

  function changeModifierOptionQuantity(group: PublicModifierGroup, optionId: string, nextQuantity: number) {
    setCustomizingItem((current) => {
      if (!current) return current;
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option || option.isAvailable === false) return current;

      const quantity = Math.max(0, Math.min(50, Math.floor(nextQuantity)));
      const outside = current.selections.filter((selection) => !(selection.groupId === group.id && selection.optionId === optionId));
      const otherGroupQuantity = current.selections
        .filter((selection) => selection.groupId === group.id && selection.optionId !== optionId)
        .reduce((sum, selection) => sum + (selection.quantity ?? 1), 0);
      const maxSelect = modifierMaxSelect(group);
      const cappedQuantity = Number.isFinite(maxSelect) ? Math.min(quantity, Math.max(0, maxSelect - otherGroupQuantity)) : quantity;

      if (cappedQuantity <= 0) return { ...current, selections: outside };
      return { ...current, selections: [...outside, { groupId: group.id, optionId, quantity: cappedQuantity }] };
    });
  }

  function confirmCustomItem() {
    if (!customizingItem) return;
    const resolution = resolveModifierSelections(customizingItem.item.modifierGroups ?? [], customizingItem.selections, { basePrice: customizingItem.item.price });
    if (!resolution.ok) {
      setError(resolution.errors[0] ?? "Vui lòng chọn đủ tùy chọn cho món.");
      return;
    }

    setCart((current) =>
      addRemoteCartLine(current, {
        itemId: customizingItem.item.id,
        quantity: customizingItem.quantity,
        note: customizingItem.note,
        modifiers: customizingItem.selections
      })
    );
    notifyAddedToCart(customizingItem.item.name);
    setCustomizingItem(null);
    setError(null);
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
      quoteAccepted: deliveryQuoteState.accepted,
      quoteError: deliveryQuoteState.message
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
    if (!networkOnline) {
      setError("Mạng đang mất kết nối. Bạn kiểm tra lại 4G/Wi-Fi rồi gửi đơn.");
      return;
    }
    if (!validateCartBasics()) {
      setScreen("cart");
      return;
    }
    const quoteGate = remoteCheckoutReducer(
      { screen, error: null },
      {
        type: "REQUIRE_DELIVERY_QUOTE",
        mode,
        quoteAccepted: deliveryQuoteState.accepted,
        quoteError: deliveryQuoteState.message
      }
    );
    if (quoteGate.error) {
      setError(quoteGate.error);
      setScreen(quoteGate.screen);
      return;
    }
    if (selectedPromotion && !promotionEvaluation.eligible) {
      setError(
        promotionEligibilityMessage({
          promotion: selectedPromotion,
          itemSubtotal: subtotal,
          deliveryFee,
          isDeliveryMode: mode === "DELIVERY"
        })
      );
      setScreen("cart");
      return;
    }

    const orderFingerprint = JSON.stringify({
      mode,
      branchId: mode === "PICKUP" ? selectedPickupBranch?.id ?? selectedPickupBranchId : "",
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: mode === "DELIVERY" ? deliveryAddress.trim() : "",
      deliveryLat: mode === "DELIVERY" ? deliveryLat ?? null : null,
      deliveryLng: mode === "DELIVERY" ? deliveryLng ?? null : null,
      customerNote: customerNote.trim(),
      promotionCode: effectivePromotionCode,
      items: cartLines.map((line) => ({
        id: line.lineId,
        menuItemId: line.itemId,
        quantity: line.quantity,
        note: line.note?.trim() ?? "",
        modifiers: line.modifiers ?? []
      }))
    });
    let idempotencyKey: string;
    try {
      const pending = resolvePendingOrderIdempotency({
        storage: window.localStorage,
        storageKey: pendingOrderStorageKey,
        fingerprint: orderFingerprint,
        createId: () => globalThis.crypto.randomUUID()
      });
      pendingCreateRequestRef.current = pending;
      idempotencyKey = pending.idempotencyKey;
    } catch {
      const existingPending = pendingCreateRequestRef.current;
      idempotencyKey =
        existingPending?.fingerprint === orderFingerprint ? existingPending.idempotencyKey : globalThis.crypto.randomUUID();
      pendingCreateRequestRef.current = { fingerprint: orderFingerprint, idempotencyKey };
    }
    actionInFlightRef.current = "submit";
    setSubmitting(true);
    try {
      const response = await fetch("/api/remote-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          branchId: mode === "PICKUP" ? selectedPickupBranch?.id ?? selectedPickupBranchId : undefined,
          fulfillmentType: mode,
          customerSessionId: sessionId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerNote: customerNote.trim(),
          promotionCode: effectivePromotionCode,
          deliveryAddress: deliveryAddress.trim(),
          deliveryLat,
          deliveryLng,
          idempotencyKey,
          items: cartLines.map((line) => ({
            menuItemId: line.itemId,
            quantity: line.quantity,
            note: line.note,
            modifiers: line.modifiers
          }))
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không gửi được đơn");
      const next = json.data as CreatedRemoteOrder;
      setCreated(next);
      setHistory((current) => [next, ...current.filter((entry) => entry.order.id !== next.order.id)].slice(0, 20));
      pendingCreateRequestRef.current = null;
      try {
        clearPendingOrderIdempotency(window.localStorage, pendingOrderStorageKey);
      } catch {
        // Ordering succeeded; stale retry metadata should never block the happy path.
      }
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
    if (!networkOnline) {
      setError("Mạng đang mất kết nối. Bạn kiểm tra lại 4G/Wi-Fi rồi báo quán xác nhận thanh toán.");
      return;
    }

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

  function openRestaurantSupport() {
    if (restaurant.hotline) {
      window.location.href = `tel:${restaurant.hotline}`;
      return;
    }
    notifyCustomer("Quán chưa có hotline hỗ trợ.");
    setError("Quán chưa cấu hình hotline. Bạn vui lòng ghi chú trong đơn để quán hỗ trợ.");
  }

  function renderClosedOrderActions(order: OrderDto) {
    const lifecycle = getCustomerOrderLifecycle(order);
    if (lifecycle.state !== "cancelled" && lifecycle.state !== "refunded") return null;

    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={openRestaurantSupport}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#eadbd5] bg-white px-3 text-[12px] font-black text-[#a33a23]"
        >
          <Headphones size={15} />
          Gọi quán
        </button>
        <button
          type="button"
          onClick={reorderLastOrder}
          disabled={!canReorder}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#0f6b43] px-3 text-[12px] font-black text-white disabled:opacity-50"
        >
          <RefreshCcw size={15} />
          Đặt lại
        </button>
      </div>
    );
  }

  function renderTrackingSyncHint(order: OrderDto) {
    const lifecycle = getCustomerOrderLifecycle(order);
    const lastSyncText = lastOrderSyncAt ? "đã đồng bộ gần đây" : "đang bật";
    const text = lifecycle.isClosed
      ? "Đơn đã kết thúc, hệ thống ngừng cập nhật tự động."
      : !networkOnline
        ? "Mất kết nối, sẽ tự cập nhật lại khi có mạng."
        : trackingPollError
          ? "Cập nhật tự động tạm gián đoạn, hệ thống sẽ thử lại."
          : pageVisible && trackingPollingInterval
            ? `Cập nhật tự động · ${lastSyncText}`
            : "Tạm dừng cập nhật khi bạn rời trang.";

    return (
      <div role="status" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#f7f5ee] px-3 py-2 text-left text-[11px] font-black text-[#667269]">
        <RefreshCcw size={13} className={trackingPollError ? "text-[#b94724]" : "text-[#0f6b43]"} />
        <span>{text}</span>
      </div>
    );
  }

  function renderMenuCartDock() {
    if (cartItemCount === 0 && !activeEntry) return null;

    const showingCart = cartItemCount > 0;
    const targetScreen = showingCart ? "cart" : "tracking";
    const title = showingCart ? "Xem giỏ hàng" : "Theo dõi đơn";
    const subtitle = showingCart
      ? `${cartLines.length} loại món · ${formatVnd(total)}`
      : orderStatusText(activeEntry!.order);

    return (
      <div className="customer-menu-cart-dock" aria-live="polite">
        {cartFeedback && showingCart ? (
          <div key={`cart-feedback-${cartFeedback.key}`} role="status" className="customer-menu-cart-feedback">
            <CheckCircle2 size={15} aria-hidden="true" />
            <span className="min-w-0 truncate">Đã thêm {cartFeedback.itemName}</span>
          </div>
        ) : null}
        <button
          key={cartFeedback?.key ?? "menu-cart-dock"}
          type="button"
          onClick={() => setScreen(targetScreen)}
          className={`customer-menu-cart-button ${cartFeedback && showingCart ? "customer-menu-cart-button--pulse" : ""}`}
          aria-label={showingCart ? `Xem giỏ hàng, ${cartItemCount} món, tổng ${formatVnd(total)}` : "Theo dõi đơn hàng"}
        >
          <span className="customer-menu-cart-icon">
            <ShoppingBag size={19} aria-hidden="true" />
            {showingCart ? <span className="customer-menu-cart-count">{cartItemCount}</span> : null}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[14px] font-black">{title}</span>
            <span className="block truncate text-[12px] font-bold text-white/78">{subtitle}</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    );
  }

  function modifiersMatch(a?: Array<{ groupId: string; optionId: string }>, b?: Array<{ groupId: string; optionId: string }>) {
    const listA = a || [];
    const listB = b || [];
    if (listA.length !== listB.length) return false;
    return listA.every((selA) =>
      listB.some((selB) => selB.groupId === selA.groupId && selB.optionId === selA.optionId)
    );
  }

  function handleCustomerAgentAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.href = action.href;
      return;
    }

    if (action.uiTarget === "add_item_to_cart") {
      const body = action.body as {
        menuItemId: string;
        quantity?: number;
        note?: string;
        modifiers?: Array<{ groupId: string; optionId: string; quantity?: number }>;
      } | undefined;
      if (!body?.menuItemId) return;
      const menuItem = allItems.find((item) => item.id === body.menuItemId);
      if (!menuItem) return;

      const selections = body.modifiers ?? [];
      const resolution = resolveModifierSelections(menuItem.modifierGroups ?? [], selections, { basePrice: menuItem.price });
      if (!resolution.ok) {
        setCustomizingItem({
          item: menuItem,
          selections: defaultModifierSelectionsForGroups(menuItem.modifierGroups ?? []),
          quantity: body.quantity ?? 1,
          note: body.note ?? ""
        });
        setError(null);
        return;
      }

      setCart((current) =>
        addRemoteCartLine(current, {
          itemId: menuItem.id,
          quantity: body.quantity ?? 1,
          note: body.note,
          modifiers: selections
        })
      );
      notifyAddedToCart(menuItem.name);
      setScreen((current) => (current === "payment" || current === "vietqr" ? "menu" : current));
      setError(null);
      return;
    }

    if (action.uiTarget === "remove_item_from_cart") {
      const body = action.body as {
        menuItemId: string;
        quantity?: number;
        modifiers?: Array<{ groupId: string; optionId: string }>;
      } | undefined;
      if (!body?.menuItemId) return;

      const matchingLines = cartLines.filter((line) => {
        if (line.itemId !== body.menuItemId) return false;
        if (body.modifiers) {
          return modifiersMatch(line.modifiers, body.modifiers);
        }
        return true;
      });

      if (matchingLines.length === 0) return;

      const qtyToRemove = body.quantity ?? 1;
      let removedCount = 0;

      setCart((current) => {
        let updatedCart = { ...current };
        for (const line of matchingLines) {
          if (removedCount >= qtyToRemove) break;
          if (!body.quantity) {
            delete updatedCart[line.lineId];
            removedCount += line.quantity;
          } else {
            const toDec = Math.min(line.quantity, qtyToRemove - removedCount);
            updatedCart = updateRemoteCartQuantity(updatedCart, line.lineId, -toDec);
            removedCount += toDec;
          }
        }
        return updatedCart;
      });
      notifyCustomer("Đã cập nhật giỏ hàng.");
      setError(null);
      return;
    }

    if (action.uiTarget === "clear_cart") {
      setCart({});
      notifyCustomer("Đã xóa toàn bộ giỏ hàng.");
      setError(null);
      return;
    }

    if (action.uiTarget === "add_item") {
      const body = action.body as { menuItemId?: string; categoryId?: string } | undefined;
      const item = allItems.find((menuItem) => menuItem.id === body?.menuItemId);
      if (!item) return;
      addMenuItem(item);
      if (body?.categoryId) setActiveCategory(body.categoryId);
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
      openRestaurantSupport();
    }
  }

  function renderModifierCustomizer() {
    if (!customizingItem) return null;

    const item = customizingItem.item;
    const groups = item.modifierGroups ?? [];
    const resolution = resolveModifierSelections(groups, customizingItem.selections, { basePrice: customizingItem.item.price });
    const unitPrice = item.price + (resolution.ok ? resolution.totalDelta : 0);
    const totalPrice = unitPrice * customizingItem.quantity;

    return (
      <div className="fixed inset-0 z-50 grid place-items-end bg-black/32 px-3 pb-3 pt-12 sm:place-items-center">
        <section className="flex max-h-[88dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-[30px] bg-[#fffefa] shadow-[0_28px_90px_rgba(0,0,0,0.25)]">
          <div className="flex items-start justify-between gap-3 border-b border-[#ecefe6] p-4">
            <div className="min-w-0">
              <p className="text-[12px] font-black uppercase tracking-[0.12em] text-[#006b3c]">Tùy chọn món</p>
              <h2 className="mt-1 truncate text-[20px] font-black text-[#111713]">{item.name}</h2>
              <p className="mt-1 text-[13px] font-bold text-[#68746b]">{formatVnd(unitPrice)} / phần</p>
            </div>
            <button type="button" onClick={() => setCustomizingItem(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f5f2ea] text-[#111713]">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            {groups.map((group) => {
              const groupSelections = customizingItem.selections.filter((selection) => selection.groupId === group.id);
              const minSelect = modifierMinSelect(group);
              const maxSelect = modifierMaxSelect(group);
              const usesQuantity = shouldUseOptionQuantity(group);

              return (
                <section key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[14px] font-black text-[#111713]">{group.name}</h3>
                      <p className="mt-0.5 text-[11px] font-bold text-[#748076]">
                        {minSelect > 0 ? `Bắt buộc chọn ${minSelect}` : "Không bắt buộc"}
                        {Number.isFinite(maxSelect) ? ` · tối đa ${maxSelect}` : ""}
                      </p>
                    </div>
                    {minSelect > 0 ? <span className="rounded-full bg-[#edf7ef] px-2.5 py-1 text-[10px] font-black text-[#006b3c]">Bắt buộc</span> : null}
                  </div>

                  <div className="grid gap-2">
                  {group.options.map((option) => {
                    const selectedSelection = groupSelections.find((selection) => selection.optionId === option.id);
                    const selected = Boolean(selectedSelection);
                    const optionQuantity = selectedSelection?.quantity ?? 0;
                    const disabled = option.isAvailable === false;
                    const priceText = modifierOptionPriceText(item.price, option);
                    if (usesQuantity) {
                      return (
                          <div
                            key={option.id}
                            className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                              selected
                                ? "border-[#0f7b4b] bg-[#edf7ef]"
                                : disabled
                                  ? "border-[#ecefe6] bg-[#f5f2ea] opacity-60"
                                  : "border-[#ecefe6] bg-white"
                            }`}
                          >
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => changeModifierOptionQuantity(group, option.id, optionQuantity > 0 ? 0 : 1)}
                              className="min-w-0 flex-1 text-left disabled:pointer-events-none"
                            >
                              <span className="block truncate text-[13px] font-black text-[#111713]">{option.name}</span>
                              <span className="mt-0.5 block text-[11px] font-bold text-[#748076]">
                                {disabled ? "Tạm hết" : priceText}
                              </span>
                            </button>
                            <QuantityStepper
                              value={optionQuantity}
                              onMinus={() => changeModifierOptionQuantity(group, option.id, optionQuantity - 1)}
                              onPlus={() => changeModifierOptionQuantity(group, option.id, optionQuantity + 1)}
                            />
                          </div>
                        );
                      }

                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleModifierOption(group, option.id)}
                          className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border px-3 text-left transition ${
                            selected
                              ? "border-[#0f7b4b] bg-[#edf7ef]"
                              : disabled
                                ? "border-[#ecefe6] bg-[#f5f2ea] opacity-60"
                                : "border-[#ecefe6] bg-white"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-black text-[#111713]">{option.name}</span>
                            <span className="mt-0.5 block text-[11px] font-bold text-[#748076]">{disabled ? "Tạm hết" : priceText}</span>
                          </span>
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-[#0f7b4b] bg-[#0f7b4b] text-white" : "border-[#dce2d8] bg-white text-transparent"}`}>
                            <Check size={14} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
              Ghi chú riêng cho món
              <input
                value={customizingItem.note}
                onChange={(event) => setCustomizingItem((current) => current ? { ...current, note: event.target.value } : current)}
                maxLength={200}
                placeholder="Ví dụ: ít đá, bỏ hành..."
                className="h-11 rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]"
              />
            </label>

            {!resolution.ok ? (
              <p className="rounded-2xl bg-[#fff3e3] px-4 py-3 text-[12px] font-bold text-[#be5d00]">{resolution.errors[0]}</p>
            ) : null}
          </div>

          <div className="grid gap-3 border-t border-[#ecefe6] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3">
              <QuantityStepper
                value={customizingItem.quantity}
                onMinus={() => setCustomizingItem((current) => current ? { ...current, quantity: Math.max(1, current.quantity - 1) } : current)}
                onPlus={() => setCustomizingItem((current) => current ? { ...current, quantity: Math.min(50, current.quantity + 1) } : current)}
              />
              <span className="text-[17px] font-black text-[#111713]">{formatVnd(totalPrice)}</span>
            </div>
            <PrimaryButton onClick={confirmCustomItem} disabled={!resolution.ok}>
              Thêm vào giỏ
            </PrimaryButton>
          </div>
        </section>
      </div>
    );
  }

  function withLogibot(node: React.ReactNode) {
    return (
      <>
        <CustomerAiAssistant
          restaurantSlug={restaurant.slug}
          customerSessionId={sessionId}
          cart={cartLines.map((line) => ({
            menuItemId: line.itemId,
            name: line.item.name,
            price: cartLineUnitPrice(line),
            quantity: line.quantity,
            note: line.note
          }))}
          orderStatus={trackedOrder}
          onAgentAction={handleCustomerAgentAction}
        />
        {node}
        {renderModifierCustomizer()}
        <FloatingRemoteActions
          cartCount={screen === "menu" || screen === "cart" ? 0 : cartItemCount}
          cartTotal={total}
          notice={customerToast}
          onCart={() => setScreen("cart")}
          onSupport={openRestaurantSupport}
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
          className={`min-h-11 rounded-xl text-[13px] font-black ${mode === "DELIVERY" ? "bg-white text-[#006b3c] shadow-sm" : "text-[#6d766d] disabled:opacity-40"}`}
        >
          Giao hàng
        </button>
        <button
          type="button"
          disabled={!restaurant.pickupEnabled}
          onClick={() => restaurant.pickupEnabled && setMode("PICKUP")}
          className={`min-h-11 rounded-xl text-[13px] font-black ${mode === "PICKUP" ? "bg-white text-[#006b3c] shadow-sm" : "text-[#6d766d] disabled:opacity-40"}`}
        >
          Đến lấy
        </button>
      </div>
    );
  }

  function renderPickupBranchSelector() {
    if (mode !== "PICKUP" || restaurant.branches.length === 0) return null;

    if (restaurant.branches.length === 1) {
      const branch = selectedPickupBranch ?? restaurant.branches[0];
      return (
        <SoftCard className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#e7eadf] bg-[#fbfaf5] text-[#006b3c]">
            <Store size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-black text-[#121813]">Nhận tại {branch?.name ?? restaurant.name}</span>
            <span className="mt-1 block truncate text-[12px] font-semibold text-[#6d756d]">{branch?.address ?? restaurant.address ?? "Tại cửa hàng"}</span>
          </span>
        </SoftCard>
      );
    }

    return (
      <SoftCard className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-black text-[#121813]">Chi nhánh nhận món</h2>
            <p className="mt-1 text-[12px] font-semibold text-[#6d756d]">Dự kiến {etaMinutes} phút</p>
          </div>
          <Store size={18} className="text-[#006b3c]" />
        </div>
        <div className="grid gap-2">
          {restaurant.branches.map((branch) => {
            const selected = branch.id === (selectedPickupBranch?.id ?? selectedPickupBranchId);
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => setSelectedPickupBranchId(branch.id)}
                className={`flex min-h-[68px] items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${selected ? "border-[#0f7b4b] bg-[#edf7ef]" : "border-[#ecefe6] bg-[#fffefa]"}`}
              >
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#006b3c] text-white" : "bg-[#f4f1e8] text-[#006b3c]"}`}>
                  <MapPin size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-black text-[#121813]">{branch.name}</span>
                    {branch.isPrimary ? <span className="shrink-0 rounded-full bg-[#fff3df] px-2 py-0.5 text-[10px] font-black text-[#a8560b]">Chính</span> : null}
                  </span>
                  <span className="mt-1 block truncate text-[11px] font-semibold text-[#6d756d]">{branch.address ?? "Tại cửa hàng"}</span>
                </span>
                <span className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-[#006b3c] bg-[#006b3c] text-white" : "border-[#d8ddd2] text-transparent"}`}>
                  <Check size={14} />
                </span>
              </button>
            );
          })}
        </div>
      </SoftCard>
    );
  }

  function renderSummaryCard(showDetails = true) {
    const summaryDiscount = cartLines.length > 0 ? previewDiscount : activeEntry?.order.discountAmount ?? 0;
    const summaryTotal = cartLines.length > 0 ? total : activeEntry?.order.total ?? 0;

    return (
      <SoftCard className="grid gap-3">
        {showDetails ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-black text-[#121813]">{activeEntry ? `Đơn hàng ${orderShortId(activeEntry.order.id)}` : "Đơn hàng của bạn"}</h2>
              <p className="mt-1 text-[12px] font-semibold text-[#748076]">{cartLines.length || activeEntry?.order.items.length || 0} món</p>
            </div>
            <button type="button" onClick={() => setScreen("cart")} className="inline-flex min-h-11 items-center gap-1 px-2 text-[12px] font-black text-[#006b3c]">
              Xem chi tiết <ChevronRight size={14} />
            </button>
          </div>
        ) : null}
        <PriceRow label="Tạm tính" value={formatVnd(subtotal || activeEntry?.order.subtotal || 0)} />
        {serviceFee > 0 ? <PriceRow label={`Phí dịch vụ (${restaurant.serviceFeePercent || 0}%)`} value={formatVnd(serviceFee)} hint={<span className="grid h-4 w-4 place-items-center rounded-full border border-[#cdd5c8] text-[10px]">i</span>} /> : null}
        <PriceRow label="Phí giao hàng" value={formatVnd(deliveryFee || activeEntry?.order.deliveryFee || 0)} hint={<span className="grid h-4 w-4 place-items-center rounded-full border border-[#cdd5c8] text-[10px]">i</span>} />
        {summaryDiscount > 0 ? <PriceRow label="Ưu đãi" value={`-${formatVnd(summaryDiscount)}`} /> : null}
        <div className="h-px bg-[#eef0e7]" />
        <PriceRow label="Tổng cộng" value={formatVnd(summaryTotal)} strong />
      </SoftCard>
    );
  }

  function renderError() {
    return error ? <p className="rounded-2xl bg-[#fff3e3] px-4 py-3 text-[13px] font-bold text-[#be5d00]">{error}</p> : null;
  }

  function renderNetworkNotice() {
    if (networkOnline) return null;
    return <p className="rounded-2xl bg-[#fff3e3] px-4 py-3 text-[13px] font-bold text-[#be5d00]">Mạng đang mất kết nối. Giỏ hàng vẫn được giữ trên máy này.</p>;
  }

  function renderNotificationPrompt() {
    if (notificationPermission === "unsupported") return null;
    if (notificationPermission === "granted") {
      return (
        <p className="mt-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#edf7ef] px-3 py-2 text-[12px] font-black text-[#006b3c]">
          <Bell size={15} />
          Thông báo đơn hàng đã bật
        </p>
      );
    }
    if (notificationPermission === "denied") {
      return <p className="mt-3 text-[12px] font-semibold leading-5 text-[#7c867e]">Trình duyệt đang chặn thông báo. Bạn vẫn có thể theo dõi realtime trong trang này.</p>;
    }
    return (
      <button type="button" onClick={requestOrderNotifications} className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#f8f6ef] px-4 text-[12px] font-black text-[#006b3c]">
        <Bell size={15} />
        Bật thông báo đơn hàng
      </button>
    );
  }

  function renderMenuScreen() {
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <header className="customer-app-header">
            <BrandMark restaurant={restaurant} />
            <button type="button" onClick={() => activeEntry && setScreen("tracking")} className="relative grid h-11 w-11 place-items-center rounded-full border border-[#e7eadf] bg-white text-[#0e2117] shadow-[0_8px_20px_rgba(16,32,23,0.05)]" aria-label="Theo dõi đơn hàng">
              <Bell size={18} />
              {activeEntry ? <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#ef3b2d] text-[10px] font-black text-white">1</span> : null}
            </button>
          </header>

          <div className="customer-bottom-buffer flex-1 space-y-4 px-5">
            <section className="customer-compact-hero">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#59665f]">
                  <MapPin size={14} className="text-[#f28c28]" />
                  {currentQuote?.distanceKm ? `Cách bạn ${currentQuote.distanceKm} km` : `Trong bán kính ${restaurant.deliveryRadiusKm} km`}
                </p>
                <h1 className="mt-2 text-[22px] font-black leading-tight text-[#101713]">Chọn món nhanh</h1>
                <p className="mt-1 text-[13px] font-semibold text-[#667269]">{etaMinutes} phút dự kiến · {mode === "DELIVERY" ? "Giao tận nơi" : "Đến lấy tại quán"}</p>
              </div>
              <ShoppingBag size={22} className="text-[#0f6b43]" aria-hidden="true" />
            </section>

            {(restaurant.deliveryEnabled && restaurant.pickupEnabled) ? renderModeToggle() : null}

            {restaurant.promotions[0] ? (
              <button type="button" onClick={() => setScreen("cart")} className="customer-promo-strip">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-black text-[#101713]">Ưu đãi hôm nay</span>
                  <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#667269]">{promotionDescription(restaurant.promotions[0])}</span>
                </span>
                <ChevronRight size={17} className="shrink-0 text-[#0f6b43]" />
              </button>
            ) : null}

            <div className="customer-menu-controls">
            <div className="customer-search-row">
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
              <IconButton label="Mở danh mục" onClick={() => setCategoryMenuOpen(true)} className="h-12 w-12">
                <SlidersHorizontal size={18} className="text-[#006b3c]" />
              </IconButton>
            </div>

            <div className="customer-category-rail">
              {[{ id: "all", name: "Tất cả" }, ...categories].map((category, index) => {
                const Icon = categoryIcons[index % categoryIcons.length];
                const selected = activeCategory === category.id;
                return (
                  <button key={category.id} type="button" onClick={() => setActiveCategory(category.id)} className="customer-category-icon-tab">
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl border ${selected ? "border-[#0f7b4b] bg-[#edf6ef] text-[#006b3c]" : "border-[#ecefe6] bg-white text-[#69756d]"}`}>
                      <Icon size={19} />
                    </span>
                    <span className={`max-w-[72px] truncate text-[11px] font-black ${selected ? "text-[#006b3c]" : "text-[#56625a]"}`}>{category.name}</span>
                  </button>
                );
              })}
            </div>
            </div>

            {categoryMenuOpen ? (
              <div className="fixed inset-0 z-[1320]">
                <button
                  type="button"
                  className="absolute inset-0 bg-black/24 backdrop-blur-[2px]"
                  onClick={() => setCategoryMenuOpen(false)}
                  aria-label="Đóng danh mục"
                />
                <section
                  role="dialog"
                  aria-modal="true"
                  aria-label="Danh mục món"
                  className="absolute inset-x-3 bottom-3 mx-auto flex max-h-[72dvh] max-w-[430px] flex-col overflow-hidden rounded-[28px] border border-[#e7eadf] bg-[#fffefa] shadow-[0_24px_80px_rgba(16,32,23,0.24)]"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#eef0e7] px-4 py-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#006b3c]">Menu</p>
                      <h2 className="text-[16px] font-black text-[#111713]">Danh mục món</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCategoryMenuOpen(false)}
                      className="grid h-11 w-11 place-items-center rounded-2xl border border-[#e7eadf] bg-white text-[#59665f]"
                      aria-label="Đóng danh mục"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    <div className="customer-category-grid">
                      {[{ id: "all", name: "Tất cả", count: allItems.length }, ...categories.map((category) => ({ id: category.id, name: category.name, count: category.items.length }))].map((category, index) => {
                        const Icon = categoryIcons[index % categoryIcons.length];
                        const selected = activeCategory === category.id;

                        return (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => {
                              setActiveCategory(category.id);
                              setCategoryMenuOpen(false);
                            }}
                            className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 text-left ${selected ? "border-[#0f7b4b] bg-[#edf6ef] text-[#006b3c]" : "border-[#ecefe6] bg-white text-[#111713]"}`}
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f6f4ee]">
                              <Icon size={17} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-black">{category.name}</span>
                              <span className="mt-0.5 block text-[11px] font-semibold text-[#6f7a70]">{category.count} món</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[17px] font-black text-[#111713]">{activeCategory === "all" ? "Menu" : categories.find((category) => category.id === activeCategory)?.name ?? "Menu"}</h2>
                <button type="button" onClick={() => setActiveCategory("all")} className="inline-flex min-h-11 items-center px-2 text-[12px] font-black text-[#006b3c]">
                  Xem tất cả
                </button>
              </div>
              <div className="customer-menu-grid">
                {visibleItems.length === 0 ? (
                  <div className="col-span-2 rounded-3xl bg-white p-5 text-center text-[13px] font-semibold text-[#68746b] shadow-[0_10px_24px_rgba(23,34,27,0.04)]">
                    Chưa tìm thấy món phù hợp. Bạn thử từ khóa hoặc danh mục khác nhé.
                  </div>
                ) : null}
                {visibleItems.map((item) => (
                  <article key={item.id} className="customer-menu-card">
                    <ProductThumb item={item} className="customer-menu-thumb" />
                    <div className="customer-menu-card-body">
                      <h3 className="customer-menu-title">{item.name}</h3>
                      <p className="customer-menu-meta">{item.categoryName}</p>
                      <p className="customer-menu-price">{formatVnd(item.price)}</p>
                    </div>
                    <button type="button" onClick={() => addMenuItem(item)} className="customer-menu-action customer-menu-action--secondary">
                      <Plus size={16} />
                      {hasMenuModifiers(item) ? "Chọn" : "Thêm"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>

          {renderMenuCartDock()}
        </div>
      </PhoneFrame>
    );
  }

  function renderCartScreen() {
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader title="Giỏ hàng của bạn" onBack={() => setScreen("menu")} right={<button type="button" className="inline-flex min-h-11 items-center px-2 text-[12px] font-black text-[#006b3c]">Chỉnh sửa</button>} />
          <div className="customer-bottom-buffer flex-1 space-y-4 px-5">
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
            {renderPickupBranchSelector()}

            {restaurant.promotions.length > 0 ? (
              <SoftCard className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-black text-[#121813]">Mã ưu đãi</h2>
                    <p className="mt-1 text-[12px] font-semibold text-[#6d756d]">Chọn mã đang áp dụng cho đặt online</p>
                  </div>
                  {previewDiscount > 0 ? <span className="rounded-lg bg-[#edf7ef] px-2.5 py-1 text-[11px] font-black text-[#006b3c]">-{formatVnd(previewDiscount)}</span> : null}
                </div>
                <div className="grid gap-2">
                  {restaurant.promotions.slice(0, 4).map((promotion) => {
                    const selected = selectedPromotion?.id === promotion.id;
                    const evaluation = evaluatePublicPromotion({
                      itemSubtotal: subtotal,
                      deliveryFee,
                      promotion
                    });
                    return (
                      <button
                        key={promotion.id}
                        type="button"
                        onClick={() => setPromotionCode(selected ? "" : promotion.code)}
                        className={`rounded-2xl border px-3 py-2.5 text-left ${selected ? "border-[#0f7b4b] bg-[#edf7ef]" : "border-[#ecefe6] bg-[#fffefa]"}`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-[12px] font-black text-[#121813]">{promotion.code}</span>
                          <span className={`text-[11px] font-black ${selected ? "text-[#006b3c]" : "text-[#7a857b]"}`}>
                            {selected ? "Đã chọn" : evaluation.eligible ? `-${formatVnd(evaluation.discountAmount)}` : "Chọn"}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] font-semibold text-[#68746b]">{promotionDescription(promotion)}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedPromotion && previewDiscount <= 0 && selectedPromotion.minOrderAmount > subtotal ? (
                  <p className="text-[12px] font-bold text-[#be5d00]">
                    Cần thêm {formatVnd(selectedPromotion.minOrderAmount - subtotal)} để dùng mã {selectedPromotion.code}.
                  </p>
                ) : null}
              </SoftCard>
            ) : null}

            <div className="customer-cart-list">
              {cartLines.length === 0 ? (
                <SoftCard>
                  <p className="text-center text-[13px] font-semibold text-[#68746b]">Giỏ hàng đang trống. Quay lại menu để chọn món nhé.</p>
                </SoftCard>
              ) : (
                cartLines.map((line) => {
                  const resolvedModifiers = resolveCartLineModifiers(line);
                  const lineSummary = modifierSummary(resolvedModifiers);
                  const unitPrice = cartLineUnitPrice(line);

                  return (
                    <article key={line.lineId} className="customer-cart-card">
                      <ProductThumb item={line.item} className="customer-cart-card-media" />
                      <div className="customer-cart-card-main">
                        <h3 className="truncate text-[14px] font-black text-[#111713]">{line.item.name}</h3>
                        {lineSummary ? <p className="mt-1 line-clamp-2 text-[11px] font-bold text-[#68746b]">{lineSummary}</p> : null}
                        <p className="mt-2 text-[13px] font-black text-[#111713]">{formatVnd(unitPrice)}</p>
                        <label className="mt-2 block">
                          <span className="sr-only">Ghi chú cho {line.item.name}</span>
                          <input
                            name={`itemNote-${line.lineId}`}
                            autoComplete="off"
                            value={line.note ?? ""}
                            onChange={(event) => updateItemNote(line.lineId, event.target.value)}
                            maxLength={200}
                            placeholder="Ghi chú món"
                            className="h-10 w-full rounded-xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[12px] font-semibold text-[#121813] outline-none focus:border-[#0f7b4b]"
                          />
                        </label>
                        <div className="customer-cart-card-actions items-center gap-2">
                          <QuantityStepper value={line.quantity} onMinus={() => updateQuantity(line.lineId, -1)} onPlus={() => updateQuantity(line.lineId, 1)} />
                          <button type="button" aria-label={`Xóa ${line.item.name} khỏi giỏ hàng`} onClick={() => updateQuantity(line.lineId, -line.quantity)} className="grid h-11 w-11 place-items-center rounded-xl text-[#6d766d]">
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <SoftCard className="grid gap-3">
              <div className="customer-form-grid">
                <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                  Tên khách
                  <input name="customerName" autoComplete="name" maxLength={120} value={customerName} onChange={(event) => updateCustomerProfile({ customerName: event.target.value })} placeholder="Tên của bạn" className="h-11 rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                </label>
                <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                  Số điện thoại
                  <input name="customerPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={customerPhone} onChange={(event) => updateCustomerProfile({ customerPhone: event.target.value })} placeholder="09xx xxx xxx" className="h-11 rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                </label>
              </div>
              <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                Ghi chú cho quán
                <div className="relative">
                  <textarea name="customerNote" autoComplete="off" maxLength={300} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Ví dụ: ít đá, không đường..." className="min-h-20 w-full rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 py-3 pr-10 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                  <Pencil className="absolute bottom-3 right-3 text-[#69766d]" size={16} aria-hidden="true" />
                </div>
              </label>
              <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                Mã ưu đãi
                <input name="promotionCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={promotionCode} onChange={(event) => setPromotionCode(normalizePromotionCode(event.target.value))} placeholder="Nhập mã nếu có" className="h-11 rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 text-[13px] font-black uppercase outline-none focus:border-[#0f7b4b]" />
                {promotionCode ? (
                  <span className={`text-[11px] font-bold ${selectedPromotion && previewDiscount > 0 ? "text-[#006b3c]" : "text-[#7c867e]"}`}>
                    {selectedPromotion
                      ? promotionEligibilityMessage({
                          promotion: selectedPromotion,
                          itemSubtotal: subtotal,
                          deliveryFee,
                          isDeliveryMode: mode === "DELIVERY"
                        })
                      : "Mã chưa nằm trong danh sách công khai, hệ thống sẽ kiểm tra khi gửi đơn."}
                  </span>
                ) : null}
              </label>
            </SoftCard>

            {renderSummaryCard(false)}
            {renderNetworkNotice()}
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
    const deliveryFeeText = deliveryQuoteState.pending
      ? "Đang tính..."
      : deliveryQuoteState.stale
        ? "Cần tính lại"
        : currentQuoteError
          ? "Chưa có phí"
          : formatVnd(deliveryFee);

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
              route={currentQuote?.routeGeometry?.coordinates ?? null}
              onAddressChange={(address) => updateCustomerProfile({ deliveryAddress: address })}
              onManualAddressChange={(address) =>
                updateCustomerProfile({
                  deliveryAddress: address,
                  deliveryLat: undefined,
                  deliveryLng: undefined
                })
              }
              onCoordinateChange={(point) => {
                updateCustomerProfile({ deliveryLat: point.lat, deliveryLng: point.lng });
              }}
            />

            <SoftCard className="grid gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#e7eadf] bg-[#fbfaf5] text-[#006b3c]">
                  <MapPin size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-[#121813]">{deliveryAddress || "Chưa chọn địa chỉ giao"}</p>
                  <button type="button" className="mt-1 inline-flex min-h-11 items-center text-[12px] font-black text-[#006b3c]">Thay đổi</button>
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
              <span className="font-black text-[#111713]">{deliveryFeeText}</span>
            </div>

            <SoftCard className={`grid gap-3 border ${deliveryInsightToneClass(currentQuoteInsight.tone)}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-current/20 bg-white/70">
                  {currentQuoteInsight.tone === "red" || currentQuoteInsight.tone === "yellow" ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-black">{currentQuoteInsight.title}</p>
                      <p className="mt-1 text-[12px] font-bold leading-5 opacity-85">{currentQuoteInsight.detail}</p>
                    </div>
                    {quoteFreshnessLabel ? <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-black opacity-80">{quoteFreshnessLabel}</span> : null}
                  </div>
                  {currentQuoteInsight.badges.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {currentQuoteInsight.badges.slice(0, 4).map((badge) => (
                        <span key={badge} className="rounded-full border border-current/15 bg-white/70 px-2.5 py-1 text-[11px] font-black">
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {!deliveryQuoteState.pending && !deliveryQuoteState.accepted ? (
                    <button
                      type="button"
                      onClick={() => void loadQuote()}
                      disabled={!networkOnline || loadingQuote}
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-2xl border border-current/20 bg-white/70 px-3 text-[12px] font-black disabled:opacity-55"
                    >
                      <RefreshCcw size={14} />
                      Thử tính lại
                    </button>
                  ) : null}
                </div>
              </div>
            </SoftCard>

            <SoftCard>
              <label className="grid gap-1.5 text-[12px] font-black text-[#111713]">
                Ghi chú cho tài xế
                <div className="relative">
                  <textarea name="deliveryNote" autoComplete="off" maxLength={300} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} placeholder="Ví dụ: Gọi trước khi đến..." className="min-h-20 w-full rounded-2xl border border-[#e6eadf] bg-[#fffefa] px-3 py-3 pr-10 text-[13px] font-semibold outline-none focus:border-[#0f7b4b]" />
                  <Pencil className="absolute bottom-3 right-3 text-[#69766d]" size={16} aria-hidden="true" />
                </div>
              </label>
            </SoftCard>

            {deliveryQuoteState.accepted && currentQuote ? (
              <p className="rounded-2xl bg-[#edf7ef] px-4 py-3 text-[13px] font-bold text-[#006b3c]">
                Địa chỉ nằm trong vùng giao. {currentQuote.distanceKm ? `Khoảng cách ${currentQuote.distanceKm} km.` : ""}
              </p>
            ) : null}
            {deliveryQuoteState.message ? <p className="rounded-2xl bg-[#fff3e3] px-4 py-3 text-[13px] font-bold text-[#be5d00]">{deliveryQuoteState.message}</p> : null}
            {renderNetworkNotice()}
            {renderError()}
          </div>
          <BottomAction>
            <PrimaryButton onClick={continueFromDelivery} disabled={mode === "DELIVERY" && !deliveryQuoteState.accepted}>
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
    const deliveryQuoteBlocked = mode === "DELIVERY" && !deliveryQuoteState.accepted;
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader title="Thanh toán" onBack={() => setScreen(mode === "DELIVERY" ? "delivery" : "cart")} />
          <div className="flex-1 space-y-4 px-5 pb-5">
            {renderSummaryCard()}
            <FlowVisualCard
              src={paymentChoice === "vietqr" ? orderFlowImageSources.paymentVietqr : orderFlowImageSources.restaurantConfirmation}
              title={paymentChoice === "vietqr" ? "Thanh toán VietQR" : "Thanh toán khi nhận món"}
              caption={paymentChoice === "vietqr" ? "Quét mã, báo đã chuyển khoản, rồi theo dõi xác nhận từ quán." : "Gửi đơn trước, quán xác nhận món và thu tiền khi giao hoặc khi bạn đến lấy."}
            />

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

            {deliveryQuoteBlocked && deliveryQuoteState.message ? (
              <p className="rounded-2xl bg-[#fff3e3] px-4 py-3 text-[13px] font-bold text-[#be5d00]">{deliveryQuoteState.message}</p>
            ) : null}
            {renderNetworkNotice()}
            {renderError()}
          </div>
          <BottomAction>
            <PrimaryButton onClick={submitOrder} disabled={submitting || cartLines.length === 0 || !networkOnline || deliveryQuoteBlocked}>
              {submitting
                ? "Đang tạo đơn..."
                : deliveryQuoteBlocked
                  ? "Cần cập nhật phí giao hàng"
                  : requiresPrepaidQr
                    ? `Thanh toán ${formatVnd(total)}`
                    : `Đặt hàng ${formatVnd(total)}`}
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
            <FlowImage src={orderFlowImageSources.paymentVietqr} alt="Thanh toán VietQR" className="h-[154px]" sizes="390px" />
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
            {renderNetworkNotice()}
            {renderError()}
          </div>
          <BottomAction>
            <PrimaryButton onClick={markRemotePaid} disabled={submitting || !networkOnline || activeEntry?.order.paymentStatus === "waiting_confirm"}>
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
              <div className="relative h-32 w-32 overflow-hidden rounded-[30px] border border-white/30 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
                <Image src={orderFlowImageSources.restaurantConfirmation} alt="Quán xác nhận đơn hàng" fill sizes="128px" className="object-cover" />
                <span className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full bg-[#006b3c] text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                  <Check size={23} strokeWidth={3} />
                </span>
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
              {order ? (
                <div className="mt-5 border-t border-[#edf0e7] pt-5">
                  <OrderTimeline order={order} />
                </div>
              ) : null}
            </SoftCard>
            <SoftCard className="mt-4 text-center">
              <p className="text-[13px] font-semibold leading-5 text-[#667269]">Bạn sẽ nhận thông báo khi đơn hàng đang được giao</p>
              {renderNotificationPrompt()}
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
    const lifecycle = getCustomerOrderLifecycle(order);
    const orderInterrupted = lifecycle.state === "cancelled" || lifecycle.state === "refunded";
    const statusPillClass = orderInterrupted ? "bg-[#fff1ed] text-[#a33a23]" : "bg-[#edf7ef] text-[#006b3c]";
    const courierLocation = courierLocations[order.id] ?? order.deliveryCourierLocation ?? null;
    return (
      <PhoneFrame>
        <div className="flex min-h-dvh flex-col">
          <ScreenHeader
            title="Theo dõi đơn hàng"
            onBack={() => setScreen("menu")}
            right={
              <button type="button" onClick={openRestaurantSupport} className="grid h-11 w-11 place-items-center rounded-2xl text-[#102017]">
                <Headphones size={19} />
              </button>
            }
          />
          <div className="flex-1 space-y-4 px-5 pb-5">
            <SoftCard>
              <h2 className="text-[17px] font-black text-[#121813]">Đơn hàng {orderShortId(order.id)}</h2>
              <span className={`mt-3 inline-flex rounded-lg px-2.5 py-1 text-[11px] font-black ${statusPillClass}`}>{orderStatusText(order)}</span>
              {renderTrackingSyncHint(order)}
              {orderInterrupted ? null : (
                <p className="mt-3 text-[12px] font-semibold text-[#6e7a70]">Thời gian dự kiến: {etaMinutes - 5 > 0 ? `${etaMinutes - 5} - ${etaMinutes}` : etaMinutes} phút</p>
              )}
              {orderInterrupted ? null : (
                <div className="mt-5">
                  <OrderProgress order={order} />
                </div>
              )}
              <div className="mt-5 border-t border-[#edf0e7] pt-5">
                <OrderTimeline order={order} />
              </div>
              {renderClosedOrderActions(order)}
              {renderNotificationPrompt()}
            </SoftCard>

            {orderInterrupted ? (
              <SoftCard>
                <FlowImage src={orderFlowImageSources.cancelled} alt="Đơn dừng xử lý" className="mb-4 h-[150px]" sizes="390px" />
                <h3 className="text-[15px] font-black text-[#121813]">Đơn không tiếp tục xử lý</h3>
                <p className="mt-2 text-[12px] font-semibold leading-5 text-[#6e7a70]">
                  {lifecycle.state === "refunded"
                    ? "Quán đã ghi nhận hoàn tiền cho đơn này. Nếu chưa thấy tiền về tài khoản, bạn có thể liên hệ quán để đối soát."
                    : "Quán chưa thể tiếp tục đơn này. Bạn có thể gọi quán để đổi phương án hoặc đặt lại đơn mới."}
                </p>
              </SoftCard>
            ) : order.fulfillmentType === "DELIVERY" && restaurant.deliveryTrackingEnabled ? (
              <div className="grid gap-3">
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
                {order.deliveryTrackingSnapshot ? (
                  <SoftCard className={`border ${trackingSnapshotToneClass(order.deliveryTrackingSnapshot.state)}`}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-current/20 bg-white/70">
                        <Truck size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-black">{order.deliveryTrackingSnapshot.label}</span>
                        <span className="mt-1 block text-[12px] font-bold leading-5 opacity-85">{order.deliveryTrackingSnapshot.detail}</span>
                      </span>
                    </div>
                  </SoftCard>
                ) : null}
              </div>
            ) : (
              <SoftCard>
                <h3 className="text-[15px] font-black text-[#121813]">Đang chuẩn bị món</h3>
                <p className="mt-2 text-[12px] font-semibold leading-5 text-[#6e7a70]">Quán đang chuẩn bị những món của bạn.</p>
                <FlowImage src={orderFlowImageSources.preparing} alt="Quán đang chuẩn bị món" className="mt-4 h-40" sizes="390px" />
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-black text-[#121813]">{item.menuItem?.name ?? "Món đã đặt"}</span>
                        {item.modifierSummary ? <span className="mt-1 block truncate text-[11px] font-bold text-[#68746b]">{item.modifierSummary}</span> : null}
                        {item.note ? <span className="mt-1 block truncate text-[11px] font-semibold text-[#68746b]">Ghi chú: {item.note}</span> : null}
                      </span>
                      <span className="text-[12px] font-black text-[#111713]">x{item.quantity}</span>
                      <span className="min-w-[72px] text-right text-[12px] font-black text-[#111713]">{formatVnd(item.price)}</span>
                    </div>
                  );
                })}
              </SoftCard>
            </section>
          </div>
          <BottomAction>
            <PrimaryButton onClick={() => setScreen(lifecycle.state === "completed" ? "complete" : "menu")}>
              {lifecycle.state === "completed" ? "Hoàn thành" : "Về trang chủ"}
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
            <FlowImage src={orderFlowImageSources.completed} alt="Đơn hàng hoàn tất" className="mx-auto h-[210px] w-full" sizes="390px" />

            <SoftCard>
              <h2 className="text-[16px] font-black text-[#121813]">{order ? `Đơn hàng ${orderShortId(order.id)}` : "Đơn hàng của bạn"}</h2>
              <span className="mt-3 inline-flex rounded-lg bg-[#edf7ef] px-2.5 py-1 text-[11px] font-black text-[#006b3c]">Hoàn thành</span>
              <p className="mt-3 text-[13px] font-semibold leading-5 text-[#667269]">Cảm ơn bạn đã đặt hàng! Hẹn gặp lại bạn lần sau.</p>
            </SoftCard>

            <SoftCard>
              <p className="text-[13px] font-semibold text-[#667269]">Bạn đánh giá thế nào về đơn hàng?</p>
              <div className="mt-4 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setRating(star)} className="grid h-11 w-11 place-items-center rounded-full text-[#f59f00]">
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
