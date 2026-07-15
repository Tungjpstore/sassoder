"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  Landmark,
  Banknote,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Trash2,
  Utensils
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatVnd } from "@/lib/money";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { useDineInCartStore } from "@/hooks/customer/use-dine-in-cart-store";
import { useDineInMenuBrowser } from "@/hooks/customer/use-customer-menu-browser";
import type { DineInCartItem } from "@/lib/customer/cart-state";
import {
  dineInCheckoutReducer,
  type DineInCheckoutAction,
  type DineInCheckoutScreen
} from "@/lib/customer/checkout-flow";
import {
  defaultModifierSelectionsForGroups,
  resolveModifierSelections,
  type PublicModifierGroup
} from "@/lib/customer/modifier-pricing";
import {
  evaluatePublicPromotion,
  findPublicPromotionByCode,
  normalizePromotionCode,
  promotionDescription,
  promotionEligibilityMessage
} from "@/lib/customer/promotion-preview";
import { getCustomerOrderPollingInterval } from "@/lib/customer/order-sync";
import { getCustomerOrderTimeline, getCustomerOrderLifecycle } from "@/lib/customer/order-lifecycle";
import { canMarkCustomerPaid, canStartDineInPayment } from "@/lib/customer/payment-gates";
import {
  callDineInStaff,
  checkoutDineInOrder,
  createDineInOrder,
  fetchDineInOrderHistory,
  markDineInOrderPaid
} from "@/lib/customer/dine-in-api";
import {
  dineInPayableMethod,
  dineInPayableTotal,
  isDineInOrderPaid,
  isOpenDineInOrderStatus,
  shortDineInOrderCode
} from "@/lib/customer/dine-in-order-view";
import {
  clearPendingOrderIdempotency,
  pendingOrderIdempotencyStorageKey,
  resolvePendingOrderIdempotency
} from "@/lib/customer/pending-order-idempotency";
import { useDineInCustomerSession } from "@/hooks/customer/use-dine-in-customer-session";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import type { AiAgentAction } from "@/types/ai-agent";
import type { OrderDto, OrderStatus, PaymentMethod, TableBillStatus } from "@/types/domain";
import type { PublicMenuCategory, PublicMenuItem, PublicPromotion } from "@/types";
import { ShopShell, TopBar, StickyCartBar } from "../shell/shop-shell";
import { BottomSheet } from "../ui/sheet";
import { ShopButton } from "../ui/button";
import { Card, Money, Pill, QtyStepper, MoneyRow, SectionLabel, EmptyState, Skeleton, CustomerMenuGrid, CustomerMenuCard, CustomerDealStrip } from "../ui/primitives";
import { ModifierSheet, type CustomizingItem } from "./modifier-sheet";

type PaymentInfo =
  | { method: "QR"; url: string; amount: number; bank: string; account: string; accountName?: string; transferContent: string }
  | { method: "CASH"; amount: number; message: string };

type CreatedOrder = {
  order: {
    id: string;
    status: string;
    subtotal?: number;
    discountAmount?: number;
    promotionCode?: string | null;
    total: number;
    paymentMethod: "QR" | "CASH" | null;
    paymentStatus?: "unpaid" | "waiting_payment" | "waiting_confirm" | "paid" | "failed" | "refunded";
    paidAt?: string | null;
    bill: {
      id: string;
      status: TableBillStatus;
      total: number;
      paymentMethod: "QR" | "CASH" | null;
      createdAt: string;
      updatedAt?: string | null;
      paidAt?: string | null;
      closedAt?: string | null;
    } | null;
    createdAt?: string;
    updatedAt?: string | null;
    items?: Array<{
      quantity: number;
      price: number;
      note: string | null;
      modifierSummary?: string | null;
      menuItem: { id?: string; name: string } | null;
    }>;
  };
  payment: PaymentInfo | null;
};

type RealtimeState = "idle" | "connecting" | "connected" | "error";

type RestaurantProps = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  address: string | null;
  hotline: string | null;
  contactEmail: string | null;
  receiptFooter: string | null;
  receiptShowQr: boolean;
  promotions: PublicPromotion[];
};

function invoiceCode(id: string) {
  return `#${id.slice(0, 12).toUpperCase()}`;
}
function formatTime(value?: string | null) {
  if (!value) return "Vừa gửi";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}
function formatCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function hasMenuModifiers(item: Pick<PublicMenuItem, "modifierGroups">) {
  return item.modifierGroups?.some((group) => group.options.length > 0) ?? false;
}
function modifierMinSelect(group: PublicModifierGroup) {
  return typeof group.minSelect === "number" ? group.minSelect : group.required ? 1 : 0;
}
function modifierSummaryText(resolution: ReturnType<typeof resolveModifierSelections>) {
  if (!resolution.ok || resolution.selections.length === 0) return "";
  return resolution.selections.map((s) => `${s.optionName}${s.quantity > 1 ? ` x${s.quantity}` : ""}`).join(", ");
}
function toLifecycleOrder(order: CreatedOrder["order"] | null) {
  if (!order) return null;
  return {
    status: order.status as OrderStatus,
    paymentStatus: order.paymentStatus ?? "unpaid",
    paymentMethod: order.paymentMethod,
    fulfillmentType: "DINE_IN" as const,
    deliveryStatus: "none" as const
  } satisfies Pick<OrderDto, "status" | "paymentStatus" | "paymentMethod" | "fulfillmentType" | "deliveryStatus">;
}
function realtimeLabel(state: RealtimeState) {
  if (state === "connected") return "Cập nhật tự động đang bật";
  if (state === "connecting") return "Đang kết nối trạng thái đơn";
  if (state === "error") return "Cập nhật tạm gián đoạn, bấm làm mới nếu cần";
  return "Trạng thái sẽ tự cập nhật sau khi gọi món";
}

