"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChefHat,
  CircleHelp,
  Clock3,
  Gift,
  Landmark,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  Trash2,
  UserRound,
  Utensils
} from "lucide-react";
import { create } from "zustand";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { AiAgentAction } from "@/types/ai-agent";
import type { PaymentMethod, TableBillStatus } from "@/types/domain";
import type { PublicMenuCategory, PublicPromotion } from "@/types";

type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
  note?: string;
};

type CartStore = {
  items: Record<string, CartItem>;
  add: (item: Omit<CartItem, "quantity">) => void;
  decrement: (menuItemId: string) => void;
  remove: (menuItemId: string) => void;
  setNote: (menuItemId: string, note: string) => void;
  clear: () => void;
};

const useCart = create<CartStore>((set) => ({
  items: {},
  add: (item) =>
    set((state) => ({
      items: {
        ...state.items,
        [item.menuItemId]: {
          ...item,
          quantity: (state.items[item.menuItemId]?.quantity ?? 0) + 1,
          note: state.items[item.menuItemId]?.note
        }
      }
    })),
  decrement: (menuItemId) =>
    set((state) => {
      const current = state.items[menuItemId];
      if (!current) return state;
      const next = { ...state.items };
      if (current.quantity <= 1) {
        delete next[menuItemId];
      } else {
        next[menuItemId] = { ...current, quantity: current.quantity - 1 };
      }
      return { items: next };
    }),
  remove: (menuItemId) =>
    set((state) => {
      const next = { ...state.items };
      delete next[menuItemId];
      return { items: next };
    }),
  setNote: (menuItemId, note) =>
    set((state) => {
      const current = state.items[menuItemId];
      if (!current) return state;
      return {
        items: {
          ...state.items,
          [menuItemId]: { ...current, note }
        }
      };
    }),
  clear: () => set({ items: {} })
}));

type PaymentInfo =
  | {
      method: "QR";
      url: string;
      amount: number;
      bank: string;
      account: string;
      accountName?: string;
      transferContent: string;
    }
  | {
      method: "CASH";
      amount: number;
      message: string;
    };

type CreatedOrder = {
  order: {
    id: string;
    status: string;
    subtotal?: number;
    discountAmount?: number;
    promotionCode?: string | null;
    total: number;
    paymentMethod: "QR" | "CASH" | null;
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
    items?: Array<{
      quantity: number;
      price: number;
      note: string | null;
      menuItem: { id?: string; name: string } | null;
    }>;
  };
  payment: PaymentInfo | null;
};

type RealtimeState = "idle" | "connecting" | "connected" | "error";
type CustomerView = "menu" | "cart" | "orders";
type StepState = "done" | "active" | "pending";

const customerSessionTtlMs = 24 * 60 * 60 * 1000;

function customerSessionStorageKey(restaurantId: string, tableId: string) {
  return `logivn:customer-session:${restaurantId}:${tableId}`;
}

function persistCustomerSession(key: string, id: string) {
  window.localStorage.setItem(key, JSON.stringify({ id, createdAt: Date.now() }));
}

function createCustomerSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatCustomerOrderTime(value?: string) {
  if (!value) return "Vừa gửi";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function isOpenOrder(status: string) {
  return ["pending", "ordering", "completed", "waiting_payment", "waiting_confirm"].includes(status);
}

function payableTotal(entry: CreatedOrder) {
  return entry.order.bill?.total ?? entry.order.total;
}

function payableMethod(entry: CreatedOrder) {
  return entry.order.bill?.paymentMethod ?? entry.order.paymentMethod;
}

function realtimeLabel(state: RealtimeState) {
  if (state === "connected") return "Cập nhật realtime đang hoạt động";
  if (state === "connecting") return "Đang kết nối cập nhật đơn";
  if (state === "error") return "Realtime tạm gián đoạn, vui lòng làm mới nếu cần";
  return "Đơn sẽ tự cập nhật sau khi gửi";
}

function shortOrderCode(id: string) {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function customerInvoiceCode(id: string) {
  return `HD-${id.slice(0, 6).toUpperCase()}`;
}

function formatReceiptVnd(amount: number) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

function calculatePublicPromotionDiscount(subtotal: number, promotion: PublicPromotion | null) {
  if (!promotion || subtotal < promotion.minOrderAmount) return 0;
  if (promotion.discountType === "PERCENT") {
    return Math.min(subtotal, Math.round((subtotal * promotion.discountValue) / 100));
  }
  return Math.min(subtotal, promotion.discountValue);
}

function promotionDescription(promotion: PublicPromotion) {
  const value = promotion.discountType === "PERCENT" ? `${promotion.discountValue}%` : formatVnd(promotion.discountValue);
  if (promotion.minOrderAmount > 0) return `Giảm ${value} cho hóa đơn từ ${formatVnd(promotion.minOrderAmount)}`;
  return `Giảm ${value} cho đơn hiện tại`;
}

function itemDescription(restaurantName: string) {
  return `Món đang sẵn sàng phục vụ tại ${restaurantName}.`;
}

function statusTone(status: string) {
  if (status === "cancelled") return "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--accent-strong)]";
  if (status === "completed" || status === "paid") {
    return "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]";
  }
  if (status === "waiting_confirm") {
    return "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }
  return "border-[var(--secondary)] bg-[var(--secondary-soft)] text-[var(--primary-strong)]";
}

function liveStatusCopy(status: string, paymentMethod: PaymentMethod | null) {
  if (status === "waiting_payment") return "Quét VietQR rồi bấm Tôi đã thanh toán để quán kiểm tra nhanh hơn.";
  if (status === "waiting_confirm") {
    return paymentMethod === "QR"
      ? "Quán đang đối chiếu giao dịch VietQR của bạn."
      : "Nhân viên sẽ xác nhận thanh toán tiền mặt tại bàn.";
  }
  if (status === "paid") return "Đơn đã thanh toán xong. Cảm ơn bạn đã dùng bữa.";
  if (status === "completed") return "Món đã được phục vụ. Khi dùng xong bạn có thể thanh toán tại đây.";
  if (status === "ordering") return "Quán đã xác nhận đơn và đang chuẩn bị món cho bàn.";
  if (status === "cancelled") return "Đơn đã bị huỷ. Vui lòng gọi nhân viên nếu cần hỗ trợ.";
  return "Đơn đã gửi, đang chờ quán xác nhận.";
}

function getOrderSteps(status: string, paymentMethod: PaymentMethod | null) {
  const isAccepted = ["ordering", "completed", "waiting_payment", "waiting_confirm", "paid"].includes(status);
  const isServed = ["completed", "waiting_payment", "waiting_confirm", "paid"].includes(status);
  const isPaymentStarted = ["waiting_payment", "waiting_confirm", "paid"].includes(status);
  const isCancelled = status === "cancelled";

  const paymentLabel = paymentMethod === "QR" ? "Thanh toán VietQR" : paymentMethod === "CASH" ? "Xác nhận tiền mặt" : "Thanh toán sau";
  const paymentDescription =
    paymentMethod === "QR"
      ? "Chờ bạn quét mã và báo đã chuyển khoản"
      : paymentMethod === "CASH"
        ? "Nhân viên xác nhận tại bàn"
        : "Chọn VietQR hoặc tiền mặt sau khi dùng xong";

  return [
    {
      label: "Đã gửi đơn",
      description: "Quán đã nhận yêu cầu gọi món",
      icon: ReceiptText,
      state: isCancelled ? "done" : "done"
    },
    {
      label: "Quán xác nhận",
      description: "Nhân viên kiểm tra và chuyển đơn xuống bếp",
      icon: ChefHat,
      state: status === "pending" ? "active" : isAccepted ? "done" : "pending"
    },
    {
      label: "Đã phục vụ",
      description: "Bạn có thể gọi thêm hoặc thanh toán sau khi dùng xong",
      icon: CheckCircle2,
      state: status === "ordering" ? "active" : isServed ? "done" : isCancelled ? "active" : "pending"
    },
    {
      label: paymentLabel,
      description: paymentDescription,
      icon: paymentMethod === "QR" ? Landmark : Banknote,
      state: status === "waiting_payment" || status === "waiting_confirm" ? "active" : status === "paid" ? "done" : isPaymentStarted ? "done" : "pending"
    }
  ] satisfies Array<{ label: string; description: string; icon: LucideIcon; state: StepState }>;
}

function ReceiptInvoice({
  restaurant,
  table,
  entry,
  entries
}: {
  restaurant: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    hotline: string | null;
    contactEmail: string | null;
    receiptFooter: string | null;
    receiptShowQr: boolean;
  };
  table: { name: string };
  entry: CreatedOrder;
  entries: CreatedOrder[];
}) {
  const bill = entry.order.bill;
  const paidAt = bill?.paidAt ?? new Date().toISOString();
  const payment = entry.payment;
  const rows = entries.flatMap((orderEntry) => orderEntry.order.items ?? []);
  const subtotal = entries.reduce((sum, orderEntry) => sum + (orderEntry.order.subtotal ?? orderEntry.order.total + (orderEntry.order.discountAmount ?? 0)), 0);
  const discount = entries.reduce((sum, orderEntry) => sum + (orderEntry.order.discountAmount ?? 0), 0);
  const total = bill?.total ?? entry.order.total;
  const paymentLabel = paymentMethodLabel(bill?.paymentMethod ?? entry.order.paymentMethod);

  return (
    <section className="logivn-receipt w-full max-w-full rounded-[22px] p-2.5 sm:rounded-[28px] sm:p-5">
      <div className="receipt-border min-w-0 rounded-[18px] p-3 sm:rounded-[22px] sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="grid content-start gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {restaurant.logoUrl ? (
                <Image src={restaurant.logoUrl} alt={`Logo ${restaurant.name}`} width={96} height={96} className="h-11 w-11 shrink-0 rounded-xl object-cover sm:h-14 sm:w-14 sm:rounded-2xl" />
              ) : (
                <LogiVNLogo className="h-10 shrink-0 sm:h-14" priority />
              )}
              <div className="min-w-0">
                <p className="break-words text-lg font-black leading-tight text-[var(--primary)] sm:text-xl">{restaurant.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)] sm:text-xs sm:tracking-[0.18em]">Smart ordering. Better service.</p>
              </div>
            </div>
            <div className="receipt-info-card grid gap-2 rounded-2xl p-3 text-xs sm:p-4 sm:text-sm">
              <p className="receipt-row"><span>Tên quán</span><strong>{restaurant.name}</strong></p>
              <p className="receipt-row"><span>Địa chỉ</span><strong>{restaurant.address || "Chưa cấu hình"}</strong></p>
              <p className="receipt-row"><span>Hotline</span><strong>{restaurant.hotline || "Chưa cấu hình"}</strong></p>
              <p className="receipt-row"><span>Email</span><strong>{restaurant.contactEmail || "Chưa cấu hình"}</strong></p>
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-center text-2xl font-black leading-tight text-[var(--primary)] sm:text-4xl">HÓA ĐƠN THANH TOÁN</h2>
            <div className="receipt-info-card mt-3 grid gap-2 rounded-2xl p-3 text-xs sm:mt-4 sm:p-4 sm:text-sm">
              <p className="receipt-row"><span>Mã hóa đơn</span><strong className="font-mono text-[var(--accent)]">{customerInvoiceCode(bill?.id ?? entry.order.id)}</strong></p>
              <p className="receipt-row"><span>Ngày giờ</span><strong>{formatCustomerOrderTime(paidAt)}</strong></p>
              <p className="receipt-row"><span>Bàn</span><strong>{table.name}</strong></p>
              <p className="receipt-row"><span>Thanh toán</span><strong>{paymentLabel}</strong></p>
            </div>
          </div>
        </div>

        <div className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-[rgba(15,77,58,0.34)] sm:mt-5">
          <div className="grid grid-cols-[26px_minmax(0,1fr)_28px_76px] gap-1 bg-[var(--primary)] px-2 py-2.5 text-[10px] font-black uppercase text-[#FFF7EB] sm:grid-cols-[42px_minmax(0,1fr)_42px_96px] sm:gap-2 sm:px-3 sm:py-3 sm:text-xs">
            <span>STT</span>
            <span>Món</span>
            <span className="text-center">SL</span>
            <span className="text-right">T.Tiền</span>
          </div>
          <div className="divide-y divide-[rgba(169,197,161,0.45)] bg-white/58">
            {rows.map((item, index) => (
              <div key={`${item.menuItem?.id ?? item.menuItem?.name ?? "item"}-${index}`} className="grid grid-cols-[26px_minmax(0,1fr)_28px_76px] items-start gap-1 px-2 py-2.5 text-xs sm:grid-cols-[42px_minmax(0,1fr)_42px_96px] sm:gap-2 sm:px-3 sm:py-3 sm:text-sm">
                <span className="tabular-nums">{index + 1}</span>
                <span className="min-w-0 break-words font-semibold">{item.menuItem?.name ?? "Món đã gọi"}</span>
                <span className="text-center font-bold tabular-nums">{item.quantity}</span>
                <span className="min-w-0 text-right font-bold tabular-nums">{formatReceiptVnd(item.quantity * item.price)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid min-w-0 gap-3 sm:mt-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="grid gap-3">
            <div className="receipt-info-card rounded-2xl p-3 text-sm sm:p-4">
              <p className="text-xs font-black uppercase text-[var(--primary)]">Thanh toán</p>
              <p className="mt-2 font-black">{paymentLabel}</p>
              <p className="mt-2 flex items-center gap-2 font-bold text-[var(--primary)]"><CheckCircle2 size={17} /> Đã thanh toán</p>
            </div>
            {restaurant.receiptShowQr && payment?.method === "QR" ? (
              <div className="receipt-info-card rounded-2xl p-3 text-center sm:p-4">
                <p className="text-xs font-black uppercase text-[var(--primary)]">Mã QR thanh toán</p>
                <Image src={payment.url} alt="QR thanh toán" width={128} height={128} unoptimized className="mx-auto mt-3 h-28 w-28 rounded-xl bg-white p-2 sm:h-32 sm:w-32" />
              </div>
            ) : null}
          </div>
          <div className="receipt-info-card min-w-0 rounded-2xl p-3 sm:p-4">
            <div className="grid gap-3 text-sm">
              <p className="receipt-row"><span>Tạm tính</span><strong>{formatReceiptVnd(subtotal)}</strong></p>
              <p className="receipt-row"><span>Giảm giá</span><strong className="text-[var(--accent)]">-{formatReceiptVnd(discount)}</strong></p>
              <p className="receipt-row"><span>Phí dịch vụ</span><strong>{formatReceiptVnd(0)}</strong></p>
              <p className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-[rgba(242,140,40,0.34)] bg-[#FFF7EB] px-3 py-3 font-black sm:mt-2 sm:px-4">
                <span>TỔNG CỘNG</span>
                <span className="whitespace-nowrap text-xl text-[var(--accent)] sm:text-2xl">{formatReceiptVnd(total)}</span>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-sm font-semibold text-[var(--primary)]">
          {restaurant.receiptFooter || "Cảm ơn quý khách đã sử dụng dịch vụ. Hẹn gặp lại quý khách."}
        </p>
      </div>
    </section>
  );
}

function FlowHeader({
  title,
  subtitle,
  onBack
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/75 px-5 py-4 shadow-[0_10px_30px_rgba(43,43,43,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          aria-label={onBack ? "Quay lại" : "Mã QR bàn"}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-container)] text-[var(--primary)] transition active:scale-95"
        >
          {onBack ? <ArrowLeft size={21} /> : <QrCode size={21} />}
        </button>
        <div className="min-w-0 text-center">
          <div className="flex justify-center">
            <LogiVNLogo className="h-8" priority />
          </div>
          {subtitle ? <p className="truncate text-xs font-semibold text-[var(--muted-foreground)]">{subtitle}</p> : null}
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--muted-foreground)]"
          aria-hidden="true"
        >
          <UserRound size={20} />
        </div>
      </div>
      {title ? <h1 className="sr-only">{title}</h1> : null}
    </header>
  );
}

function QuantityControl({
  quantity,
  onMinus,
  onPlus,
  compact = false
}: {
  quantity: number;
  onMinus: () => void;
  onPlus: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center rounded-full bg-[var(--surface-container)] p-1", compact ? "gap-1" : "gap-2")}>
      <button
        type="button"
        onClick={onMinus}
        aria-label="Giảm số lượng"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] shadow-sm transition active:scale-95"
      >
        <Minus size={16} />
      </button>
      <span className="w-7 text-center text-sm font-bold tabular-nums">{quantity}</span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="Tăng số lượng"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-hover)] text-[#FFF7EB] shadow-sm transition active:scale-95"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function EmptyImage({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--surface-container)] text-[var(--primary)]">
      <Utensils size={24} aria-label={label} />
    </div>
  );
}

function BottomNav({
  active,
  cartCount,
  onMenu,
  onCart,
  onOrders,
  onHelp
}: {
  active: "menu" | "cart" | "orders";
  cartCount: number;
  onMenu: () => void;
  onCart: () => void;
  onOrders: () => void;
  onHelp: () => void;
}) {
  const items = [
    { key: "menu", label: "Món", icon: Utensils, onClick: onMenu },
    { key: "cart", label: "Giỏ", icon: ShoppingCart, onClick: onCart, count: cartCount },
    { key: "orders", label: "Đơn", icon: ReceiptText, onClick: onOrders },
    { key: "help", label: "Hỗ trợ", icon: CircleHelp, onClick: onHelp }
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-4xl justify-around rounded-t-[28px] border-t border-[var(--border)] bg-[var(--surface)]/80 px-4 pb-7 pt-3 shadow-[0_-10px_40px_rgba(43,43,43,0.12)] backdrop-blur-2xl">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <button
            type="button"
            key={item.key}
            onClick={item.onClick}
            className={cn(
              "relative flex min-w-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-xs font-bold text-[var(--outline)] transition active:scale-95",
              isActive && "customer-cta -translate-y-1 px-5 text-[#FFF7EB]"
            )}
          >
            {"count" in item && item.count ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary-hover)] px-1 text-[10px] text-[#FFF7EB]">
                {item.count}
              </span>
            ) : null}
            <Icon size={21} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function CustomerOrderClient({
  restaurant,
  table,
  categories
}: {
  restaurant: {
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
  table: { id: string; name: string };
  categories: PublicMenuCategory[];
}) {
  const { items, add, decrement, remove, setNote, clear } = useCart();
  const cart = Object.values(items);
  const [activeView, setActiveView] = useState<CustomerView>("menu");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "all");
  const [customerSessionId, setCustomerSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<CreatedOrder[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState<string | null>(null);
  const [pendingOrderFingerprint, setPendingOrderFingerprint] = useState<string | null>(null);
  const [selectedPromotionCode, setSelectedPromotionCode] = useState(restaurant.promotions[0]?.code ?? "");
  const [staffCallLoading, setStaffCallLoading] = useState(false);
  const [staffCallSent, setStaffCallSent] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const selectedPromotion = useMemo(
    () => restaurant.promotions.find((promotion) => promotion.code === selectedPromotionCode) ?? null,
    [restaurant.promotions, selectedPromotionCode]
  );
  const previewDiscount = useMemo(() => calculatePublicPromotionDiscount(total, selectedPromotion), [selectedPromotion, total]);
  const previewTotal = Math.max(0, total - previewDiscount);
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const menuItemCount = useMemo(
    () => categories.reduce((sum, category) => sum + (category.items?.length ?? 0), 0),
    [categories]
  );
  const cartSignature = useMemo(
    () =>
      JSON.stringify(
        cart.map((item) => ({
          id: item.menuItemId,
          quantity: item.quantity,
          note: item.note ?? ""
        }))
      ),
    [cart]
  );
  const filtered = categoryId === "all" ? categories : categories.filter((category) => category.id === categoryId);
  const createdOrderId = created?.order.id;
  const customerSessionKey = useMemo(() => customerSessionStorageKey(restaurant.id, table.id), [restaurant.id, table.id]);
  const openHistory = useMemo(() => history.filter((entry) => isOpenOrder(entry.order.status)), [history]);
  const openHistoryTotal = useMemo(() => openHistory.reduce((sum, entry) => sum + entry.order.total, 0), [openHistory]);

  function ensureCustomerSessionId() {
    if (customerSessionId) return customerSessionId;
    const id = createCustomerSessionId();
    persistCustomerSession(customerSessionKey, id);
    setCustomerSessionId(id);
    return id;
  }

  function mergeHistoryOrder(next: CreatedOrder) {
    setHistory((current) => [next, ...current.filter((entry) => entry.order.id !== next.order.id)]);
  }

  function patchStoredOrder(orderId: string, patch: Partial<CreatedOrder["order"]>) {
    const applyPatch = (entry: CreatedOrder) => ({ ...entry, order: { ...entry.order, ...patch } });
    setHistory((current) => current.map((entry) => (entry.order.id === orderId ? applyPatch(entry) : entry)));
    setCreated((current) => (current?.order.id === orderId ? applyPatch(current) : current));
  }

  function patchStoredBill(billId: string, patch: Partial<NonNullable<CreatedOrder["order"]["bill"]>>) {
    const applyPatch = (entry: CreatedOrder) =>
      entry.order.bill?.id === billId
        ? {
            ...entry,
            order: {
              ...entry.order,
              bill: { ...entry.order.bill, ...patch }
            }
          }
        : entry;
    setHistory((current) => current.map(applyPatch));
    setCreated((current) => (current ? applyPatch(current) : current));
  }

  async function showHelp() {
    if (staffCallLoading) return;
    const sessionId = ensureCustomerSessionId();
    setStaffCallLoading(true);
    setStaffCallSent(false);
    setError(null);
    try {
      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          tableId: table.id,
          customerSessionId: sessionId,
          message: "Khách cần nhân viên hỗ trợ tại bàn."
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không gọi được nhân viên");
      setStaffCallSent(true);
      window.setTimeout(() => setStaffCallSent(false), 2600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gọi được nhân viên");
    } finally {
      setStaffCallLoading(false);
    }
  }

  const loadOrderHistory = useCallback(
    async ({ openLatest = false }: { openLatest?: boolean } = {}) => {
      if (!customerSessionId) return [];
      setHistoryLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          restaurantSlug: restaurant.slug,
          tableId: table.id,
          customerSessionId
        });
        const response = await fetch(`/api/orders/history?${params.toString()}`, { cache: "no-store" });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error ?? "Không tải được lịch sử gọi món");

        const orders = (json.data.orders ?? []) as CreatedOrder[];
        setHistory(orders);
        if (openLatest && orders[0]) {
          setCreated(orders[0]);
          setRealtimeState("connecting");
        }
        return orders;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được lịch sử gọi món");
        return [];
      } finally {
        setHistoryLoading(false);
      }
    },
    [customerSessionId, restaurant.slug, table.id]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(customerSessionKey);
        const parsed = saved ? (JSON.parse(saved) as { id?: string; createdAt?: number }) : null;
        const isValid =
          parsed?.id &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parsed.id) &&
          parsed.createdAt &&
          Date.now() - parsed.createdAt < customerSessionTtlMs;

        if (isValid) {
          setCustomerSessionId(parsed.id!);
          return;
        }
      } catch {
        // A broken localStorage entry should never block ordering.
      }

      const id = createCustomerSessionId();
      persistCustomerSession(customerSessionKey, id);
      setCustomerSessionId(id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [customerSessionKey]);

  useEffect(() => {
    if (!customerSessionId) return;
    const timer = window.setTimeout(() => {
      void loadOrderHistory();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [customerSessionId, loadOrderHistory]);

  async function submitOrder() {
    if (cart.length === 0 || loading) return;
    const sessionId = ensureCustomerSessionId();
    const orderFingerprint = JSON.stringify({ cartSignature, customerNote, selectedPromotionCode });
    const idempotencyKey =
      pendingIdempotencyKey && pendingOrderFingerprint === orderFingerprint ? pendingIdempotencyKey : crypto.randomUUID();
    setPendingIdempotencyKey(idempotencyKey);
    setPendingOrderFingerprint(orderFingerprint);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          tableId: table.id,
          customerSessionId: sessionId,
          customerNote,
          promotionCode: selectedPromotionCode || undefined,
          idempotencyKey,
          items: cart.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            note: item.note
          }))
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không gửi được đơn hàng");
      setRealtimeState("connecting");
      setCreated(json.data);
      mergeHistoryOrder(json.data);
      setPendingIdempotencyKey(null);
      setPendingOrderFingerprint(null);
      clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được đơn hàng");
    } finally {
      setLoading(false);
    }
  }

  async function markPaid() {
    if (!created) return;
    const sessionId = ensureCustomerSessionId();
    setPaymentLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${created.order.id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          tableId: table.id,
          customerSessionId: sessionId
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không cập nhật được thanh toán");
      patchStoredOrder(created.order.id, json.data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được thanh toán");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function startPayment(method: PaymentMethod) {
    if (!created) return;
    const sessionId = ensureCustomerSessionId();
    setPaymentLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${created.order.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          tableId: table.id,
          customerSessionId: sessionId,
          paymentMethod: method
        })
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error ?? "Không tạo được yêu cầu thanh toán");
      setCreated(json.data);
      mergeHistoryOrder(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được yêu cầu thanh toán");
    } finally {
      setPaymentLoading(false);
    }
  }

  async function openOrderHistory() {
    setCreated(null);
    setActiveView("orders");
    if (!customerSessionId) {
      setError("LogiVN đang chuẩn bị phiên gọi món. Vui lòng thử lại sau vài giây.");
      return;
    }

    await loadOrderHistory();
  }

  function handleCustomerAgentAction(action: AiAgentAction) {
    if (action.uiTarget === "add_item") {
      const item = action.body as { menuItemId?: string; categoryId?: string; name?: string; price?: number; image?: string | null } | undefined;
      if (!item?.menuItemId || !item.name || typeof item.price !== "number") return;
      add({
        menuItemId: item.menuItemId,
        name: item.name,
        price: item.price,
        image: item.image ?? null
      });
      if (item.categoryId) setCategoryId(item.categoryId);
      setCreated(null);
      setActiveView("cart");
      setError(null);
      return;
    }

    if (action.uiTarget === "menu_category") {
      const body = action.body as { categoryId?: string } | undefined;
      if (body?.categoryId) setCategoryId(body.categoryId);
      setCreated(null);
      setActiveView("menu");
      setError(null);
      return;
    }

    if (action.uiTarget === "menu") {
      setCreated(null);
      setActiveView("menu");
      setError(null);
      return;
    }

    if (action.uiTarget === "cart") {
      setCreated(null);
      setActiveView("cart");
      setError(null);
      return;
    }

    if (action.uiTarget === "orders" || action.uiTarget === "payment") {
      const body = action.body as { action?: string } | undefined;
      if (body?.action === "mark_paid") {
        void markPaid();
        return;
      }
      void openOrderHistory();
      return;
    }

    if (action.uiTarget === "staff_call") {
      void showHelp();
    }
  }

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
          payment_method?: PaymentMethod | null;
          updated_at?: string;
        };
        if (!next.status) return;

        patchStoredOrder(createdOrderId, {
          status: next.status,
          total: next.total,
          paymentMethod: next.payment_method
        });

        if (next.status === "paid") {
          const paidAt = next.updated_at ?? new Date().toISOString();
          if (billId) {
            patchStoredBill(billId, {
              status: "paid",
              total: next.total,
              paymentMethod: next.payment_method ?? created?.order.paymentMethod ?? null,
              paidAt,
              closedAt: paidAt
            });
          }

          void loadOrderHistory().then((orders) => {
            const refreshed = orders.find((entry) => entry.order.id === createdOrderId)
              ?? (billId ? orders.find((entry) => entry.order.bill?.id === billId) : undefined);
            if (refreshed) setCreated(refreshed);
          });
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("connected");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeState("error");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [created?.order.bill?.id, created?.order.paymentMethod, createdOrderId, loadOrderHistory]);

  if (created) {
    const currentPaymentMethod = payableMethod(created);
    const currentPayableTotal = payableTotal(created);
    const steps = getOrderSteps(created.order.status, currentPaymentMethod);
    const isWaitingQrPayment = created.payment?.method === "QR" && created.order.status === "waiting_payment";
    const canStartPayment = ["ordering", "completed"].includes(created.order.status);
    const isPaid = created.order.status === "paid" || created.order.bill?.status === "paid";
    const receiptEntries = created.order.bill
      ? history.filter((entry) => entry.order.bill?.id === created.order.bill?.id)
      : [created];
    const normalizedReceiptEntries = receiptEntries.some((entry) => entry.order.id === created.order.id)
      ? receiptEntries
      : [created, ...receiptEntries];

    return (
      <main className="stitch-customer customer-shell-glow relative min-h-screen bg-[var(--background)] pb-10">
        <FlowHeader title="Trạng thái đơn" subtitle={restaurant.name} />
        <CustomerAiAssistant
          restaurantSlug={restaurant.slug}
          customerSessionId={customerSessionId}
          cart={cart}
          orderStatus={created.order}
          onAgentAction={handleCustomerAgentAction}
        />
        <div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-7">
          <section className="flex flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--primary-hover)] text-[#FFF7EB] shadow-[0_12px_38px_rgba(15,77,58,0.22)]">
              <CheckCircle2 size={48} />
            </div>
            <p className="mt-6 text-sm font-bold text-[var(--muted-foreground)]">{shortOrderCode(created.order.id)}</p>
            <h1 className="mt-1 text-4xl font-black leading-tight text-[var(--foreground)]">
              {isPaid ? "Đã thanh toán" : "Đơn đã được nhận"}
            </h1>
            <p className="mt-3 text-base leading-7 text-[var(--muted-foreground)]">
              {liveStatusCopy(created.order.status, currentPaymentMethod)}
            </p>
          </section>

          {isPaid ? (
            <section className="rounded-2xl border border-[var(--primary)] bg-[var(--primary-soft)] p-4 text-center text-sm font-bold text-[var(--primary-strong)]">
              Thanh toán đã được quán xác nhận. Hóa đơn chi tiết nằm ngay bên dưới.
            </section>
          ) : null}

          <section className="customer-glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-[var(--outline)]">TỔNG THANH TOÁN</p>
                <p className="mt-2 text-3xl font-black text-[var(--foreground)]">{formatVnd(currentPayableTotal)}</p>
                {created.order.bill ? (
                  <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">Hóa đơn bàn gồm nhiều lượt gọi món</p>
                ) : null}
                {(created.order.discountAmount ?? 0) > 0 ? (
                  <p className="mt-1 text-xs font-black text-[var(--accent)]">
                    Đã áp mã {created.order.promotionCode}: -{formatVnd(created.order.discountAmount ?? 0)}
                  </p>
                ) : null}
              </div>
              <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", statusTone(created.order.status))}>
                {orderStatusLabel(created.order.status)}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
              <Clock3 size={16} />
              {realtimeLabel(realtimeState)}
            </div>
          </section>

          {isPaid ? (
            <ReceiptInvoice
              restaurant={restaurant}
              table={table}
              entry={created}
              entries={normalizedReceiptEntries.length ? normalizedReceiptEntries : [created]}
            />
          ) : null}

          {!isPaid && !created.payment ? (
            <section className="customer-glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Thanh toán sau khi dùng xong</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                    Bạn có thể gọi thêm món nhiều lần. Khi muốn thanh toán, chọn VietQR hoặc tiền mặt cho hóa đơn bàn này.
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <ReceiptText size={23} />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {(["QR", "CASH"] as PaymentMethod[]).map((method) => {
                  const Icon = method === "QR" ? Landmark : Banknote;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => startPayment(method)}
                      disabled={!canStartPayment || paymentLoading}
                      className="flex min-h-16 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          method === "QR" ? "bg-[var(--primary-hover)] text-[#FFF7EB]" : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        )}
                      >
                        <Icon size={21} />
                      </span>
                      <span>
                        <span className="block text-sm font-black">{paymentMethodLabel(method)}</span>
                        <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                          {method === "QR" ? `Tạo mã cho ${formatVnd(currentPayableTotal)}` : "Nhờ nhân viên xác nhận"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {!canStartPayment ? (
                <p className="mt-4 rounded-xl bg-[var(--surface-container)] p-3 text-sm font-semibold text-[var(--muted-foreground)]">
                  Quán cần xác nhận đơn trước khi thanh toán.
                </p>
              ) : null}
            </section>
          ) : !isPaid && created.payment?.method === "QR" ? (
            <section className="customer-glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Thanh toán VietQR</h2>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">Quét mã, chuyển đúng nội dung bên dưới.</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Landmark size={22} />
                </div>
              </div>
              <Image
                src={created.payment.url}
                alt="Mã VietQR thanh toán đơn hàng"
                width={280}
                height={280}
                unoptimized
                className="mx-auto mt-5 h-64 w-64 rounded-2xl bg-white p-3 shadow-sm"
              />
              <dl className="mt-5 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">Ngân hàng</dt>
                  <dd className="font-bold">{created.payment.bank}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted-foreground)]">Số tài khoản</dt>
                  <dd className="font-bold">{created.payment.account}</dd>
                </div>
                {created.payment.accountName ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--muted-foreground)]">Chủ tài khoản</dt>
                    <dd className="text-right font-bold">{created.payment.accountName}</dd>
                  </div>
                ) : null}
                <div className="rounded-xl bg-[var(--surface-container)] p-3">
                  <dt className="text-xs font-semibold text-[var(--muted-foreground)]">Nội dung chuyển khoản</dt>
                  <dd className="mt-1 break-all font-mono text-sm font-bold">{created.payment.transferContent}</dd>
                </div>
              </dl>
              {isWaitingQrPayment ? (
                <Button className="customer-cta mt-5 h-12 w-full rounded-xl" onClick={markPaid} disabled={paymentLoading}>
                  <CheckCircle2 size={18} />
                  {paymentLoading ? "Đang cập nhật..." : "Tôi đã thanh toán"}
                </Button>
              ) : (
                <div className="mt-5 rounded-xl bg-[var(--primary-soft)] p-3 text-sm font-semibold text-[var(--primary)]">
                  Quán sẽ xác nhận thanh toán và cập nhật trạng thái ngay trên màn hình này.
                </div>
              )}
            </section>
          ) : !isPaid ? (
            <section className="customer-glass-card rounded-2xl p-5">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <Banknote size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black">Thanh toán tiền mặt</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                    {created.payment?.method === "CASH" ? created.payment.message : "Nhân viên sẽ xác nhận thanh toán tại bàn."}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="customer-glass-card rounded-2xl bg-[var(--surface-container)] p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[var(--primary-hover)] shadow-[0_0_12px_rgba(15,77,58,0.8)]" />
              <h2 className="text-sm font-black text-[var(--primary)]">CẬP NHẬT TRỰC TIẾP</h2>
            </div>
            <div className="relative grid gap-6">
              <div className="absolute bottom-5 left-5 top-5 w-0.5 bg-[var(--border)]" />
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="relative z-10 flex gap-4">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--surface)]",
                        step.state === "done" && "border-[var(--primary-hover)] bg-[var(--primary-hover)] text-[#FFF7EB]",
                        step.state === "active" &&
                          "border-[var(--primary-hover)] bg-[var(--surface)] text-[var(--primary-hover)] ring-4 ring-[var(--primary-soft)]",
                        step.state === "pending" && "border-[var(--border)] text-[var(--outline)] opacity-60"
                      )}
                    >
                      <Icon size={19} />
                    </div>
                    <div className={cn("pt-1", step.state === "pending" && "opacity-60")}>
                      <h3 className={cn("text-sm font-black", step.state === "active" && "text-[var(--primary-hover)]")}>
                        {step.label}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {error ? <p className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{error}</p> : null}

          <Button
            className="h-14 w-full rounded-xl bg-[var(--accent)] text-[#FFF7EB] shadow-[0_10px_28px_rgba(242,140,40,0.28)] hover:bg-[var(--accent-hover)]"
            onClick={() => {
              setCreated(null);
              setActiveView("menu");
              setError(null);
            }}
          >
            <Plus size={18} />
            Gọi thêm món
          </Button>
        </div>
      </main>
    );
  }

  if (activeView === "orders") {
    return (
      <main className="stitch-customer customer-shell-glow relative min-h-screen bg-[var(--background)] pb-40">
        <FlowHeader title="Lịch sử gọi món" subtitle={restaurant.name} onBack={() => setActiveView("menu")} />
        <div className="mx-auto grid max-w-4xl gap-5 px-5 py-6">
          <section className="customer-glass-card rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[var(--primary)]">{table.name}</p>
                <h1 className="mt-1 text-3xl font-black">Đơn của bàn</h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  LogiVN tự khôi phục lịch sử bằng phiên ẩn danh trên thiết bị này và các đơn đang mở của bàn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadOrderHistory()}
                disabled={historyLoading}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--primary-soft)] px-4 text-sm font-black text-[var(--primary)] transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={historyLoading ? "animate-spin" : ""} size={17} />
                Làm mới
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[var(--surface-container)] p-4">
                <p className="text-xs font-bold text-[var(--outline)]">ĐƠN ĐANG MỞ</p>
                <p className="metric-number mt-2 text-2xl font-black">{openHistory.length}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface-container)] p-4 sm:col-span-2">
                <p className="text-xs font-bold text-[var(--outline)]">TẠM TÍNH CHƯA THANH TOÁN</p>
                <p className="metric-number mt-2 text-2xl font-black text-[var(--primary-hover)]">{formatVnd(openHistoryTotal)}</p>
              </div>
            </div>
          </section>

          {historyLoading && history.length === 0 ? (
            <section className="customer-glass-card rounded-2xl p-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Đang tải lại lịch sử gọi món...
            </section>
          ) : null}

          {!historyLoading && history.length === 0 ? (
            <section className="customer-glass-card rounded-2xl p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                <ReceiptText size={24} />
              </div>
              <h2 className="mt-4 text-xl font-black">Chưa có đơn nào</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Chọn món và gửi đơn để bắt đầu theo dõi tại đây.</p>
              <Button className="customer-cta mt-5 rounded-xl" onClick={() => setActiveView("menu")}>
                Chọn món ngay
              </Button>
            </section>
          ) : null}

          <section className="grid gap-3">
            {history.map((entry) => (
              <button
                type="button"
                key={entry.order.id}
                onClick={() => {
                  setCreated(entry);
                  setRealtimeState("connecting");
                }}
                className="customer-glass-card rounded-2xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(43,43,43,0.12)] active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[var(--foreground)]">{shortOrderCode(entry.order.id)}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                      {formatCustomerOrderTime(entry.order.createdAt)}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-bold", statusTone(entry.order.status))}>
                    {orderStatusLabel(entry.order.status)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2">
                  {(entry.order.items ?? []).slice(0, 3).map((item, index) => (
                    <div key={`${entry.order.id}-${index}`} className="flex justify-between gap-4 text-sm">
                      <span className="truncate text-[var(--muted-foreground)]">
                        {item.quantity}x {item.menuItem?.name ?? "Món đã gọi"}
                      </span>
                      <span className="metric-number shrink-0 font-semibold">{formatVnd(item.quantity * item.price)}</span>
                    </div>
                  ))}
                  {(entry.order.items?.length ?? 0) > 3 ? (
                    <p className="text-xs font-semibold text-[var(--primary)]">+{(entry.order.items?.length ?? 0) - 3} món khác</p>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
                  <span className="text-sm font-semibold text-[var(--muted-foreground)]">{paymentMethodLabel(payableMethod(entry))}</span>
                  <span className="metric-number text-xl font-black text-[var(--primary-hover)]">{formatVnd(entry.order.total)}</span>
                </div>
                {entry.order.bill ? (
                  <p className="mt-2 text-right text-xs font-semibold text-[var(--muted-foreground)]">
                    Hóa đơn bàn: {formatVnd(entry.order.bill.total)}
                  </p>
                ) : null}
              </button>
            ))}
          </section>

          {error ? <p className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{error}</p> : null}
        </div>

        <BottomNav
          active="orders"
          cartCount={cartCount}
          onMenu={() => setActiveView("menu")}
          onCart={() => setActiveView("cart")}
          onOrders={openOrderHistory}
          onHelp={() => void showHelp()}
        />
      </main>
    );
  }

  if (activeView === "cart") {
    return (
      <main className="stitch-customer customer-shell-glow relative min-h-screen bg-[var(--background)] pb-40">
        <FlowHeader title="Giỏ hàng" subtitle={restaurant.name} onBack={() => setActiveView("menu")} />
        <div className="mx-auto grid max-w-4xl gap-6 px-5 py-6 md:grid-cols-[minmax(0,1fr)_360px]">
          <section className="grid gap-4">
            <div>
              <p className="text-sm font-bold text-[var(--primary)]">{table.name}</p>
              <h1 className="mt-1 text-3xl font-black">Giỏ hàng của bạn</h1>
            </div>

            {cart.length === 0 ? (
              <div className="customer-glass-card rounded-2xl p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                  <ShoppingCart size={24} />
                </div>
                <h2 className="mt-4 text-xl font-black">Chưa có món nào</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Quay lại thực đơn để chọn món trước khi gửi đơn.</p>
                <Button className="mt-5" variant="secondary" onClick={() => setActiveView("menu")}>
                  Chọn món
                </Button>
              </div>
            ) : (
              cart.map((item) => (
                <article key={item.menuItemId} className="customer-glass-card rounded-2xl p-5">
                  <div className="flex gap-4">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-container)]">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={112}
                          height={112}
                          sizes="112px"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <EmptyImage label={item.name} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-black">{item.name}</h2>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{itemDescription(restaurant.name)}</p>
                        </div>
                        <p className="shrink-0 text-sm font-black text-[var(--primary)]">{formatVnd(item.price * item.quantity)}</p>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <QuantityControl
                          quantity={item.quantity}
                          onMinus={() => decrement(item.menuItemId)}
                          onPlus={() =>
                            add({
                              menuItemId: item.menuItemId,
                              name: item.name,
                              price: item.price,
                              image: item.image
                            })
                          }
                          compact
                        />
                        <button
                          type="button"
                          onClick={() => remove(item.menuItemId)}
                          aria-label={`Xoá ${item.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--danger)] transition hover:bg-[var(--danger-soft)] active:scale-95"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <label className="mt-4 grid gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
                    Ghi chú cho món
                    <input
                      value={item.note ?? ""}
                      onChange={(event) => setNote(item.menuItemId, event.target.value)}
                      className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                      placeholder="Ví dụ: ít cay, không hành..."
                    />
                  </label>
                </article>
              ))
            )}

            <button
              type="button"
              onClick={() => setActiveView("menu")}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] text-sm font-black text-[var(--primary)] transition hover:bg-[var(--primary-soft)] active:scale-[0.98]"
            >
              <Plus size={19} />
              Thêm món khác
            </button>
          </section>

          <aside className="customer-glass-card h-fit rounded-2xl p-5 md:sticky md:top-24">
            <h2 className="text-2xl font-black">Tóm tắt đơn</h2>
            <div className="mt-5 grid gap-3 border-b border-[var(--border)] pb-5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--muted-foreground)]">Số món</span>
                <span className="font-bold">{cartCount} món</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--muted-foreground)]">Tạm tính</span>
                <span className="font-bold">{formatVnd(total)}</span>
              </div>
              {selectedPromotion ? (
                <div className="rounded-xl border border-[rgba(242,140,40,0.24)] bg-[#FFF7EB] p-3">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--muted-foreground)]">Mã {selectedPromotion.code}</span>
                    <span className="font-bold text-[var(--accent)]">-{formatVnd(previewDiscount)}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">
                    {previewDiscount > 0 ? promotionDescription(selectedPromotion) : `Cần đạt ${formatVnd(selectedPromotion.minOrderAmount)} để áp dụng`}
                  </p>
                </div>
              ) : restaurant.promotions.length > 0 ? (
                <label className="grid gap-2 text-sm font-black">
                  Mã khuyến mãi
                  <select
                    value={selectedPromotionCode}
                    onChange={(event) => setSelectedPromotionCode(event.target.value)}
                    className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)]"
                  >
                    <option value="">Không dùng mã</option>
                    {restaurant.promotions.map((promotion) => (
                      <option key={promotion.id} value={promotion.code}>{promotion.code} - {promotion.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <span className="text-lg font-black">Tổng cộng</span>
              <span className="text-3xl font-black text-[var(--primary-hover)]">{formatVnd(previewTotal)}</span>
            </div>
            <label className="mt-5 grid gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
              Ghi chú cho quán
              <Textarea
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                placeholder="Ví dụ: mang thêm chén, phục vụ món sau..."
                className="rounded-xl"
              />
            </label>
            {error ? <p className="mt-4 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)]">{error}</p> : null}
            <Button
              className="customer-cta mt-5 hidden h-12 w-full rounded-xl md:inline-flex"
              disabled={cart.length === 0 || loading}
              onClick={submitOrder}
            >
              {loading ? "Đang gửi món..." : "Gửi món cho quán"}
              <ChefHat size={18} />
            </Button>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-[96px] z-40 px-5 md:hidden">
          <Button
            className="customer-cta h-14 w-full rounded-xl px-6"
            disabled={cart.length === 0 || loading}
            onClick={submitOrder}
          >
            <span className="mr-auto">{formatVnd(previewTotal)}</span>
            {loading ? "Đang gửi..." : "Gửi món"}
            <ChefHat size={18} />
          </Button>
        </div>
        <BottomNav
          active="cart"
          cartCount={cartCount}
          onMenu={() => setActiveView("menu")}
          onCart={() => setActiveView("cart")}
          onOrders={openOrderHistory}
          onHelp={() => void showHelp()}
        />
      </main>
    );
  }

  return (
    <main className="stitch-customer customer-shell-glow relative min-h-screen bg-[var(--background)] pb-44">
      <FlowHeader title="Thực đơn" subtitle={restaurant.name} />
      <CustomerAiAssistant
        restaurantSlug={restaurant.slug}
        customerSessionId={customerSessionId}
        cart={cart}
        orderStatus={openHistory[0]?.order ?? null}
        onAgentAction={handleCustomerAgentAction}
      />

      <div className="mx-auto max-w-4xl px-5 py-5">
        <section className="customer-glass-card flex items-center justify-between gap-4 rounded-2xl p-5">
          <div>
            <p className="text-sm font-bold text-[var(--muted-foreground)]">ĐANG GỌI MÓN CHO</p>
            <h1 className="mt-2 text-3xl font-black">{table.name}</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {restaurant.name} có {menuItemCount} món đang phục vụ.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void showHelp()}
            disabled={staffCallLoading}
            className="flex min-h-14 shrink-0 items-center gap-2 rounded-2xl bg-[var(--primary-hover)] px-4 text-sm font-black text-[#FFF7EB] shadow-[0_10px_26px_rgba(15,77,58,0.2)] transition active:scale-95 disabled:opacity-60"
          >
            <CircleHelp size={20} />
            {staffCallLoading ? "Đang gọi" : "Gọi NV"}
          </button>
        </section>

        {staffCallSent ? (
          <div className="mt-3 rounded-2xl border border-[rgba(15,77,58,0.24)] bg-[#A9C5A1]/22 px-4 py-3 text-sm font-black text-[var(--primary)]">
            Quán đã nhận yêu cầu gọi nhân viên cho {table.name}.
          </div>
        ) : null}

        {restaurant.promotions.length > 0 ? (
          <section className="mt-4 rounded-2xl border border-[rgba(242,140,40,0.28)] bg-[#FFF7EB]/92 p-4 shadow-[0_10px_26px_rgba(43,43,43,0.06)]">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent)] text-white">
                <Gift size={18} />
              </span>
              <div>
                <p className="text-sm font-black text-[var(--primary)]">Mã khuyến mãi hôm nay</p>
                <p className="text-xs font-semibold text-[var(--muted-foreground)]">Chọn mã, hệ thống tự trừ khi gửi món.</p>
              </div>
            </div>
            <div className="hide-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              <button
                type="button"
                onClick={() => setSelectedPromotionCode("")}
                className={cn(
                  "min-h-11 shrink-0 rounded-full border px-4 text-sm font-black transition active:scale-95",
                  !selectedPromotionCode ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[rgba(169,197,161,0.42)] bg-white/70 text-[var(--primary)]"
                )}
              >
                Không dùng mã
              </button>
              {restaurant.promotions.map((promotion) => (
                <button
                  key={promotion.id}
                  type="button"
                  onClick={() => setSelectedPromotionCode(promotion.code)}
                  className={cn(
                    "min-h-11 shrink-0 rounded-full border px-4 text-left text-sm font-black transition active:scale-95",
                    selectedPromotionCode === promotion.code
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[rgba(242,140,40,0.3)] bg-white/70 text-[var(--primary)]"
                  )}
                >
                  {promotion.code}
                  <span className="ml-2 font-semibold opacity-80">{promotion.discountType === "PERCENT" ? `-${promotion.discountValue}%` : `-${formatVnd(promotion.discountValue)}`}</span>
                </button>
              ))}
            </div>
            {selectedPromotion ? (
              <p className="mt-2 text-xs font-bold text-[var(--muted-foreground)]">{promotionDescription(selectedPromotion)}</p>
            ) : null}
          </section>
        ) : null}

        {history.length > 0 ? (
          <section className="customer-glass-card mt-4 flex items-center justify-between gap-4 rounded-2xl p-4">
            <div className="min-w-0">
              <p className="text-sm font-black text-[var(--foreground)]">
                {openHistory.length > 0 ? `${openHistory.length} đơn đang mở` : "Lịch sử gọi món đã lưu"}
              </p>
              <p className="mt-1 truncate text-sm text-[var(--muted-foreground)]">
                {openHistory.length > 0 ? `Tạm tính chưa thanh toán ${formatVnd(openHistoryTotal)}` : "Bạn có thể xem lại các lượt gọi món gần đây."}
              </p>
            </div>
            <button
              type="button"
              onClick={openOrderHistory}
              className="shrink-0 rounded-full bg-[var(--primary-hover)] px-4 py-2 text-sm font-black text-[#FFF7EB] transition active:scale-95"
            >
              Xem đơn
            </button>
          </section>
        ) : null}

        <section className="mt-4">
          <div className="hide-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-2">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              className={cn(
                "h-11 shrink-0 rounded-full border px-5 text-sm font-bold transition active:scale-95",
                categoryId === "all"
                  ? "border-[var(--primary-hover)] bg-[var(--primary-hover)] text-[#FFF7EB] shadow-sm"
                  : "border-[var(--border)] bg-[var(--surface-container)] text-[var(--foreground)]"
              )}
            >
              Tất cả
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={cn(
                  "h-11 shrink-0 rounded-full border px-5 text-sm font-bold transition active:scale-95",
                  categoryId === category.id
                    ? "border-[var(--primary-hover)] bg-[var(--primary-hover)] text-[#FFF7EB] shadow-sm"
                    : "border-[var(--border)] bg-[var(--surface-container)] text-[var(--foreground)]"
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 grid gap-5">
          {filtered.map((category) => (
            <div key={category.id} className="grid gap-3">
              {categoryId === "all" ? <h2 className="text-lg font-black">{category.name}</h2> : null}
              {category.items.length === 0 ? (
                <div className="customer-glass-card rounded-2xl p-5 text-sm text-[var(--muted-foreground)]">
                  Danh mục này chưa có món khả dụng.
                </div>
              ) : (
                category.items.map((item) => {
                  const quantity = items[item.id]?.quantity ?? 0;
                  return (
                    <article
                      key={item.id}
                      className="customer-glass-card flex min-h-[120px] overflow-hidden rounded-2xl transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(43,43,43,0.12)]"
                    >
                      <div className="h-auto w-[118px] shrink-0 bg-[var(--surface-container)] sm:w-[150px]">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            width={180}
                            height={150}
                            sizes="(min-width: 640px) 150px, 118px"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <EmptyImage label={item.name} />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
                        <div>
                          <h3 className="truncate text-lg font-black">{item.name}</h3>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
                            {itemDescription(restaurant.name)}
                          </p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="font-black text-[var(--primary-hover)]">{formatVnd(item.price)}</span>
                          {quantity > 0 ? (
                            <QuantityControl
                              quantity={quantity}
                              onMinus={() => decrement(item.id)}
                              onPlus={() =>
                                add({
                                  menuItemId: item.id,
                                  name: item.name,
                                  price: item.price,
                                  image: item.image
                                })
                              }
                              compact
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                add({
                                  menuItemId: item.id,
                                  name: item.name,
                                  price: item.price,
                                  image: item.image
                                })
                              }
                              aria-label={`Thêm ${item.name}`}
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-container-highest)] text-[var(--primary-hover)] transition hover:bg-[var(--primary-soft)] active:scale-95"
                            >
                              <Plus size={20} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          ))}
        </section>
      </div>

      {error ? (
        <div className="fixed inset-x-0 bottom-[180px] z-40 px-5">
          <p className="mx-auto max-w-4xl rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--accent-strong)] shadow-sm">{error}</p>
        </div>
      ) : null}

      {cart.length > 0 ? (
        <div className="fixed inset-x-0 bottom-[96px] z-40 px-5">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setActiveView("cart");
            }}
            className="customer-glass-card mx-auto flex h-20 w-full max-w-4xl items-center justify-between rounded-2xl px-4 transition active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-hover)] text-sm font-black text-[#FFF7EB]">
                {cartCount}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-[var(--muted-foreground)]">GIỎ HIỆN TẠI</p>
                <p className="text-base font-black text-[var(--primary-hover)]">{formatVnd(previewTotal)}</p>
                {previewDiscount > 0 ? <p className="text-[11px] font-bold text-[var(--accent)]">Đã trừ {formatVnd(previewDiscount)}</p> : null}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-[var(--primary-soft)] px-4 py-2 text-sm font-black text-[var(--primary)]">
              Xem giỏ
              <ArrowLeft className="rotate-180" size={17} />
            </div>
          </button>
        </div>
      ) : null}

      <BottomNav
        active="menu"
        cartCount={cartCount}
        onMenu={() => setActiveView("menu")}
        onCart={() => setActiveView("cart")}
        onOrders={openOrderHistory}
        onHelp={() => void showHelp()}
      />
    </main>
  );
}
