"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Banknote,
  Bell,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock3,
  Coffee,
  Download,
  Home,
  Landmark,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  Utensils
} from "lucide-react";
import { create } from "zustand";
import { CustomerAiAssistant } from "@/components/customer/customer-ai-assistant";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { formatVnd } from "@/lib/money";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  addDineInCartItem,
  decrementDineInCartItem,
  removeDineInCartItem,
  setDineInCartItemNote,
  type DineInCartItem
} from "@/lib/customer/cart-state";
import {
  dineInCheckoutReducer,
  type DineInCheckoutAction,
  type DineInCheckoutScreen
} from "@/lib/customer/checkout-flow";
import type { AiAgentAction } from "@/types/ai-agent";
import type { PaymentMethod, TableBillStatus } from "@/types/domain";
import type { PublicMenuCategory, PublicPromotion } from "@/types";

type CartStore = {
  items: Record<string, DineInCartItem>;
  add: (item: Omit<DineInCartItem, "quantity">) => void;
  decrement: (menuItemId: string) => void;
  remove: (menuItemId: string) => void;
  setNote: (menuItemId: string, note: string) => void;
  clear: () => void;
};

const useCart = create<CartStore>((set) => ({
  items: {},
  add: (item) =>
    set((state) => ({
      items: addDineInCartItem(state.items, item)
    })),
  decrement: (menuItemId) =>
    set((state) => ({
      items: decrementDineInCartItem(state.items, menuItemId)
    })),
  remove: (menuItemId) =>
    set((state) => ({
      items: removeDineInCartItem(state.items, menuItemId)
    })),
  setNote: (menuItemId, note) =>
    set((state) => ({
      items: setDineInCartItemNote(state.items, menuItemId, note)
    })),
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
      menuItem: { id?: string; name: string } | null;
    }>;
  };
  payment: PaymentInfo | null;
};

type RealtimeState = "idle" | "connecting" | "connected" | "error";
type CustomerScreen = DineInCheckoutScreen;
type StepState = "done" | "active" | "pending";

const customerSessionTtlMs = 24 * 60 * 60 * 1000;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

function formatCustomerOrderTime(value?: string | null) {
  if (!value) return "Vừa gửi";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatShortTime(value?: string | null) {
  if (!value) return "vừa xong";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit"
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

function isOrderPaid(entry: CreatedOrder | null) {
  return Boolean(entry && (entry.order.status === "paid" || entry.order.bill?.status === "paid"));
}

function shortOrderCode(entry: CreatedOrder | null) {
  if (!entry) return "#OD";
  const createdAt = entry.order.createdAt ? new Date(entry.order.createdAt) : new Date();
  const yy = String(createdAt.getFullYear()).slice(-2);
  const mm = String(createdAt.getMonth() + 1).padStart(2, "0");
  const dd = String(createdAt.getDate()).padStart(2, "0");
  return `#OD${yy}${mm}${dd}-${entry.order.id.slice(0, 3).toUpperCase()}`;
}

function customerInvoiceCode(id: string) {
  return `#${id.slice(0, 12).toUpperCase()}`;
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

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatCountdown(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = seconds % 60;
  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function realtimeLabel(state: RealtimeState) {
  if (state === "connected") return "Cập nhật tự động đang bật";
  if (state === "connecting") return "Đang kết nối trạng thái đơn";
  if (state === "error") return "Realtime tạm gián đoạn, bấm làm mới nếu cần";
  return "Trạng thái sẽ tự cập nhật sau khi gọi món";
}

function foodSteps(status: string) {
  const accepted = ["ordering", "completed", "waiting_payment", "waiting_confirm", "paid"].includes(status);
  const cooking = status === "ordering";
  const served = ["completed", "waiting_payment", "waiting_confirm", "paid"].includes(status);
  const paid = status === "paid";

  return [
    { label: "Đặt món", icon: Check, state: "done" },
    { label: "Đã xác nhận", icon: Utensils, state: accepted ? "done" : "active" },
    { label: "Đang chuẩn bị", icon: ChefHat, state: cooking ? "active" : served || paid ? "done" : "pending" },
    { label: "Hoàn thành", icon: PackageCheck, state: paid ? "done" : served ? "active" : "pending" }
  ] satisfies Array<{ label: string; icon: LucideIcon; state: StepState }>;
}

function paymentSteps(entry: CreatedOrder | null) {
  const paid = isOrderPaid(entry);
  const waiting = entry?.order.status === "waiting_confirm" || entry?.order.status === "waiting_payment";
  return [
    { label: "Đã thanh toán", icon: Check, state: paid || waiting ? "done" : "active" },
    { label: "Đang xác nhận", icon: Clock3, state: paid ? "done" : waiting ? "active" : "pending" },
    { label: "Hoàn thành", icon: ReceiptText, state: paid ? "done" : "pending" }
  ] satisfies Array<{ label: string; icon: LucideIcon; state: StepState }>;
}

function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div className={cx("flex h-9 items-center justify-between px-5 text-[11px] font-black", dark ? "text-white" : "text-[#111]")}>
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <span className={cx("h-2.5 w-3 rounded-[3px]", dark ? "bg-white" : "bg-black")} />
        <span className={cx("h-2.5 w-3.5 rounded-[3px]", dark ? "bg-white" : "bg-black")} />
        <span className={cx("h-2.5 w-5 rounded-[4px] border", dark ? "border-white" : "border-black")}>
          <span className={cx("block h-full w-3.5 rounded-[3px]", dark ? "bg-white" : "bg-black")} />
        </span>
      </div>
    </div>
  );
}

function PhoneFrame({
  children,
  darkStatus = false,
  className
}: {
  children: React.ReactNode;
  darkStatus?: boolean;
  className?: string;
}) {
  return (
    <main className="min-h-dvh bg-[#f5f2ea] text-[#101713] md:grid md:place-items-start md:py-5">
      <div
        className={cx(
          "relative mx-auto min-h-dvh w-full max-w-none overflow-hidden bg-[#fffefa] shadow-[0_24px_70px_rgba(7,45,31,0.14)] sm:max-w-[390px] md:min-h-[844px] md:rounded-[30px] md:border md:border-[#e9e5db]",
          className
        )}
      >
        <StatusBar dark={darkStatus} />
        {children}
      </div>
    </main>
  );
}

function ScreenHeader({
  title,
  subtitle,
  onBack,
  action,
  dark = false
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <header className={cx("flex min-h-14 items-center justify-between px-4", dark ? "text-white" : "text-[#101713]")}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Quay lại"
        className={cx("grid h-11 w-11 place-items-center rounded-full transition active:scale-95", dark ? "bg-white/10" : "bg-transparent")}
      >
        <ArrowLeft size={20} />
      </button>
      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-[14px] font-black">{title}</h1>
        {subtitle ? <p className={cx("mt-0.5 truncate text-[10px] font-bold", dark ? "text-white/75" : "text-[#69746e]")}>{subtitle}</p> : null}
      </div>
      <div className="grid h-11 w-11 place-items-center">{action}</div>
    </header>
  );
}

function IconCircle({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "green" | "orange" | "red" }) {
  return (
    <span
      className={cx(
        "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
        tone === "green" && "bg-[#006b3c] text-white",
        tone === "orange" && "bg-[#fff2dc] text-[#f28c28]",
        tone === "red" && "bg-[#fff1f1] text-[#e23a3a]",
        tone === "light" && "bg-[#f4f3ef] text-[#0b5b38]"
      )}
    >
      {children}
    </span>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = "solid"
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex h-14 w-full items-center justify-center gap-2 rounded-[14px] text-[14px] font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55",
        variant === "solid" && "bg-[#006b3c] text-white shadow-[0_14px_28px_rgba(0,91,53,0.22)]",
        variant === "outline" && "border border-[#ccd9d1] bg-white text-[#006b3c]",
        variant === "ghost" && "bg-[#f6f4ef] text-[#006b3c]"
      )}
    >
      {children}
    </button>
  );
}

