"use client";

import Link from "next/link";
import { useEffect } from "react";
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
    title: "Vận hành",
    links: [
      { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
      { href: "/dashboard/orders", label: "Đơn hàng", icon: ListOrdered },
      { href: "/dashboard/kitchen", label: "Bếp", icon: ChefHat },
      { href: "/dashboard/online", label: "Đặt online", icon: ShoppingBag },
      { href: "/dashboard/reservations", label: "Đặt bàn", icon: CalendarCheck },
    ],
  },
  {
    title: "Quản lý",
    links: [
      { href: "/dashboard/menu", label: "Menu món", icon: Menu },
      { href: "/dashboard/tables", label: "Bàn & QR", icon: QrCode },
      { href: "/dashboard/payments", label: "Thanh toán", icon: CreditCard },
      { href: "/dashboard/promotions", label: "Khuyến mãi", icon: Gift },
    ],
  },
  {
    title: "Hệ thống",
    links: [
      { href: "/dashboard/staff", label: "Nhân viên", icon: UserRound },
      { href: "/dashboard/analytics", label: "Báo cáo", icon: BarChart3 },
      { href: "/dashboard/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

const allLinks = navGroups.flatMap((g) => g.links);

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
    <nav className="relative z-[1] mx-3 mt-3 grid gap-0.5">
      {navGroups.map((group) => (
        <div key={group.title} className="mt-2 first:mt-0">
          <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]/60">
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
                  "admin-nav-link group relative flex h-9 items-center gap-3 rounded-lg px-2 text-[13px] font-medium transition duration-150",
                  active
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--soft-surface)] hover:text-[var(--foreground)]"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition",
                    active
                      ? "bg-white/12 text-white"
                      : "bg-transparent text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]"
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

  return (
    <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
      {allLinks.map((link) => {
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
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition",
              active
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
            )}
          >
            <link.icon size={15} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
