import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, ChevronDown, Cpu, LogOut, RefreshCw, Shield, Wifi } from "lucide-react";
import { CommandPalette } from "@/features/platform-admin/components/command-palette";
import { platformAdminLogoutAction, refreshPlatformAdminAction } from "@/features/platform-admin/actions";
import { LiveDot, badgeTone, formatDateTime } from "@/features/platform-admin/components/primitives";
import { platformAdminSections } from "@/features/platform-admin/navigation";
import type { ActiveSection, Snapshot } from "@/features/platform-admin/types";
import type { PlatformAdminSession } from "@/lib/platform-admin-auth";
import { cn } from "@/lib/utils";

const sectionDescriptions: Record<ActiveSection, string> = {
  overview: "Mission control cho tenant, AI, queue, deploy và SLA.",
  "system-map": "Topology realtime giữa frontend, API, Redis, worker, AI và payments.",
  deployments: "Release health, preview deploy, migrations và rollback.",
  services: "Sức khoẻ dịch vụ, websocket, cron, worker và integrations.",
  queues: "BullMQ operations: waiting, active, failed, retry và dead-letter.",
  redis: "Realtime backbone: memory, ops/sec, keyspace, locks và cache hit.",
  telegram: "Bot infrastructure, callback, delivery, rate limit và kết nối DevOps.",
  ai: "Token, model, latency, chi phí, prompt failures và API key rotation.",
  payments: "VietQR reconciliation, pending payments, duplicate risk và webhook retry.",
  tenants: "Tenant explorer cho quán, subscription, feature channel và health.",
  logs: "Structured logs, traces, error grouping và streaming terminal.",
  alerts: "Operational alerts, severity, acknowledgement và AI summary.",
  incidents: "War-room realtime cho outage, impact, timeline và mitigation.",
  flags: "Feature rollout theo tenant, environment, stage và A/B cohort.",
  settings: "RBAC, audit, environment, secrets policy và platform governance."
};

function statusSummary(snapshot: Snapshot) {
  if (snapshot.warnings.length) return { label: "Degraded", tone: "warning" as const };
  if (snapshot.metrics.pendingPayments || snapshot.metrics.integrationWarnings) return { label: "Attention", tone: "info" as const };
  return { label: "Operational", tone: "good" as const };
}

function Sidebar({ activeSection, snapshot }: { activeSection: ActiveSection; snapshot: Snapshot }) {
  const summary = statusSummary(snapshot);

  return (
    <aside className="fixed inset-y-3 left-3 z-40 hidden w-[264px] overflow-hidden rounded-xl border border-white/10 bg-[#0B1020]/86 shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-2xl lg:block">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/45 to-transparent" />
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 p-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sm font-black text-sky-100 shadow-[0_0_28px_rgba(14,165,233,0.22)]">LV</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">LogiVN Control</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">AI DevOps Center</span>
            </span>
          </Link>
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className={badgeTone(summary.tone)}>{summary.label}</span>
              <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-400"><LiveDot tone={summary.tone} /> realtime</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <span>{snapshot.environment.vercelEnv}</span>
              <span className="text-right">{snapshot.environment.region}</span>
              <span>{snapshot.metrics.activeTenants} tenants</span>
              <span className="text-right">{snapshot.queryLatencyMs}ms</span>
            </div>
          </div>
        </div>
        <nav className="grid gap-1 overflow-y-auto p-2">
          {platformAdminSections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.key;
            return (
              <Link
                key={section.key}
                href={section.href}
                className={cn(
                  "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition",
                  active
                    ? "border border-sky-400/25 bg-sky-400/12 text-white shadow-[0_0_24px_rgba(14,165,233,0.14)]"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                )}
              >
                <span className={cn("grid h-6 w-6 place-items-center rounded-md", active ? "bg-sky-300/15 text-sky-200" : "text-slate-500 group-hover:text-sky-200")}>
                  <Icon size={15} />
                </span>
                <span className="truncate">{section.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 p-3">
          <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-400">
            <p className="font-semibold text-slate-200">{snapshot.environment.commit}</p>
            <p className="mt-1">Không expose raw secrets hoặc dữ liệu riêng của quán.</p>
          </div>
          <form action={platformAdminLogoutAction}>
            <button className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-300 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-100">
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
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B1020]/82 px-4 py-3 backdrop-blur-2xl lg:px-6">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">admin.logivn.com</span>
            <span className={badgeTone(summary.tone)}>{summary.label}</span>
          </div>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-white md:text-2xl">{active.label}</h1>
          <p className="mt-1 hidden max-w-3xl truncate text-sm text-slate-500 xl:block">{sectionDescriptions[activeSection]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CommandPalette />
          <span className="hidden h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-400 2xl:inline-flex">
            <Wifi size={14} className="text-emerald-300" /> WS healthy
          </span>
          <span className="hidden h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-400 2xl:inline-flex">
            <Cpu size={14} className="text-sky-300" /> {formatDateTime(snapshot.generatedAt)}
          </span>
          <form action={refreshPlatformAdminAction}>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-400/10 hover:text-white">
              <RefreshCw size={15} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </form>
          <button className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-100" aria-label="Thông báo">
            <Bell size={16} />
          </button>
          <div className="hidden h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 sm:flex">
            <Shield size={14} className="text-emerald-300" />
            {session.role}
            <ChevronDown size={14} className="text-slate-500" />
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ activeSection }: { activeSection: ActiveSection }) {
  return (
    <nav className="dashboard-mobile-nav-shell flex gap-2 overflow-x-auto border-b border-white/10 bg-[#0B1020]/90 px-4 py-3 backdrop-blur-2xl lg:hidden">
      {platformAdminSections.map((section) => {
        const Icon = section.icon;
        const active = activeSection === section.key;
        return (
          <Link
            key={section.key}
            href={section.href}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold",
              active ? "border-sky-400/30 bg-sky-400/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-400"
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
    <main className="stitch-admin stitch-devops min-h-screen bg-[#0B1020] text-slate-100">
      <Sidebar activeSection={activeSection} snapshot={snapshot} />
      <section className="lg:pl-[288px]">
        <Topbar activeSection={activeSection} snapshot={snapshot} session={session} />
        <MobileNav activeSection={activeSection} />
        <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-6 xl:py-5">{children}</div>
      </section>
    </main>
  );
}
