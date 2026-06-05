"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { DashboardAssetIcon, type DashboardIconId } from "@/components/dashboard/dashboard-icon-assets";
import { useDashboardOverlay } from "@/components/dashboard/use-dashboard-overlay";
import type { PlanFeatureKey, getRestaurantEntitlement } from "@/services/subscription-service";

type DashboardEntitlement = Awaited<ReturnType<typeof getRestaurantEntitlement>>;

type CommandItem = {
  id: string;
  label: string;
  href: string;
  icon: DashboardIconId;
  group: string;
  keywords: string;
  featureKey?: PlanFeatureKey;
  premiumHint?: string;
};

const commands: CommandItem[] = [
  { id: "overview", label: "Ca bán hôm nay", href: "/dashboard", icon: "todayShift", group: "Hôm nay", keywords: "dashboard home tong quan ca ban hom nay" },
  { id: "logibot-ai", label: "LogiBot AI", href: "/dashboard/logibot-ai", icon: "logibotAi", group: "AI", keywords: "logibot ai tro ly van hanh assistant operator" },
  { id: "orders", label: "Đơn hàng", href: "/dashboard/orders", icon: "orders", group: "Vận hành", keywords: "order don hang" },
  { id: "kitchen", label: "Bếp", href: "/dashboard/kitchen", icon: "kitchen", group: "Vận hành", keywords: "kitchen bep nau" },
  { id: "tables", label: "Bàn & QR", href: "/dashboard/tables", icon: "tablesQr", group: "Vận hành", keywords: "table ban qr code" },
  { id: "payments", label: "Thanh toán", href: "/dashboard/payments", icon: "payments", group: "Vận hành", keywords: "payment thanh toan vietqr" },
  { id: "online", label: "Đặt online", href: "/dashboard/online", icon: "onlineOrders", group: "Bán hàng", keywords: "online dat mon giao hang" },
  { id: "reservations", label: "Đặt bàn trước", href: "/dashboard/reservations", icon: "reservations", group: "Bán hàng", keywords: "reservation dat ban truoc premium", featureKey: "reservations", premiumHint: "Premium mở đặt bàn trước và nhận cọc." },
  { id: "promotions", label: "Khuyến mãi", href: "/dashboard/promotions", icon: "promotions", group: "Bán hàng", keywords: "promotion khuyen mai giam gia voucher" },
  { id: "menu", label: "Menu món", href: "/dashboard/menu", icon: "menuItems", group: "Quản lý", keywords: "menu mon an food" },
  { id: "inventory", label: "Kho hàng", href: "/dashboard/inventory", icon: "inventory", group: "Quản lý", keywords: "inventory kho hang ton kho nguyen lieu ocr nhap hang premium", featureKey: "inventory_premium", premiumHint: "Premium mở PO, lô/HSD, OCR và AI tối ưu kho." },
  { id: "staff", label: "Nhân viên", href: "/dashboard/staff", icon: "staff", group: "Quản lý", keywords: "staff nhan vien" },
  { id: "analytics", label: "Báo cáo", href: "/dashboard/analytics", icon: "analytics", group: "Hệ thống", keywords: "analytics bao cao doanh thu premium insight", featureKey: "advanced_reports", premiumHint: "Premium mở báo cáo nâng cao và insight thông minh." },
  { id: "settings", label: "Cài đặt", href: "/dashboard/settings", icon: "settings", group: "Hệ thống", keywords: "settings cai dat thiet lap" },
];

function shouldShowPremiumBadge(item: CommandItem, entitlement?: DashboardEntitlement) {
  if (!item.featureKey || !item.premiumHint) return false;
  if (!entitlement || !("planCode" in entitlement)) return false;
  return entitlement.planCode !== "premium";
}

export function CommandPalette({ entitlement }: { entitlement?: DashboardEntitlement }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const portalTarget = useDashboardOverlay(open);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.keywords.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [filtered]);

  const flatList = useMemo(() => filtered, [filtered]);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const navigate = useCallback(
    (href: string) => {
      closePalette();
      router.push(href);
    },
    [closePalette, router]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setActiveIndex(0);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatList[activeIndex]) {
      navigate(flatList[activeIndex].href);
    } else if (e.key === "Escape") {
      closePalette();
    }
  }

  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="dashboard-modal-root fixed inset-0 isolate z-[var(--z-dashboard-modal)] overflow-hidden overscroll-contain">
      <button
        type="button"
        className="drawer-backdrop absolute inset-0 z-0"
        onClick={closePalette}
        aria-label="Đóng command palette"
        style={{ opacity: 1 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="command-palette-enter admin-command-surface relative z-[1] mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-[580px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={18} className="shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Tìm trang, chức năng, mã đơn…"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
          />
          <kbd className="hidden shrink-0 rounded-md border border-[var(--border)] bg-[var(--soft-surface)] px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)] sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto overscroll-contain p-2">
          {flatList.length === 0 && (
            <div className="px-3 py-8 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Không tìm thấy kết quả cho &quot;{query}&quot;
            </div>
          )}
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group}>
              <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                {group}
              </p>
              {items.map((item) => {
                const idx = flatList.indexOf(item);
                const showPremium = shouldShowPremiumBadge(item, entitlement);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.href)}
                    onPointerEnter={() => setActiveIndex(idx)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                      idx === activeIndex
                        ? "bg-[var(--primary-soft)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(15,77,58,0.14)]"
                        : "text-[var(--foreground)] hover:bg-[var(--soft-surface)]"
                    }`}
                    title={showPremium ? item.premiumHint : undefined}
                  >
                    <DashboardAssetIcon icon={item.icon} active={idx === activeIndex} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {showPremium ? <span className="shrink-0 rounded-full border border-[#F2B36E]/55 bg-[#FFF2DF] px-2 py-0.5 text-[9px] font-black uppercase tracking-normal text-[#A95712]">Premium</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted-foreground)]">
          <span>↑↓ Di chuyển · ↵ Chọn · Esc Đóng</span>
          <span className="hidden sm:inline">⌘K mở/đóng nhanh</span>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        );
      }}
      className="hidden h-9 min-w-0 max-w-[520px] flex-1 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/25 md:flex lg:min-w-[220px] 2xl:min-w-[320px]"
    >
      <Search size={16} className="text-[var(--muted-foreground)]" />
      <span className="min-w-0 flex-1 truncate text-left">Tìm kiếm nhanh mã đơn, bàn, món…</span>
      <kbd className="rounded-md border border-[var(--border)] bg-[var(--soft-surface)] px-1.5 py-0.5 text-xs font-semibold">
        ⌘K
      </kbd>
    </button>
  );
}