function BottomDock({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-none bg-gradient-to-t from-[#fffefa] via-[#fffefa] to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-8 sm:max-w-[390px]">
      {children}
    </div>
  );
}

function FloatingCustomerActions({
  cartCount,
  cartTotal,
  notice,
  onCart,
  onStaff,
  staffLoading
}: {
  cartCount: number;
  cartTotal: number;
  notice?: string | null;
  onCart: () => void;
  onStaff: () => void;
  staffLoading?: boolean;
}) {
  return (
    <div
      className="customer-floating-actions customer-floating-actions--dine-in pointer-events-none fixed z-[1305] flex max-w-[270px] flex-col items-end gap-2"
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
              <ShoppingCart size={16} />
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
          onClick={onStaff}
          disabled={staffLoading}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f6b43] px-3 text-[11px] font-black text-white shadow-[0_12px_24px_rgba(0,107,60,0.2)] transition active:scale-95 disabled:opacity-65"
        >
          <Bell size={15} />
          {staffLoading ? "Đang gọi" : "Gọi NV"}
        </button>
      </div>
    </div>
  );
}

function PlantCorner() {
  return (
    <div className="pointer-events-none absolute bottom-0 right-0 h-24 w-24 opacity-65">
      <span className="absolute bottom-1 right-5 h-16 w-4 rounded-full bg-[#d6e6cf]" />
      <span className="absolute bottom-9 right-8 h-9 w-5 -rotate-45 rounded-[100%_0] bg-[#b6d5ad]" />
      <span className="absolute bottom-12 right-2 h-10 w-6 rotate-45 rounded-[100%_0] bg-[#c7dfbf]" />
      <span className="absolute bottom-2 right-11 h-9 w-5 rotate-12 rounded-[100%_0] bg-[#aecfa5]" />
    </div>
  );
}

function ProductThumb({ src, alt, seed = 0 }: { src?: string | null; alt: string; seed?: number }) {
  const palettes = [
    "from-[#fff3d8] via-[#f4c06f] to-[#7b3e12]",
    "from-[#fff5e8] via-[#f6a652] to-[#c74718]",
    "from-[#edf8e5] via-[#a6d99a] to-[#0b6d3b]",
    "from-[#fdf2ef] via-[#f6c7b4] to-[#bc4d2a]"
  ];

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={76}
        height={76}
        sizes="76px"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className={cx("relative h-full w-full overflow-hidden bg-gradient-to-br", palettes[seed % palettes.length])}>
      <span className="absolute bottom-3 left-3 h-6 w-9 rounded-b-[12px] rounded-t-[6px] bg-white/88 shadow-sm" />
      <span className="absolute bottom-5 left-11 h-3 w-3 rounded-full border-2 border-white/88" />
      <span className="absolute left-5 top-3 h-5 w-5 rounded-full bg-white/50 blur-[1px]" />
      <span className="absolute right-3 top-4 h-8 w-8 rounded-full bg-[#006b3c]/20" />
    </div>
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
    <div className={cx("flex items-center rounded-full bg-white", compact ? "gap-1" : "gap-2")}>
      <button type="button" onClick={onMinus} className="grid h-11 w-11 place-items-center rounded-full border border-[#e7e5df] text-[#101713] active:scale-95">
        <Minus size={14} />
      </button>
      <span className="w-6 text-center text-[13px] font-black tabular-nums">{quantity}</span>
      <button type="button" onClick={onPlus} className="grid h-11 w-11 place-items-center rounded-full bg-[#006b3c] text-white active:scale-95">
        <Plus size={14} />
      </button>
    </div>
  );
}

