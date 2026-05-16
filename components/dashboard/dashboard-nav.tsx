"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
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
  Settings,
  ShoppingBag,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import { prefetchKitchenOrders } from "@/components/dashboard/kitchen-orders-cache";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  icon: React.ElementType;
};

type NavGroup = {
  title: string;
  links: NavLink[];
};

const navGroups: NavGroup[] = [
  {
    title: "Hôm nay",
    links: [
      { href: "/dashboard", label: "Ca bán hôm nay", icon: LayoutDashboard },
    ],
  },
  {
    title: "Vận hành",
    links: [
      { href: "/dashboard/orders", label: "Đơn hàng", icon: ListOrdered },
      { href: "/dashboard/kitchen", label: "Bếp", icon: ChefHat },
      { href: "/dashboard/tables", label: "Bàn & QR", icon: QrCode },
      { href: "/dashboard/payments", label: "Thanh toán", icon: CreditCard },
    ],
  },
  {
    title: "Bán hàng",
    links: [
      { href: "/dashboard/online", label: "Đặt online", icon: ShoppingBag },
      { href: "/dashboard/reservations", label: "Đặt bàn", icon: CalendarCheck },
      { href: "/dashboard/promotions", label: "Khuyến mãi", icon: Gift },
    ],
  },
  {
    title: "Quản lý",
    links: [
      { href: "/dashboard/menu", label: "Menu món", icon: Menu },
      { href: "/dashboard/inventory", label: "Kho hàng", icon: Warehouse },
      { href: "/dashboard/staff", label: "Nhân viên", icon: UserRound },
    ],
  },
  {
    title: "Hệ thống",
    links: [
      { href: "/dashboard/analytics", label: "Báo cáo", icon: BarChart3 },
      { href: "/dashboard/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

const allLinks = navGroups.flatMap((g) => g.links);
const mobilePrimaryLinks = [
  { href: "/dashboard", label: "Hôm nay", icon: LayoutDashboard },
  { href: "/dashboard/orders", label: "Đơn", icon: ListOrdered },
  { href: "/dashboard/tables", label: "Bàn", icon: QrCode },
  { href: "/dashboard/kitchen", label: "Bếp", icon: ChefHat },
] satisfies NavLink[];
const mobileMoreLinks = allLinks.filter(
  (link) => !mobilePrimaryLinks.some((primary) => primary.href === link.href)
);

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

export function AdminDesktopNav() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/dashboard/kitchen") return;
    const timer = window.setTimeout(prefetchKitchenOrders, 700);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <nav className="relative z-[1] mx-2.5 mt-3 grid gap-1">
      {navGroups.map((group) => (
        <div key={group.title} className="mt-2 first:mt-0">
          <p className="mb-1 px-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]/55">
            {group.title}
          </p>
          {group.links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onFocus={
                  link.href === "/dashboard/kitchen"
                    ? prefetchKitchenOrders
                    : undefined
                }
                onPointerEnter={
                  link.href === "/dashboard/kitchen"
                    ? prefetchKitchenOrders
                    : undefined
                }
                className={cn(
                  "admin-nav-link group relative flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-semibold transition duration-150",
                  active
                    ? "bg-[var(--primary)] text-white shadow-[0_14px_28px_rgba(15,77,58,0.18)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)]"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-lg transition",
                    active
                      ? "bg-white/15 text-white"
                      : "text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]"
                  )}
                >
                  <link.icon size={15} />
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = useMemo(() => mobileMoreLinks.some((link) => isActive(pathname, link.href)), [pathname]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[70] border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-18px_44px_rgba(15,77,58,0.12)] backdrop-blur-xl lg:hidden"
        aria-label="Điều hướng chính trên di động"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {mobilePrimaryLinks.map((link) => {
            const active = isActive(pathname, link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                onFocus={
                  link.href === "/dashboard/kitchen"
                    ? prefetchKitchenOrders
                    : undefined
                }
                onPointerEnter={
                  link.href === "/dashboard/kitchen"
                    ? prefetchKitchenOrders
                    : undefined
                }
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-black transition",
                  active
                    ? "bg-[var(--primary)] text-white shadow-[0_10px_24px_rgba(15,77,58,0.2)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)]"
                )}
              >
                <link.icon size={18} />
                <span className="max-w-full truncate">{link.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-black transition",
              open || moreActive
                ? "bg-[var(--primary)] text-white shadow-[0_10px_24px_rgba(15,77,58,0.2)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)]"
            )}
            aria-expanded={open}
            aria-controls="dashboard-mobile-more"
            aria-label="Mở menu chức năng dashboard"
          >
            <Menu size={18} />
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-[90] lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/24 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu thêm"
          />
          <section
            id="dashboard-mobile-more"
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-2 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto flex max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
            aria-label="Tất cả chức năng dashboard"
          >
            <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--primary)]">LogiVN</p>
                  <h2 className="text-base font-black text-[var(--foreground)]">Menu vận hành</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]"
                  aria-label="Đóng menu"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {mobilePrimaryLinks.map((link) => {
                  const active = isActive(pathname, link.href);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-center text-[10px] font-black transition",
                        active
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)]"
                      )}
                    >
                      <link.icon size={15} />
                      <span className="max-w-full truncate">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {navGroups.map((group) => (
                <div key={group.title} className="py-1">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2">
                    {group.links.map((link) => {
                      const active = isActive(pathname, link.href);

                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-black transition",
                            active
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)] hover:border-[var(--primary)]/35"
                          )}
                        >
                          <link.icon size={16} />
                          <span className="min-w-0 truncate">{link.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
