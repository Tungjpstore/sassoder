"use client";

import * as React from "react";
import Link from "next/link";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { DashboardCopilotLayer } from "@/components/ai/dashboard-copilot-layer";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { CommandPaletteTrigger } from "@/components/dashboard/command-palette";
import { ToastProvider } from "@/components/dashboard/toast-provider";
import { fontVars } from "@/components/landing-v2/fonts";
import type { getRestaurantEntitlement } from "@/services/subscription-service";
import { DashboardIconRail, DashboardSidebarNav } from "./nav";
import { DashboardMobileMenuTrigger, DashboardMobileNav } from "./mobile-nav";
import { ActionRail, type ActionStreamItem } from "./action-rail";

type Entitlement = Awaited<ReturnType<typeof getRestaurantEntitlement>>;

/* DashboardShellV2 — buồng lái vận hành 3 cột:
 *   [icon rail 72px] · [nội dung] · [ActionRail 340px cố định]
 * ActionRail giữ nguyên xuyên suốt mọi workspace → liên thông.
 * Có thể tắt rail phải cho trang cần toàn bộ chiều ngang (showRail=false).
 * Người dùng cũng có nút trên topbar để thu/mở rail; lựa chọn nhớ trong localStorage. */
const RAIL_STORAGE_KEY = "logivn:dash:rail:open";

export function DashboardShellV2({
  children,
  title,
  restaurantName,
  restaurantId,
  entitlement,
  topbarSlot,
  actionStream = [],
  showRail = true,
  showDashboardCopilot = true,
  basePath = ""
}: {
  children: React.ReactNode;
  title: string;
  restaurantName: string;
  restaurantId?: string;
  entitlement?: Entitlement;
  topbarSlot?: React.ReactNode;
  actionStream?: ActionStreamItem[];
  showRail?: boolean;
  showDashboardCopilot?: boolean;
  basePath?: string;
}) {
  const [railOpen, setRailOpen] = React.useState(true);
  const canUseOwnerAi = Boolean(
    restaurantId &&
      entitlement?.allowed &&
      "features" in entitlement &&
      entitlement.features.ai_owner_assistant?.enabled
  );

  React.useEffect(() => {
    if (!showRail) return;
    let frame = 0;
    try {
      const raw = window.localStorage.getItem(RAIL_STORAGE_KEY);
      if (raw === "0" || raw === "1") {
        frame = window.requestAnimationFrame(() => setRailOpen(raw === "1"));
      }
    } catch {
      /* ignore */
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [showRail]);

  function toggleRail() {
    setRailOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <ToastProvider>
      <div data-dash="v2" className={`${fontVars} relative isolate flex min-h-screen text-[var(--d-text)]`}>
        {/* Icon rail trái — chỉ tablet (md → lg) */}
        <aside className="fixed inset-y-0 left-0 z-[var(--d-z-shell)] hidden w-[var(--d-rail-w)] flex-col border-r border-[var(--d-line)] bg-[var(--d-shell)] md:flex lg:hidden">
          <Link
            href="/dashboard"
            className="mx-2 mt-3 grid h-11 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)]"
            aria-label="LogiVN · Tổng quan"
          >
            <LogiVNLogo className="h-6" priority />
          </Link>
          <DashboardIconRail entitlement={entitlement} basePath={basePath} />
        </aside>

        {/* Sidebar có nhãn — desktop (≥ lg) */}
        <aside className="fixed inset-y-0 left-0 z-[var(--d-z-shell)] hidden w-[var(--d-sidebar-w)] flex-col border-r border-[var(--d-line)] bg-[var(--d-shell)] lg:flex">
          <Link
            href="/dashboard"
            className="mx-3 mt-3 flex h-12 items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 transition hover:border-[var(--d-line-strong)]"
            aria-label="LogiVN · Tổng quan"
          >
            <LogiVNLogo className="h-7" priority />
          </Link>
          <DashboardSidebarNav entitlement={entitlement} basePath={basePath} />
        </aside>

        {/* Cột giữa + phải */}
        <div className="flex min-h-screen w-full flex-col md:pl-[var(--d-rail-w)] lg:pl-[var(--d-sidebar-w)]">
          {/* Topbar */}
          <header className="sticky top-0 z-[var(--d-z-shell)] border-b border-[var(--d-line)] bg-[var(--d-surface)]/92 px-3 backdrop-blur sm:px-4 md:px-5">
            <div className="flex min-h-[var(--d-topbar-h)] items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <DashboardMobileMenuTrigger className="grid h-10 w-10 place-items-center rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] text-[var(--d-text-muted)] md:hidden" />
                <div className="min-w-0">
                  <p className="truncate text-[length:var(--d-fs-2xs)] font-semibold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">
                    {restaurantName}
                  </p>
                  <p className="truncate text-[length:var(--d-fs-h3)] font-semibold text-[var(--d-text)]">{title}</p>
                </div>
                <div className="hidden lg:block">
                  <CommandPaletteTrigger />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {topbarSlot}
                {showRail ? (
                  <button
                    type="button"
                    onClick={toggleRail}
                    aria-label={railOpen ? "Ẩn dòng hành động" : "Hiện dòng hành động"}
                    aria-pressed={railOpen}
                    className="hidden h-10 items-center gap-2 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)] transition hover:border-[var(--d-line-strong)] hover:text-[var(--d-text)] xl:inline-flex"
                  >
                    {railOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                    <span className="hidden 2xl:inline">{railOpen ? "Ẩn dòng hành động" : "Dòng hành động"}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <DashboardMobileNav entitlement={entitlement} basePath={basePath} />

          {/* Body: content + action rail */}
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 px-3 pb-[calc(var(--d-s-10)+env(safe-area-inset-bottom))] pt-[var(--d-s-4)] sm:px-4 md:px-5 md:pb-[var(--d-s-6)]">
              <div className={`mx-auto w-full ${railOpen && showRail ? "max-w-[1080px]" : "max-w-[1320px]"}`}>{children}</div>
            </main>

            {showRail && railOpen ? (
              <aside className="sticky top-[var(--d-topbar-h)] hidden h-[calc(100vh-var(--d-topbar-h))] w-[340px] shrink-0 border-l border-[var(--d-line)] bg-[var(--d-surface)] xl:block">
                <ActionRail items={actionStream} />
              </aside>
            ) : null}
          </div>
        </div>
        {showDashboardCopilot && canUseOwnerAi && restaurantId ? <DashboardCopilotLayer restaurantId={restaurantId} restaurantName={restaurantName} /> : null}
      </div>
    </ToastProvider>
  );
}