function Stepper({ steps }: { steps: Array<{ label: string; icon: LucideIcon; state: StepState }> }) {
  return (
    <div className="grid grid-cols-4 gap-0">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <div key={step.label} className="relative flex flex-col items-center text-center">
            {index > 0 ? <span className={cx("absolute left-0 top-4 h-0.5 w-1/2", step.state === "pending" ? "bg-[#e3e1dc]" : "bg-[#006b3c]")} /> : null}
            {index < steps.length - 1 ? <span className={cx("absolute right-0 top-4 h-0.5 w-1/2", steps[index + 1]?.state === "pending" ? "bg-[#e3e1dc]" : "bg-[#006b3c]")} /> : null}
            <span
              className={cx(
                "relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 bg-white",
                step.state === "done" && "border-[#006b3c] bg-[#006b3c] text-white",
                step.state === "active" && "border-[#006b3c] text-[#006b3c]",
                step.state === "pending" && "border-[#e3e1dc] text-[#c1bdb5]"
              )}
            >
              <Icon size={14} />
            </span>
            <span className={cx("mt-2 text-[10px] font-black leading-4", step.state === "pending" ? "text-[#a4a099]" : "text-[#006b3c]")}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function PriceLine({ label, value, strong = false, accent = false }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between gap-4 text-[13px]", strong ? "font-black text-[#101713]" : "font-semibold text-[#68736d]")}>
      <span>{label}</span>
      <span className={cx("tabular-nums", accent && "text-[#f28c28]", strong && "text-[19px]")}>{value}</span>
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
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex min-h-[76px] w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-[0_10px_25px_rgba(16,23,19,0.04)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55",
        selected ? "border-[#006b3c]" : "border-[#ebe8df]"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-black text-[#101713]">{title}</span>
        <span className="mt-1 block text-[11px] font-semibold leading-4 text-[#7b837d]">{subtitle}</span>
      </span>
      <span className={cx("grid h-6 w-6 place-items-center rounded-full border", selected ? "border-[#006b3c] bg-[#006b3c] text-white" : "border-[#d8d5cd]")}>
        {selected ? <Check size={13} /> : null}
      </span>
    </button>
  );
}

function CafeStillLife() {
  return (
    <div className="relative mx-auto h-24 w-40">
      <span className="absolute bottom-2 left-8 h-12 w-20 rounded-full bg-[#d6ead0]" />
      <span className="absolute bottom-6 left-10 h-12 w-6 -rotate-12 rounded-b-lg rounded-t-sm bg-[#f5f2e9] shadow-sm" />
      <span className="absolute bottom-7 left-12 h-8 w-8 rounded-full bg-[#f28c28]/40" />
      <span className="absolute bottom-8 left-[72px] h-9 w-8 rounded-b-xl rounded-t-md bg-[#006b3c]" />
      <span className="absolute bottom-11 left-[100px] h-3 w-3 rounded-full border-2 border-[#006b3c]" />
      <span className="absolute bottom-[60px] left-7 h-7 w-3 -rotate-45 rounded-full bg-[#9bc18d]" />
      <span className="absolute bottom-[72px] left-[52px] h-5 w-3 rotate-45 rounded-full bg-[#9bc18d]" />
      <span className="absolute bottom-1 left-4 h-3 w-32 rounded-full bg-black/8 blur-sm" />
    </div>
  );
}

function ChefIllustration() {
  return (
    <div className="relative h-36 overflow-hidden rounded-2xl bg-[#f7f1e7]">
      <span className="absolute inset-x-5 bottom-5 h-12 rounded-2xl bg-white/70" />
      <span className="absolute bottom-8 left-14 h-16 w-16 rounded-full bg-[#f6c39f]" />
      <span className="absolute bottom-[84px] left-12 h-8 w-20 rounded-[50%] bg-white shadow-sm" />
      <span className="absolute bottom-5 left-11 h-16 w-[88px] rounded-t-[30px] bg-[#006b3c]" />
      <span className="absolute bottom-16 left-[88px] h-2 w-2 rounded-full bg-[#101713]" />
      <span className="absolute bottom-5 right-10 h-14 w-20 rounded-b-2xl rounded-t-full bg-[#f28c28]/55" />
      <span className="absolute bottom-[52px] right-16 h-10 w-10 rounded-full bg-[#f9d7b2]" />
      <span className="absolute bottom-7 left-28 h-2 w-16 -rotate-12 rounded-full bg-[#8c5a2d]" />
      <span className="absolute left-8 top-5 h-12 w-14 rounded-full bg-[#cfe4c7]" />
      <span className="absolute right-7 top-6 h-10 w-10 rounded-full bg-[#e9d7b8]" />
    </div>
  );
}

function CashIllustration() {
  return (
    <div className="relative mx-auto my-6 h-28 w-48">
      <span className="absolute left-8 top-10 h-16 w-28 -rotate-6 rounded-xl bg-[#9bd37d] shadow-[0_12px_24px_rgba(0,91,53,0.14)]" />
      <span className="absolute left-14 top-[60px] h-8 w-16 rounded-full border-4 border-[#5ca75a]" />
      <span className="absolute bottom-7 right-9 h-8 w-8 rounded-full bg-[#f28c28]" />
      <span className="absolute bottom-10 right-2 h-8 w-8 rounded-full bg-[#f7bd5f]" />
      <span className="absolute bottom-5 right-[60px] h-6 w-6 rounded-full bg-[#f4a63a]" />
      <span className="absolute bottom-2 left-6 h-4 w-36 rounded-full bg-black/8 blur-sm" />
    </div>
  );
}

function ReceiptSuccessIllustration() {
  return (
    <div className="relative mx-auto h-28 w-36">
      <span className="absolute bottom-5 left-5 h-20 w-20 rounded-2xl bg-white shadow-[0_14px_28px_rgba(0,0,0,0.12)]" />
      <span className="absolute bottom-[76px] left-9 h-1.5 w-11 rounded-full bg-[#e2e6df]" />
      <span className="absolute bottom-14 left-9 h-1.5 w-10 rounded-full bg-[#e2e6df]" />
      <span className="absolute bottom-9 left-9 h-1.5 w-8 rounded-full bg-[#e2e6df]" />
      <span className="absolute bottom-10 right-8 grid h-12 w-12 place-items-center rounded-full bg-[#006b3c] text-white shadow-lg">
        <Check size={26} />
      </span>
      <span className="absolute bottom-2 left-2 h-4 w-32 rounded-full bg-black/8 blur-sm" />
    </div>
  );
}

function GreenHero({
  title,
  subtitle,
  kind = "cafe"
}: {
  title: string;
  subtitle: string;
  kind?: "cafe" | "check" | "receipt";
}) {
  return (
    <section className="relative overflow-hidden bg-[#005b35] px-6 pb-12 pt-5 text-center text-white">
      <span className="absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/8 blur-2xl" />
      <span className="absolute -right-10 bottom-3 h-32 w-32 rounded-full bg-[#f28c28]/20 blur-2xl" />
      <div className="relative">
        {kind === "cafe" ? <CafeStillLife /> : kind === "receipt" ? <ReceiptSuccessIllustration /> : (
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-white text-[#006b3c] shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
            <Check size={52} strokeWidth={3} />
          </div>
        )}
        <h2 className="mt-5 text-[21px] font-black leading-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-[260px] text-[13px] font-semibold leading-6 text-white/84">{subtitle}</p>
      </div>
    </section>
  );
}

function OrderSummaryCard({
  entry,
  children
}: {
  entry: CreatedOrder;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#ede9df] bg-white p-4 shadow-[0_14px_34px_rgba(16,23,19,0.07)]">
      <h3 className="text-[14px] font-black text-[#101713]">Đơn hàng {shortOrderCode(entry)}</h3>
      <p className="mt-2 text-[12px] font-semibold text-[#69746e]">
        Thời gian gửi: {formatCustomerOrderTime(entry.order.createdAt)}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function ReceiptInvoice({
  restaurant,
  table,
  entry,
  entries
}: {
  restaurant: {
    name: string;
    address: string | null;
    receiptFooter: string | null;
  };
  table: { name: string };
  entry: CreatedOrder;
  entries: CreatedOrder[];
}) {
  const bill = entry.order.bill;
  const rows = entries.flatMap((orderEntry) => orderEntry.order.items ?? []);
  const subtotal = rows.reduce((sum, item) => sum + item.quantity * item.price, 0) || entries.reduce((sum, orderEntry) => sum + (orderEntry.order.subtotal ?? orderEntry.order.total), 0);
  const discount = entries.reduce((sum, orderEntry) => sum + (orderEntry.order.discountAmount ?? 0), 0);
  const total = bill?.total ?? entry.order.total;

  return (
    <section className="rounded-[22px] border border-[#ebe8df] bg-white px-5 py-6 text-center shadow-[0_14px_34px_rgba(16,23,19,0.06)]">
      <h2 className="text-[15px] font-black">{restaurant.name}</h2>
      <p className="mx-auto mt-1 max-w-[240px] text-[10px] font-semibold leading-4 text-[#69746e]">{restaurant.address || "Địa chỉ quán"}</p>
      <p className="mt-3 text-[12px] font-black tracking-wide">HÓA ĐƠN THANH TOÁN</p>
      <p className="mt-1 text-[11px] font-bold text-[#69746e]">{customerInvoiceCode(bill?.id ?? entry.order.id)}</p>
      <p className="mt-1 text-[11px] font-semibold text-[#69746e]">Thời gian: {formatCustomerOrderTime(bill?.paidAt ?? entry.order.paidAt ?? entry.order.createdAt)}</p>
      <p className="mt-1 text-[11px] font-semibold text-[#69746e]">{table.name}</p>

      <div className="mt-5 divide-y divide-[#efede7] text-left">
        {rows.length > 0 ? (
          rows.map((item, index) => (
            <div key={`${item.menuItem?.id ?? item.menuItem?.name ?? "item"}-${index}`} className="grid grid-cols-[1fr_28px_80px] gap-2 py-2.5 text-[12px]">
              <span className="font-semibold text-[#101713]">{item.menuItem?.name ?? "Món đã gọi"}</span>
              <span className="text-center font-bold">x{item.quantity}</span>
              <span className="text-right font-bold tabular-nums">{formatVnd(item.quantity * item.price)}</span>
            </div>
          ))
        ) : (
          <div className="py-3 text-center text-[12px] font-semibold text-[#69746e]">Chi tiết món sẽ hiển thị sau khi quán đồng bộ hóa đơn.</div>
        )}
      </div>

      <div className="mt-4 grid gap-2 border-t border-[#efede7] pt-4 text-left">
        <PriceLine label="Tạm tính" value={formatVnd(subtotal)} />
        <PriceLine label="VAT (0%)" value={formatVnd(0)} />
        {discount > 0 ? <PriceLine label="Giảm giá" value={`-${formatVnd(discount)}`} accent /> : null}
        <PriceLine label="Tổng cộng" value={formatVnd(total)} strong />
      </div>
      <p className="mt-5 text-[11px] font-semibold leading-5 text-[#69746e]">
        {restaurant.receiptFooter || "Cảm ơn bạn! Hóa đơn đã được gửi kèm email của bạn nếu có."}
      </p>
    </section>
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
  const [screen, setScreen] = useState<CustomerScreen>("menu");
  const [categoryId, setCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customerSessionId, setCustomerSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<CreatedOrder[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [driverNote, setDriverNote] = useState("");
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedPromotionCode, setSelectedPromotionCode] = useState(restaurant.promotions[0]?.code ?? "");
  const [staffCallLoading, setStaffCallLoading] = useState(false);
  const [staffCallSent, setStaffCallSent] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const [qrSeconds, setQrSeconds] = useState(5 * 60);
  const [error, setError] = useState<string | null>(null);
  const [customerToast, setCustomerToast] = useState<string | null>(null);
  const pendingCreateRequestRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const createRequestInFlightRef = useRef(false);
  const paymentRequestInFlightRef = useRef(false);
  const customerToastTimerRef = useRef<number | null>(null);

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
  const visibleCategories = useMemo(() => {
    const query = normalizeText(searchQuery.trim());
    const scoped = categoryId === "all" ? categories : categories.filter((category) => category.id === categoryId);
    return scoped
      .map((category) => ({
        ...category,
        items: query ? category.items.filter((item) => normalizeText(item.name).includes(query)) : category.items
      }))
      .filter((category) => category.items.length > 0 || !query);
  }, [categories, categoryId, searchQuery]);
  const createdOrderId = created?.order.id;
  const customerSessionKey = useMemo(() => customerSessionStorageKey(restaurant.id, table.id), [restaurant.id, table.id]);
  const openHistory = useMemo(() => history.filter((entry) => isOpenOrder(entry.order.status)), [history]);
  const openHistoryTotal = useMemo(() => openHistory.reduce((sum, entry) => sum + payableTotal(entry), 0), [openHistory]);
  const canStartPayment = Boolean(created && (["ordering", "completed"].includes(created.order.status) || created.order.bill));
  const currentPayableTotal = created ? payableTotal(created) : 0;
  const currentPaymentMethod = created ? payableMethod(created) : null;

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

  function notifyCustomer(message: string) {
    if (customerToastTimerRef.current) window.clearTimeout(customerToastTimerRef.current);
    setCustomerToast(message);
    customerToastTimerRef.current = window.setTimeout(() => {
      setCustomerToast(null);
      customerToastTimerRef.current = null;
    }, 2800);
  }

  const applyCheckoutTransition = useCallback((action: DineInCheckoutAction) => {
    const next = dineInCheckoutReducer({ screen: "tracking", error: null }, action);
    setError(next.error);
    setScreen(next.screen);
    return next;
  }, []);

  const openEntry = useCallback((entry: CreatedOrder) => {
    setCreated(entry);
    setRealtimeState("connecting");
    const next = applyCheckoutTransition({
      type: "OPEN_EXISTING_ORDER",
      isPaid: isOrderPaid(entry),
      orderStatus: entry.order.status,
      paymentMethod: entry.payment?.method ?? entry.order.paymentMethod ?? entry.order.bill?.paymentMethod
    });
    if (next.screen === "vietqr-payment") {
      setQrSeconds(5 * 60);
    }
  }, [applyCheckoutTransition]);

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
      notifyCustomer("Đã gọi nhân viên đến bàn.");
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
        setCreated((current) => {
          if (!current) return current;
          return orders.find((entry) => entry.order.id === current.order.id) ?? current;
        });
        if (openLatest && orders[0]) openEntry(orders[0]);
        return orders;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được lịch sử gọi món");
        return [];
      } finally {
        setHistoryLoading(false);
      }
    },
    [customerSessionId, openEntry, restaurant.slug, table.id]
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    return () => {
      if (customerToastTimerRef.current) window.clearTimeout(customerToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (screen !== "vietqr-payment") return;
    const timer = window.setInterval(() => {
      setQrSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, createdOrderId]);

  async function submitOrder() {
    if (cart.length === 0 || loading || createRequestInFlightRef.current) return;
    const sessionId = ensureCustomerSessionId();
    const orderFingerprint = JSON.stringify({
      cartSignature,
      customerNote: customerNote.trim(),
      selectedPromotionCode
    });
    const existingPending = pendingCreateRequestRef.current;
    const idempotencyKey =
      existingPending?.fingerprint === orderFingerprint ? existingPending.idempotencyKey : globalThis.crypto.randomUUID();
    pendingCreateRequestRef.current = { fingerprint: orderFingerprint, idempotencyKey };
    createRequestInFlightRef.current = true;
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
          customerNote: [customerNote.trim(), driverNote.trim()].filter(Boolean).join("\n"),
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
      pendingCreateRequestRef.current = null;
      clear();
      setCustomerNote("");
      setDriverNote("");
      setScreen("order-sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được đơn hàng");
    } finally {
      createRequestInFlightRef.current = false;
      setLoading(false);
    }
  }

  async function markPaid() {
    if (!created || paymentLoading || paymentRequestInFlightRef.current) return;
    const sessionId = ensureCustomerSessionId();
    paymentRequestInFlightRef.current = true;
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
      setCreated(json.data);
      mergeHistoryOrder(json.data);
      applyCheckoutTransition({ type: "PAYMENT_MARKED", isPaid: isOrderPaid(json.data) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được thanh toán");
    } finally {
      paymentRequestInFlightRef.current = false;
      setPaymentLoading(false);
    }
  }

  async function startPayment(method: PaymentMethod) {
    if (!created || paymentLoading || paymentRequestInFlightRef.current) return;
    const sessionId = ensureCustomerSessionId();
    paymentRequestInFlightRef.current = true;
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
      if (method === "QR") setQrSeconds(5 * 60);
      applyCheckoutTransition({ type: "START_PAYMENT", method });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được yêu cầu thanh toán");
    } finally {
      paymentRequestInFlightRef.current = false;
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

  function handleCustomerAgentAction(action: AiAgentAction) {
    if (action.type === "link" && action.href) {
      window.location.href = action.href;
      return;
    }

    if (action.uiTarget === "add_item") {
      const body = action.body as { menuItemId?: string; categoryId?: string; name?: string; price?: number; image?: string | null } | undefined;
      const menuItem = categories.flatMap((category) => category.items).find((item) => item.id === body?.menuItemId);
      if (!menuItem && (!body?.menuItemId || !body.name || typeof body.price !== "number")) return;
      add({
        menuItemId: menuItem?.id ?? body!.menuItemId!,
        name: menuItem?.name ?? body!.name!,
        price: menuItem?.price ?? body!.price!,
        image: menuItem?.image ?? body?.image ?? null
      });
      if (body?.categoryId) setCategoryId(body.categoryId);
      notifyCustomer(`Đã thêm ${menuItem?.name ?? body!.name!} vào giỏ hàng.`);
      setScreen((current) =>
        current === "payment-choice" || current === "cash-payment" || current === "vietqr-payment" || current === "payment-pending"
          ? "menu"
          : current
      );
      setError(null);
      return;
    }

    if (action.uiTarget === "menu_category") {
      const body = action.body as { categoryId?: string } | undefined;
      if (body?.categoryId) setCategoryId(body.categoryId);
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
      void openOrderHistory();
      return;
    }

    if (action.uiTarget === "payment") {
      const body = action.body as { action?: string } | undefined;
      if (body?.action === "mark_paid") {
        void markPaid();
        return;
      }
      if (created) {
        applyCheckoutTransition({
          type: "OPEN_PAYMENT_ENTRY",
          canStartPayment,
          hasCreatedOrder: true
        });
      }
      return;
    }

    if (action.uiTarget === "staff_call") {
      void showHelp();
    }
  }

  function withLogibot(node: React.ReactNode) {
    return (
      <>
        <CustomerAiAssistant
          restaurantSlug={restaurant.slug}
          customerSessionId={customerSessionId}
          cart={cart}
          orderStatus={created?.order ?? openHistory[0]?.order ?? null}
          onAgentAction={handleCustomerAgentAction}
        />
        {node}
        <FloatingCustomerActions
          cartCount={cartCount}
          cartTotal={previewTotal}
          notice={customerToast}
          onCart={() => setScreen("cart")}
          onStaff={() => void showHelp()}
          staffLoading={staffCallLoading}
        />
      </>
    );
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
  }, [applyCheckoutTransition, created?.order.bill?.id, created?.order.paymentMethod, createdOrderId, loadOrderHistory]);

  function renderMenuScreen() {
    return (
      <PhoneFrame>
        <ScreenHeader
          title="Menu"
          subtitle={table.name}
          onBack={() => {
            if (window.history.length > 1) window.history.back();
          }}
          action={
            <button type="button" onClick={openOrderHistory} aria-label="Theo dõi đơn hàng" className="relative grid h-11 w-11 place-items-center rounded-full">
              <Bell size={18} aria-hidden="true" />
              {openHistory.length > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#f28c28]" /> : null}
            </button>
          }
        />

        <div className="px-4 pb-28">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a918b]" size={16} aria-hidden="true" />
            <input
              name="menuSearch"
              type="search"
              aria-label="Tìm món trong menu"
              autoComplete="off"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm món, ví dụ: cà phê, trà, bánh..."
              className="h-11 w-full rounded-2xl border-0 bg-[#f3f2ee] pl-11 pr-4 text-[12px] font-semibold outline-none placeholder:text-[#9a9f99] focus:ring-2 focus:ring-[#d6e7dd]"
            />
          </div>

          <div className="hide-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              className={cx("h-8 shrink-0 rounded-full px-4 text-[11px] font-black", categoryId === "all" ? "bg-[#006b3c] text-white" : "bg-[#f3f2ee] text-[#101713]")}
            >
              Tất cả
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={cx("h-8 shrink-0 rounded-full px-4 text-[11px] font-black", categoryId === category.id ? "bg-[#006b3c] text-white" : "bg-[#f3f2ee] text-[#101713]")}
              >
                {category.name}
              </button>
            ))}
          </div>

          {staffCallSent ? (
            <div className="mt-3 rounded-2xl border border-[#cfe0d5] bg-[#eff8f2] px-4 py-3 text-[12px] font-black text-[#006b3c]">
              Quán đã nhận yêu cầu gọi nhân viên cho {table.name}.
            </div>
          ) : null}

          {restaurant.promotions.length > 0 ? (
            <button
              type="button"
              onClick={() => setScreen("cart")}
              className="mt-4 flex min-h-[62px] w-full items-center justify-between rounded-2xl bg-[#006b3c] px-4 text-left text-white shadow-[0_14px_28px_rgba(0,91,53,0.2)]"
            >
              <span>
                <span className="block text-[12px] font-black">Ưu đãi hôm nay</span>
                <span className="mt-1 block text-[11px] font-semibold text-white/82">
                  {selectedPromotion ? promotionDescription(selectedPromotion) : "Chọn mã trước khi gọi món"}
                </span>
              </span>
              <ChevronRight size={18} />
            </button>
          ) : null}

          <div className="mt-5 grid gap-5">
            {visibleCategories.length === 0 ? (
              <div className="rounded-2xl bg-[#f6f4ef] p-5 text-center text-[13px] font-semibold text-[#69746e]">
                Chưa tìm thấy món phù hợp. Bạn thử từ khóa khác nhé.
              </div>
            ) : null}

            {visibleCategories.map((category, categoryIndex) => (
              <section key={category.id}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[15px] font-black">{category.name}</h2>
                  {categoryId === "all" ? <button type="button" onClick={() => setCategoryId(category.id)} className="text-[11px] font-black text-[#006b3c]">Xem tất cả</button> : null}
                </div>
                <div className="grid gap-3">
                  {category.items.length === 0 ? (
                    <div className="rounded-2xl bg-[#f6f4ef] p-4 text-[12px] font-semibold text-[#69746e]">Danh mục này chưa có món khả dụng.</div>
                  ) : (
                    category.items.map((item, index) => {
                      const quantity = items[item.id]?.quantity ?? 0;
                      return (
                        <article key={item.id} className="flex items-center gap-3 rounded-2xl bg-white p-2 shadow-[0_10px_26px_rgba(16,23,19,0.05)]">
                          <div className="h-[58px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-[#f4f1ea]">
                            <ProductThumb src={item.image} alt={item.name} seed={categoryIndex + index} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-[13px] font-black">{item.name}</h3>
                            <p className="mt-1 text-[12px] font-black tabular-nums">{formatVnd(item.price)}</p>
                          </div>
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
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#006b3c] text-white active:scale-95"
                            >
                              <Plus size={16} />
                            </button>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

        {error ? (
          <div className="absolute inset-x-4 bottom-24 rounded-2xl border border-[#f0c7c7] bg-[#fff5f5] p-3 text-[12px] font-semibold text-[#a33131]">
            {error}
          </div>
        ) : null}

        {cart.length > 0 ? (
          <BottomDock>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setScreen("cart");
              }}
              className="flex h-14 w-full items-center justify-between rounded-2xl bg-[#006b3c] px-4 text-white shadow-[0_16px_30px_rgba(0,91,53,0.25)] active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 text-[13px] font-black">
                <ShoppingCart size={17} />
                Giỏ hàng ({cartCount}) - {formatVnd(previewTotal)}
              </span>
              <ArrowLeft className="rotate-180" size={17} />
            </button>
          </BottomDock>
        ) : null}
      </PhoneFrame>
    );
  }

  function renderCartScreen() {
    return (
      <PhoneFrame>
        <ScreenHeader title="Giỏ hàng của bạn" subtitle={table.name} onBack={() => setScreen("menu")} action={<button type="button" onClick={() => setScreen("menu")} className="text-[11px] font-black text-[#006b3c]">Chỉnh sửa</button>} />
        <div className="px-4 pb-28">
          {selectedPromotion ? (
            <button
              type="button"
              onClick={() => setSelectedPromotionCode(selectedPromotionCode ? "" : restaurant.promotions[0]?.code ?? "")}
              className="mb-4 flex w-full items-center justify-between rounded-2xl border border-[#f4e2bd] bg-[#fff9ef] p-4 text-left"
            >
              <span>
                <span className="block text-[12px] font-black text-[#101713]">Bạn sẽ tích lũy 15 điểm</span>
                <span className="mt-1 block text-[11px] font-semibold text-[#69746e]">{promotionDescription(selectedPromotion)}</span>
              </span>
              <ChevronRight size={16} className="text-[#f28c28]" />
            </button>
          ) : null}

          <div className="grid gap-3">
            {cart.length === 0 ? (
              <div className="rounded-2xl bg-[#f6f4ef] p-6 text-center">
                <IconCircle tone="green"><ShoppingCart size={18} /></IconCircle>
                <h2 className="mt-4 text-[16px] font-black">Chưa có món nào</h2>
                <p className="mt-2 text-[12px] font-semibold leading-5 text-[#69746e]">Quay lại menu để chọn món trước khi gửi đơn.</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <article key={item.menuItemId} className="flex items-start gap-3 rounded-2xl bg-white p-2 shadow-[0_10px_26px_rgba(16,23,19,0.05)]">
                  <div className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-xl bg-[#f4f1ea]">
                    <ProductThumb src={item.image} alt={item.name} seed={index} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-[13px] font-black">{item.name}</h3>
                        <p className="mt-1 text-[12px] font-black tabular-nums">{formatVnd(item.price)}</p>
                      </div>
                      <button type="button" onClick={() => remove(item.menuItemId)} aria-label={`Xóa ${item.name}`} className="grid h-8 w-8 place-items-center rounded-full text-[#69746e]">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-2 flex justify-end">
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
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          <label className="mt-5 block rounded-2xl border border-[#ebe8df] bg-white p-4">
            <span className="text-[12px] font-black">Ghi chú cho quán</span>
            <textarea
              name="customerNote"
              autoComplete="off"
              value={customerNote}
              onChange={(event) => setCustomerNote(event.target.value)}
              placeholder="Ví dụ: ít đá, không đường..."
              rows={3}
              className="mt-2 w-full resize-none bg-transparent text-[12px] font-semibold leading-5 outline-none placeholder:text-[#a0a49f]"
            />
          </label>

          <div className="mt-5 grid gap-3">
            <PriceLine label="Tạm tính" value={formatVnd(total)} />
            <PriceLine label="Phí phục vụ (3%)" value={formatVnd(0)} accent />
            <PriceLine label="Phí giao hàng" value={formatVnd(0)} />
            {previewDiscount > 0 ? <PriceLine label="Khuyến mãi" value={`-${formatVnd(previewDiscount)}`} accent /> : null}
            <div className="border-t border-[#efede7] pt-3">
              <PriceLine label="Tổng cộng" value={formatVnd(previewTotal)} strong />
            </div>
          </div>

          {error ? <p className="mt-4 rounded-2xl border border-[#f0c7c7] bg-[#fff5f5] p-3 text-[12px] font-semibold text-[#a33131]">{error}</p> : null}
        </div>

        <BottomDock>
          <PrimaryButton onClick={submitOrder} disabled={cart.length === 0 || loading}>
            {loading ? "Đang gửi món..." : "Gọi món"}
          </PrimaryButton>
        </BottomDock>
      </PhoneFrame>
    );
  }

  function renderOrderSentScreen() {
    if (!created) return renderMenuScreen();
    return (
      <PhoneFrame darkStatus className="bg-[#005b35]">
        <GreenHero title="Đã gửi yêu cầu gọi món!" subtitle="Quán đang xác nhận đơn hàng của bạn." kind="cafe" />
        <div className="-mt-5 rounded-t-[28px] bg-[#fffefa] px-4 pb-6 pt-5">
          <OrderSummaryCard entry={created}>
            <Stepper steps={foodSteps(created.order.status)} />
          </OrderSummaryCard>
          <div className="mt-6 rounded-2xl bg-[#f8f6f0] p-4 text-center text-[12px] font-semibold leading-5 text-[#69746e]">
            Bạn có thể theo dõi trạng thái đơn hàng tại đây.
          </div>
          <div className="mt-5">
            <PrimaryButton onClick={() => setScreen("tracking")}>Theo dõi đơn hàng</PrimaryButton>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  function renderTrackingScreen() {
    if (!created) return renderMenuScreen();
    const rows = created.order.items ?? [];
    return (
      <PhoneFrame>
        <ScreenHeader title="Theo dõi đơn hàng" subtitle={table.name} onBack={() => setScreen("menu")} action={<button type="button" onClick={() => void showHelp()} aria-label="Gọi nhân viên" className="grid h-11 w-11 place-items-center rounded-full"><Bell size={18} /></button>} />
        <div className="px-4 pb-28">
          <section>
            <h2 className="text-[15px] font-black">Đơn hàng {shortOrderCode(created)}</h2>
            <p className="mt-2 text-[12px] font-semibold text-[#69746e]">Thời gian gửi: {formatShortTime(created.order.createdAt)} · Dự kiến 15 - 20 phút</p>
            <div className="mt-5">
              <Stepper steps={foodSteps(created.order.status)} />
            </div>
          </section>

          <section className="mt-6">
            <h3 className="mb-3 text-[13px] font-black">{created.order.status === "pending" ? "Đang chờ xác nhận" : created.order.status === "ordering" ? "Đang chuẩn bị" : "Chi tiết món"}</h3>
            <ChefIllustration />
          </section>

          <section className="mt-6">
            <h3 className="mb-3 text-[13px] font-black">Chi tiết món</h3>
            <div className="divide-y divide-[#efede7] rounded-2xl bg-white px-3 shadow-[0_10px_26px_rgba(16,23,19,0.05)]">
              {rows.length > 0 ? (
                rows.map((item, index) => (
                  <div key={`${item.menuItem?.id ?? item.menuItem?.name ?? "item"}-${index}`} className="grid grid-cols-[42px_1fr_24px_72px] items-center gap-2 py-3 text-[12px]">
                    <div className="h-9 w-9 overflow-hidden rounded-lg bg-[#f4f1ea]"><ProductThumb alt={item.menuItem?.name ?? "Món"} seed={index} /></div>
                    <span className="truncate font-bold">{item.menuItem?.name ?? "Món đã gọi"}</span>
                    <span className="text-center font-bold">x{item.quantity}</span>
                    <span className="text-right font-bold tabular-nums">{formatVnd(item.quantity * item.price)}</span>
                  </div>
                ))
              ) : (
                <div className="py-5 text-center text-[12px] font-semibold text-[#69746e]">Quán đang đồng bộ chi tiết món.</div>
              )}
            </div>
          </section>

          <div className="mt-5 rounded-2xl bg-[#f8f6f0] p-4 text-center text-[12px] font-semibold text-[#69746e]">
            {realtimeLabel(realtimeState)}
          </div>
          {staffCallSent ? <div className="mt-3 rounded-2xl bg-[#eff8f2] p-3 text-[12px] font-black text-[#006b3c]">Quán đã nhận yêu cầu hỗ trợ.</div> : null}
          {error ? <p className="mt-3 rounded-2xl border border-[#f0c7c7] bg-[#fff5f5] p-3 text-[12px] font-semibold text-[#a33131]">{error}</p> : null}
        </div>

        <BottomDock>
          <div className="grid gap-2">
            <PrimaryButton variant="outline" onClick={() => setScreen("menu")}>
              Gọi thêm món
            </PrimaryButton>
            <PrimaryButton onClick={() => setScreen("payment-choice")} disabled={!canStartPayment}>
              {canStartPayment ? "Bạn đã dùng xong? Thanh toán" : "Chờ quán xác nhận đơn"}
            </PrimaryButton>
          </div>
        </BottomDock>
      </PhoneFrame>
    );
  }

  function renderPaymentChoiceScreen() {
    if (!created) return renderMenuScreen();
    return (
      <PhoneFrame>
        <ScreenHeader title={`Đơn hàng ${shortOrderCode(created)}`} subtitle={table.name} onBack={() => setScreen("tracking")} />
        <div className="relative flex min-h-[calc(100vh-92px)] flex-col px-4 pb-6 pt-8 md:min-h-[752px]">
          <PlantCorner />
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#006b3c] text-white shadow-[0_14px_30px_rgba(0,91,53,0.22)]">
              <Check size={34} />
            </div>
            <h2 className="mt-6 text-[19px] font-black">Bạn đã dùng xong?</h2>
            <p className="mt-3 text-[12px] font-semibold leading-5 text-[#69746e]">Chọn phương thức thanh toán</p>
          </div>

          <div className="mt-8 grid gap-3">
            <button
              type="button"
              onClick={() => setScreen("menu")}
              className="flex items-center justify-between rounded-3xl border border-[#dfe8df] bg-[#f8fbf7] p-4 text-left transition active:scale-[0.99]"
            >
              <span>
                <span className="block text-[14px] font-black text-[#0f6b43]">Vẫn muốn gọi thêm món?</span>
                <span className="mt-1 block text-[12px] font-semibold text-[#69746e]">Món gọi thêm sẽ được gộp vào hóa đơn bàn hiện tại nếu chưa thanh toán.</span>
              </span>
              <Plus size={19} className="shrink-0 text-[#0f6b43]" />
            </button>
            <PaymentMethodCard
              icon={<IconCircle tone="green"><Banknote size={18} /></IconCircle>}
              title="Tiền mặt"
              subtitle="Thanh toán khi nhân viên mang hóa đơn"
              onClick={() => void startPayment("CASH")}
              disabled={!canStartPayment || paymentLoading}
            />
            <PaymentMethodCard
              icon={<IconCircle tone="red"><Landmark size={18} /></IconCircle>}
              title="VietQR"
              subtitle="Quét mã để thanh toán qua ứng dụng ngân hàng"
              onClick={() => void startPayment("QR")}
              disabled={!canStartPayment || paymentLoading}
            />
          </div>
          <p className="mt-auto pb-8 text-center text-[12px] font-semibold text-[#69746e]">Cảm ơn bạn!</p>
        </div>
      </PhoneFrame>
    );
  }

  function renderCashPaymentScreen() {
    if (!created) return renderMenuScreen();
    return (
      <PhoneFrame>
        <ScreenHeader title="Thanh toán" subtitle={table.name} onBack={() => setScreen("payment-choice")} />
        <div className="px-4 pb-6 pt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-black">Tổng thanh toán</p>
              <p className="mt-2 text-[18px] font-black tabular-nums">{formatVnd(currentPayableTotal)}</p>
              <p className="mt-1 text-[11px] font-semibold text-[#69746e]">(Đã bao gồm VAT)</p>
            </div>
          </div>
          <CashIllustration />
          <div className="rounded-2xl bg-[#f8f6f0] p-4 text-center">
            <p className="text-[13px] font-bold text-[#69746e]">Vui lòng thanh toán cho nhân viên</p>
            <p className="mt-2 text-[12px] font-semibold leading-5 text-[#69746e]">Nhân viên sẽ xác nhận và xuất hóa đơn</p>
          </div>
          <div className="mt-8">
            <PrimaryButton variant="ghost" onClick={() => setScreen("payment-choice")}>Đổi phương thức thanh toán</PrimaryButton>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  function renderVietQrPaymentScreen() {
    if (!created) return renderMenuScreen();
    const qr = created.payment?.method === "QR" ? created.payment : null;
    return (
      <PhoneFrame>
        <ScreenHeader title="Thanh toán" subtitle={table.name} onBack={() => setScreen("payment-choice")} />
        <div className="px-4 pb-32 pt-7 text-center">
          <p className="text-[13px] font-black">Tổng thanh toán</p>
          <p className="mt-2 text-[18px] font-black tabular-nums">{formatVnd(currentPayableTotal)}</p>
          <p className="mt-1 text-[11px] font-semibold text-[#69746e]">(Đã bao gồm VAT)</p>

          <div className="mx-auto mt-7 w-[236px] rounded-2xl bg-white p-3 shadow-[0_12px_30px_rgba(16,23,19,0.08)]">
            {qr ? (
              <Image src={qr.url} alt="Mã VietQR thanh toán đơn hàng" width={220} height={220} unoptimized className="h-[220px] w-[220px] rounded-xl bg-white" />
            ) : (
              <div className="grid h-[220px] w-[220px] place-items-center rounded-xl bg-[#f6f4ef] text-[12px] font-semibold text-[#69746e]">Đang tạo mã QR</div>
            )}
          </div>
          {qr ? (
            <div className="mt-4 text-[12px] font-semibold leading-5 text-[#69746e]">
              <p className="font-black text-[#101713]">{qr.bank}</p>
              <p>{qr.accountName || "Chủ tài khoản"}</p>
              <p>{qr.account}</p>
              <p className="mt-1 break-all font-mono text-[11px]">{qr.transferContent}</p>
            </div>
          ) : null}

          <div className="mt-5 rounded-2xl bg-[#f8f6f0] p-4">
            <p className="text-[12px] font-semibold text-[#69746e]">Mã QR hết hạn sau <span className="font-black text-[#ff6b00]">{formatCountdown(qrSeconds)}</span></p>
          </div>
        </div>

        <BottomDock>
          <div className="grid gap-2">
            <PrimaryButton onClick={markPaid} disabled={!qr || paymentLoading}>
              {paymentLoading ? "Đang gửi xác nhận..." : "Tôi đã chuyển khoản"}
            </PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => setScreen("payment-choice")}>Đổi phương thức thanh toán</PrimaryButton>
          </div>
        </BottomDock>
      </PhoneFrame>
    );
  }

  function renderPaymentPendingScreen() {
    if (!created) return renderMenuScreen();
    return (
      <PhoneFrame darkStatus className="bg-[#005b35]">
        <GreenHero title="Đã gửi thanh toán!" subtitle="Quán đang xác nhận thanh toán của bạn." kind="receipt" />
        <div className="-mt-5 rounded-t-[28px] bg-[#fffefa] px-4 pb-6 pt-5">
          <OrderSummaryCard entry={created}>
            <Stepper steps={paymentSteps(created)} />
          </OrderSummaryCard>
          <div className="mt-6 rounded-2xl bg-[#f8f6f0] p-4 text-center text-[12px] font-semibold leading-5 text-[#69746e]">
            Vui lòng chờ quán xác nhận.
          </div>
        </div>
      </PhoneFrame>
    );
  }

  function renderPaymentSuccessScreen() {
    if (!created) return renderMenuScreen();
    return (
      <PhoneFrame darkStatus className="bg-[#005b35]">
        <GreenHero title="Thanh toán thành công!" subtitle="Cảm ơn bạn, hẹn gặp lại." kind="check" />
        <div className="-mt-5 rounded-t-[28px] bg-[#fffefa] px-4 pb-6 pt-5">
          <OrderSummaryCard entry={created}>
            <Stepper steps={paymentSteps(created)} />
          </OrderSummaryCard>
          <div className="mt-5 grid gap-3">
            <PrimaryButton variant="outline" onClick={() => setScreen("invoice")}>Xem chi tiết đơn hàng</PrimaryButton>
            <PrimaryButton onClick={() => {
              setCreated(null);
              setScreen("menu");
            }}>
              <Home size={17} />
              Về trang chủ
            </PrimaryButton>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  function renderInvoiceScreen() {
    if (!created) return renderMenuScreen();
    const receiptEntries = created.order.bill
      ? history.filter((entry) => entry.order.bill?.id === created.order.bill?.id)
      : [created];
    const normalizedReceiptEntries = receiptEntries.some((entry) => entry.order.id === created.order.id)
      ? receiptEntries
      : [created, ...receiptEntries];

    return (
      <PhoneFrame>
        <ScreenHeader title="Hóa đơn" subtitle={table.name} onBack={() => setScreen("payment-success")} />
        <div className="px-4 pb-6 pt-4">
          <ReceiptInvoice
            restaurant={restaurant}
            table={table}
            entry={created}
            entries={normalizedReceiptEntries.length ? normalizedReceiptEntries : [created]}
          />
          <div className="mt-5">
            <PrimaryButton onClick={() => window.print()}>
              Tải hóa đơn
              <Download size={17} />
            </PrimaryButton>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  function renderOrdersScreen() {
    return (
      <PhoneFrame>
        <ScreenHeader title="Theo dõi đơn hàng" subtitle={table.name} onBack={() => setScreen("menu")} action={<button type="button" onClick={() => void loadOrderHistory()} className="text-[11px] font-black text-[#006b3c]">Làm mới</button>} />
        <div className="px-4 pb-6">
          <div className="rounded-2xl bg-[#f8f6f0] p-4">
            <p className="text-[12px] font-black text-[#101713]">{openHistory.length} đơn đang mở</p>
            <p className="mt-1 text-[12px] font-semibold text-[#69746e]">Tạm tính chưa thanh toán {formatVnd(openHistoryTotal)}</p>
          </div>
          <div className="mt-4 grid gap-3">
            {historyLoading && history.length === 0 ? (
              <div className="rounded-2xl bg-[#f6f4ef] p-5 text-center text-[12px] font-semibold text-[#69746e]">Đang tải lịch sử gọi món...</div>
            ) : null}
            {!historyLoading && history.length === 0 ? (
              <div className="rounded-2xl bg-[#f6f4ef] p-5 text-center text-[12px] font-semibold text-[#69746e]">Chưa có đơn nào trên thiết bị này.</div>
            ) : null}
            {history.map((entry) => (
              <button key={entry.order.id} type="button" onClick={() => openEntry(entry)} className="rounded-2xl bg-white p-4 text-left shadow-[0_10px_26px_rgba(16,23,19,0.05)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-black">{shortOrderCode(entry)}</p>
                    <p className="mt-1 text-[11px] font-semibold text-[#69746e]">{formatCustomerOrderTime(entry.order.createdAt)}</p>
                  </div>
                  <span className="rounded-full bg-[#eff8f2] px-3 py-1 text-[10px] font-black text-[#006b3c]">{orderStatusLabel(entry.order.status)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#efede7] pt-3">
                  <span className="text-[11px] font-semibold text-[#69746e]">{paymentMethodLabel(payableMethod(entry))}</span>
                  <span className="text-[15px] font-black tabular-nums">{formatVnd(payableTotal(entry))}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </PhoneFrame>
    );
  }

  if (screen === "cart") return withLogibot(renderCartScreen());
  if (screen === "order-sent") return withLogibot(renderOrderSentScreen());
  if (screen === "tracking") return withLogibot(renderTrackingScreen());
  if (screen === "payment-choice") return withLogibot(renderPaymentChoiceScreen());
  if (screen === "cash-payment") return withLogibot(renderCashPaymentScreen());
  if (screen === "vietqr-payment") return withLogibot(renderVietQrPaymentScreen());
  if (screen === "payment-pending") return withLogibot(renderPaymentPendingScreen());
  if (screen === "payment-success") return withLogibot(renderPaymentSuccessScreen());
  if (screen === "invoice") return withLogibot(renderInvoiceScreen());
  if (screen === "orders") return withLogibot(renderOrdersScreen());
  return withLogibot(renderMenuScreen());
}
