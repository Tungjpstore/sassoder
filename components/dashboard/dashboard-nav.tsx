"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { DashboardAssetIcon, type DashboardIconId } from "@/components/dashboard/dashboard-icon-assets";
import { prefetchKitchenOrders } from "@/components/dashboard/kitchen-orders-cache";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  icon: DashboardIconId;
};

type NavGroup = {
  id: string;
  title: string;
  links: NavLink[];
};

const navGroups: NavGroup[] = [
  {
    id: "dashboard-mobile-group-today",
    title: "Hôm nay",
    links: [
      { href: "/dashboard", label: "Ca bán hôm nay", icon: "todayShift" },
    ],
  },
  {
    id: "dashboard-mobile-group-operations",
    title: "Vận hành",
    links: [
      { href: "/dashboard/orders", label: "Đơn hàng", icon: "orders" },
      { href: "/dashboard/kitchen", label: "Bếp", icon: "kitchen" },
      { href: "/dashboard/tables", label: "Bàn & QR", icon: "tablesQr" },
      { href: "/dashboard/payments", label: "Thanh toán", icon: "payments" },
    ],
  },
  {
    id: "dashboard-mobile-group-sales",
    title: "Bán hàng",
    links: [
      { href: "/dashboard/online", label: "Đặt online", icon: "onlineOrders" },
      { href: "/dashboard/reservations", label: "Đặt bàn", icon: "reservations" },
      { href: "/dashboard/promotions", label: "Khuyến mãi", icon: "promotions" },
    ],
  },
  {
    id: "dashboard-mobile-group-management",
    title: "Quản lý",
    links: [
      { href: "/dashboard/menu", label: "Menu món", icon: "menuItems" },
      { href: "/dashboard/inventory", label: "Kho hàng", icon: "inventory" },
      { href: "/dashboard/staff", label: "Nhân viên", icon: "staff" },
    ],
  },
  {
    id: "dashboard-mobile-group-system",
    title: "Hệ thống",
    links: [
      { href: "/dashboard/analytics", label: "Báo cáo", icon: "analytics" },
      { href: "/dashboard/settings", label: "Cài đặt", icon: "settings" },
    ],
  },
];

const allLinks = navGroups.flatMap((g) => g.links);
const mobilePrimaryLinks = [
  { href: "/dashboard", label: "Tổng quan", icon: "todayShift" },
  { href: "/dashboard/orders", label: "Đơn hàng", icon: "orders" },
  { href: "/dashboard/tables", label: "Bàn/Bếp", icon: "tablesQr" },
  { href: "/dashboard/analytics", label: "Báo cáo", icon: "analytics" },
] satisfies NavLink[];
const mobileMoreLinks = allLinks.filter(
  (link) => !mobilePrimaryLinks.some((primary) => primary.href === link.href)
);
const dashboardMobileMenuEvent = "logivn:dashboard-mobile-menu";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

function isMobilePrimaryActive(pathname: string, href: string) {
  if (href === "/dashboard/tables") {
    return isActive(pathname, "/dashboard/tables") || isActive(pathname, "/dashboard/kitchen");
  }
  return isActive(pathname, href);
}

