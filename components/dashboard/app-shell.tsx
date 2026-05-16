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
  showLiveActionCenter = true,
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

  return (
    <ToastProvider>
      <main className="stitch-admin admin-shell-bg dashboard-density relative min-h-screen overflow-x-clip text-[var(--foreground)]">
        {/* ── Desktop sidebar ── */}
        <aside className={`fixed inset-y-0 left-0 z-50 hidden w-[204px] flex-col overflow-hidden border-r border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,white)] text-[var(--foreground)] ${focusMode ? "lg:hidden" : "lg:flex"}`}>
          {/* Subtle gradient overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(15,77,58,0.04) 0%, transparent 42%, rgba(242,140,40,0.04) 100%)" }}
          />
          <Link href="/dashboard" className="relative z-[1] mx-2.5 mt-2.5 flex h-12 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 transition hover:border-[var(--primary)]/25">
            <span className="inline-flex">
              <LogiVNLogo className="h-8" priority />
            </span>
          </Link>
          <AdminDesktopNav />
          {entitlement && "planName" in entitlement ? (
            <Link
              href="/dashboard/settings?section=billing"
              className="relative z-[1] mx-2.5 mt-auto block rounded-xl border border-[var(--primary)]/15 bg-[linear-gradient(135deg,var(--primary-soft),#fff)] p-3 transition hover:border-[var(--primary)]/35"
            >
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--primary)]">Gói hiện tại</span>
              <span className="mt-1 block truncate text-sm font-black text-[var(--foreground)]">{entitlement.planName}</span>
              <span className="mt-1 block text-xs font-semibold text-[var(--muted-foreground)]">
                {"daysLeft" in entitlement ? `Còn ${entitlement.daysLeft} ngày` : "Quản lý gói"}
              </span>
              <span className="mt-2 inline-flex text-xs font-black text-[var(--primary)]">Nâng cấp gói</span>
            </Link>
          ) : null}
          <div className={`relative z-[1] mx-2.5 ${entitlement && "planName" in entitlement ? "mt-2" : "mt-auto"} rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5`}>
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
          <div className="relative z-[1] mx-2.5 mt-2">
            <LogoutButton />
          </div>
          <div className="relative z-[1] mt-2 flex h-9 items-center justify-center gap-2 border-t border-[var(--border)] text-[11px] font-medium text-[var(--muted-foreground)]">
            Powered by
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1">
              <LogiVNLogo className="h-4" />
            </span>
          </div>
        </aside>

        {/* ── Main content ── */}
        <section className={`relative ${focusMode ? "" : "lg:pl-[204px]"}`}>
          <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(255,247,235,0.86)] px-3 py-1.5 backdrop-blur-xl md:px-4">
            <div className="flex min-h-10 items-center justify-between gap-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className={focusMode ? "block" : "lg:hidden"}>
                  <LogiVNLogo className="h-8" priority />
                </div>
                {topbarVariant === "overview" ? (
                  <div className="hidden items-center gap-3 md:flex">
                    <Link
                      href="/dashboard/settings"
                      className="inline-flex h-9 min-w-[164px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]/25"
                    >
                      <Store size={16} className="text-[var(--primary)]" />
                      <span className="truncate">{restaurantName}</span>
                      <ChevronDown className="ml-auto" size={16} />
                    </Link>
                    <Link
                      href="/dashboard/analytics"
                      className="inline-flex h-9 min-w-[188px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/25"
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
                <button
                  type="button"
                  disabled
                  className="hidden h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--muted-foreground)] opacity-70 md:inline-flex"
                  aria-label="Trợ giúp"
                  title="Trợ giúp sẽ được mở ở phiên bản tiếp theo"
                >
                  <CircleHelp size={16} />
                  <span className="hidden xl:inline">Trợ giúp</span>
                </button>
                <Link
                  href="/dashboard/settings"
                  className="hidden h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/25 md:inline-flex"
                  aria-label="Cài đặt"
                >
                  <Settings size={16} />
                </Link>
                <Link
                  href="/"
                  className="hidden h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)]/25 md:inline-flex"
                  aria-label="Mở trang chủ"
                >
                  <ExternalLink size={16} />
                </Link>
                <div className="hidden h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 lg:flex">
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] text-xs font-semibold text-[#FFF7EB]">
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
            {focusMode ? null : <AdminMobileNav />}
          </header>
          <div className="mx-auto w-full max-w-[1680px] px-3 pb-[var(--dashboard-mobile-content-bottom)] pt-2.5 md:px-4 lg:pb-4">
            {entitlement && (!entitlement.allowed || entitlement.warning) ? (
              <section
                className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
                  entitlement.allowed
                    ? "border-[var(--accent)]/25 bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--accent)]/35 bg-[var(--accent-soft)] text-[var(--accent)]"
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
                    className="admin-glow-btn inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold"
                  >
                    Gia hạn gói
                  </Link>
                </div>
              </section>
            ) : null}
            {!hideHeading && (
              <section className="admin-hero-panel relative mb-3 overflow-hidden px-4 py-3">
                <div className="relative z-[1]">
                  <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)] md:text-2xl">{title}</h1>
                  {subtitle && <p className="mt-1 max-w-2xl truncate text-sm text-[var(--muted-foreground)]">{subtitle}</p>}
                </div>
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
