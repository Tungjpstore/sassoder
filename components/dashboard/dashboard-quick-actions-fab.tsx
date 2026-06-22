"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, X } from "lucide-react";
import { DashboardAssetIcon, type DashboardIconId } from "@/components/dashboard/dashboard-icon-assets";
import { cn } from "@/lib/utils";

const quickActions = [
  {
    href: "/dashboard/orders",
    label: "Đơn hàng",
    detail: "Nhận, lọc và xử lý đơn mới",
    icon: "orders",
    tone: "primary"
  },
  {
    href: "/dashboard/kitchen",
    label: "Bếp",
    detail: "Xem queue món cần ra",
    icon: "kitchen",
    tone: "green"
  },
  {
    href: "/dashboard/tables",
    label: "Bàn & QR",
    detail: "Mở sơ đồ bàn, in QR",
    icon: "tablesQr",
    tone: "green"
  },
  {
    href: "/dashboard/online",
    label: "Đặt online",
    detail: "Kiểm tra pickup/delivery",
    icon: "onlineOrders",
    tone: "orange"
  },
  {
    href: "/dashboard/payments",
    label: "Thanh toán",
    detail: "Đối soát VietQR và hóa đơn",
    icon: "payments",
    tone: "orange"
  },
  {
    href: "/dashboard/menu",
    label: "Menu món",
    detail: "Sửa món, giá, danh mục",
    icon: "menuItems",
    tone: "neutral"
  },
  {
    href: "/dashboard/analytics",
    label: "Báo cáo",
    detail: "Doanh thu và hiệu suất",
    icon: "analytics",
    tone: "neutral"
  },
  {
    href: "/dashboard/settings",
    label: "Cài đặt",
    detail: "Hồ sơ quán, online, VietQR",
    icon: "settings",
    tone: "neutral"
  }
] satisfies Array<{
  href: string;
  label: string;
  detail: string;
  icon: DashboardIconId;
  tone: "primary" | "green" | "orange" | "neutral";
}>;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

export function DashboardQuickActionsFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const activeAction = useMemo(() => quickActions.find((item) => isActive(pathname, item.href)) ?? null, [pathname]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="dashboard-quick-fab fixed bottom-[var(--dashboard-mobile-floating-bottom,5.85rem)] left-[max(0.85rem,env(safe-area-inset-left))] z-[var(--z-dashboard-panel,60)] md:bottom-5 md:left-[calc(var(--d-sidebar-w,232px)+1rem)]">
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-0 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
            aria-label="Đóng thao tác nhanh"
          />
          <section
            className="relative z-10 mb-3 w-[min(calc(100vw-2rem),360px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_70px_rgba(16,24,40,0.22)]"
            aria-label="Thao tác nhanh dashboard"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[linear-gradient(135deg,var(--primary-soft),rgba(242,140,40,0.08))] px-3 py-3">
              <div className="min-w-0">
                <p className="dashboard-eyebrow text-[var(--primary)]">Quick Actions</p>
                <h2 className="truncate text-sm font-black text-[var(--foreground)]">Lối tắt xử lý ca bán</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
                aria-label="Đóng thao tác nhanh"
              >
                <X size={17} />
              </button>
            </div>
            <div className="grid max-h-[min(62dvh,420px)] gap-1.5 overflow-y-auto p-2">
              {quickActions.map((action) => {
                const active = isActive(pathname, action.href);

                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[0_12px_24px_rgba(15,77,58,0.18)]"
                        : "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--foreground)] hover:border-[var(--primary)]/35 hover:bg-[var(--surface)]"
                    )}
                  >
                    <DashboardAssetIcon icon={action.icon} active={active} size="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{action.label}</span>
                      <span className={cn("mt-0.5 block truncate text-xs font-semibold", active ? "text-white/72" : "text-[var(--muted-foreground)]")}>
                        {action.detail}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative z-10",
          "inline-flex h-14 w-14 items-center justify-center gap-2 rounded-full border p-0 text-sm font-black shadow-[0_14px_34px_rgba(15,77,58,0.18)] transition hover:-translate-y-0.5 active:scale-95 sm:w-auto sm:justify-start sm:px-3 sm:pr-4",
          open
            ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
            : "border-[var(--primary)]/25 bg-[var(--surface)] text-[var(--primary)]"
        )}
        aria-label={open ? "Đóng thao tác nhanh" : "Mở thao tác nhanh"}
        aria-expanded={open}
      >
        <span className={cn("grid h-10 w-10 place-items-center rounded-full", open ? "bg-[var(--soft-surface)] text-[var(--primary)]" : "bg-[var(--primary)] text-white")}>
          {open ? <X size={18} /> : <Plus size={19} />}
        </span>
        <span className="hidden sm:inline">{activeAction ? activeAction.label : "Thao tác nhanh"}</span>
      </button>
    </div>
  );
}
