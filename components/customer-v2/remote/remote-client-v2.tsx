"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Banknote,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Headphones,
  Home,
  MapPin,
  Pencil,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  Truck,
  Utensils,
  WalletCards
} from "lucide-react";
import { CustomerDeliveryLocationPicker } from "@/components/location/customer-delivery-location-picker";
import { RouteMiniMap } from "@/components/customer/route-mini-map";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
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
  resolveModifierSelections,
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
  getOrderProgressLabels
} from "@/lib/customer/order-lifecycle";
import { canMarkCustomerPaid } from "@/lib/customer/payment-gates";
import { getCustomerOrderPollingInterval, hasCustomerOrderSnapshotChanged } from "@/lib/customer/order-sync";
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
import { ShopShell, TopBar, StickyCartBar } from "../shell/shop-shell";
import { ShopButton } from "../ui/button";
import { Card, Money, Pill, QtyStepper, MoneyRow, SectionLabel, EmptyState, SegmentedTabs, CustomerMenuGrid, CustomerMenuCard, CustomerDealStrip, CustomerStickyActions, CustomerStatusHero } from "../ui/primitives";
import { ModifierSheet, type CustomizingItem } from "../dine-in/modifier-sheet";

type FulfillmentMode = RemoteFulfillmentMode;
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