export function AdminDesktopNav() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/dashboard/kitchen") return;
    const timer = window.setTimeout(prefetchKitchenOrders, 700);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <nav className="dashboard-sidebar-scroll relative z-[1] mx-3 mt-4 grid min-h-0 flex-1 gap-1 overflow-y-auto pr-1">
      {navGroups.map((group) => (
        <div key={group.title} className="mt-2 first:mt-0">
          <p className="mb-1 px-2 text-xs font-semibold uppercase text-[var(--primary)]/60">
            {group.title}
          </p>
          {group.links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onFocus={
                  link.href === "/dashboard/tables"
                    ? prefetchKitchenOrders
                    : undefined
                }
                onPointerEnter={
                  link.href === "/dashboard/tables"
                    ? prefetchKitchenOrders
                    : undefined
                }
                className={cn(
                  "admin-nav-link group relative flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold transition duration-150",
                  active
                    ? "bg-[var(--primary)] text-white shadow-[0_14px_28px_rgba(15,77,58,0.18)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)]"
                )}
              >
                <DashboardAssetIcon icon={link.icon} active={active} />
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminMobileMenuTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Mở menu chức năng dashboard"
      aria-controls="dashboard-mobile-more"
      data-dashboard-mobile-menu-trigger="true"
      onClick={() => window.dispatchEvent(new CustomEvent(dashboardMobileMenuEvent, { detail: { open: true } }))}
    >
      <Menu size={19} />
    </button>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const activeGroupId = useMemo(() => navGroups.find((group) => group.links.some((link) => isActive(pathname, link.href)))?.id ?? navGroups[0].id, [pathname]);
  const [selectedGroupId, setSelectedGroupId] = useState(activeGroupId);
  const [query, setQuery] = useState("");
  const moreActive = useMemo(() => mobileMoreLinks.some((link) => link.href !== "/dashboard/kitchen" && isActive(pathname, link.href)), [pathname]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return navGroups;
    return navGroups
      .map((group) => ({
        ...group,
        links: group.links.filter((link) => `${group.title} ${link.label}`.toLocaleLowerCase("vi-VN").includes(normalizedQuery))
      }))
      .filter((group) => group.links.length > 0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSelectedGroupId(activeGroupId);
      setQuery("");
    });
  }, [activeGroupId, open]);

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

  useEffect(() => {
    function handleOpenMenu(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      setOpen(detail?.open ?? true);
    }

    window.addEventListener(dashboardMobileMenuEvent, handleOpenMenu);
    return () => window.removeEventListener(dashboardMobileMenuEvent, handleOpenMenu);
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-dashboard-mobile-menu-trigger]")) return;
      event.preventDefault();
      setOpen(true);
    }

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  return (
    <>
      <nav
        className="dashboard-mobile-nav-shell fixed inset-x-0 bottom-0 z-[70] border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-18px_44px_rgba(15,77,58,0.12)] backdrop-blur-xl lg:hidden"
        aria-label="Điều hướng chính trên di động"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-0.5">
          {mobilePrimaryLinks.map((link) => {
            const active = isMobilePrimaryActive(pathname, link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                onFocus={
                  link.href === "/dashboard/tables"
                    ? prefetchKitchenOrders
                    : undefined
                }
                onPointerEnter={
                  link.href === "/dashboard/tables"
                    ? prefetchKitchenOrders
                    : undefined
                }
                className={cn(
                  "dashboard-mobile-tab flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition",
                  active
                    ? "is-active bg-transparent text-[var(--primary)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)]"
                )}
              >
                <DashboardAssetIcon icon={link.icon} active={active} size="sm" />
                <span className="max-w-full truncate">{link.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "dashboard-mobile-tab flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition",
              open || moreActive
                ? "is-active bg-transparent text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)]"
            )}
            aria-expanded={open}
            aria-controls="dashboard-mobile-more"
            aria-label="Mở menu chức năng dashboard"
          >
            <DashboardAssetIcon icon="more" active={open || moreActive} size="sm" />
            <span>Thêm</span>
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
            className="dashboard-mobile-menu-container absolute inset-x-2 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto flex max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
            aria-label="Tất cả chức năng dashboard"
          >
            <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="dashboard-eyebrow">LogiVN mobile</p>
                  <h2 className="dashboard-section-title">Thêm chức năng</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--muted-foreground)]"
                  aria-label="Đóng menu"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {mobilePrimaryLinks.map((link) => {
                  const mobileActive = isMobilePrimaryActive(pathname, link.href);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-center text-[10px] font-semibold transition",
                        mobileActive
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)]"
                      )}
                    >
                      <DashboardAssetIcon icon={link.icon} active={mobileActive} size="sm" />
                      <span className="max-w-full truncate">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
              <label className="relative mt-2 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--outline)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  name="dashboard-mobile-menu-search"
                  autoComplete="off"
                  aria-label="Tìm chức năng trong dashboard"
                  placeholder="Tìm chức năng…"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] pl-10 pr-3 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--ring)]"
                />
              </label>
            </div>
            <div className="hide-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2">
              {visibleGroups.map((group) => {
                const active = selectedGroupId === group.id || group.links.some((link) => isActive(pathname, link.href));
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      document.getElementById(group.id)?.scrollIntoView({ block: "start" });
                    }}
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
                    )}
                  >
                    {group.title}
                    <span className={cn("metric-number rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-white/15 text-white" : "bg-[var(--primary-soft)] text-[var(--primary)]")}>
                      {group.links.length}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {visibleGroups.length === 0 ? (
                <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--soft-surface)] p-4 text-center">
                  <div>
                    <Search className="mx-auto h-5 w-5 text-[var(--primary)]" />
                    <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">Không thấy chức năng</p>
                  </div>
                </div>
              ) : null}
              {visibleGroups.map((group) => (
                <div key={group.title} id={group.id} className="scroll-mt-2 py-1">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {group.links.map((link) => {
                      const active = isActive(pathname, link.href);

                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
                            active
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)] hover:border-[var(--primary)]/35"
                          )}
                        >
                          <DashboardAssetIcon icon={link.icon} active={active} />
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
