"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardAssetIcon } from "@/components/dashboard-v2/adapters/dashboard-shared";
import { cn } from "@/lib/utils";
import type { getRestaurantEntitlement } from "@/services/subscription-service";
import { navGroups, isNavActive, resolveHref, type NavLink } from "./nav-config";

type Entitlement = Awaited<ReturnType<typeof getRestaurantEntitlement>>;

const warmRoutes = ["/dashboard/orders", "/dashboard/kitchen", "/dashboard/tables", "/dashboard/payments", "/dashboard/analytics"];

function showPremium(link: NavLink, entitlement?: Entitlement) {
  if (!link.featureKey || !link.premiumHint) return false;
  if (!entitlement || !("planCode" in entitlement)) return false;
  return entitlement.planCode !== "premium";
}

function useWarmRoutes() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const href of warmRoutes) if (href !== pathname) router.prefetch(href);
    }, 600);
    return () => window.clearTimeout(t);
  }, [pathname, router]);
}

/* DashboardSidebarNav — sidebar có nhãn chữ + tên nhóm (desktop ≥ lg).
 * Chủ quán đọc rõ tên từng workspace, gom theo nhóm công việc. */
export function DashboardSidebarNav({ entitlement, basePath = "" }: { entitlement?: Entitlement; basePath?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useWarmRoutes();

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-[var(--d-s-4)] overflow-y-auto px-3 py-[var(--d-s-4)]" aria-label="Điều hướng dashboard">
      {navGroups.map((group) => (
        <div key={group.id} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
            {group.title}
          </p>
          {group.links.map((link) => {
            const target = resolveHref(link.href, basePath);
            const active = isNavActive(pathname, target);
            return (
              <Link
                key={link.href}
                href={target}
                onPointerEnter={() => router.prefetch(target)}
                className={cn(
                  "group flex min-h-10 items-center gap-3 rounded-[var(--d-r-md)] px-2.5 text-[length:var(--d-fs-sm)] font-medium transition-colors duration-[var(--d-dur)]",
                  active
                    ? "bg-[var(--d-primary-soft)] font-semibold text-[var(--d-primary)]"
                    : "text-[var(--d-text-muted)] hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
                )}
              >
                <span className={cn("grid h-7 w-7 flex-none place-items-center rounded-[var(--d-r-sm)]", active ? "bg-[var(--d-jade)] text-[var(--d-on-jade)]" : "text-[var(--d-text-faint)] group-hover:text-[var(--d-text-muted)]")}>
                  <DashboardAssetIcon icon={link.icon} active={active} size="sm" />
                </span>
                <span className="min-w-0 flex-1 truncate">{link.label}</span>
                {showPremium(link, entitlement) ? (
                  <span className="rounded-[var(--d-r-pill)] bg-[var(--d-accent-soft)] px-1.5 py-0.5 text-[length:var(--d-fs-2xs)] font-bold uppercase text-[var(--d-orange-600)]">PRO</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/* DashboardIconRail — rail icon-only cho tablet (md → lg), có tooltip. */
export function DashboardIconRail({ entitlement, basePath = "" }: { entitlement?: Entitlement; basePath?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useWarmRoutes();

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-[var(--d-s-4)]" aria-label="Điều hướng dashboard">
      {navGroups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1.5 border-t border-[var(--d-line)] pt-2 first:border-t-0 first:pt-0">
          {group.links.map((link) => {
            const target = resolveHref(link.href, basePath);
            const active = isNavActive(pathname, target);
            return (
              <Link
                key={link.href}
                href={target}
                onPointerEnter={() => router.prefetch(target)}
                aria-label={link.label}
                className={cn(
                  "group/rail relative grid h-11 w-full place-items-center rounded-[var(--d-r-md)] border transition-colors duration-[var(--d-dur)]",
                  active
                    ? "border-[var(--d-jade)] bg-[var(--d-jade)] text-[var(--d-on-jade)]"
                    : "border-transparent text-[var(--d-text-muted)] hover:border-[var(--d-line)] hover:bg-[var(--d-surface-2)] hover:text-[var(--d-text)]"
                )}
              >
                <DashboardAssetIcon icon={link.icon} active={active} />
                {showPremium(link, entitlement) ? (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--d-orange)] ring-2 ring-[var(--d-shell)]" aria-hidden="true" />
                ) : null}
                <span className="pointer-events-none absolute left-[calc(100%+8px)] z-[var(--d-z-popover)] whitespace-nowrap rounded-[var(--d-r-sm)] bg-[var(--d-jade-900)] px-2 py-1 text-[length:var(--d-fs-2xs)] font-semibold text-[var(--d-on-jade)] opacity-0 shadow-[var(--d-sh-md)] transition-opacity duration-[var(--d-dur)] group-hover/rail:opacity-100">
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
