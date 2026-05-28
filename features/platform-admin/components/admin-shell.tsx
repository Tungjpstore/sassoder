import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, LogOut, RefreshCw, Shield } from "lucide-react";
import { CommandPalette } from "@/features/platform-admin/components/command-palette";
import { platformAdminLogoutAction, refreshPlatformAdminAction } from "@/features/platform-admin/actions";
import { LiveDot, badgeTone, formatDateTime } from "@/features/platform-admin/components/primitives";
import { platformAdminSections } from "@/features/platform-admin/navigation";
import type { ActiveSection, Snapshot } from "@/features/platform-admin/types";
import type { PlatformAdminSession } from "@/lib/platform-admin-auth";
import { cn } from "@/lib/utils";

function statusSummary(snapshot: Snapshot) {
  if (snapshot.warnings.length) return { label: "Cần xử lý", tone: "warning" as const };
  if (snapshot.metrics.pendingPayments || snapshot.metrics.integrationWarnings) return { label: "Theo dõi", tone: "info" as const };
  return { label: "Ổn định", tone: "good" as const };
}

function Sidebar({ activeSection, snapshot }: { activeSection: ActiveSection; snapshot: Snapshot }) {
  const summary = statusSummary(snapshot);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/10 bg-[#0A0F1D] lg:block">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sm font-black text-white">LV</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">LogiVN Control</p>
            <p className="text-[11px] font-medium text-slate-500">admin.logivn.com</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className={badgeTone(summary.tone)}>{summary.label}</span>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500"><LiveDot tone={summary.tone} /> {snapshot.environment.vercelEnv}</span>
        </div>

        <nav className="grid gap-0.5 overflow-y-auto p-2">
          {platformAdminSections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.key;
            return (
              <Link
                key={section.key}
                href={section.href}
                className={cn(
                  "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
                  active ? "bg-white text-[#080C16]" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <Icon size={16} className={active ? "text-[#080C16]" : "text-slate-500 group-hover:text-slate-200"} />
                <span className="truncate">{section.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 p-2">
          <form action={platformAdminLogoutAction}>
            <button className="flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white">
              <LogOut size={16} />
              Đăng xuất
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ activeSection, snapshot, session }: { activeSection: ActiveSection; snapshot: Snapshot; session: PlatformAdminSession }) {
  const active = platformAdminSections.find((section) => section.key === activeSection) ?? platformAdminSections[0];
  const summary = statusSummary(snapshot);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#080C16]/92 px-4 py-3 backdrop-blur-xl lg:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">{active.label}</h1>
            <span className={badgeTone(summary.tone)}>{summary.label}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(snapshot.generatedAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CommandPalette />
          <form action={refreshPlatformAdminAction}>
            <button className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08]" aria-label="Làm mới">
              <RefreshCw size={16} />
            </button>
          </form>
          <button className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08]" aria-label="Thông báo">
            <Bell size={16} />
          </button>
          <div className="hidden h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 sm:flex">
            <Shield size={14} />
            {session.role}
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ activeSection }: { activeSection: ActiveSection }) {
  return (
    <nav className="dashboard-mobile-nav-shell flex gap-2 overflow-x-auto border-b border-white/10 bg-[#080C16]/95 px-4 py-3 backdrop-blur-xl lg:hidden">
      {platformAdminSections.map((section) => {
        const Icon = section.icon;
        const active = activeSection === section.key;
        return (
          <Link
            key={section.key}
            href={section.href}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold",
              active ? "border-white bg-white text-[#080C16]" : "border-white/10 bg-white/[0.04] text-slate-300"
            )}
          >
            <Icon size={15} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PlatformAdminShell({
  activeSection,
  snapshot,
  session,
  children
}: {
  activeSection: ActiveSection;
  snapshot: Snapshot;
  session: PlatformAdminSession;
  children: ReactNode;
}) {
  return (
    <main className="stitch-admin stitch-devops min-h-screen bg-[#080C16] text-slate-100">
      <Sidebar activeSection={activeSection} snapshot={snapshot} />
      <section className="lg:pl-[248px]">
        <Topbar activeSection={activeSection} snapshot={snapshot} session={session} />
        <MobileNav activeSection={activeSection} />
        <div className="mx-auto max-w-[1760px] px-4 py-4 lg:px-5">{children}</div>
      </section>
    </main>
  );
}
