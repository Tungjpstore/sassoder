"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardAssetIcon } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { cn } from "@/lib/utils";
import type { getRestaurantEntitlement } from "@/services/subscription-service";
import { Sheet } from "./overlay";
import { navGroups, mobilePrimaryLinks, isNavActive, resolveHref } from "./nav-config";

type Entitlement = Awaited<ReturnType<typeof getRestaurantEntitlement>>;

const MENU_EVENT = "logivn:dash-v2-mobile-menu";

export function DashboardMobileMenuTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Mở menu chức năng"
      onClick={() => window.dispatchEvent(new CustomEvent(MENU_EVENT))}
      data-dash-v2-menu-trigger="true"
    >
      <DashboardAssetIcon icon="more" />
    </button>
  );
}

export function DashboardMobileNav({ entitlement: _entitlement, basePath = "" }: { entitlement?: Entitlement; basePath?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(MENU_EVENT, handler);
    return () => window.removeEventListener(MENU_EVENT, handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[var(--d-z-shell)] border-t border-[var(--d-line)] bg-[var(--d-surface)]/95 px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden"
        aria-label="Điều hướng di động"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-0.5">
          {mobilePrimaryLinks.map((link) => {
            const target = resolveHref(link.href, basePath);
            const active = isNavActive(pathname, target);
            return (
              <Link
                key={link.href}
                href={target}
                onPointerEnter={() => router.prefetch(target)}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--d-r-md)] px-1 text-[length:var(--d-fs-2xs)] font-semibold transition-colors",
                  active ? "text-[var(--d-jade)]" : "text-[var(--d-text-muted)]"
                )}
              >
                <DashboardAssetIcon icon={link.icon} active={active} size="sm" />
                <span className="max-w-full truncate">{link.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--d-r-md)] px-1 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-text-muted)] transition-colors"
            aria-label="Thêm chức năng"
          >
            <DashboardAssetIcon icon="more" size="sm" />
            <span>Thêm</span>
          </button>
        </div>
      </nav>

      <Sheet open={open} onClose={() => setOpen(false)} title="Tất cả chức năng" subtitle="Menu">
        <div className="flex flex-col gap-[var(--d-s-4)]">
          {navGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-2">
              <p className="d-eyebrow">{group.title}</p>
              <div className="grid grid-cols-2 gap-2">
                {group.links.map((link) => {
                  const target = resolveHref(link.href, basePath);
                  const active = isNavActive(pathname, target);
                  return (
                    <Link
                      key={link.href}
                      href={target}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-[var(--d-r-md)] border px-3 text-[length:var(--d-fs-sm)] font-semibold transition-colors",
                        active
                          ? "border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                          : "border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text)] hover:border-[var(--d-line-strong)]"
                      )}
                    >
                      <DashboardAssetIcon icon={link.icon} active={active} />
                      <span className="min-w-0 flex-1 truncate">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
