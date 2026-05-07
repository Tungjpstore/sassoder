import Link from "next/link";
import { CalendarDays, ChevronDown, CircleHelp, ExternalLink, Settings, Store } from "lucide-react";
import { DashboardCopilotLayer } from "@/components/ai/dashboard-copilot-layer";
import { CommandPalette, CommandPaletteTrigger } from "@/components/dashboard/command-palette";
import { AdminDesktopNav, AdminMobileNav } from "@/components/dashboard/dashboard-nav";
import { DarkModeToggle } from "@/components/dashboard/dark-mode-toggle";
import { AdminLiveActionCenter } from "@/components/dashboard/live-action-center";
import { LogoutButton } from "@/components/dashboard/logout-button";
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
  showLiveActionCenter = true
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

  return (
    <ToastProvider>
      <main className="stitch-admin admin-shell-bg relative min-h-screen overflow-hidden text-[var(--foreground)]">
        {/* ── Desktop sidebar ── */}
        <aside className="fixed inset-y-0 left-0 z-50 hidden w-[216px] flex-col overflow-hidden border-r border-[var(--border)] bg-white text-[var(--foreground)] lg:flex">
          <Link href="/dashboard" className="relative z-[1] mx-3 mt-3 flex h-14 items-center rounded-xl border border-[var(--border)] bg-white px-3 transition hover:bg-[var(--soft-surface)]">
            <span className="inline-flex">
              <LogiVNLogo className="h-9" priority />
            </span>
          </Link>
          <AdminDesktopNav />
          <div className="relative z-[1] mx-3 mt-auto rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--primary)]">
                <Store size={18} />
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
          <div className="relative z-[1] mt-3 flex h-10 items-center justify-center gap-2 border-t border-[var(--border)] text-[11px] font-medium text-[var(--muted-foreground)]">
            Powered by
            <span className="rounded-md border border-[var(--border)] bg-white px-1.5 py-1">
              <LogiVNLogo className="h-4" />
            </span>
          </div>
        </aside>

        {/* ── Main content ── */}
        <section className="relative z-[1] lg:pl-[216px]">
          <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/95 px-4 py-2 backdrop-blur md:px-5">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="lg:hidden">
                  <LogiVNLogo className="h-8" priority />
                </div>
                {topbarVariant === "overview" ? (
                  <div className="hidden items-center gap-3 md:flex">
                    <Link
                      href="/dashboard/settings"
                      className="inline-flex h-9 min-w-[164px] items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--foreground)]"
                    >
                      <Store size={16} className="text-[var(--primary)]" />
                      <span className="truncate">{restaurantName}</span>
                      <ChevronDown className="ml-auto" size={16} />
                    </Link>
                    <Link
                      href="/dashboard/analytics"
                      className="inline-flex h-9 min-w-[188px] items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--muted-foreground)]"
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
              <div className="flex items-center gap-2">
                {restaurantId && showLiveActionCenter ? <AdminLiveActionCenter restaurantId={restaurantId} /> : null}
                <DarkModeToggle />
                <Link
                  href="/dashboard/settings"
                  className="hidden h-9 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--soft-surface)] md:inline-flex"
                  aria-label="Trợ giúp"
                >
                  <CircleHelp size={16} />
                  <span className="hidden xl:inline">Trợ giúp</span>
                </Link>
                <Link
                  href="/dashboard/settings"
                  className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--muted-foreground)] transition hover:bg-[var(--soft-surface)] md:inline-flex"
                  aria-label="Cài đặt"
                >
                  <Settings size={16} />
                </Link>
                <Link
                  href="/"
                  className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--muted-foreground)] transition hover:bg-[var(--soft-surface)] md:inline-flex"
                  aria-label="Mở trang chủ"
                >
                  <ExternalLink size={16} />
                </Link>
                <div className="hidden h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-2 lg:flex">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--primary)] text-xs font-semibold text-white">
                    {restaurantName.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-32 truncate text-sm font-semibold">{restaurantName}</span>
                  </span>
                  <ChevronDown size={16} className="text-[var(--outline)]" />
                </div>
              </div>
              <div className="lg:hidden">
                <LogoutButton compact />
              </div>
            </div>
            <AdminMobileNav />
          </header>
          <div className="mx-auto w-full max-w-[1600px] px-4 py-3 md:px-5">
            {entitlement && (!entitlement.allowed || entitlement.warning) ? (
              <section
                className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
                  entitlement.allowed
                    ? "border-[#F28C28]/25 bg-[#FFF7ED] text-[#9A3412]"
                    : "border-[#F28C28]/35 bg-[#FFF7ED] text-[#7C2D12]"
                }`}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">
                      {entitlement.allowed ? entitlement.warning?.message : entitlement.reason ?? "Gói LogiVN chưa hợp lệ."}
                    </p>
                    <p className="mt-0.5 text-xs opacity-80">
                      {"planName" in entitlement && entitlement.planName
                        ? `${entitlement.planName} · ${"daysLeft" in entitlement ? entitlement.daysLeft : 0} ngày còn lại`
                        : "Vui lòng kiểm tra gói trước khi vận hành."}
                    </p>
                  </div>
                  <Link
                    href="/dashboard/settings?section=billing"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-[#F28C28] px-3 text-xs font-semibold text-white transition hover:bg-[#D97706]"
                  >
                    Gia hạn gói
                  </Link>
                </div>
              </section>
            ) : null}
            {!hideHeading && (
              <section className="admin-page-heading relative mb-3 overflow-hidden rounded-xl border border-[var(--border)] bg-white px-5 py-4">
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">{title}</h1>
                {subtitle && <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">{subtitle}</p>}
              </section>
            )}
            {children}
          </div>
        </section>
        <CommandPalette />
        {canUseOwnerAi && restaurantId ? <DashboardCopilotLayer restaurantId={restaurantId} restaurantName={restaurantName} /> : null}
      </main>
    </ToastProvider>
  );
}