type MenuItemWithCategory = PublicMenuItem & { categoryName: string };

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
  if (typeof window === "undefined") return { customerName: "", customerPhone: "", deliveryAddress: "" };
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
function flattenItems(categories: PublicMenuCategory[]): MenuItemWithCategory[] {
  return categories.flatMap((category) => category.items.map((item) => ({ ...item, categoryName: category.name })));
}
function hasMenuModifiers(item: Pick<PublicMenuItem, "modifierGroups">) {
  return item.modifierGroups?.some((group) => group.options.length > 0) ?? false;
}
function isRemoteOrderClosed(order: OrderDto) {
  return getCustomerOrderLifecycle(order).isClosed;
}
function orderShortId(orderId: string) {
  return `#OD${orderId.replace(/-/g, "").slice(0, 9).toUpperCase()}`;
}
function formatCountdown(seconds: number) {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function getInitialNotificationPermission(): OrderNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

export function RemoteClientV2({ restaurant, categories }: { restaurant: RemoteRestaurant; categories: PublicMenuCategory[] }) {
  const allItems = useMemo(() => flattenItems(categories), [categories]);
  const [screen, setScreen] = useState<RemoteCheckoutScreen>("menu");
  const { activeCategory, searchQuery, setActiveCategory, setSearchQuery, visibleItems } = useRemoteMenuBrowser(allItems);
  const [mode, setMode] = useState<FulfillmentMode>(restaurant.deliveryEnabled ? "DELIVERY" : "PICKUP");
  const defaultPickupBranchId = useMemo(
    () => restaurant.branches.find((b) => b.isPrimary)?.id ?? restaurant.branches[0]?.id ?? "",
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
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState<CustomizingItem | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<OrderNotificationPermission>(() => getInitialNotificationPermission());
  const [networkOnline, setNetworkOnline] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
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
  const toastTimerRef = useRef<number | null>(null);
  const trackedOrderRef = useRef<OrderDto | null>(null);
  const notifyOrderUpdateRef = useRef<(order: OrderDto) => void>(() => undefined);
  const pendingOrderStorageKey = useMemo(() => pendingOrderIdempotencyStorageKey("remote", restaurant.id), [restaurant.id]);

  const { customerName, customerPhone, deliveryAddress, deliveryLat, deliveryLng } = customerProfile;

  function resolveCartLineModifiers(line: RemoteCartLine & { item: MenuItemWithCategory }) {
    return resolveModifierSelections(line.item.modifierGroups ?? [], line.modifiers ?? [], { basePrice: line.item.price });
  }
  function cartLineUnitPrice(line: RemoteCartLine & { item: MenuItemWithCategory }) {
    const resolved = resolveCartLineModifiers(line);
    return line.item.price + (resolved.ok ? resolved.totalDelta : 0);
  }
  function modifierSummaryText(line: RemoteCartLine & { item: MenuItemWithCategory }) {
    const resolved = resolveCartLineModifiers(line);
    if (!resolved.ok || resolved.selections.length === 0) return "";
    return resolved.selections.map((s) => `${s.optionName}${s.quantity > 1 ? ` x${s.quantity}` : ""}`).join(", ");
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
  const selectedPromotion = useMemo(() => findPublicPromotionByCode(restaurant.promotions, promotionCode), [promotionCode, restaurant.promotions]);
  const deliveryFee = mode === "DELIVERY" ? currentQuote?.fee ?? 0 : 0;
  const serviceFee = mode === "DELIVERY" ? currentQuote?.serviceFee ?? calculateClientServiceFee(restaurant, subtotal) : calculateClientServiceFee(restaurant, subtotal);
  const selectedPickupBranch = useMemo(
    () => restaurant.branches.find((b) => b.id === selectedPickupBranchId) ?? restaurant.branches.find((b) => b.isPrimary) ?? restaurant.branches[0] ?? null,
    [restaurant.branches, selectedPickupBranchId]
  );
  const promotionEvaluation = useMemo(
    () => evaluatePublicPromotion({ itemSubtotal: subtotal, deliveryFee, promotion: selectedPromotion }),
    [deliveryFee, selectedPromotion, subtotal]
  );
  const previewDiscount = promotionEvaluation.discountAmount;
  const normalizedPromotionCode = normalizePromotionCode(promotionCode);
  const effectivePromotionCode = selectedPromotion ? (promotionEvaluation.eligible ? selectedPromotion.code : "") : normalizedPromotionCode;
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

  function notify(message: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }
  function notifyOrderUpdate(order: OrderDto) {
    const message = orderStatusText(order);
    notify(message);
    if (typeof window === "undefined" || !("Notification" in window) || window.Notification.permission !== "granted") return;
    try {
      new window.Notification(`${restaurant.name} · ${orderShortId(order.id)}`, { body: message, tag: `logivn-order-${order.id}`, icon: restaurant.logoUrl ?? undefined });
    } catch {
      // toast already shown
    }
  }
  async function requestOrderNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      notify("Trình duyệt này chưa hỗ trợ thông báo đơn hàng.");
      return;
    }
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    notify(permission === "granted" ? "Đã bật thông báo đơn hàng." : "Bạn vẫn có thể theo dõi đơn trong trang này.");
  }
  function updateCustomerProfile(patch: Partial<RemoteCustomerProfile>) {
    setCustomerProfile((current) => ({ ...current, ...patch }));
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
      setCourierLocations((current) => ({ ...current, [next.order.id]: next.order.deliveryCourierLocation! }));
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
      const params = new URLSearchParams({ restaurantSlug: restaurant.slug, customerSessionId: sessionId });
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
        body: JSON.stringify({ subtotal, deliveryAddress: deliveryAddress.trim(), deliveryLat, deliveryLng })
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
        quoteRetryStateRef.current = { fingerprint: requestFingerprint, attempts: quoteRetryStateRef.current.attempts + 1 };
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
    try {
      const params = new URLSearchParams({ restaurantSlug: restaurant.slug, customerSessionId: sessionId });
      const response = await fetch(`/api/remote-orders/history?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tải được lịch sử đơn online");
      const orders = json.data.orders as CreatedRemoteOrder[];
      setHistory(orders);
      setLastOrderSyncAt(Date.now());
      setTrackingPollError(false);
      setCreated((current) => (current ? orders.find((entry) => entry.order.id === current.order.id) ?? current : current));
    } catch {
      setTrackingPollError(Boolean(trackedOrderRef.current));
    }
  }, [restaurant.slug, sessionId]);

  useEffect(() => {
    if (quoteTimerRef.current) window.clearTimeout(quoteTimerRef.current);
    quoteTimerRef.current = window.setTimeout(() => void loadQuote(), 450);
    return () => {
      if (quoteTimerRef.current) window.clearTimeout(quoteTimerRef.current);
    };
  }, [loadQuote]);

  useEffect(() => () => quoteAbortRef.current?.abort(), []);
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (quoteRetryTimerRef.current) window.clearTimeout(quoteRetryTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const update = () => setNetworkOnline(window.navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    update();
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
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
    const warmup = window.setTimeout(() => void poll(), 1200);
    const interval = window.setInterval(() => void poll(), trackingPollingInterval);
    return () => {
      cancelled = true;
      window.clearTimeout(warmup);
      window.clearInterval(interval);
    };
  }, [fetchTrackedOrderSnapshot, trackedOrder?.id, trackingPollingInterval]);
  useEffect(() => {
    if (screen !== "vietqr") return;
    const timer = window.setInterval(() => setQrSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screen, activeEntry?.order.id]);

  useEffect(() => {
    const orderId = trackedOrder?.id;
    if (!orderId) return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`customer-order:${orderId}`)
      .on("broadcast", { event: "order_status" }, (payload) => {
        const next = payload.payload as {
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
        if (!next.status) return;
        const patch = (order: OrderDto): OrderDto => ({
          ...order,
          status: next.status!,
          paymentStatus: next.payment_status ?? order.paymentStatus,
          paymentMethod: next.payment_method ?? order.paymentMethod,
          total: next.total ?? order.total,
          paidAt: next.paid_at ?? order.paidAt,
          updatedAt: next.updated_at ?? order.updatedAt,
          deliveryStatus: next.delivery_status ?? order.deliveryStatus,
          deliveryDistanceKm: next.delivery_distance_km ?? order.deliveryDistanceKm,
          deliveryFee: next.delivery_fee ?? order.deliveryFee,
          serviceFee: next.service_fee ?? order.serviceFee,
          deliveryRouteDurationMinutes: next.delivery_route_duration_minutes ?? order.deliveryRouteDurationMinutes,
          deliveryTrackingUpdatedAt: next.delivery_tracking_updated_at ?? order.deliveryTrackingUpdatedAt
        });
        const previousOrder = trackedOrderRef.current;
        const patchedOrder = previousOrder?.id === orderId ? patch(previousOrder) : null;
        setCreated((current) => (current && current.order.id === orderId ? { ...current, order: patch(current.order) } : current));
        setHistory((current) => current.map((entry) => (entry.order.id === orderId ? { ...entry, order: patch(entry.order) } : entry)));
        setLastOrderSyncAt(Date.now());
        setTrackingPollError(false);
        if (
          previousOrder &&
          patchedOrder &&
          (previousOrder.status !== patchedOrder.status || previousOrder.paymentStatus !== patchedOrder.paymentStatus || previousOrder.deliveryStatus !== patchedOrder.deliveryStatus)
        ) {
          trackedOrderRef.current = patchedOrder;
          notifyOrderUpdateRef.current(patchedOrder);
        }
      })
      .on("broadcast", { event: "delivery_tracking" }, (payload) => {
        const next = payload.payload as {
          order_id?: string;
          latitude?: number | null;
          longitude?: number | null;
          accuracy_meters?: number | null;
          heading_degrees?: number | null;
          speed_mps?: number | null;
          created_at?: string | null;
          delivery_status?: OrderDto["deliveryStatus"] | null;
        };
        if (next.order_id !== orderId) return;
        if (typeof next.latitude === "number" && typeof next.longitude === "number") {
          setCourierLocations((current) => ({
            ...current,
            [orderId]: {
              lat: next.latitude!,
              lng: next.longitude!,
              accuracyMeters: next.accuracy_meters ?? null,
              headingDegrees: next.heading_degrees ?? null,
              speedMps: next.speed_mps ?? null,
              capturedAt: next.created_at ?? null
            }
          }));
        }
        if (next.delivery_status) {
          const patchDelivery = (order: OrderDto): OrderDto => ({
            ...order,
            deliveryStatus: next.delivery_status ?? order.deliveryStatus,
            deliveryTrackingUpdatedAt: next.created_at ?? order.deliveryTrackingUpdatedAt
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
      setCustomizing({ item, selections: defaultModifierSelectionsForGroups(item.modifierGroups ?? []), quantity: 1, note: "" });
      setError(null);
      return;
    }
    setCart((current) => updateRemoteCartQuantity(current, item.id, 1));
    notify(`Đã thêm ${item.name} vào giỏ.`);
  }
  function confirmCustomItem() {
    if (!customizing) return;
    const resolution = resolveModifierSelections(customizing.item.modifierGroups ?? [], customizing.selections, { basePrice: customizing.item.price });
    if (!resolution.ok) {
      setError(resolution.errors[0] ?? "Vui lòng chọn đủ tùy chọn cho món.");
      return;
    }
    setCart((current) => addRemoteCartLine(current, { itemId: customizing.item.id, quantity: customizing.quantity, note: customizing.note, modifiers: customizing.selections }));
    notify(`Đã thêm ${customizing.item.name} vào giỏ.`);
    setCustomizing(null);
    setError(null);
  }
  function applyCheckoutTransition(action: RemoteCheckoutAction) {
    const next = remoteCheckoutReducer({ screen, error: null }, action);
    setError(next.error);
    setScreen(next.screen);
    return next;
  }
  function validateCartBasics() {
    const validation = validateRemoteCheckoutBasics({ cartLineCount: cartLines.length, customerName, customerPhone });
    setError(validation.ok ? null : validation.error);
    return validation.ok;
  }
  function continueFromCart() {
    if (!validateCartBasics()) return;
    applyCheckoutTransition({ type: "CONTINUE_FROM_CART", mode });
  }
  function continueFromDelivery() {
    applyCheckoutTransition({ type: "CONTINUE_FROM_DELIVERY", mode, quoteAccepted: deliveryQuoteState.accepted, quoteError: deliveryQuoteState.message });
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
      { type: "REQUIRE_DELIVERY_QUOTE", mode, quoteAccepted: deliveryQuoteState.accepted, quoteError: deliveryQuoteState.message }
    );
    if (quoteGate.error) {
      setError(quoteGate.error);
      setScreen(quoteGate.screen);
      return;
    }
    if (selectedPromotion && !promotionEvaluation.eligible) {
      setError(promotionEligibilityMessage({ promotion: selectedPromotion, itemSubtotal: subtotal, deliveryFee, isDeliveryMode: mode === "DELIVERY" }));
      setScreen("cart");
      return;
    }
    const selectedPaymentMethod = paymentChoice === "vietqr" ? "QR" : "CASH";
    const orderFingerprint = JSON.stringify({
      mode,
      branchId: mode === "PICKUP" ? selectedPickupBranch?.id ?? selectedPickupBranchId : "",
      paymentMethod: selectedPaymentMethod,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: mode === "DELIVERY" ? deliveryAddress.trim() : "",
      deliveryLat: mode === "DELIVERY" ? deliveryLat ?? null : null,
      deliveryLng: mode === "DELIVERY" ? deliveryLng ?? null : null,
      customerNote: customerNote.trim(),
      promotionCode: effectivePromotionCode,
      items: cartLines.map((line) => ({ id: line.lineId, menuItemId: line.itemId, quantity: line.quantity, note: line.note?.trim() ?? "", modifiers: line.modifiers ?? [] }))
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
      const existing = pendingCreateRequestRef.current;
      idempotencyKey = existing?.fingerprint === orderFingerprint ? existing.idempotencyKey : globalThis.crypto.randomUUID();
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
          paymentMethod: selectedPaymentMethod,
          deliveryAddress: deliveryAddress.trim(),
          deliveryLat,
          deliveryLng,
          idempotencyKey,
          items: cartLines.map((line) => ({ menuItemId: line.itemId, quantity: line.quantity, note: line.note, modifiers: line.modifiers }))
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
        // ignore
      }
      setCart({});
      const nextCheckout = remoteCheckoutReducer({ screen, error: null }, { type: "ORDER_SUBMITTED", paymentMethod: next.payment?.method, requiresPrepaidQr });
      if (nextCheckout.screen === "vietqr") setQrSecondsLeft(10 * 60);
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
        body: JSON.stringify({ restaurantSlug: restaurant.slug, customerSessionId: sessionId })
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
    notify("Quán chưa có hotline hỗ trợ.");
    setError("Quán chưa cấu hình hotline. Bạn vui lòng ghi chú trong đơn để quán hỗ trợ.");
  }

  function modifiersMatch(a?: Array<{ groupId: string; optionId: string }>, b?: Array<{ groupId: string; optionId: string }>) {
    const listA = a || [];
    const listB = b || [];
    if (listA.length !== listB.length) return false;
    return listA.every((selA) => listB.some((selB) => selB.groupId === selA.groupId && selB.optionId === selA.optionId));
  }

  function handleAgentAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.href = action.href;
      return;
    }
    if (action.uiTarget === "add_item_to_cart" || action.uiTarget === "add_item") {
      const body = action.body as { menuItemId?: string; categoryId?: string; quantity?: number; note?: string; modifiers?: Array<{ groupId: string; optionId: string; quantity?: number }> } | undefined;
      if (!body?.menuItemId) return;
      const menuItem = allItems.find((item) => item.id === body.menuItemId);
      if (!menuItem) return;
      const selections = body.modifiers ?? [];
      const resolution = resolveModifierSelections(menuItem.modifierGroups ?? [], selections, { basePrice: menuItem.price });
      if (!resolution.ok) {
        setCustomizing({ item: menuItem, selections: defaultModifierSelectionsForGroups(menuItem.modifierGroups ?? []), quantity: body.quantity ?? 1, note: body.note ?? "" });
        setError(null);
        return;
      }
      setCart((current) => addRemoteCartLine(current, { itemId: menuItem.id, quantity: body.quantity ?? 1, note: body.note, modifiers: selections }));
      if (body.categoryId) setActiveCategory(body.categoryId);
      notify(`Đã thêm ${menuItem.name} vào giỏ.`);
      setScreen((current) => (current === "payment" || current === "vietqr" ? "menu" : current));
      setError(null);
      return;
    }
    if (action.uiTarget === "remove_item_from_cart") {
      const body = action.body as { menuItemId?: string; quantity?: number; modifiers?: Array<{ groupId: string; optionId: string }> } | undefined;
      if (!body?.menuItemId) return;
      const matching = cartLines.filter((line) => line.itemId === body.menuItemId && (body.modifiers ? modifiersMatch(line.modifiers, body.modifiers) : true));
      if (matching.length === 0) return;
      const qtyToRemove = body.quantity ?? 1;
      let removed = 0;
      setCart((current) => {
        let updated = { ...current };
        for (const line of matching) {
          if (removed >= qtyToRemove) break;
          if (!body.quantity) {
            delete updated[line.lineId];
            removed += line.quantity;
          } else {
            const toDec = Math.min(line.quantity, qtyToRemove - removed);
            updated = updateRemoteCartQuantity(updated, line.lineId, -toDec);
            removed += toDec;
          }
        }
        return updated;
      });
      notify("Đã cập nhật giỏ hàng.");
      return;
    }
    if (action.uiTarget === "clear_cart") {
      setCart({});
      notify("Đã xóa toàn bộ giỏ hàng.");
      return;
    }
    if (action.uiTarget === "menu_category") {
      const body = action.body as { categoryId?: string } | undefined;
      if (body?.categoryId) setActiveCategory(body.categoryId);
      setScreen("menu");
      return;
    }
    if (action.uiTarget === "menu") {
      setScreen("menu");
      return;
    }
    if (action.uiTarget === "cart") {
      setScreen("cart");
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
        const orderForGate = trackedOrder ?? activeEntry?.order;
        if (canMarkCustomerPaid(orderForGate)) void markRemotePaid();
        else if (activeEntry?.payment?.method === "QR") setScreen("vietqr");
        else setScreen(activeEntry ? "tracking" : "payment");
        return;
      }
      if (activeEntry?.payment?.method === "QR") {
        setScreen("vietqr");
        return;
      }
      setScreen(activeEntry ? "tracking" : "payment");
      return;
    }
    if (action.uiTarget === "staff_call") openRestaurantSupport();
  }

  const viewProps: RemoteViewProps = {
    restaurant,
    categories,
    allItems,
    screen,
    setScreen,
    mode,
    setMode,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    visibleItems,
    cartLines,
    cartItemCount,
    subtotal,
    deliveryFee,
    serviceFee,
    previewDiscount,
    total,
    loyaltyPoints,
    etaMinutes,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    updateCustomerProfile,
    customerNote,
    setCustomerNote,
    promotionCode,
    setPromotionCode,
    selectedPromotion,
    selectedPickupBranch,
    selectedPickupBranchId,
    setSelectedPickupBranchId,
    paymentChoice,
    setPaymentChoice,
    requiresPrepaidQr,
    restaurantPoint,
    currentQuote,
    currentQuoteError,
    currentQuoteInsight,
    quoteFreshnessLabel,
    deliveryQuoteState,
    loadingQuote,
    loadQuote,
    networkOnline,
    notificationPermission,
    requestOrderNotifications,
    submitting,
    error,
    toast,
    activeEntry,
    trackedOrder,
    courierLocations,
    trackingPollError,
    lastOrderSyncAt,
    pageVisible,
    trackingPollingInterval,
    rating,
    setRating,
    qrSecondsLeft,
    canReorder,
    customizing,
    setCustomizing,
    confirmCustomItem,
    addMenuItem,
    updateQuantity,
    updateItemNote,
    cartLineUnitPrice,
    modifierSummaryText,
    continueFromCart,
    continueFromDelivery,
    submitOrder,
    markRemotePaid,
    reorderLastOrder,
    openRestaurantSupport,
    handleAgentAction,
    sessionId
  };

  return <RemoteView {...viewProps} />;
}

type RemoteCartLineView = RemoteCartLine & { lineId: string; item: MenuItemWithCategory };

type RemoteViewProps = {
  restaurant: RemoteRestaurant;
  categories: PublicMenuCategory[];
  allItems: MenuItemWithCategory[];
  screen: RemoteCheckoutScreen;
  setScreen: (s: RemoteCheckoutScreen) => void;
  mode: FulfillmentMode;
  setMode: (m: FulfillmentMode) => void;
  activeCategory: string;
  setActiveCategory: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  visibleItems: MenuItemWithCategory[];
  cartLines: RemoteCartLineView[];
  cartItemCount: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  previewDiscount: number;
  total: number;
  loyaltyPoints: number;
  etaMinutes: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  updateCustomerProfile: (patch: Partial<RemoteCustomerProfile>) => void;
  customerNote: string;
  setCustomerNote: (v: string) => void;
  promotionCode: string;
  setPromotionCode: (v: string) => void;
  selectedPromotion: PublicPromotion | null | undefined;
  selectedPickupBranch: PublicStoreBranch | null;
  selectedPickupBranchId: string;
  setSelectedPickupBranchId: (id: string) => void;
  paymentChoice: PaymentChoice;
  setPaymentChoice: (c: PaymentChoice) => void;
  requiresPrepaidQr: boolean;
  restaurantPoint: { lat: number; lng: number } | null;
  currentQuote: DeliveryQuote | null;
  currentQuoteError: string | null;
  currentQuoteInsight: ReturnType<typeof resolveDeliveryQuoteCustomerInsight>;
  quoteFreshnessLabel: string | null;
  deliveryQuoteState: ReturnType<typeof resolveDeliveryQuoteCheckoutState>;
  loadingQuote: boolean;
  loadQuote: () => Promise<void>;
  networkOnline: boolean;
  notificationPermission: OrderNotificationPermission;
  requestOrderNotifications: () => void;
  submitting: boolean;
  error: string | null;
  toast: string | null;
  activeEntry: CreatedRemoteOrder | null;
  trackedOrder: OrderDto | null;
  courierLocations: Record<string, CourierLiveLocation>;
  trackingPollError: boolean;
  lastOrderSyncAt: number | null;
  pageVisible: boolean;
  trackingPollingInterval: number | null;
  rating: number;
  setRating: (n: number) => void;
  qrSecondsLeft: number;
  canReorder: boolean;
  customizing: CustomizingItem | null;
  setCustomizing: (v: CustomizingItem | null) => void;
  confirmCustomItem: () => void;
  addMenuItem: (item: MenuItemWithCategory) => void;
  updateQuantity: (lineId: string, delta: number) => void;
  updateItemNote: (lineId: string, note: string) => void;
  cartLineUnitPrice: (line: RemoteCartLineView) => number;
  modifierSummaryText: (line: RemoteCartLineView) => string;
  continueFromCart: () => void;
  continueFromDelivery: () => void;
  submitOrder: () => void;
  markRemotePaid: () => void;
  reorderLastOrder: () => void;
  openRestaurantSupport: () => void;
  handleAgentAction: (action: AiAgentAction) => void;
  sessionId: string;
};

function insightToneClass(tone: "green" | "yellow" | "red" | "neutral") {
  if (tone === "green") return "border-[var(--ok-fg)]/25 bg-[var(--ok-bg)] text-[var(--ok-fg)]";
  if (tone === "red") return "border-[var(--danger-fg)]/25 bg-[var(--danger-bg)] text-[var(--danger-fg)]";
  if (tone === "yellow") return "border-[var(--warn-fg)]/25 bg-[var(--warn-bg)] text-[var(--warn-fg)]";
  return "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]";
}

function ItemThumb({ src, alt, size = 64 }: { src?: string | null; alt: string; size?: number }) {
  if (src) return <Image src={src} alt={alt} width={size} height={size} sizes={`${size}px`} className="h-full w-full object-cover" />;
  return (
    <div className="grid h-full w-full place-items-center bg-[var(--primary-soft)] text-[var(--jade)]">
      <Utensils size={Math.round(size / 2.6)} />
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-[var(--r-md)] border border-[var(--danger-fg)]/30 bg-[var(--danger-bg)] px-3 py-2.5 text-[length:var(--fs-xs)] font-semibold text-[var(--danger-fg)]">
      {children}
    </p>
  );
}

function RemoteTimeline({ order }: { order: OrderDto }) {
  const items = getCustomerOrderTimeline(order);
  return (
    <ol className="shop-stagger grid grid-cols-1">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const dot =
          item.blocked
            ? "border-[var(--danger-fg)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
            : item.done
              ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]"
              : item.current
                ? "border-[var(--jade)] bg-[var(--surface)] text-[var(--jade)]"
                : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-faint)]";
        return (
          <li key={item.key} className="grid grid-cols-[28px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[length:var(--fs-2xs)] font-bold ${dot}`}>
                {item.done ? "✓" : index + 1}
              </span>
              {!last ? <span className={`w-0.5 flex-1 ${item.done ? "bg-[var(--jade)]" : "bg-[var(--line)]"}`} /> : null}
            </div>
            <div className={last ? "" : "pb-4"}>
              <p className={`text-[length:var(--fs-sm)] font-semibold ${item.blocked ? "text-[var(--danger-fg)]" : item.done || item.current ? "text-[var(--text)]" : "text-[var(--text-faint)]"}`}>
                {item.label}
              </p>
              <p className="mt-0.5 text-[length:var(--fs-xs)] leading-[var(--lh-body)] text-[var(--text-muted)]">{item.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OrderProgress({ order }: { order?: OrderDto | null }) {
  const labels = getOrderProgressLabels(order?.fulfillmentType);
  const activeIndex = order ? getCustomerOrderLifecycle(order).stepIndex : 0;
  return (
    <div className="grid grid-cols-4 gap-1">
      {labels.map((label, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <div key={label} className="flex flex-col items-center gap-1.5 text-center">
            <span className={`grid h-8 w-8 place-items-center rounded-full border-2 text-[length:var(--fs-2xs)] font-bold ${done || active ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-faint)]"}`}>
              {done ? "✓" : index + 1}
            </span>
            <span className={`text-[length:var(--fs-2xs)] font-semibold leading-tight ${done || active ? "text-[var(--jade)]" : "text-[var(--text-faint)]"}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RemoteView(props: RemoteViewProps) {
  const {
    restaurant, categories, allItems, screen, setScreen, mode, setMode, activeCategory, setActiveCategory,
    searchQuery, setSearchQuery, visibleItems, cartLines, cartItemCount, subtotal, deliveryFee, serviceFee,
    previewDiscount, total, loyaltyPoints, etaMinutes, customerName, customerPhone, deliveryAddress, deliveryLat,
    deliveryLng, updateCustomerProfile, customerNote, setCustomerNote, promotionCode, setPromotionCode,
    selectedPromotion, selectedPickupBranch, selectedPickupBranchId, setSelectedPickupBranchId, paymentChoice,
    setPaymentChoice, requiresPrepaidQr, restaurantPoint, currentQuote, currentQuoteError, currentQuoteInsight,
    quoteFreshnessLabel, deliveryQuoteState, loadingQuote, loadQuote, networkOnline, notificationPermission,
    requestOrderNotifications, submitting, error, toast, activeEntry, trackedOrder, courierLocations,
    trackingPollError, lastOrderSyncAt, pageVisible, trackingPollingInterval, rating, setRating, qrSecondsLeft,
    canReorder, customizing, setCustomizing, confirmCustomItem, addMenuItem, updateQuantity, updateItemNote,
    cartLineUnitPrice, modifierSummaryText, continueFromCart, continueFromDelivery, submitOrder, markRemotePaid,
    reorderLastOrder, openRestaurantSupport, handleAgentAction, sessionId
  } = props;

  const showModeToggle = restaurant.deliveryEnabled && restaurant.pickupEnabled;

  function StickyActions({ children }: { children: React.ReactNode }) {
    return <CustomerStickyActions>{children}</CustomerStickyActions>;
  }

  function renderMenu() {
    return (
      <>
        <TopBar
          title={restaurant.name}
          subtitle={
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} className="text-[var(--orange)]" />
              {currentQuote?.distanceKm ? `Cách bạn ${currentQuote.distanceKm} km` : `Bán kính ${restaurant.deliveryRadiusKm} km`} · {etaMinutes} phút
            </span>
          }
          logoUrl={restaurant.logoUrl}
          right={
            <button type="button" onClick={() => activeEntry && setScreen("tracking")} aria-label="Theo dõi đơn" className="relative grid h-10 w-10 place-items-center rounded-full text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-90">
              <Bell size={20} />
              {activeEntry ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
            </button>
          }
        />

        <div className="flex-1">
          <div className="px-4 pt-3">
            {showModeToggle ? (
              <SegmentedTabs
                ariaLabel="Hình thức nhận"
                value={mode}
                onChange={(m) => setMode(m)}
                options={[
                  { value: "DELIVERY", label: "Giao hàng", icon: <Truck size={15} />, disabled: !restaurant.deliveryEnabled },
                  { value: "PICKUP", label: "Đến lấy", icon: <Store size={15} />, disabled: !restaurant.pickupEnabled }
                ]}
              />
            ) : null}
          </div>

          <div className="sticky top-[calc(var(--topbar-h)+var(--safe-top))] z-[var(--z-topbar)] border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 pb-3 pt-3 backdrop-blur-md">
            <label className="relative block">
              <span className="sr-only">Tìm món trong menu</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={18} />
              <input
                type="search"
                name="menuSearch"
                inputMode="search"
                autoComplete="off"
                aria-label="Tìm món trong menu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm món: cà phê, trà sữa..."
                className="h-11 w-full rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] pl-10 pr-4 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]"
              />
            </label>
            <div className="shop-no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              <CategoryPill active={activeCategory === "all"} onClick={() => setActiveCategory("all")}>Tất cả</CategoryPill>
              {categories.map((category) => (
                <CategoryPill key={category.id} active={activeCategory === category.id} onClick={() => setActiveCategory(category.id)}>
                  {category.name}
                </CategoryPill>
              ))}
            </div>
          </div>

          <div className="px-4 py-4 shop-screen-in">
            {restaurant.promotions[0] ? (
              <CustomerDealStrip className="mb-4" title="Ưu đãi hôm nay" description={promotionDescription(restaurant.promotions[0])} onClick={() => setScreen("cart")} />
            ) : null}

            {visibleItems.length === 0 ? (
              <EmptyState icon={<Search size={22} />} title="Không tìm thấy món" description="Thử từ khóa hoặc danh mục khác nhé." />
            ) : (
              <CustomerMenuGrid>
                {visibleItems.map((item) => (
                  <MenuRow key={item.id} item={item} cartLines={cartLines} onAdd={addMenuItem} onDec={(lineId) => updateQuantity(lineId, -1)} onInc={(lineId) => updateQuantity(lineId, 1)} />
                ))}
              </CustomerMenuGrid>
            )}
          </div>
        </div>

        {cartItemCount > 0 ? (
          <StickyCartBar count={cartItemCount} total={total} label="Xem giỏ hàng" onClick={() => setScreen("cart")} />
        ) : activeEntry ? (
          <StickyActions>
            <ShopButton size="lg" fullWidth variant="secondary" leftIcon={<Bell size={18} />} onClick={() => setScreen("tracking")}>
              Theo dõi đơn · {orderStatusText(activeEntry.order)}
            </ShopButton>
          </StickyActions>
        ) : null}
      </>
    );
  }

  function renderPromoList() {
    if (restaurant.promotions.length === 0) return null;
    return (
      <Card className="grid gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">Mã ưu đãi</h2>
            <p className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--text-muted)]">Áp dụng cho đặt online</p>
          </div>
          {previewDiscount > 0 ? <Pill tone="ok">-{formatVnd(previewDiscount)}</Pill> : null}
        </div>
        <div className="grid gap-2">
          {restaurant.promotions.slice(0, 4).map((promotion) => {
            const selected = selectedPromotion?.id === promotion.id;
            const evaluation = evaluatePublicPromotion({ itemSubtotal: subtotal, deliveryFee, promotion });
            return (
              <button
                key={promotion.id}
                type="button"
                onClick={() => setPromotionCode(selected ? "" : promotion.code)}
                className={`rounded-[var(--r-md)] border px-3 py-2.5 text-left ${selected ? "border-[var(--jade)] bg-[var(--primary-soft)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[length:var(--fs-sm)] font-bold text-[var(--text)]">{promotion.code}</span>
                  <span className={`text-[length:var(--fs-xs)] font-bold ${selected ? "text-[var(--jade)]" : "text-[var(--text-muted)]"}`}>
                    {selected ? "Đã chọn" : evaluation.eligible ? `-${formatVnd(evaluation.discountAmount)}` : "Chọn"}
                  </span>
                </span>
                <span className="mt-1 block text-[length:var(--fs-xs)] text-[var(--text-muted)]">{promotionDescription(promotion)}</span>
              </button>
            );
          })}
        </div>
      </Card>
    );
  }

  function renderBranchSelector() {
    if (mode !== "PICKUP" || restaurant.branches.length === 0) return null;
    if (restaurant.branches.length === 1) {
      const branch = selectedPickupBranch ?? restaurant.branches[0];
      return (
        <Card className="flex items-start gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--primary-soft)] text-[var(--jade)]"><Store size={18} /></span>
          <span className="min-w-0">
            <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--text)]">Nhận tại {branch?.name ?? restaurant.name}</span>
            <span className="mt-0.5 block truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{branch?.address ?? restaurant.address ?? "Tại cửa hàng"}</span>
          </span>
        </Card>
      );
    }
    return (
      <Card className="grid gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">Chi nhánh nhận món</h2>
            <p className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--text-muted)]">Dự kiến {etaMinutes} phút</p>
          </div>
          <Store size={18} className="text-[var(--jade)]" />
        </div>
        <div className="grid gap-2">
          {restaurant.branches.map((branch) => {
            const selected = branch.id === (selectedPickupBranch?.id ?? selectedPickupBranchId);
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => setSelectedPickupBranchId(branch.id)}
                className={`flex items-start gap-3 rounded-[var(--r-md)] border px-3 py-2.5 text-left ${selected ? "border-[var(--jade)] bg-[var(--primary-soft)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
              >
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] ${selected ? "bg-[var(--jade)] text-[var(--on-jade)]" : "bg-[var(--surface-2)] text-[var(--jade)]"}`}><MapPin size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[length:var(--fs-sm)] font-bold text-[var(--text)]">{branch.name}</span>
                    {branch.isPrimary ? <Pill tone="orange">Chính</Pill> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{branch.address ?? "Tại cửa hàng"}</span>
                </span>
                <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line-strong)] text-transparent"}`}><Check size={12} /></span>
              </button>
            );
          })}
        </div>
      </Card>
    );
  }

  function renderSummary(showHeader = true) {
    const summaryDiscount = cartLines.length > 0 ? previewDiscount : activeEntry?.order.discountAmount ?? 0;
    const summaryTotal = cartLines.length > 0 ? total : activeEntry?.order.total ?? 0;
    return (
      <Card className="grid gap-2.5 p-4">
        {showHeader ? (
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">{activeEntry ? `Đơn ${orderShortId(activeEntry.order.id)}` : "Đơn của bạn"}</h2>
            <button type="button" onClick={() => setScreen("cart")} className="inline-flex items-center gap-0.5 text-[length:var(--fs-xs)] font-bold text-[var(--jade)]">
              Chi tiết <ChevronRight size={14} />
            </button>
          </div>
        ) : null}
        <MoneyRow label="Tạm tính" value={<Money value={subtotal || activeEntry?.order.subtotal || 0} />} />
        {serviceFee > 0 ? <MoneyRow label={`Phí dịch vụ (${restaurant.serviceFeePercent || 0}%)`} value={<Money value={serviceFee} />} /> : null}
        <MoneyRow label="Phí giao hàng" value={<Money value={deliveryFee || activeEntry?.order.deliveryFee || 0} />} />
        {summaryDiscount > 0 ? <MoneyRow label="Ưu đãi" value={`-${formatVnd(summaryDiscount)}`} tone="accent" /> : null}
        <div className="border-t border-[var(--line)] pt-2.5">
          <MoneyRow label="Tổng cộng" value={<Money value={summaryTotal} />} strong />
        </div>
      </Card>
    );
  }

  function renderNotificationPrompt() {
    if (notificationPermission === "unsupported") return null;
    if (notificationPermission === "granted") {
      return (
        <p className="mt-3 inline-flex items-center justify-center gap-2 rounded-[var(--r-pill)] bg-[var(--primary-soft)] px-3 py-2 text-[length:var(--fs-xs)] font-bold text-[var(--jade)]">
          <Bell size={15} /> Thông báo đơn hàng đã bật
        </p>
      );
    }
    if (notificationPermission === "denied") {
      return <p className="mt-3 text-[length:var(--fs-xs)] text-[var(--text-muted)]">Trình duyệt đang chặn thông báo. Bạn vẫn theo dõi realtime trong trang này.</p>;
    }
    return (
      <ShopButton size="md" variant="secondary" className="mt-3" leftIcon={<Bell size={15} />} onClick={requestOrderNotifications}>
        Bật thông báo đơn hàng
      </ShopButton>
    );
  }

  function renderCart() {
    return (
      <>
        <TopBar title="Giỏ hàng" onBack={() => setScreen("menu")} />
        <div className="flex-1 px-4 py-4 shop-screen-in">
          <div className="grid gap-4">
            <div className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 py-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--orange)] text-white"><Star size={16} /></span>
              <span>
                <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--text)]">Bạn sẽ tích {loyaltyPoints} điểm</span>
                <span className="block text-[length:var(--fs-xs)] text-[var(--text-muted)]">100 điểm = 10.000đ</span>
              </span>
            </div>

            {showModeToggle ? (
              <SegmentedTabs
                ariaLabel="Hình thức nhận"
                value={mode}
                onChange={(m) => setMode(m)}
                options={[
                  { value: "DELIVERY", label: "Giao hàng", icon: <Truck size={15} />, disabled: !restaurant.deliveryEnabled },
                  { value: "PICKUP", label: "Đến lấy", icon: <Store size={15} />, disabled: !restaurant.pickupEnabled }
                ]}
              />
            ) : null}

            {renderBranchSelector()}
            {renderPromoList()}

            {cartLines.length === 0 ? (
              <EmptyState icon={<ShoppingBag size={22} />} title="Giỏ hàng trống" description="Quay lại menu để chọn món nhé." />
            ) : (
              <div className="grid gap-3">
                {cartLines.map((line) => {
                  const summary = modifierSummaryText(line);
                  const unitPrice = cartLineUnitPrice(line);
                  return (
                    <div key={line.lineId} className="flex gap-3">
                      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
                        <ItemThumb src={line.item.image} alt={line.item.name} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{line.item.name}</p>
                            {summary ? <p className="truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{summary}</p> : null}
                            <Money value={unitPrice} className="text-[length:var(--fs-xs)] font-semibold text-[var(--text)]" />
                          </div>
                          <button type="button" onClick={() => updateQuantity(line.lineId, -line.quantity)} aria-label={`Xóa ${line.item.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--text-faint)] hover:text-[var(--danger-fg)]">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <input
                          value={line.note ?? ""}
                          onChange={(e) => updateItemNote(line.lineId, e.target.value)}
                          maxLength={200}
                          placeholder="Ghi chú món"
                          className="mt-1.5 h-9 w-full rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[length:var(--fs-xs)] outline-none focus:border-[var(--jade)]"
                        />
                        <div className="mt-1.5 flex justify-end">
                          <QtyStepper size="sm" value={line.quantity} min={1} onChange={(q) => updateQuantity(line.lineId, q - line.quantity)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Card className="grid gap-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <SectionLabel>Tên khách</SectionLabel>
                  <input name="customerName" autoComplete="name" maxLength={120} value={customerName} onChange={(e) => updateCustomerProfile({ customerName: e.target.value })} placeholder="Tên của bạn" className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
                </label>
                <label className="grid gap-1.5">
                  <SectionLabel>Số điện thoại</SectionLabel>
                  <input name="customerPhone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={customerPhone} onChange={(e) => updateCustomerProfile({ customerPhone: e.target.value })} placeholder="09xx xxx xxx" className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
                </label>
              </div>
              <label className="grid gap-1.5">
                <SectionLabel>Ghi chú cho quán</SectionLabel>
                <textarea name="customerNote" autoComplete="off" maxLength={300} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} rows={2} placeholder="Ví dụ: ít đá, không đường..." className="resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
              </label>
              <label className="grid gap-1.5">
                <SectionLabel>Mã ưu đãi</SectionLabel>
                <input name="promotionCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={promotionCode} onChange={(e) => setPromotionCode(normalizePromotionCode(e.target.value))} placeholder="Nhập mã nếu có" className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 font-mono text-[length:var(--fs-sm)] font-bold uppercase outline-none focus:border-[var(--jade)]" />
                {promotionCode ? (
                  <span className={`text-[length:var(--fs-xs)] font-semibold ${selectedPromotion && previewDiscount > 0 ? "text-[var(--ok-fg)]" : "text-[var(--text-muted)]"}`}>
                    {selectedPromotion
                      ? promotionEligibilityMessage({ promotion: selectedPromotion, itemSubtotal: subtotal, deliveryFee, isDeliveryMode: mode === "DELIVERY" })
                      : "Mã chưa nằm trong danh sách công khai, hệ thống sẽ kiểm tra khi gửi đơn."}
                  </span>
                ) : null}
              </label>
            </Card>

            {renderSummary(false)}
            {!networkOnline ? <p className="rounded-[var(--r-md)] bg-[var(--warn-bg)] px-3 py-2.5 text-[length:var(--fs-xs)] font-semibold text-[var(--warn-fg)]">Mạng đang mất kết nối. Giỏ hàng vẫn được giữ trên máy này.</p> : null}
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </div>
        </div>
        <StickyActions>
          <ShopButton size="lg" fullWidth disabled={cartLines.length === 0} onClick={continueFromCart}>
            Đặt hàng
          </ShopButton>
        </StickyActions>
      </>
    );
  }

  function renderDelivery() {
    const deliveryFeeText = deliveryQuoteState.pending
      ? "Đang tính..."
      : deliveryQuoteState.stale
        ? "Cần tính lại"
        : currentQuoteError
          ? "Chưa có phí"
          : formatVnd(deliveryFee);
    return (
      <>
        <TopBar title="Thông tin giao hàng" onBack={() => setScreen("cart")} loading={loadingQuote} />
        <div className="flex-1 px-4 py-4 shop-screen-in">
          <div className="grid gap-4">
            <CustomerDeliveryLocationPicker
              address={deliveryAddress}
              latitude={deliveryLat}
              longitude={deliveryLng}
              restaurantPoint={restaurantPoint}
              route={currentQuote?.routeGeometry?.coordinates ?? null}
              onAddressChange={(address) => updateCustomerProfile({ deliveryAddress: address })}
              onManualAddressChange={(address) => updateCustomerProfile({ deliveryAddress: address, deliveryLat: undefined, deliveryLng: undefined })}
              onCoordinateChange={(point) => updateCustomerProfile({ deliveryLat: point.lat, deliveryLng: point.lng })}
            />

            <Card className="flex items-start gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--primary-soft)] text-[var(--jade)]"><MapPin size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{deliveryAddress || "Chưa chọn địa chỉ giao"}</p>
                <p className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--text-muted)]">Dự kiến giao trong {etaMinutes} phút</p>
              </div>
            </Card>

            <div className="flex items-center justify-between px-1 text-[length:var(--fs-sm)]">
              <span className="text-[var(--text-muted)]">Phí giao hàng</span>
              <span className="shop-num font-bold text-[var(--text)]">{deliveryFeeText}</span>
            </div>

            <Card className={`grid gap-3 border p-4 ${insightToneClass(currentQuoteInsight.tone)}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-current/20 bg-[var(--surface)]/70">
                  {currentQuoteInsight.tone === "red" || currentQuoteInsight.tone === "yellow" ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[length:var(--fs-sm)] font-bold">{currentQuoteInsight.title}</p>
                      <p className="mt-1 text-[length:var(--fs-xs)] leading-[var(--lh-body)] opacity-90">{currentQuoteInsight.detail}</p>
                    </div>
                    {quoteFreshnessLabel ? <span className="rounded-[var(--r-pill)] bg-[var(--surface)]/70 px-2.5 py-1 text-[length:var(--fs-2xs)] font-bold opacity-80">{quoteFreshnessLabel}</span> : null}
                  </div>
                  {currentQuoteInsight.badges.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {currentQuoteInsight.badges.slice(0, 4).map((badge) => (
                        <span key={badge} className="rounded-[var(--r-pill)] border border-current/15 bg-[var(--surface)]/70 px-2.5 py-1 text-[length:var(--fs-2xs)] font-bold">{badge}</span>
                      ))}
                    </div>
                  ) : null}
                  {!deliveryQuoteState.pending && !deliveryQuoteState.accepted ? (
                    <button type="button" onClick={() => void loadQuote()} disabled={!networkOnline || loadingQuote} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[var(--r-md)] border border-current/20 bg-[var(--surface)]/70 px-3 text-[length:var(--fs-xs)] font-bold disabled:opacity-55">
                      <RefreshCcw size={14} /> Thử tính lại
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <label className="grid gap-1.5">
                <SectionLabel>Ghi chú cho tài xế</SectionLabel>
                <textarea name="deliveryNote" autoComplete="off" maxLength={300} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} rows={2} placeholder="Ví dụ: gọi trước khi đến..." className="resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]" />
              </label>
            </Card>

            {deliveryQuoteState.message ? <p className="rounded-[var(--r-md)] bg-[var(--warn-bg)] px-3 py-2.5 text-[length:var(--fs-xs)] font-semibold text-[var(--warn-fg)]">{deliveryQuoteState.message}</p> : null}
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </div>
        </div>
        <StickyActions>
          <ShopButton size="lg" fullWidth disabled={mode === "DELIVERY" && !deliveryQuoteState.accepted} onClick={continueFromDelivery}>
            Xác nhận
          </ShopButton>
        </StickyActions>
      </>
    );
  }

  function renderPayment() {
    const qrAvailable = requiresPrepaidQr;
    const cashAvailable = !requiresPrepaidQr;
    const blocked = mode === "DELIVERY" && !deliveryQuoteState.accepted;
    return (
      <>
        <TopBar title="Thanh toán" onBack={() => setScreen(mode === "DELIVERY" ? "delivery" : "cart")} loading={submitting} />
        <div className="flex-1 px-4 py-4 shop-screen-in">
          <div className="grid gap-4">
            {renderSummary()}
            <section>
              <SectionLabel>Phương thức thanh toán</SectionLabel>
              <div className="mt-2 grid gap-2">
                <PayMethodCard icon={<span className="text-[18px] font-black text-[#e11d1d]">V</span>} title="VietQR" subtitle={qrAvailable ? "Quét mã VietQR" : "Khả dụng khi quán bật trả trước"} selected={paymentChoice === "vietqr"} disabled={!qrAvailable} onClick={() => setPaymentChoice("vietqr")} />
                <PayMethodCard icon={<WalletCards size={18} />} title="Ví điện tử" subtitle="MoMo, ZaloPay, VNPay..." disabled />
                <PayMethodCard icon={<CreditCard size={18} />} title="Thẻ ngân hàng" subtitle="Visa, Mastercard, JCB..." disabled />
                <PayMethodCard icon={<Banknote size={18} />} title="Tiền mặt" subtitle="Thanh toán khi nhận hàng" selected={paymentChoice === "cash"} disabled={!cashAvailable} onClick={() => setPaymentChoice("cash")} />
              </div>
            </section>
            {blocked && deliveryQuoteState.message ? <p className="rounded-[var(--r-md)] bg-[var(--warn-bg)] px-3 py-2.5 text-[length:var(--fs-xs)] font-semibold text-[var(--warn-fg)]">{deliveryQuoteState.message}</p> : null}
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </div>
        </div>
        <StickyActions>
          <ShopButton size="lg" fullWidth loading={submitting} disabled={submitting || cartLines.length === 0 || !networkOnline || blocked} onClick={submitOrder}>
            {blocked ? "Cần cập nhật phí giao hàng" : requiresPrepaidQr ? `Thanh toán ${formatVnd(total)}` : `Đặt hàng ${formatVnd(total)}`}
          </ShopButton>
          <p className="flex items-center justify-center gap-1.5 text-center text-[length:var(--fs-2xs)] text-[var(--text-faint)]">
            <ShieldCheck size={13} className="text-[var(--jade)]" /> Thông tin thanh toán được bảo mật
          </p>
        </StickyActions>
      </>
    );
  }

  function renderVietQr() {
    const payment = activeEntry?.payment;
    return (
      <>
        <TopBar title="Thanh toán VietQR" onBack={() => setScreen("payment")} loading={submitting} />
        <div className="flex-1 px-4 py-4 text-center shop-screen-in">
          <SectionLabel>Số tiền</SectionLabel>
          <p className="mt-1 shop-num text-[length:var(--fs-display)] font-bold text-[var(--text)]">{formatVnd(payment?.amount ?? total)}</p>

          <div className="mx-auto mt-4 grid aspect-square w-[244px] place-items-center rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--sh-md)]">
            {payment?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={payment.url} alt="Mã VietQR thanh toán" className="h-full w-full rounded-[var(--r-md)] object-contain" />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-[var(--r-md)] bg-[var(--surface-2)] text-[length:var(--fs-xs)] text-[var(--text-muted)]">Đang tạo mã QR...</div>
            )}
          </div>
          <p className="mt-3 text-[length:var(--fs-xs)] font-bold text-[var(--jade)]">{payment?.bank ?? "Ngân hàng"} · napas247</p>

          {payment?.transferContent ? (
            <Card className="mx-auto mt-4 max-w-xs p-3">
              <MoneyRow label="Nội dung CK" value={<span className="font-mono text-[length:var(--fs-xs)]">{payment.transferContent}</span>} strong />
            </Card>
          ) : null}

          <p className="mt-4 text-[length:var(--fs-xs)] text-[var(--text-muted)]">
            Mã còn hiệu lực <span className="font-bold text-[var(--orange-600)]">{formatCountdown(qrSecondsLeft)}</span>
          </p>
          {error ? <div className="mt-3 text-left"><ErrorNote>{error}</ErrorNote></div> : null}
        </div>
        <StickyActions>
          <ShopButton size="lg" fullWidth loading={submitting} disabled={!networkOnline || activeEntry?.order.paymentStatus === "waiting_confirm"} onClick={markRemotePaid}>
            {activeEntry?.order.paymentStatus === "waiting_confirm" ? "Đang chờ quán xác nhận" : "Tôi đã thanh toán"}
          </ShopButton>
        </StickyActions>
      </>
    );
  }

  function renderSuccess() {
    const order = activeEntry?.order;
    return (
      <>
        <div className="px-4 pb-2 pt-5" style={{ paddingTop: "calc(var(--s-5) + var(--safe-top))" }}>
          <CustomerStatusHero
            eyebrow={order ? orderShortId(order.id) : "Đơn mới"}
            title="Đặt hàng thành công!"
            description={`Cảm ơn bạn đã đặt hàng tại ${restaurant.name}. Màn hình này sẽ tự cập nhật khi quán xử lý.`}
            badge={<span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--on-jade)]/15"><Check size={26} strokeWidth={3} /></span>}
          />
        </div>
        <div className="flex-1 px-4 pb-6 pt-2 shop-screen-in">
          <Card className="p-4 text-center">
            <h2 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">{order ? `Đơn ${orderShortId(order.id)}` : "Đơn của bạn"}</h2>
            <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">Dự kiến: {etaMinutes - 5 > 0 ? `${etaMinutes - 5} - ${etaMinutes}` : etaMinutes} phút</p>
            <div className="mt-4"><OrderProgress order={order} /></div>
            {order ? <div className="mt-4 border-t border-[var(--line)] pt-4 text-left"><RemoteTimeline order={order} /></div> : null}
            {renderNotificationPrompt()}
          </Card>
          <div className="mt-4">
            <ShopButton size="lg" fullWidth onClick={() => setScreen("tracking")}>Xem chi tiết đơn hàng</ShopButton>
          </div>
        </div>
      </>
    );
  }

  function renderTracking() {
    const order = trackedOrder;
    if (!order) return renderMenu();
    const lifecycle = getCustomerOrderLifecycle(order);
    const interrupted = lifecycle.state === "cancelled" || lifecycle.state === "refunded";
    const courierLocation = courierLocations[order.id] ?? order.deliveryCourierLocation ?? null;
    const syncText = interrupted
      ? "Đơn đã kết thúc, ngừng cập nhật tự động."
      : !networkOnline
        ? "Mất kết nối, sẽ tự cập nhật khi có mạng."
        : trackingPollError
          ? "Cập nhật tạm gián đoạn, hệ thống sẽ thử lại."
          : pageVisible && trackingPollingInterval
            ? `Cập nhật tự động · ${lastOrderSyncAt ? "đã đồng bộ gần đây" : "đang bật"}`
            : "Tạm dừng cập nhật khi bạn rời trang.";
    return (
      <>
        <TopBar
          title="Theo dõi đơn hàng"
          onBack={() => setScreen("menu")}
          right={
            <button type="button" onClick={openRestaurantSupport} aria-label="Gọi quán" className="grid h-10 w-10 place-items-center rounded-full text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-90"><Headphones size={19} /></button>
          }
        />
        <div className="flex-1 px-4 py-4 shop-screen-in">
          <div className="grid gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">Đơn {orderShortId(order.id)}</h2>
                <Pill tone={interrupted ? "danger" : "jade"}>{orderStatusText(order)}</Pill>
              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                <RefreshCcw size={12} className={trackingPollError ? "text-[var(--danger-fg)]" : "text-[var(--jade)]"} /> {syncText}
              </p>
              {!interrupted ? <div className="mt-4"><OrderProgress order={order} /></div> : null}
              <div className="mt-4 border-t border-[var(--line)] pt-4"><RemoteTimeline order={order} /></div>
              {interrupted ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ShopButton size="md" variant="secondary" leftIcon={<Headphones size={15} />} onClick={openRestaurantSupport}>Gọi quán</ShopButton>
                  <ShopButton size="md" leftIcon={<RefreshCcw size={15} />} disabled={!canReorder} onClick={reorderLastOrder}>Đặt lại</ShopButton>
                </div>
              ) : null}
              {renderNotificationPrompt()}
            </Card>

            {!interrupted && order.fulfillmentType === "DELIVERY" && restaurant.deliveryTrackingEnabled ? (
              <RouteMiniMap
                origin={{ lat: order.restaurant?.storeLat, lng: order.restaurant?.storeLng }}
                destination={{ lat: order.deliveryLat, lng: order.deliveryLng }}
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
            ) : null}

            <Card className="p-4">
              <SectionLabel>Thông tin đơn hàng</SectionLabel>
              <div className="mt-2 grid gap-3">
                {order.items.map((item, index) => {
                  const matched = item.menuItem?.id ? allItems.find((m) => m.id === item.menuItem?.id) : null;
                  return (
                    <div key={`${item.menuItem?.name ?? "item"}-${index}`} className="flex items-center gap-3">
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]"><ItemThumb src={matched?.image} alt={item.menuItem?.name ?? "Món"} size={40} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{item.menuItem?.name ?? "Món đã đặt"}</span>
                        {item.modifierSummary ? <span className="block truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{item.modifierSummary}</span> : null}
                        {item.note ? <span className="block truncate text-[length:var(--fs-xs)] text-[var(--text-faint)]">Ghi chú: {item.note}</span> : null}
                      </span>
                      <span className="text-[length:var(--fs-xs)] font-bold text-[var(--text)]">x{item.quantity}</span>
                      <Money value={item.price} className="min-w-[64px] text-right text-[length:var(--fs-xs)] font-bold text-[var(--text)]" />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
        <StickyActions>
          <ShopButton size="lg" fullWidth onClick={() => setScreen(lifecycle.state === "completed" ? "complete" : "menu")}>
            {lifecycle.state === "completed" ? "Hoàn thành" : "Về menu"}
          </ShopButton>
        </StickyActions>
      </>
    );
  }

  function renderComplete() {
    const order = trackedOrder;
    return (
      <>
        <TopBar title="Hoàn thành" onBack={() => setScreen("tracking")} />
        <div className="flex-1 px-4 py-4 text-center shop-screen-in">
          <div className="mx-auto mt-2 grid h-20 w-20 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--jade)]"><Check size={38} strokeWidth={3} /></div>
          <Card className="mt-5 p-4">
            <h2 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">{order ? `Đơn ${orderShortId(order.id)}` : "Đơn của bạn"}</h2>
            <Pill tone="jade" className="mt-2">Hoàn thành</Pill>
            <p className="mt-2 text-[length:var(--fs-sm)] text-[var(--text-muted)]">Cảm ơn bạn đã đặt hàng! Hẹn gặp lại.</p>
          </Card>
          <Card className="mt-4 p-4">
            <p className="text-[length:var(--fs-sm)] text-[var(--text-muted)]">Bạn đánh giá thế nào?</p>
            <div className="mt-3 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => setRating(star)} className="grid h-11 w-11 place-items-center rounded-full text-[var(--orange)]" aria-label={`${star} sao`}>
                  <Star size={26} fill={star <= rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            <p className="mt-2 text-[length:var(--fs-xs)] text-[var(--text-muted)]">{rating >= 5 ? "Tuyệt vời!" : "Cảm ơn đánh giá của bạn"}</p>
          </Card>
        </div>
        <StickyActions>
          <ShopButton size="lg" variant="secondary" fullWidth disabled={!canReorder} leftIcon={<RefreshCcw size={17} />} onClick={reorderLastOrder}>Đặt lại đơn hàng</ShopButton>
          <ShopButton size="lg" fullWidth leftIcon={<Home size={17} />} onClick={() => setScreen("menu")}>Về menu</ShopButton>
        </StickyActions>
      </>
    );
  }

  function renderScreen() {
    switch (screen) {
      case "cart": return renderCart();
      case "delivery": return renderDelivery();
      case "payment": return renderPayment();
      case "vietqr": return renderVietQr();
      case "success": return renderSuccess();
      case "tracking": return renderTracking();
      case "complete": return renderComplete();
      default: return renderMenu();
    }
  }

  return (
    <ShopShell>
      {renderScreen()}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 z-[var(--z-toast)] flex justify-center px-4" style={{ bottom: "calc(var(--cartbar-h) + var(--safe-bottom) + 1rem)" }} role="status">
          <span className="rounded-[var(--r-pill)] bg-[var(--jade)] px-4 py-2 text-[length:var(--fs-xs)] font-semibold text-[var(--on-jade)] shadow-[var(--sh-lg)]">{toast}</span>
        </div>
      ) : null}

      {screen === "menu" ? (
        <button
          type="button"
          onClick={openRestaurantSupport}
          aria-label="Hỗ trợ"
          className="fixed right-4 z-[var(--z-cartbar)] inline-flex h-11 items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--jade)] px-3.5 text-[length:var(--fs-xs)] font-bold text-[var(--on-jade)] shadow-[var(--sh-lg)] transition active:scale-95"
          style={{ bottom: `calc(${cartItemCount > 0 || activeEntry ? "var(--cartbar-h) + " : ""}var(--safe-bottom) + 1.25rem)` }}
        >
          <Headphones size={15} /> Hỗ trợ
        </button>
      ) : null}

      <ModifierSheet state={customizing} onChange={setCustomizing} onClose={() => setCustomizing(null)} onConfirm={confirmCustomItem} />

      <CustomerAiAssistant
        restaurantSlug={restaurant.slug}
        customerSessionId={sessionId}
        cart={cartLines.map((line) => ({ menuItemId: line.itemId, name: line.item.name, price: cartLineUnitPrice(line), quantity: line.quantity, note: line.note }))}
        orderStatus={trackedOrder}
        onAgentAction={handleAgentAction}
      />
    </ShopShell>
  );
}

function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center rounded-[var(--r-pill)] px-3.5 text-[length:var(--fs-sm)] font-semibold transition ${active ? "bg-[var(--jade)] text-[var(--on-jade)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"}`}
    >
      {children}
    </button>
  );
}

function MenuRow({
  item,
  cartLines,
  onAdd,
  onDec,
  onInc
}: {
  item: MenuItemWithCategory;
  cartLines: RemoteCartLineView[];
  onAdd: (item: MenuItemWithCategory) => void;
  onDec: (lineId: string) => void;
  onInc: (lineId: string) => void;
}) {
  const hasModifiers = hasMenuModifiers(item);
  const plainLine = cartLines.find((line) => line.itemId === item.id && !line.modifierSignature);
  const totalQty = cartLines.reduce((sum, line) => sum + (line.itemId === item.id ? line.quantity : 0), 0);
  return (
    <CustomerMenuCard
      name={item.name}
      price={item.price}
      meta={item.categoryName}
      quantity={totalQty}
      hasOptions={hasModifiers}
      onAdd={() => onAdd(item)}
      onQuantityChange={plainLine ? (q) => (q > plainLine.quantity ? onInc(plainLine.lineId) : onDec(plainLine.lineId)) : undefined}
      imageSlot={
        <ItemThumb src={item.image} alt={item.name} size={176} />
      }
    />
  );
}

function PayMethodCard({
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
      className={`flex min-h-[64px] w-full items-center gap-3 rounded-[var(--r-lg)] border bg-[var(--surface)] p-3 text-left shadow-[var(--sh-sm)] transition active:scale-[0.99] disabled:opacity-55 ${selected ? "border-[var(--jade)]" : "border-[var(--line)]"}`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--surface-2)] text-[var(--jade)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--text)]">{title}</span>
        <span className="mt-0.5 block truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{subtitle}</span>
      </span>
      <span className={`grid h-6 w-6 place-items-center rounded-full border ${selected ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]" : "border-[var(--line-strong)] text-transparent"}`}><Check size={14} /></span>
    </button>
  );
}
