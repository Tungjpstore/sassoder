"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  ChefHat,
  CreditCard,
  Gift,
  LayoutDashboard,
  ListOrdered,
  Menu,
  QrCode,
  Search,
  Settings,
  ShoppingBag,
  UserRound,
} from "lucide-react";

type CommandItem = {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  group: string;
  keywords: string;
};

const commands: CommandItem[] = [
  { id: "overview", label: "Tổng quan", href: "/dashboard", icon: LayoutDashboard, group: "Vận hành", keywords: "dashboard home tong quan" },
  { id: "orders", label: "Đơn hàng", href: "/dashboard/orders", icon: ListOrdered, group: "Vận hành", keywords: "order don hang" },
  { id: "kitchen", label: "Bếp", href: "/dashboard/kitchen", icon: ChefHat, group: "Vận hành", keywords: "kitchen bep nau" },
  { id: "online", label: "Đặt online", href: "/dashboard/online", icon: ShoppingBag, group: "Vận hành", keywords: "online dat mon giao hang" },
  { id: "reservations", label: "Đặt bàn trước", href: "/dashboard/reservations", icon: CalendarCheck, group: "Vận hành", keywords: "reservation dat ban truoc" },
  { id: "menu", label: "Menu món", href: "/dashboard/menu", icon: Menu, group: "Quản lý", keywords: "menu mon an food" },
  { id: "tables", label: "Bàn & QR", href: "/dashboard/tables", icon: QrCode, group: "Quản lý", keywords: "table ban qr code" },
  { id: "payments", label: "Thanh toán", href: "/dashboard/payments", icon: CreditCard, group: "Quản lý", keywords: "payment thanh toan vietqr" },
  { id: "promotions", label: "Khuyến mãi", href: "/dashboard/promotions", icon: Gift, group: "Quản lý", keywords: "promotion khuyen mai giam gia voucher" },
  { id: "staff", label: "Nhân viên", href: "/dashboard/staff", icon: UserRound, group: "Hệ thống", keywords: "staff nhan vien" },
  { id: "analytics", label: "Báo cáo", href: "/dashboard/analytics", icon: BarChart3, group: "Hệ thống", keywords: "analytics bao cao doanh thu" },
  { id: "settings", label: "Cài đặt", href: "/dashboard/settings", icon: Settings, group: "Hệ thống", keywords: "settings cai dat thiet lap" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className="drawer-backdrop absolute inset-0"
        onClick={closePalette}
        aria-label="Đóng command palette"
        style={{ opacity: 1 }}
      />
      <div className="command-palette-enter admin-command-surface relative mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-[580px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search size={18} className="shrink-0 text-[var(--muted-foreground)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Tìm trang, chức năng, mã đơn..."
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
          />
          <kbd className="hidden shrink-0 rounded-md border border-[var(--border)] bg-[var(--soft-surface)] px-2 py-1 text-xs font-semibold text-[var(--muted-foreground)] sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
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
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.href)}
                    onPointerEnter={() => setActiveIndex(idx)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                      idx === activeIndex
                        ? "bg-[rgba(52,211,153,0.1)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.15)]"
                        : "text-[var(--foreground)] hover:bg-[var(--soft-surface)]"
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
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
    </div>
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
      className="hidden h-9 min-w-[320px] max-w-[520px] flex-1 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-[rgba(52,211,153,0.2)] md:flex"
    >
      <Search size={16} className="text-[var(--muted-foreground)]" />
      <span className="flex-1 text-left">Tìm kiếm nhanh mã đơn, bàn, món...</span>
      <kbd className="rounded-md border border-[var(--border)] bg-[var(--soft-surface)] px-1.5 py-0.5 text-xs font-semibold">
        ⌘K
      </kbd>
    </button>
  );
}
