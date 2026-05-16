import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { platformAdminLogoutAction, refreshPlatformAdminAction } from "@/app/admin/actions";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { formatDateTime } from "@/features/platform-admin/components/primitives";
import { platformAdminSections } from "@/features/platform-admin/navigation";
import type { ActiveSection, Snapshot } from "@/features/platform-admin/types";
import { cn } from "@/lib/utils";

function Sidebar({ activeSection, snapshot }: { activeSection: ActiveSection; snapshot: Snapshot }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-slate-200 bg-white lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4">
          <LogiVNLogo href="/admin" className="h-9" priority />
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Platform admin</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{snapshot.environment.vercelEnv}</p>
            <p className="mt-1 truncate text-xs text-slate-500">Không hiển thị doanh thu/đơn riêng tư của quán</p>
          </div>
        </div>
        <nav className="grid gap-1 p-3">
          {platformAdminSections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.key;
            return (
              <Link
                key={section.key}
                href={section.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                  active ? "bg-[var(--primary)] text-[#FFF7EB]" : "text-[var(--muted-foreground)] hover:bg-[var(--soft-surface)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon size={16} />
                {section.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-slate-200 p-3">
          <form action={platformAdminLogoutAction}>
            <button className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <LogOut size={16} />
              Đăng xuất /admin
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ activeSection, snapshot }: { activeSection: ActiveSection; snapshot: Snapshot }) {
  const active = platformAdminSections.find((section) => section.key === activeSection) ?? platformAdminSections[0];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-5">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">LogiVN control plane</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{active.label}</h1>
        </div>
        <div className="flex items-center gap-2">
          <form action={refreshPlatformAdminAction}>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <RefreshCw size={15} />
              Làm mới
            </button>
          </form>
          <span className="hidden h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-500 sm:inline-flex">
            {formatDateTime(snapshot.generatedAt)} · {snapshot.queryLatencyMs}ms
          </span>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ activeSection }: { activeSection: ActiveSection }) {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
      {platformAdminSections.map((section) => {
        const Icon = section.icon;
        const active = activeSection === section.key;
        return (
          <Link
            key={section.key}
            href={section.href}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold",
              active ? "border-[var(--primary)] bg-[var(--primary)] text-[#FFF7EB]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
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
  children
}: {
  activeSection: ActiveSection;
  snapshot: Snapshot;
  children: ReactNode;
}) {
  return (
    <main className="stitch-admin min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar activeSection={activeSection} snapshot={snapshot} />
      <section className="lg:pl-[252px]">
        <Topbar activeSection={activeSection} snapshot={snapshot} />
        <MobileNav activeSection={activeSection} />
        <div className="mx-auto max-w-[1500px] px-4 py-4 lg:px-5">{children}</div>
      </section>
    </main>
  );
}
