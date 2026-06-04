import Link from "next/link";
import { CalendarDays, ChevronDown, ExternalLink, Store } from "lucide-react";
import { DashboardCopilotLayer } from "@/components/ai/dashboard-copilot-layer";
import { CommandPalette, CommandPaletteTrigger } from "@/components/dashboard/command-palette";
import { DashboardQuickActionsFab } from "@/components/dashboard/dashboard-quick-actions-fab";
import { DashboardAssetIcon } from "@/components/dashboard/dashboard-icon-assets";
import { AdminDesktopNav, AdminMobileMenuTrigger, AdminMobileNav, AdminTabletRail } from "@/components/dashboard/dashboard-nav";
import { DarkModeToggle } from "@/components/dashboard/dark-mode-toggle";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { DashboardSubscriptionNotice } from "@/components/dashboard/subscription-notice";
import { ToastProvider } from "@/components/dashboard/toast-provider";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import type { getRestaurantEntitlement } from "@/services/subscription-service";

type DashboardEntitlement = Awaited<ReturnType<typeof getRestaurantEntitlement>>;

export function AdminShell({
  children,
  title,
  restaurantName,
  restaurantId,
  entitlement,
  subtitle,
  topbarVariant = "default",
  hideHeading = false,
  showLiveActionCenter = true,
  showQuickActionsFab = true,
  showDashboardCopilot = true,
  focusMode = false
}: {
  children: React.ReactNode;
  title: string;
  restaurantName: string;
  restaurantId?: string;
  entitlement?: DashboardEntitlement;
  subtitle?: string;
  topbarVariant?: "default" | "overview";
  hideHeading?: boolean;
  showLiveActionCenter?: boolean;
  showQuickActionsFab?: boolean;
  showDashboardCopilot?: boolean;
  focusMode?: boolean;
}) {
  const today = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date());
  const canUseOwnerAi = Boolean(
    restaurantId &&
      entitlement?.allowed &&
      "features" in entitlement &&
      entitlement.features.ai_owner_assistant?.enabled
  );
  const showBillingSidebarNotice = Boolean(entitlement && "planName" in entitlement && (!entitlement.allowed || entitlement.warning));

  return (
    <ToastProvider>
      <main className={`stitch-admin open-design-mobile admin-shell-bg dashboard-density relative isolate min-h-screen overflow-x-clip text-[var(--foreground)] ${focusMode ? "dashboard-focus-shell" : "dashboard-owner-shell"}`}>
        {/* ── Desktop sidebar ── */}
        <aside className={`dashboard-desktop-sidebar fixed inset-y-0 left-0 z-50 hidden w-[232px] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--dashboard-shell)] text-[var(--foreground)] ${focusMode ? "lg:hidden" : "lg:flex"}`}>
          {/* Subtle gradient overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(15,77,58,0.04) 0%, transparent 42%, rgba(242,140,40,0.04) 100%)" }}
          />
          <Link href="/dashboard" className="relative z-[1] mx-3 mt-3 flex h-12 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 transition hover:border-[var(--primary)]/25">
            <span className="inline-flex">
              <LogiVNLogo className="h-8" priority />
            </span>
          </Link>
          <AdminDesktopNav entitlement={entitlement} />
          {showBillingSidebarNotice && entitlement && "planName" in entitlement ? (
            <Link
              href="/dashboard/settings?section=billing"
              className="relative z-[1] mx-3 mt-auto block rounded-xl border border-[var(--primary)]/15 bg-[linear-gradient(135deg,var(--primary-soft),#fff)] p-3 transition hover:border-[var(--primary)]/35"
            >
              <span className="dashboard-eyebrow text-[var(--primary)]">Gói hiện tại</span>
              <span className="mt-1 block truncate text-sm font-semibold text-[var(--foreground)]">{entitlement.planName}</span>
              <span className="mt-1 block text-xs font-semibold text-[var(--muted-foreground)]">
                {"daysLeft" in entitlement ? `Còn ${entitlement.daysLeft} ngày` : "Quản lý gói"}
              </span>
              <span className="mt-2 inline-flex text-xs font-semibold text-[var(--primary)]">{entitlement.allowed ? "Gia hạn gói" : "Mở gói"}</span>
            </Link>
          ) : null}
          <div className={`relative z-[1] mx-3 ${showBillingSidebarNotice ? "mt-2" : "mt-auto"} rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5`}>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--primary)]/20 bg-[var(--primary-soft)] text-[var(--primary)]">
                <Store size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{restaurantName}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">Chi nhánh chính</span>
              </span>
              <ChevronDown className="ml-auto text-[var(--muted-foreground)]" size={16} />
            </div>
          </div>
          <div className="relative z-[1] mx-3 mt-2">
            <LogoutButton />
          </div>
          <div className="relative z-[1] mt-2 flex h-9 items-center justify-center gap-2 border-t border-[var(--border)] text-xs font-medium text-[var(--muted-foreground)]">
            Powered by
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1">
              <LogiVNLogo className="h-4" />
            </span>
          </div>
        </aside>
        {focusMode ? null : <AdminTabletRail restaurantName={restaurantName} entitlement={entitlement} />}

        {/* ── Main content ── */}
        <section className={`relative ${focusMode ? "" : "md:pl-[76px] lg:pl-[232px]"}`}>
          <header className="dashboard-mobile-topbar sticky top-0 z-[var(--z-dashboard-shell)] border-b border-[var(--border)] bg-[var(--dashboard-shell)] px-3 py-2 sm:px-4 md:px-5">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className={focusMode ? "block" : "md:hidden"}>
                  <AdminMobileMenuTrigger className="dashboard-mobile-menu-trigger grid h-11 w-11 place-items-center rounded-xl text-[var(--foreground)]" />
                </div>
                <div className="min-w-0 md:hidden">
                  <p className="dashboard-mobile-restaurant-label truncate text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
                    {restaurantName}
                  </p>
                  <p className="dashboard-mobile-title truncate text-sm font-semibold text-[var(--foreground)]">{title}</p>
                </div>
                <div className="hidden min-w-0 shrink-0 md:block">
                  <p className="truncate text-[11px] font-semibold uppercase leading-4 text-[var(--muted-foreground)] lg:hidden">
                    {restaurantName}
                  </p>
                  <p className="truncate text-sm font-semibold leading-5 text-[var(--foreground)] lg:text-base">{title}</p>
                </div>
                {topbarVariant === "overview" ? (
                  <div className="hidden min-w-0 items-center gap-3 md:flex">
                    <Link
                      href="/dashboard/settings"
                      className="hidden h-11 min-w-[164px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--dashboard-panel)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]/25 xl:inline-flex"
                    >
                      <Store size={16} className="text-[var(--primary)]" />
                      <span className="truncate">{restaurantName}</span>
                      <ChevronDown className="ml-auto" size={16} />
                    </Link>
                    <Link
                      href="/dashboard/analytics"
                      className="hidden h-11 min-w-[188px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--dashboard-panel)] px-3 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/25 lg:inline-flex"
                    >
                      <CalendarDays size={15} className="text-[var(--muted-foreground)]" />
                      {today.replace(/^./, (char) => char.toUpperCase())}
                      <ChevronDown className="ml-auto text-[var(--outline)]" size={16} />
                    </Link>
                  </div>
                ) : (
                  <CommandPaletteTrigger />
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/dashboard/analytics"
                  className="dashboard-mobile-date-pill inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-[var(--foreground)] md:hidden"
                >
                  Hôm nay
                  <ChevronDown size={13} />
                </Link>
                {restaurantId && showLiveActionCenter ? (
                  <div className="dashboard-mobile-live-action">
                    <AdminLiveActionCenter restaurantId={restaurantId} />
                  </div>
                ) : null}
                <div className="hidden sm:block">
                  <DarkModeToggle />
                </div>
                <Link
                  href="/dashboard/settings"
                  className="hidden h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--dashboard-panel)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/25 md:inline-flex"
                  aria-label="Cài đặt"
                >
                  <DashboardAssetIcon icon="settings" size="sm" />
                </Link>
                <Link
                  href="/"
                  className="hidden h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--dashboard-panel)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/25 xl:inline-flex"
                  aria-label="Mở trang chủ"
                >
                  <ExternalLink size={16} />
                </Link>
                <div className="hidden h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--dashboard-panel)] px-2 xl:flex">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] text-xs font-semibold text-[#FFF7EB]">
                    {restaurantName.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-32 truncate text-sm font-semibold">{restaurantName}</span>
                  </span>
                  <ChevronDown size={16} className="text-[var(--outline)]" />
                </div>
                <div className="hidden md:block lg:hidden">
                  <LogoutButton compact />
                </div>
              </div>
              <div className="dashboard-mobile-logout md:hidden">
                <LogoutButton compact />
              </div>
            </div>
          </header>
          {focusMode ? null : <AdminMobileNav entitlement={entitlement} />}
          <div className="dashboard-workspace mx-auto w-full max-w-[var(--admin-content-max)] px-3 pb-[var(--dashboard-mobile-content-bottom)] pt-3 sm:px-4 md:px-5 md:pb-5 md:pt-4">
            {entitlement && (!entitlement.allowed || entitlement.warning) ? (
              <DashboardSubscriptionNotice
                kind={entitlement.allowed ? (entitlement.warning?.severity ?? "warning") : "blocked"}
                message={entitlement.allowed ? entitlement.warning?.message ?? "Gói LogiVN cần chú ý." : entitlement.reason ?? "Gói LogiVN chưa hợp lệ."}
                planName={"planName" in entitlement ? entitlement.planName : null}
                daysLeft={"daysLeft" in entitlement ? entitlement.daysLeft : null}
                actionLabel={entitlement.allowed ? "Gia hạn gói" : "Mở gói"}
              />
            ) : null}
            {!hideHeading && (
              <section className="dashboard-workspace-heading relative mb-3 hidden px-1 py-1 md:block">
                <div className="relative z-[1]">
                  <h1 className="dashboard-page-title">{title}</h1>
                  {subtitle && <p className="sr-only">{subtitle}</p>}
                </div>
              </section>
            )}
            {children}
          </div>
        </section>
        <CommandPalette entitlement={entitlement} />
        {focusMode || !showQuickActionsFab ? null : <DashboardQuickActionsFab />}
        {showDashboardCopilot && canUseOwnerAi && restaurantId ? <DashboardCopilotLayer restaurantId={restaurantId} restaurantName={restaurantName} /> : null}
      </main>
    </ToastProvider>
  );
}