export function DineInClientV2({
  restaurant,
  table,
  tableAccessToken,
  categories
}: {
  restaurant: RestaurantProps;
  table: { id: string; name: string };
  tableAccessToken?: string | null;
  categories: PublicMenuCategory[];
}) {
  const { items, add, decrement, remove, setNote, clear } = useDineInCartStore();
  const cart = useMemo(() => Object.entries(items).map(([lineId, item]) => ({ ...item, lineId })), [items]);
  const [screen, setScreen] = useState<DineInCheckoutScreen>("menu");
  const { categoryId, searchQuery, setCategoryId, setSearchQuery, visibleCategories } = useDineInMenuBrowser(categories);

  const { customerSessionId, ensureSessionId } = useDineInCustomerSession(restaurant.id, table.id);
  const [history, setHistory] = useState<CreatedOrder[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedPromotionCode, setSelectedPromotionCode] = useState("");
  const [staffCallLoading, setStaffCallLoading] = useState(false);
  const [staffCallSent, setStaffCallSent] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const [networkOnline, setNetworkOnline] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [qrSeconds, setQrSeconds] = useState(5 * 60);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [customizing, setCustomizing] = useState<CustomizingItem | null>(null);

  const pendingCreateRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const createInFlightRef = useRef(false);
  const paymentInFlightRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const pendingOrderKey = useMemo(
    () => pendingOrderIdempotencyStorageKey("dine-in", restaurant.id, table.id),
    [restaurant.id, table.id]
  );
  const accessFor = useCallback(
    (sessionId: string) => ({
      restaurantSlug: restaurant.slug,
      tableId: table.id,
      tableAccessToken: tableAccessToken ?? undefined,
      customerSessionId: sessionId
    }),
    [restaurant.slug, table.id, tableAccessToken]
  );

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const selectedPromotion = useMemo(
    () => findPublicPromotionByCode(restaurant.promotions, selectedPromotionCode),
    [restaurant.promotions, selectedPromotionCode]
  );
  const promotionEvaluation = useMemo(
    () => evaluatePublicPromotion({ itemSubtotal: total, deliveryFee: 0, promotion: selectedPromotion }),
    [selectedPromotion, total]
  );
  const previewDiscount = promotionEvaluation.discountAmount;
  const normalizedPromotionCode = normalizePromotionCode(selectedPromotionCode);
  const effectivePromotionCode = selectedPromotion
    ? promotionEvaluation.eligible
      ? selectedPromotion.code
      : ""
    : normalizedPromotionCode;
  const previewTotal = Math.max(0, total - previewDiscount);

  const cartSignature = useMemo(
    () =>
      JSON.stringify(
        cart.map((item) => ({
          lineId: item.lineId,
          id: item.menuItemId,
          quantity: item.quantity,
          note: item.note ?? "",
          modifiers: item.modifiers ?? []
        }))
      ),
    [cart]
  );
  const createdOrderId = created?.order.id;
  const openHistory = useMemo(() => history.filter((entry) => isOpenDineInOrderStatus(entry.order.status)), [history]);
  const openHistoryTotal = useMemo(() => openHistory.reduce((sum, entry) => sum + dineInPayableTotal(entry), 0), [openHistory]);
  const pollingOrder = useMemo(
    () => toLifecycleOrder(created?.order ?? openHistory[0]?.order ?? null),
    [created?.order, openHistory]
  );
  const orderPollingInterval = useMemo(
    () => getCustomerOrderPollingInterval(pollingOrder, { networkOnline, pageVisible }),
    [networkOnline, pageVisible, pollingOrder]
  );
  const canStartPayment = canStartDineInPayment(created?.order);
  const currentPayableTotal = created ? dineInPayableTotal(created) : 0;

  function mergeHistoryOrder(next: CreatedOrder) {
    setHistory((current) => [next, ...current.filter((entry) => entry.order.id !== next.order.id)]);
  }
  function patchStoredOrder(orderId: string, patch: Partial<CreatedOrder["order"]>) {
    const apply = (entry: CreatedOrder) => ({ ...entry, order: { ...entry.order, ...patch } });
    setHistory((current) => current.map((entry) => (entry.order.id === orderId ? apply(entry) : entry)));
    setCreated((current) => (current?.order.id === orderId ? apply(current) : current));
  }
  function patchStoredBill(billId: string, patch: Partial<NonNullable<CreatedOrder["order"]["bill"]>>) {
    const apply = (entry: CreatedOrder) =>
      entry.order.bill?.id === billId
        ? { ...entry, order: { ...entry.order, bill: { ...entry.order.bill, ...patch } } }
        : entry;
    setHistory((current) => current.map(apply));
    setCreated((current) => (current ? apply(current) : current));
  }
  function notify(message: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }

  function addMenuItem(item: PublicMenuItem) {
    if (hasMenuModifiers(item)) {
      setCustomizing({ item, selections: defaultModifierSelectionsForGroups(item.modifierGroups ?? []), quantity: 1, note: "" });
      setError(null);
      return;
    }
    add({ menuItemId: item.id, name: item.name, price: item.price, image: item.image });
    notify(`Đã thêm ${item.name} vào giỏ.`);
  }

  function confirmCustomItem() {
    if (!customizing) return;
    const resolution = resolveModifierSelections(customizing.item.modifierGroups ?? [], customizing.selections, { basePrice: customizing.item.price });
    if (!resolution.ok) {
      setError(resolution.errors[0] ?? "Vui lòng chọn đủ tùy chọn cho món.");
      return;
    }
    const unitPrice = customizing.item.price + resolution.totalDelta;
    const summary = modifierSummaryText(resolution);
    for (let i = 0; i < customizing.quantity; i += 1) {
      add({
        menuItemId: customizing.item.id,
        name: customizing.item.name,
        price: unitPrice,
        image: customizing.item.image,
        note: customizing.note,
        modifiers: customizing.selections,
        modifierSummary: summary
      });
    }
    notify(`Đã thêm ${customizing.item.name} vào giỏ.`);
    setCustomizing(null);
    setError(null);
  }

  const applyCheckoutTransition = useCallback((action: DineInCheckoutAction) => {
    const next = dineInCheckoutReducer({ screen: "tracking", error: null }, action);
    setError(next.error);
    setScreen(next.screen);
    return next;
  }, []);

  const openEntry = useCallback(
    (entry: CreatedOrder) => {
      setCreated(entry);
      setCartOpen(false);
      setRealtimeState("connecting");
      const next = applyCheckoutTransition({
        type: "OPEN_EXISTING_ORDER",
        isPaid: isDineInOrderPaid(entry),
        orderStatus: entry.order.status,
        paymentMethod: entry.payment?.method ?? entry.order.paymentMethod ?? entry.order.bill?.paymentMethod
      });
      if (next.screen === "vietqr-payment") setQrSeconds(5 * 60);
    },
    [applyCheckoutTransition]
  );

  async function showHelp() {
    if (staffCallLoading) return;
    const sessionId = ensureSessionId();
    setStaffCallLoading(true);
    setStaffCallSent(false);
    setError(null);
    try {
      await callDineInStaff(accessFor(sessionId));
      setStaffCallSent(true);
      notify("Đã gọi nhân viên đến bàn.");
      window.setTimeout(() => setStaffCallSent(false), 2600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được nhân viên");
    } finally {
      setStaffCallLoading(false);
    }
  }

  const loadOrderHistory = useCallback(
    async ({ openLatest = false, silent = false }: { openLatest?: boolean; silent?: boolean } = {}) => {
      if (!customerSessionId) return [];
      if (!silent) {
        setHistoryLoading(true);
        setError(null);
      }
      try {
        const orders = await fetchDineInOrderHistory<CreatedOrder>(accessFor(customerSessionId));
        setHistory(orders);
        setCreated((current) => (current ? orders.find((entry) => entry.order.id === current.order.id) ?? current : current));
        if (openLatest && orders[0]) openEntry(orders[0]);
        return orders;
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Không tải được lịch sử gọi món");
        return [];
      } finally {
        if (!silent) setHistoryLoading(false);
      }
    },
    [accessFor, customerSessionId, openEntry]
  );

  async function submitOrder() {
    if (cart.length === 0 || loading || createInFlightRef.current) return;
    if (selectedPromotion && !promotionEvaluation.eligible) {
      setError(promotionEligibilityMessage({ promotion: selectedPromotion, itemSubtotal: total, deliveryFee: 0, isDeliveryMode: false }));
      setPromoOpen(true);
      return;
    }
    const sessionId = ensureSessionId();
    const fingerprint = JSON.stringify({
      cartSignature,
      customerNote: customerNote.trim(),
      driverNote: "",
      selectedPromotionCode: effectivePromotionCode
    });
    let idempotencyKey: string;
    try {
      const pending = resolvePendingOrderIdempotency({
        storage: window.localStorage,
        storageKey: pendingOrderKey,
        fingerprint,
        createId: () => globalThis.crypto.randomUUID()
      });
      pendingCreateRef.current = pending;
      idempotencyKey = pending.idempotencyKey;
    } catch {
      const existing = pendingCreateRef.current;
      idempotencyKey = existing?.fingerprint === fingerprint ? existing.idempotencyKey : globalThis.crypto.randomUUID();
      pendingCreateRef.current = { fingerprint, idempotencyKey };
    }
    createInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await createDineInOrder<CreatedOrder>(accessFor(sessionId), {
        customerNote: customerNote.trim(),
        promotionCode: effectivePromotionCode || undefined,
        idempotencyKey,
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          note: item.note,
          modifiers: item.modifiers
        }))
      });
      setRealtimeState("connecting");
      setCreated(data);
      mergeHistoryOrder(data);
      pendingCreateRef.current = null;
      try {
        clearPendingOrderIdempotency(window.localStorage, pendingOrderKey);
      } catch {
        // ignore
      }
      clear();
      setCustomerNote("");
      setCartOpen(false);
      setScreen("order-sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được đơn hàng");
    } finally {
      createInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function markPaid() {
    if (!created || paymentLoading || paymentInFlightRef.current) return;
    const sessionId = ensureSessionId();
    paymentInFlightRef.current = true;
    setPaymentLoading(true);
    setError(null);
    try {
      const data = await markDineInOrderPaid<CreatedOrder>(created.order.id, accessFor(sessionId));
      setCreated(data);
      mergeHistoryOrder(data);
      applyCheckoutTransition({ type: "PAYMENT_MARKED", isPaid: isDineInOrderPaid(data) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được thanh toán");
    } finally {
      paymentInFlightRef.current = false;
      setPaymentLoading(false);
    }
  }

  async function startPayment(method: PaymentMethod) {
    if (!created || paymentLoading || paymentInFlightRef.current) return;
    const sessionId = ensureSessionId();
    paymentInFlightRef.current = true;
    setPaymentLoading(true);
    setError(null);
    try {
      const data = await checkoutDineInOrder<CreatedOrder>(created.order.id, accessFor(sessionId), method);
      setCreated(data);
      mergeHistoryOrder(data);
      if (method === "QR") setQrSeconds(5 * 60);
      applyCheckoutTransition({ type: "START_PAYMENT", method });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được yêu cầu thanh toán");
    } finally {
      paymentInFlightRef.current = false;
      setPaymentLoading(false);
    }
  }

  async function openOrderHistory() {
    setScreen("orders");
    if (!customerSessionId) {
      setError("LogiVN đang chuẩn bị phiên gọi món. Vui lòng thử lại sau vài giây.");
      return;
    }
    await loadOrderHistory();
  }

  function modifiersMatch(a?: Array<{ groupId: string; optionId: string }>, b?: Array<{ groupId: string; optionId: string }>) {
    const listA = a || [];
    const listB = b || [];
    if (listA.length !== listB.length) return false;
    return listA.every((selA) => listB.some((selB) => selB.groupId === selA.groupId && selB.optionId === selA.optionId));
  }

  function handleAgentAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.assign(action.href);
      return;
    }
    if (action.uiTarget === "add_item_to_cart" || action.uiTarget === "add_item") {
      const body = action.body as
        | { menuItemId?: string; categoryId?: string; name?: string; price?: number; image?: string | null; quantity?: number; note?: string; modifiers?: Array<{ groupId: string; optionId: string; quantity?: number }> }
        | undefined;
      if (!body?.menuItemId) return;
      const menuItem = categories.flatMap((c) => c.items).find((item) => item.id === body.menuItemId);
      if (!menuItem) {
        if (body.name && typeof body.price === "number") {
          add({ menuItemId: body.menuItemId, name: body.name, price: body.price, image: body.image ?? null });
          notify(`Đã thêm ${body.name} vào giỏ.`);
        }
        return;
      }
      const selections = body.modifiers ?? [];
      const resolution = resolveModifierSelections(menuItem.modifierGroups ?? [], selections, { basePrice: menuItem.price });
      if (!resolution.ok) {
        setCustomizing({
          item: menuItem,
          selections: defaultModifierSelectionsForGroups(menuItem.modifierGroups ?? []),
          quantity: body.quantity ?? 1,
          note: body.note ?? ""
        });
        setError(null);
        return;
      }
      const unitPrice = menuItem.price + resolution.totalDelta;
      const summary = modifierSummaryText(resolution);
      for (let i = 0; i < (body.quantity ?? 1); i += 1) {
        add({ menuItemId: menuItem.id, name: menuItem.name, price: unitPrice, image: menuItem.image, note: body.note, modifiers: selections, modifierSummary: summary });
      }
      if (body.categoryId) setCategoryId(body.categoryId);
      notify(`Đã thêm ${menuItem.name} vào giỏ.`);
      setScreen((current) => (["payment-choice", "cash-payment", "vietqr-payment", "payment-pending"].includes(current) ? "menu" : current));
      setError(null);
      return;
    }
    if (action.uiTarget === "remove_item_from_cart") {
      const body = action.body as { menuItemId?: string; quantity?: number; modifiers?: Array<{ groupId: string; optionId: string }> } | undefined;
      if (!body?.menuItemId) return;
      const matching = cart.filter((item) => item.menuItemId === body.menuItemId && (body.modifiers ? modifiersMatch(item.modifiers, body.modifiers) : true));
      if (matching.length === 0) return;
      const qtyToRemove = body.quantity ?? 1;
      let removed = 0;
      for (const item of matching) {
        if (removed >= qtyToRemove) break;
        if (!body.quantity) {
          remove(item.lineId);
          removed += item.quantity;
        } else {
          const toDec = Math.min(item.quantity, qtyToRemove - removed);
          for (let i = 0; i < toDec; i += 1) decrement(item.lineId);
          removed += toDec;
        }
      }
      notify("Đã cập nhật giỏ hàng.");
      return;
    }
    if (action.uiTarget === "clear_cart") {
      clear();
      notify("Đã xóa toàn bộ giỏ hàng.");
      return;
    }
    if (action.uiTarget === "menu_category") {
      const body = action.body as { categoryId?: string } | undefined;
      if (body?.categoryId) setCategoryId(body.categoryId);
      setScreen("menu");
      return;
    }
    if (action.uiTarget === "menu") {
      setScreen("menu");
      return;
    }
    if (action.uiTarget === "cart") {
      setCartOpen(true);
      return;
    }
    if (action.uiTarget === "orders") {
      void openOrderHistory();
      return;
    }
    if (action.uiTarget === "payment") {
      const body = action.body as { action?: string } | undefined;
      if (body?.action === "mark_paid") {
        if (canMarkCustomerPaid(created?.order)) void markPaid();
        else if (created) applyCheckoutTransition({ type: "OPEN_PAYMENT_ENTRY", canStartPayment, hasCreatedOrder: true });
        return;
      }
      if (created) applyCheckoutTransition({ type: "OPEN_PAYMENT_ENTRY", canStartPayment, hasCreatedOrder: true });
      return;
    }
    if (action.uiTarget === "staff_call") void showHelp();
  }

  useEffect(() => {
    if (!customerSessionId) return;
    const timer = window.setTimeout(() => void loadOrderHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [customerSessionId, loadOrderHistory]);

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
    if (!customerSessionId || !orderPollingInterval) return;
    let cancelled = false;
    const poll = () => {
      if (!cancelled) void loadOrderHistory({ silent: true });
    };
    const warmup = window.setTimeout(poll, 1500);
    const interval = window.setInterval(poll, orderPollingInterval);
    return () => {
      cancelled = true;
      window.clearTimeout(warmup);
      window.clearInterval(interval);
    };
  }, [customerSessionId, loadOrderHistory, orderPollingInterval]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (screen !== "vietqr-payment") return;
    const timer = window.setInterval(() => setQrSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screen, createdOrderId]);

  // --- realtime ---
  useEffect(() => {
    if (!createdOrderId) return;
    const billId = created?.order.bill?.id;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`customer-order:${createdOrderId}`)
      .on("broadcast", { event: "order_status" }, (payload) => {
        const next = payload.payload as {
          id?: string;
          status?: string;
          total?: number;
          payment_status?: CreatedOrder["order"]["paymentStatus"];
          payment_method?: PaymentMethod | null;
          paid_at?: string | null;
          updated_at?: string;
        };
        if (!next.status) return;
        patchStoredOrder(createdOrderId, {
          status: next.status,
          total: next.total,
          paymentMethod: next.payment_method,
          paymentStatus: next.payment_status,
          paidAt: next.paid_at,
          updatedAt: next.updated_at
        });
        if (next.status === "ordering" || next.status === "completed") {
          setScreen((current) => (current === "order-sent" ? "tracking" : current));
        }
        if (next.status === "paid") {
          const paidAt = next.paid_at ?? next.updated_at ?? new Date().toISOString();
          if (billId) {
            patchStoredBill(billId, {
              status: "paid",
              total: next.total,
              paymentMethod: next.payment_method ?? created?.order.paymentMethod ?? null,
              updatedAt: next.updated_at ?? paidAt,
              paidAt,
              closedAt: paidAt
            });
          }
          applyCheckoutTransition({ type: "PAYMENT_CONFIRMED" });
          void loadOrderHistory().then((orders) => {
            const refreshed =
              orders.find((entry) => entry.order.id === createdOrderId) ??
              (billId ? orders.find((entry) => entry.order.bill?.id === billId) : undefined);
            if (refreshed) setCreated(refreshed);
          });
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeState("error");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyCheckoutTransition, created?.order.bill?.id, created?.order.paymentMethod, createdOrderId, loadOrderHistory]);

  return (
    <DineInView
      restaurant={restaurant}
      table={table}
      screen={screen}
      setScreen={setScreen}
      categories={categories}
      visibleCategories={visibleCategories}
      categoryId={categoryId}
      setCategoryId={setCategoryId}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      cart={cart}
      cartCount={cartCount}
      total={total}
      previewTotal={previewTotal}
      previewDiscount={previewDiscount}
      addMenuItem={addMenuItem}
      add={add}
      decrement={decrement}
      remove={remove}
      setNote={setNote}
      customerNote={customerNote}
      setCustomerNote={setCustomerNote}
      created={created}
      history={history}
      openHistory={openHistory}
      openHistoryTotal={openHistoryTotal}
      historyLoading={historyLoading}
      loading={loading}
      paymentLoading={paymentLoading}
      error={error}
      setError={setError}
      toast={toast}
      cartOpen={cartOpen}
      setCartOpen={setCartOpen}
      promoOpen={promoOpen}
      setPromoOpen={setPromoOpen}
      selectedPromotion={selectedPromotion}
      selectedPromotionCode={selectedPromotionCode}
      setSelectedPromotionCode={setSelectedPromotionCode}
      customizing={customizing}
      setCustomizing={setCustomizing}
      confirmCustomItem={confirmCustomItem}
      submitOrder={submitOrder}
      startPayment={startPayment}
      markPaid={markPaid}
      openEntry={openEntry}
      openOrderHistory={openOrderHistory}
      loadOrderHistory={loadOrderHistory}
      showHelp={showHelp}
      staffCallLoading={staffCallLoading}
      staffCallSent={staffCallSent}
      realtimeState={realtimeState}
      qrSeconds={qrSeconds}
      canStartPayment={canStartPayment}
      currentPayableTotal={currentPayableTotal}
      customerSessionId={customerSessionId}
      handleAgentAction={handleAgentAction}
    />
  );
}

type CartLine = DineInCartItem & { lineId: string };

type DineInViewProps = {
  restaurant: RestaurantProps;
  table: { id: string; name: string };
  screen: DineInCheckoutScreen;
  setScreen: (s: DineInCheckoutScreen) => void;
  categories: PublicMenuCategory[];
  visibleCategories: PublicMenuCategory[];
  categoryId: string;
  setCategoryId: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  cart: CartLine[];
  cartCount: number;
  total: number;
  previewTotal: number;
  previewDiscount: number;
  addMenuItem: (item: PublicMenuItem) => void;
  add: (item: Omit<DineInCartItem, "quantity">) => void;
  decrement: (lineId: string) => void;
  remove: (lineId: string) => void;
  setNote: (lineId: string, note: string) => void;
  customerNote: string;
  setCustomerNote: (v: string) => void;
  created: CreatedOrder | null;
  history: CreatedOrder[];
  openHistory: CreatedOrder[];
  openHistoryTotal: number;
  historyLoading: boolean;
  loading: boolean;
  paymentLoading: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  toast: string | null;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  promoOpen: boolean;
  setPromoOpen: (v: boolean) => void;
  selectedPromotion: PublicPromotion | null | undefined;
  selectedPromotionCode: string;
  setSelectedPromotionCode: (v: string) => void;
  customizing: CustomizingItem | null;
  setCustomizing: (v: CustomizingItem | null) => void;
  confirmCustomItem: () => void;
  submitOrder: () => void;
  startPayment: (method: PaymentMethod) => void;
  markPaid: () => void;
  openEntry: (entry: CreatedOrder) => void;
  openOrderHistory: () => void;
  loadOrderHistory: (opts?: { openLatest?: boolean; silent?: boolean }) => Promise<CreatedOrder[]>;
  showHelp: () => void;
  staffCallLoading: boolean;
  staffCallSent: boolean;
  realtimeState: RealtimeState;
  qrSeconds: number;
  canStartPayment: boolean;
  currentPayableTotal: number;
  customerSessionId: string | null;
  handleAgentAction: (action: AiAgentAction) => void;
};

function Timeline({ order }: { order: CreatedOrder["order"] }) {
  const lifecycleOrder = toLifecycleOrder(order)!;
  const items = getCustomerOrderTimeline(lifecycleOrder);
  return (
    <ol className="shop-stagger grid grid-cols-1 gap-0">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const dotClass =
          item.status === "done"
            ? "border-[var(--jade)] bg-[var(--jade)] text-[var(--on-jade)]"
            : item.status === "current"
              ? "border-[var(--jade)] bg-[var(--surface)] text-[var(--jade)]"
              : item.blocked
                ? "border-[var(--danger-fg)] bg-[var(--danger-bg)] text-[var(--danger-fg)]"
                : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-faint)]";
        return (
          <li key={item.key} className="grid grid-cols-[28px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[length:var(--fs-2xs)] font-bold ${dotClass}`}>
                {item.status === "done" ? "✓" : index + 1}
              </span>
              {!last ? <span className={`w-0.5 flex-1 ${item.status === "done" ? "bg-[var(--jade)]" : "bg-[var(--line)]"}`} /> : null}
            </div>
            <div className={`pb-4 ${last ? "pb-0" : ""}`}>
              <p className={`text-[length:var(--fs-sm)] font-semibold ${item.status === "pending" ? "text-[var(--text-faint)]" : "text-[var(--text)]"}`}>
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

function ItemThumb({ src, alt, size = 64 }: { src?: string | null; alt: string; size?: number }) {
  if (src) {
    return <Image src={src} alt={alt} width={size} height={size} sizes={`${size}px`} className="h-full w-full object-cover" />;
  }
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

function DineInView(props: DineInViewProps) {
  const {
    restaurant,
    table,
    screen,
    setScreen,
    categories,
    visibleCategories,
    categoryId,
    setCategoryId,
    searchQuery,
    setSearchQuery,
    cart,
    cartCount,
    total,
    previewTotal,
    previewDiscount,
    addMenuItem,
    add,
    decrement,
    remove,
    setNote,
    customerNote,
    setCustomerNote,
    created,
    history,
    openHistory,
    openHistoryTotal,
    historyLoading,
    loading,
    paymentLoading,
    error,
    setError,
    toast,
    cartOpen,
    setCartOpen,
    promoOpen,
    setPromoOpen,
    selectedPromotion,
    selectedPromotionCode,
    setSelectedPromotionCode,
    customizing,
    setCustomizing,
    confirmCustomItem,
    submitOrder,
    startPayment,
    markPaid,
    openEntry,
    openOrderHistory,
    loadOrderHistory,
    showHelp,
    staffCallLoading,
    staffCallSent,
    realtimeState,
    qrSeconds,
    canStartPayment,
    currentPayableTotal,
    customerSessionId,
    handleAgentAction
  } = props;

  const flatMenu = useMemo(
    () => visibleCategories.flatMap((category) => category.items.map((item) => item)),
    [visibleCategories]
  );

  function renderMenu() {
    return (
      <>
        <TopBar
          title={restaurant.name}
          subtitle={`Gọi món tại ${table.name}`}
          logoUrl={restaurant.logoUrl}
          right={
            <button
              type="button"
              onClick={openOrderHistory}
              aria-label="Theo dõi đơn"
              className="relative grid h-10 w-10 place-items-center rounded-full text-[var(--text)] transition hover:bg-[var(--surface-2)] active:scale-90"
            >
              <ClipboardList size={20} />
              {openHistory.length > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" />
              ) : null}
            </button>
          }
        />

        <div className="flex-1">
          {/* search + categories */}
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
                placeholder="Tìm món: cà phê, trà, bánh..."
                className="h-11 w-full rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface)] pl-10 pr-4 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]"
              />
            </label>
            <div className="shop-no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              <CategoryPill active={categoryId === "all"} onClick={() => setCategoryId("all")}>
                Tất cả
              </CategoryPill>
              {categories.map((category) => (
                <CategoryPill key={category.id} active={categoryId === category.id} onClick={() => setCategoryId(category.id)}>
                  {category.name}
                </CategoryPill>
              ))}
            </div>
          </div>

          <div className="px-4 py-4 shop-screen-in">
            {staffCallSent ? (
              <div className="mb-4 rounded-[var(--r-md)] border border-[var(--ok-fg)]/25 bg-[var(--ok-bg)] px-4 py-3 text-[length:var(--fs-xs)] font-semibold text-[var(--ok-fg)]">
                Quán đã nhận yêu cầu gọi nhân viên cho {table.name}.
              </div>
            ) : null}

            {restaurant.promotions.length > 0 ? (
              <CustomerDealStrip
                className="mb-4"
                title="Ưu đãi hôm nay"
                description={promotionDescription(restaurant.promotions[0])}
                badge={previewDiscount > 0 ? <Pill tone="ok">-{formatVnd(previewDiscount)}</Pill> : undefined}
                onClick={() => setPromoOpen(true)}
              />
            ) : null}

            {flatMenu.length === 0 ? (
              <EmptyState icon={<Search size={22} />} title="Không tìm thấy món" description="Thử từ khóa khác hoặc chọn danh mục khác nhé." />
            ) : categoryId === "all" ? (
              <CustomerMenuGrid>
                {flatMenu.map((item) => (
                  <MenuRow key={item.id} item={item} cart={cart} onAdd={addMenuItem} onDec={(id) => decrement(id)} />
                ))}
              </CustomerMenuGrid>
            ) : (
              <div className="grid gap-5">
                {visibleCategories.map((category) => (
                  <section key={category.id}>
                    <h2 className="mb-2 text-[length:var(--fs-h2)] font-bold text-[var(--text)]">{category.name}</h2>
                    <CustomerMenuGrid>
                      {category.items.length === 0 ? (
                        <p className="col-span-2 rounded-[var(--r-md)] bg-[var(--surface-2)] p-3 text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                          Danh mục này chưa có món khả dụng.
                        </p>
                      ) : (
                        category.items.map((item) => (
                          <MenuRow key={item.id} item={item} cart={cart} onAdd={addMenuItem} onDec={(id) => decrement(id)} />
                        ))
                      )}
                    </CustomerMenuGrid>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>

        <StickyCartBar
          count={cartCount}
          total={previewTotal}
          label="Xem giỏ & gọi món"
          onClick={() => {
            setError(null);
            setCartOpen(true);
          }}
          hidden={cartCount === 0}
        />
      </>
    );
  }

  function renderTracking() {
    if (!created) return renderMenu();
    const lifecycle = getCustomerOrderLifecycle(toLifecycleOrder(created.order)!);
    const rows = created.order.items ?? [];
    return (
      <>
        <TopBar
          title="Theo dõi đơn"
          subtitle={`${shortDineInOrderCode(created)} · ${table.name}`}
          onBack={() => setScreen("menu")}
          right={
            <button type="button" onClick={() => void showHelp()} aria-label="Gọi nhân viên" className="grid h-10 w-10 place-items-center rounded-full text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-90">
              <Bell size={20} />
            </button>
          }
        />
        <div className="flex-1 px-4 py-4 shop-screen-in">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <SectionLabel>Trạng thái</SectionLabel>
                <p className="mt-1 text-[length:var(--fs-h3)] font-bold text-[var(--text)]">{lifecycle.label}</p>
              </div>
              <Pill tone={realtimeState === "connected" ? "ok" : realtimeState === "error" ? "warn" : "neutral"}>
                {realtimeState === "connected" ? <span className="shop-live-dot" /> : null}
                {realtimeState === "connected" ? "Live" : realtimeState === "error" ? "Gián đoạn" : "Đang nối"}
              </Pill>
            </div>
            <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">Gửi lúc {formatTime(created.order.createdAt)} · dự kiến 15–20 phút</p>
            <div className="mt-4">
              <Timeline order={created.order} />
            </div>
          </Card>

          <Card className="mt-4 p-4">
            <SectionLabel>Chi tiết món</SectionLabel>
            <div className="mt-2 divide-y divide-[var(--line)]">
              {rows.length > 0 ? (
                rows.map((item, index) => (
                  <div key={`${item.menuItem?.id ?? index}`} className="grid grid-cols-[1fr_auto] gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">
                        {item.menuItem?.name ?? "Món đã gọi"}
                      </span>
                      {item.modifierSummary ? (
                        <span className="mt-0.5 block truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{item.modifierSummary}</span>
                      ) : null}
                      <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">x{item.quantity}</span>
                    </span>
                    <Money value={item.quantity * item.price} className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]" />
                  </div>
                ))
              ) : (
                <p className="py-3 text-center text-[length:var(--fs-xs)] text-[var(--text-muted)]">Quán đang đồng bộ chi tiết món.</p>
              )}
            </div>
          </Card>

          <p className="mt-3 text-center text-[length:var(--fs-xs)] text-[var(--text-muted)]">{realtimeLabel(realtimeState)}</p>
          {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}
        </div>

        <div className="sticky bottom-0 z-[var(--z-cartbar)] grid gap-2 border-t border-[var(--line)] bg-[var(--surface)]/95 px-4 pt-3 backdrop-blur-md" style={{ paddingBottom: "calc(var(--s-3) + var(--safe-bottom))" }}>
          <ShopButton variant="secondary" size="lg" fullWidth onClick={() => setScreen("menu")}>
            Gọi thêm món
          </ShopButton>
          <ShopButton size="lg" fullWidth disabled={!canStartPayment} onClick={() => setScreen("payment-choice")}>
            {canStartPayment ? "Đã xong? Thanh toán" : "Chờ quán xác nhận đơn"}
          </ShopButton>
        </div>
      </>
    );
  }

  function renderHero(title: string, subtitle: string, order: CreatedOrder, ctas: React.ReactNode) {
    return (
      <>
        <section className="bg-[var(--jade)] px-5 pb-10 pt-8 text-center text-[var(--on-jade)]" style={{ paddingTop: "calc(var(--s-8) + var(--safe-top))" }}>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--on-jade)]/15">
            <PackageCheckMark />
          </div>
          <h1 className="mt-4 text-[length:var(--fs-display)] font-bold">{title}</h1>
          <p className="mx-auto mt-2 max-w-xs text-[length:var(--fs-sm)] leading-[var(--lh-body)] text-[var(--on-jade)]/85">{subtitle}</p>
        </section>
        <div className="-mt-5 flex-1 rounded-t-[var(--r-2xl)] bg-[var(--bg)] px-4 pb-6 pt-5 shop-screen-in">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[length:var(--fs-h3)] font-bold text-[var(--text)]">Đơn {shortDineInOrderCode(order)}</h2>
              <span className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">{formatTime(order.order.createdAt)}</span>
            </div>
            <div className="mt-4">
              <Timeline order={order.order} />
            </div>
          </Card>
          {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}
          <div className="mt-5 grid gap-2">{ctas}</div>
        </div>
      </>
    );
  }

  function renderOrderSent() {
    if (!created) return renderMenu();
    return renderHero(
      "Đã gửi yêu cầu gọi món!",
      "Quán đang xác nhận đơn hàng của bạn.",
      created,
      <ShopButton size="lg" fullWidth onClick={() => setScreen("tracking")}>
        Theo dõi đơn hàng
      </ShopButton>
    );
  }

  function renderPaymentPending() {
    if (!created) return renderMenu();
    return renderHero("Đã gửi thanh toán!", "Quán đang xác nhận thanh toán của bạn.", created, null);
  }

  function renderPaymentSuccess() {
    if (!created) return renderMenu();
    return renderHero(
      "Thanh toán thành công!",
      "Cảm ơn bạn, hẹn gặp lại.",
      created,
      <>
        <ShopButton variant="secondary" size="lg" fullWidth onClick={() => setScreen("invoice")}>
          Xem hóa đơn
        </ShopButton>
        <ShopButton size="lg" fullWidth onClick={() => setScreen("menu")}>
          Về menu
        </ShopButton>
      </>
    );
  }

  function renderPaymentChoice() {
    if (!created) return renderMenu();
    return (
      <>
        <TopBar title={`Đơn ${shortDineInOrderCode(created)}`} subtitle={table.name} onBack={() => setScreen("tracking")} loading={paymentLoading} />
        <div className="flex-1 px-4 py-5 shop-screen-in">
          <div className="text-center">
            <h1 className="text-[length:var(--fs-h1)] font-bold text-[var(--text)]">Bạn đã dùng xong?</h1>
            <p className="mt-1 text-[length:var(--fs-sm)] text-[var(--text-muted)]">Chọn phương thức thanh toán</p>
            <p className="mt-3 shop-num text-[length:var(--fs-display)] font-bold text-[var(--text)]">{formatVnd(currentPayableTotal)}</p>
          </div>

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => setScreen("menu")}
              className="flex items-center justify-between gap-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-left transition active:scale-[0.99]"
            >
              <span>
                <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--jade)]">Gọi thêm món?</span>
                <span className="mt-0.5 block text-[length:var(--fs-xs)] text-[var(--text-muted)]">Món gọi thêm sẽ gộp vào hóa đơn bàn nếu chưa thanh toán.</span>
              </span>
              <Plus size={18} className="shrink-0 text-[var(--jade)]" />
            </button>
            <PayMethodCard
              icon={<Banknote size={20} />}
              title="Tiền mặt"
              subtitle="Thanh toán khi nhân viên mang hóa đơn"
              disabled={!canStartPayment || paymentLoading}
              onClick={() => startPayment("CASH")}
            />
            <PayMethodCard
              icon={<Landmark size={20} />}
              title="VietQR"
              subtitle="Quét mã thanh toán qua app ngân hàng"
              disabled={!canStartPayment || paymentLoading}
              onClick={() => startPayment("QR")}
            />
          </div>
          {error ? <div className="mt-4"><ErrorNote>{error}</ErrorNote></div> : null}
        </div>
      </>
    );
  }

  function renderCashPayment() {
    if (!created) return renderMenu();
    return (
      <>
        <TopBar title="Thanh toán tiền mặt" subtitle={table.name} onBack={() => setScreen("payment-choice")} />
        <div className="flex-1 px-4 py-5">
          <Card className="p-5 text-center">
            <SectionLabel>Tổng thanh toán</SectionLabel>
            <p className="mt-1 shop-num text-[length:var(--fs-display)] font-bold text-[var(--text)]">{formatVnd(currentPayableTotal)}</p>
            <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">(Đã bao gồm VAT)</p>
          </Card>
          <div className="mt-4 rounded-[var(--r-lg)] bg-[var(--surface-2)] p-4 text-center">
            <p className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">Vui lòng thanh toán cho nhân viên</p>
            <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">Nhân viên sẽ xác nhận và xuất hóa đơn cho bạn.</p>
          </div>
          <div className="mt-5">
            <ShopButton variant="ghost" size="lg" fullWidth onClick={() => setScreen("payment-choice")}>
              Đổi phương thức
            </ShopButton>
          </div>
        </div>
      </>
    );
  }

  function renderVietQr() {
    if (!created) return renderMenu();
    const qr = created.payment?.method === "QR" ? created.payment : null;
    return (
      <>
        <TopBar title="Thanh toán VietQR" subtitle={table.name} onBack={() => setScreen("payment-choice")} loading={paymentLoading} />
        <div className="flex-1 px-4 py-5 text-center shop-screen-in">
          <SectionLabel>Tổng thanh toán</SectionLabel>
          <p className="mt-1 shop-num text-[length:var(--fs-display)] font-bold text-[var(--text)]">{formatVnd(currentPayableTotal)}</p>

          <div className="mx-auto mt-5 w-[244px] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--sh-md)]">
            {qr ? (
              <Image src={qr.url} alt="Mã VietQR thanh toán" width={220} height={220} unoptimized className="h-[220px] w-[220px] rounded-[var(--r-md)] bg-white" />
            ) : (
              <div className="grid h-[220px] w-[220px] place-items-center rounded-[var(--r-md)] bg-[var(--surface-2)] text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                Đang tạo mã QR...
              </div>
            )}
          </div>

          {qr ? (
            <Card className="mx-auto mt-4 max-w-xs p-4 text-left">
              <MoneyRow label="Ngân hàng" value={qr.bank} />
              <div className="mt-1.5"><MoneyRow label="Chủ TK" value={qr.accountName || "—"} /></div>
              <div className="mt-1.5"><MoneyRow label="Số TK" value={<span className="shop-num">{qr.account}</span>} /></div>
              <div className="mt-1.5"><MoneyRow label="Nội dung CK" value={<span className="font-mono text-[length:var(--fs-xs)]">{qr.transferContent}</span>} strong /></div>
            </Card>
          ) : null}

          <p className="mt-4 text-[length:var(--fs-xs)] text-[var(--text-muted)]">
            Mã hết hạn sau <span className="font-bold text-[var(--orange-600)]">{formatCountdown(qrSeconds)}</span>
          </p>
          {error ? <div className="mt-3"><ErrorNote>{error}</ErrorNote></div> : null}
        </div>
        <div className="sticky bottom-0 z-[var(--z-cartbar)] grid gap-2 border-t border-[var(--line)] bg-[var(--surface)]/95 px-4 pt-3 backdrop-blur-md" style={{ paddingBottom: "calc(var(--s-3) + var(--safe-bottom))" }}>
          <ShopButton size="lg" fullWidth loading={paymentLoading} disabled={!qr} onClick={markPaid}>
            Tôi đã chuyển khoản
          </ShopButton>
          <ShopButton variant="ghost" size="md" fullWidth onClick={() => setScreen("payment-choice")}>
            Đổi phương thức
          </ShopButton>
        </div>
      </>
    );
  }

  function renderInvoice() {
    if (!created) return renderMenu();
    const receiptEntries = created.order.bill
      ? history.filter((entry) => entry.order.bill?.id === created.order.bill?.id)
      : [created];
    const entries = receiptEntries.some((entry) => entry.order.id === created.order.id) ? receiptEntries : [created, ...receiptEntries];
    const rows = entries.flatMap((entry) => entry.order.items ?? []);
    const subtotal = rows.reduce((sum, item) => sum + item.quantity * item.price, 0) || entries.reduce((sum, e) => sum + (e.order.subtotal ?? e.order.total), 0);
    const discount = entries.reduce((sum, e) => sum + (e.order.discountAmount ?? 0), 0);
    const billTotal = created.order.bill?.total ?? created.order.total;
    return (
      <>
        <TopBar title="Hóa đơn" subtitle={table.name} onBack={() => setScreen("payment-success")} />
        <div className="flex-1 px-4 py-4">
          <Card className="p-5 text-center">
            <h2 className="text-[length:var(--fs-h2)] font-bold text-[var(--text)]">{restaurant.name}</h2>
            <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">{restaurant.address || "Địa chỉ quán"}</p>
            <p className="mt-3 text-[length:var(--fs-sm)] font-bold tracking-wide text-[var(--text)]">HÓA ĐƠN THANH TOÁN</p>
            <p className="mt-1 text-[length:var(--fs-xs)] text-[var(--text-muted)]">{invoiceCode(created.order.bill?.id ?? created.order.id)} · {table.name}</p>

            <div className="mt-4 divide-y divide-[var(--line)] text-left">
              {rows.length > 0 ? (
                rows.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr_auto] gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{item.menuItem?.name ?? "Món"}</span>
                      {item.modifierSummary ? <span className="block text-[length:var(--fs-xs)] text-[var(--text-muted)]">{item.modifierSummary}</span> : null}
                      <span className="text-[length:var(--fs-xs)] text-[var(--text-faint)]">x{item.quantity}</span>
                    </span>
                    <Money value={item.quantity * item.price} className="text-[length:var(--fs-sm)] font-semibold text-[var(--text)]" />
                  </div>
                ))
              ) : (
                <p className="py-3 text-center text-[length:var(--fs-xs)] text-[var(--text-muted)]">Chi tiết món sẽ hiển thị khi quán đồng bộ.</p>
              )}
            </div>

            <div className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4 text-left">
              <MoneyRow label="Tạm tính" value={<Money value={subtotal} />} />
              {discount > 0 ? <MoneyRow label="Giảm giá" value={`-${formatVnd(discount)}`} tone="accent" /> : null}
              <MoneyRow label="Tổng cộng" value={<Money value={billTotal} />} strong />
            </div>
            <p className="mt-4 text-[length:var(--fs-xs)] leading-[var(--lh-body)] text-[var(--text-muted)]">
              {restaurant.receiptFooter || "Cảm ơn bạn đã ghé quán!"}
            </p>
          </Card>
          <div className="mt-5">
            <ShopButton size="lg" fullWidth leftIcon={<Receipt size={18} />} onClick={() => window.print()}>
              Tải hóa đơn
            </ShopButton>
          </div>
        </div>
      </>
    );
  }

  function renderOrders() {
    return (
      <>
        <TopBar
          title="Đơn của bàn"
          subtitle={table.name}
          onBack={() => setScreen("menu")}
          loading={historyLoading}
          right={
            <button type="button" onClick={() => void loadOrderHistory()} className="px-2 text-[length:var(--fs-xs)] font-bold text-[var(--jade)]">
              Làm mới
            </button>
          }
        />
        <div className="flex-1 px-4 py-4 shop-screen-in">
          <Card className="bg-[var(--surface-2)] p-4">
            <p className="text-[length:var(--fs-sm)] font-bold text-[var(--text)]">{openHistory.length} đơn đang mở</p>
            <p className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--text-muted)]">
              Tạm tính chưa thanh toán <Money value={openHistoryTotal} className="font-semibold text-[var(--text)]" />
            </p>
          </Card>

          <div className="mt-4 grid gap-3 shop-stagger">
            {historyLoading && history.length === 0 ? (
              <>
                <Skeleton className="h-[92px] rounded-[var(--r-lg)]" />
                <Skeleton className="h-[92px] rounded-[var(--r-lg)]" />
              </>
            ) : null}
            {!historyLoading && history.length === 0 ? (
              <EmptyState icon={<ClipboardList size={22} />} title="Chưa có đơn nào" description="Các đơn gọi từ thiết bị này sẽ hiển thị ở đây." />
            ) : null}
            {history.map((entry) => (
              <button key={entry.order.id} type="button" onClick={() => openEntry(entry)} className="w-full text-left">
                <Card interactive className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[length:var(--fs-sm)] font-bold text-[var(--text)]">{shortDineInOrderCode(entry)}</p>
                      <p className="mt-0.5 text-[length:var(--fs-xs)] text-[var(--text-muted)]">{formatTime(entry.order.createdAt)}</p>
                    </div>
                    <Pill tone="jade">{orderStatusLabel(entry.order.status as OrderStatus)}</Pill>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
                    <span className="text-[length:var(--fs-xs)] text-[var(--text-muted)]">{paymentMethodLabel(dineInPayableMethod(entry))}</span>
                    <Money value={dineInPayableTotal(entry)} className="text-[length:var(--fs-body)] font-bold text-[var(--text)]" />
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  function renderScreen() {
    switch (screen) {
      case "order-sent":
        return renderOrderSent();
      case "tracking":
        return renderTracking();
      case "payment-choice":
        return renderPaymentChoice();
      case "cash-payment":
        return renderCashPayment();
      case "vietqr-payment":
        return renderVietQr();
      case "payment-pending":
        return renderPaymentPending();
      case "payment-success":
        return renderPaymentSuccess();
      case "invoice":
        return renderInvoice();
      case "orders":
        return renderOrders();
      default:
        return renderMenu();
    }
  }

  return (
    <ShopShell>
      {renderScreen()}

      {/* Toast */}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 z-[var(--z-toast)] flex justify-center px-4" style={{ bottom: "calc(var(--cartbar-h) + var(--safe-bottom) + 1rem)" }} role="status">
          <span className="rounded-[var(--r-pill)] bg-[var(--jade)] px-4 py-2 text-[length:var(--fs-xs)] font-semibold text-[var(--on-jade)] shadow-[var(--sh-lg)]">
            {toast}
          </span>
        </div>
      ) : null}

      {/* Floating staff-call on menu/tracking */}
      {(screen === "menu" || screen === "tracking") ? (
        <button
          type="button"
          onClick={() => void showHelp()}
          disabled={staffCallLoading}
          aria-label="Gọi nhân viên"
          className="fixed right-4 z-[var(--z-cartbar)] inline-flex h-11 items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--jade)] px-3.5 text-[length:var(--fs-xs)] font-bold text-[var(--on-jade)] shadow-[var(--sh-lg)] transition active:scale-95 disabled:opacity-60"
          style={{ bottom: `calc(${cartCount > 0 && screen === "menu" ? "var(--cartbar-h) + " : ""}var(--safe-bottom) + 1.25rem)` }}
        >
          <Bell size={15} />
          {staffCallLoading ? "Đang gọi" : "Gọi NV"}
        </button>
      ) : null}

      {/* Cart sheet */}
      <BottomSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        size="tall"
        title="Giỏ hàng"
        description={table.name}
        footer={
          <ShopButton size="lg" fullWidth loading={loading} disabled={cart.length === 0} onClick={submitOrder}>
            Gọi món · {formatVnd(previewTotal)}
          </ShopButton>
        }
      >
        {cart.length === 0 ? (
          <EmptyState icon={<ShoppingBag size={22} />} title="Chưa có món nào" description="Quay lại menu để chọn món trước khi gửi đơn." />
        ) : (
          <div className="grid gap-3">
            {restaurant.promotions.length > 0 ? (
              <button
                type="button"
                onClick={() => setPromoOpen(true)}
                className="flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[length:var(--fs-sm)] font-bold text-[var(--orange-600)]">
                    {selectedPromotion ? `Mã: ${selectedPromotion.code}` : "Dùng mã ưu đãi"}
                  </span>
                  <span className="block truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">
                    {previewDiscount > 0 ? `Giảm ${formatVnd(previewDiscount)}` : "Chọn mã trước khi gửi món"}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-[var(--orange-600)]" />
              </button>
            ) : null}

            {cart.map((item) => (
              <div key={item.lineId} className="flex gap-3">
                <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
                  <ItemThumb src={item.image} alt={item.name} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[length:var(--fs-sm)] font-semibold text-[var(--text)]">{item.name}</p>
                      {item.modifierSummary ? <p className="truncate text-[length:var(--fs-xs)] text-[var(--text-muted)]">{item.modifierSummary}</p> : null}
                      <Money value={item.price} className="text-[length:var(--fs-xs)] font-semibold text-[var(--text)]" />
                    </div>
                    <button type="button" onClick={() => remove(item.lineId)} aria-label={`Xóa ${item.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--text-faint)] hover:text-[var(--danger-fg)]">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <input
                    value={item.note ?? ""}
                    onChange={(e) => setNote(item.lineId, e.target.value)}
                    maxLength={200}
                    placeholder="Ghi chú món"
                    className="mt-1.5 h-9 w-full rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[length:var(--fs-xs)] outline-none focus:border-[var(--jade)]"
                  />
                  <div className="mt-1.5 flex justify-end">
                    <QtyStepper
                      size="sm"
                      value={item.quantity}
                      min={1}
                      onChange={(q) => {
                        if (q > item.quantity) add({ menuItemId: item.menuItemId, name: item.name, price: item.price, image: item.image, modifiers: item.modifiers, modifierSummary: item.modifierSummary });
                        else decrement(item.lineId);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}

            <label className="mt-1 grid gap-1.5">
              <SectionLabel>Ghi chú cho quán</SectionLabel>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                rows={2}
                placeholder="Ví dụ: ít đá, không đường..."
                className="resize-none rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[length:var(--fs-sm)] outline-none focus:border-[var(--jade)]"
              />
            </label>

            <div className="grid gap-2 border-t border-[var(--line)] pt-3">
              <MoneyRow label="Tạm tính" value={<Money value={total} />} />
              {previewDiscount > 0 ? <MoneyRow label="Khuyến mãi" value={`-${formatVnd(previewDiscount)}`} tone="accent" /> : null}
              <MoneyRow label="Tổng cộng" value={<Money value={previewTotal} />} strong />
            </div>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </div>
        )}
      </BottomSheet>

      {/* Promotions sheet */}
      <BottomSheet open={promoOpen} onClose={() => setPromoOpen(false)} title="Mã ưu đãi" description="Chọn mã trước khi gửi món.">
        <div className="grid gap-2">
          {restaurant.promotions.slice(0, 6).map((promotion) => {
            const selected = selectedPromotion?.id === promotion.id;
            const evaluation = evaluatePublicPromotion({ itemSubtotal: total, deliveryFee: 0, promotion });
            return (
              <button
                key={promotion.id}
                type="button"
                onClick={() => setSelectedPromotionCode(selected ? "" : promotion.code)}
                className={`rounded-[var(--r-md)] border px-3 py-2.5 text-left transition ${selected ? "border-[var(--jade)] bg-[var(--primary-soft)]" : "border-[var(--line)] bg-[var(--surface)]"}`}
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
          <label className="mt-1 grid gap-1.5">
            <SectionLabel>Nhập mã khác</SectionLabel>
            <input
              value={selectedPromotionCode}
              onChange={(e) => setSelectedPromotionCode(normalizePromotionCode(e.target.value))}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="SALE20"
              className="h-11 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 font-mono text-[length:var(--fs-sm)] font-bold uppercase outline-none focus:border-[var(--jade)]"
            />
          </label>
          {selectedPromotionCode ? (
            <p className={`text-[length:var(--fs-xs)] font-semibold ${previewDiscount > 0 ? "text-[var(--ok-fg)]" : "text-[var(--warn-fg)]"}`}>
              {selectedPromotion
                ? promotionEligibilityMessage({ promotion: selectedPromotion, itemSubtotal: total, deliveryFee: 0, isDeliveryMode: false })
                : "Mã chưa nằm trong danh sách công khai, hệ thống sẽ kiểm tra khi gửi đơn."}
            </p>
          ) : null}
          <ShopButton size="lg" fullWidth variant="secondary" onClick={() => setPromoOpen(false)}>
            Xong
          </ShopButton>
        </div>
      </BottomSheet>

      {/* Modifier customizer */}
      <ModifierSheet state={customizing} onChange={setCustomizing} onClose={() => setCustomizing(null)} onConfirm={confirmCustomItem} />

      {/* AI assistant */}
      <CustomerAiAssistant
        restaurantSlug={restaurant.slug}
        customerSessionId={customerSessionId}
        cart={cart}
        orderStatus={created?.order ?? openHistory[0]?.order ?? null}
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
      className={`inline-flex h-9 shrink-0 items-center rounded-[var(--r-pill)] px-3.5 text-[length:var(--fs-sm)] font-semibold transition ${
        active ? "bg-[var(--jade)] text-[var(--on-jade)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

function MenuRow({
  item,
  cart,
  onAdd,
  onDec
}: {
  item: PublicMenuItem;
  cart: CartLine[];
  onAdd: (item: PublicMenuItem) => void;
  onDec: (menuItemId: string) => void;
}) {
  const quantity = cart.reduce((sum, line) => sum + (line.menuItemId === item.id ? line.quantity : 0), 0);
  const hasModifiers = hasMenuModifiers(item);
  return (
    <CustomerMenuCard
      name={item.name}
      price={item.price}
      quantity={quantity}
      hasOptions={hasModifiers}
      onAdd={() => onAdd(item)}
      onQuantityChange={(q) => (q > quantity ? onAdd(item) : onDec(item.id))}
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
  disabled,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[72px] w-full items-center gap-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-3 text-left shadow-[var(--sh-sm)] transition active:scale-[0.99] disabled:opacity-55"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--primary-soft)] text-[var(--jade)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[length:var(--fs-body)] font-bold text-[var(--text)]">{title}</span>
        <span className="mt-0.5 block text-[length:var(--fs-xs)] text-[var(--text-muted)]">{subtitle}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-[var(--text-faint)]" />
    </button>
  );
}

function PackageCheckMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
