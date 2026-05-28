"use client";

import type { ReactNode } from "react";
import { Bell, CalendarClock, Clock3, ListChecks, LogOut, RadioTower, RefreshCw, Send, Store } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import type { StaffOpsRealtimeState } from "@/features/staff/types";
import { cn } from "@/lib/utils";
import { initials, type StaffMobileTab } from "./staff-mobile-utils";
import { StaffStatusPill } from "./staff-mobile-primitives";

type StaffMobileShellProps = {
  children: ReactNode;
  activeTab: StaffMobileTab;
  onTabChange: (tab: StaffMobileTab) => void;
  restaurantName: string;
  staffName: string;
  roleTitle: string;
  branchName: string;
  unreadCount: number;
  workCount: number;
  requestCount: number;
  todayMeta: string;
  realtimeState: StaffOpsRealtimeState;
  lastRefreshedLabel: string;
  refreshing: boolean;
  onRefresh: () => void;
  bottomDock: ReactNode;
};

function realtimeLabel(state: StaffOpsRealtimeState) {
  if (state === "connected") return "Live";
  if (state === "connecting") return "Đang nối";
  if (state === "error") return "Mất live";
  return "Offline";
}

function realtimeTone(state: StaffOpsRealtimeState): "success" | "warning" | "neutral" {
  if (state === "connected") return "success";
  if (state === "error") return "warning";
  return "neutral";
}

const tabItems: Array<{ key: StaffMobileTab; label: string; icon: typeof Clock3 }> = [
  { key: "today", label: "Hôm nay", icon: Clock3 },
  { key: "work", label: "Việc", icon: ListChecks },
  { key: "requests", label: "Yêu cầu", icon: Send },
  { key: "inbox", label: "Tin", icon: Bell }
];

export function StaffMobileShell({
  children,
  activeTab,
  onTabChange,
  restaurantName,
  staffName,
  roleTitle,
  branchName,
  unreadCount,
  workCount,
  requestCount,
  todayMeta,
  realtimeState,
  lastRefreshedLabel,
  refreshing,
  onRefresh,
  bottomDock
}: StaffMobileShellProps) {
  const tabValue: Record<StaffMobileTab, ReactNode> = {
    today: todayMeta,
    work: workCount || "0",
    requests: requestCount || "0",
    inbox: unreadCount || "0"
  };

  return (
    <main className="stitch-admin dashboard-density admin-shell-bg staff-mobile-app min-h-screen overflow-x-clip text-[var(--foreground)]">
      <section className="relative z-[1] mx-auto grid min-h-screen w-full max-w-6xl gap-3 px-3 pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-4 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] lg:pb-6 lg:pt-6">
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <header className="sticky top-0 z-40 -mx-3 border-b border-[var(--border)] bg-[rgba(255,254,251,0.72)] px-3 pb-2 backdrop-blur-xl sm:-mx-4 sm:px-4 lg:static lg:mx-0 lg:rounded-[14px] lg:border lg:bg-[var(--dashboard-glass-strong)] lg:p-3 lg:shadow-[var(--shadow-soft)]">
            <div className="flex min-h-12 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-sm font-semibold text-white shadow-[var(--glow-primary)]">
                  {initials(staffName)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{staffName}</span>
                  <span className="block truncate text-xs font-medium text-[var(--muted-foreground)]">{roleTitle} · {branchName}</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition hover:border-[var(--primary)]/30 active:scale-[0.98]"
                  aria-label="Làm mới dữ liệu"
                >
                  <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
                </button>
                <a
                  href="/auth/clear-session"
                  className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition hover:border-[var(--primary)]/30 active:scale-[0.98]"
                  aria-label="Đăng xuất"
                >
                  <LogOut size={17} aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <StaffStatusPill tone={realtimeTone(realtimeState)}>
                <RadioTower size={13} aria-hidden="true" />
                {realtimeLabel(realtimeState)}
              </StaffStatusPill>
              <span className="truncate text-xs font-medium text-[var(--muted-foreground)]">{lastRefreshedLabel}</span>
            </div>

            <nav className="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-1" aria-label="Staff mobile sections">
              {tabItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onTabChange(item.key)}
                    className={cn(
                      "grid min-h-12 place-items-center rounded-lg px-1.5 text-center transition active:scale-[0.99]",
                      active ? "bg-[var(--primary)] text-white shadow-[var(--glow-primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span className="mt-0.5 max-w-full truncate text-[11px] font-semibold">{item.label}</span>
                    <span className={cn("max-w-full truncate text-[10px] font-semibold", active ? "text-white/74" : "text-[var(--muted-foreground)]")}>{tabValue[item.key]}</span>
                  </button>
                );
              })}
            </nav>
          </header>

          <section className="grid gap-3 pt-3">{children}</section>
          {bottomDock}
        </div>

        <aside className="hidden min-w-0 lg:grid lg:content-start lg:gap-3">
          <section className="admin-hero-panel rounded-[14px] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <LogiVNLogo className="h-8" priority />
                <p className="dashboard-eyebrow mt-4">{restaurantName}</p>
                <h1 className="dashboard-page-title mt-2">Ca làm hôm nay</h1>
                <p className="dashboard-body-copy mt-2">Chấm công, xử lý việc trong ca và nhận thông báo vận hành.</p>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]">
                <Store size={20} aria-hidden="true" />
              </span>
            </div>
          </section>
          <section className="dashboard-panel rounded-[14px] p-4">
            <p className="dashboard-eyebrow">Đang hoạt động</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <p className="text-xs font-semibold text-[var(--muted-foreground)]">Quán</p>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{restaurantName}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] p-3">
                <p className="text-xs font-semibold text-[var(--muted-foreground)]">Chi nhánh</p>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">{branchName}</p>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
