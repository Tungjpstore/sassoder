import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  FileCheck2,
  GitBranch,
  ListChecks,
  LockKeyhole,
  PlayCircle,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  type LucideIcon
} from "lucide-react";
import {
  updateAiAutomationRunStatusAction,
  updateAiRecommendationStatusAction
} from "@/app/dashboard/actions";
import { AdminShell } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import type { AiExecutionItem, AiExecutionItemKind, AiExecutionItemPriority, AiExecutionItemStatus } from "@/lib/ai/execution-center";
import { requireDashboardAdminAccess } from "@/lib/dashboard-access";
import { getAiExecutionCenterDeck } from "@/services/ai-execution-center-service";

export const dynamic = "force-dynamic";

function priorityTone(priority: AiExecutionItemPriority) {
  if (priority === "critical") return "red";
  if (priority === "high") return "yellow";
  if (priority === "medium") return "blue";
  return "neutral";
}

function statusTone(status: AiExecutionItemStatus) {
  if (status === "pending") return "yellow";
  if (status === "approved") return "green";
  if (status === "blocked") return "red";
  if (status === "manual") return "blue";
  return "neutral";
}

function kindLabel(kind: AiExecutionItemKind) {
  if (kind === "recommendation") return "Recommendation";
  if (kind === "workflow") return "Workflow";
  if (kind === "menu_opportunity") return "Menu";
  if (kind === "growth_campaign") return "Growth";
  return "Support";
}

function statusLabel(status: AiExecutionItemStatus) {
  if (status === "pending") return "Chờ duyệt";
  if (status === "approved") return "Đã duyệt";
  if (status === "manual") return "Manual";
  if (status === "blocked") return "Bị chặn";
  return "Hoàn tất";
}

function domainLabel(domain: AiExecutionItem["domain"]) {
  if (domain === "inventory") return "Kho";
  if (domain === "staffing") return "Nhân sự";
  if (domain === "payment") return "Thanh toán";
  if (domain === "menu") return "Menu";
  if (domain === "growth") return "Growth";
  if (domain === "support") return "Support";
  if (domain === "branch") return "Chi nhánh";
  return "Vận hành";
}

const kindIcons: Record<AiExecutionItemKind, LucideIcon> = {
  recommendation: Sparkles,
  workflow: GitBranch,
  menu_opportunity: ListChecks,
  growth_campaign: WandSparkles,
  support_scenario: ShieldCheck
};

function ApproveButton({ item }: { item: AiExecutionItem }) {
  if (!item.databaseId || item.status !== "pending") return null;
  if (item.kind === "recommendation") {
    return (
      <form action={updateAiRecommendationStatusAction}>
        <input type="hidden" name="recommendationId" value={item.databaseId} />
        <input type="hidden" name="status" value="accepted" />
        <button
          type="submit"
          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
          aria-label={`Duyệt ${item.title}`}
          title="Duyệt"
        >
          <CheckCircle2 size={15} />
        </button>
      </form>
    );
  }
  if (item.kind === "workflow") {
    return (
      <form action={updateAiAutomationRunStatusAction}>
        <input type="hidden" name="runId" value={item.databaseId} />
        <input type="hidden" name="status" value="approved" />
        <button
          type="submit"
          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
          aria-label={`Duyệt ${item.title}`}
          title="Duyệt"
        >
          <CheckCircle2 size={15} />
        </button>
      </form>
    );
  }
  return null;
}

function DismissButton({ item }: { item: AiExecutionItem }) {
  if (!item.databaseId || (item.kind !== "recommendation" && item.kind !== "workflow")) return null;
  if (item.kind === "recommendation") {
    return (
      <form action={updateAiRecommendationStatusAction}>
        <input type="hidden" name="recommendationId" value={item.databaseId} />
        <input type="hidden" name="status" value="dismissed" />
        <button
          type="submit"
          className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          aria-label={`Ẩn ${item.title}`}
          title="Ẩn"
        >
          <EyeOff size={15} />
        </button>
      </form>
    );
  }
  return (
    <form action={updateAiAutomationRunStatusAction}>
      <input type="hidden" name="runId" value={item.databaseId} />
      <input type="hidden" name="status" value="dismissed" />
      <button
        type="submit"
        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        aria-label={`Ẩn ${item.title}`}
        title="Ẩn"
      >
        <EyeOff size={15} />
      </button>
    </form>
  );
}

function ExecutionCard({ item }: { item: AiExecutionItem }) {
  const Icon = kindIcons[item.kind];
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]">
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
              <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge>
              <Badge>{kindLabel(item.kind)}</Badge>
              <Badge>{domainLabel(item.domain)}</Badge>
            </div>
            <p className="mt-2 text-sm font-bold text-[var(--foreground)]">{item.title}</p>
            <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{item.detail}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--soft-surface)] px-2.5 py-1.5 text-right">
          <span className="block text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">Impact</span>
          <strong className="text-xs font-bold text-[var(--foreground)]">{item.estimatedImpact}</strong>
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-lg bg-[var(--soft-surface)] px-3 py-2">
          <p className="text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Hành động</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--foreground)]">{item.action}</p>
        </div>
        {item.blockers.length ? (
          <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-2">
            <p className="text-[11px] font-bold uppercase text-[var(--accent-strong)]">Blocker</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--accent-strong)]">{item.blockers[0]}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--muted-foreground)]">{item.source} · {item.safetyMode}</span>
        <div className="flex items-center gap-1.5">
          <ApproveButton item={item} />
          <DismissButton item={item} />
          {item.actionHref ? (
            <Link
              href={item.actionHref}
              className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
              aria-label={`Mở ${item.title}`}
              title="Mở khu vực xử lý"
            >
              <ArrowRight size={16} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function AiExecutionPage() {
  const { session, entitlement } = await requireDashboardAdminAccess("ai_owner_assistant");
  const deck = await getAiExecutionCenterDeck(session.restaurantId);
  const metricCards = [
    { label: "Total", value: deck.summary.total, detail: "Quyết định AI đang gom", icon: ClipboardCheck, tone: deck.summary.total ? "green" : "blue" },
    { label: "Pending", value: deck.summary.pending, detail: "Chờ chủ quán duyệt", icon: PlayCircle, tone: deck.summary.pending ? "yellow" : "green" },
    { label: "Approved", value: deck.summary.approved, detail: "Đã duyệt để xử lý", icon: CheckCircle2, tone: deck.summary.approved ? "green" : "blue" },
    { label: "Manual", value: deck.summary.manual, detail: "Cần xử lý thủ công", icon: ListChecks, tone: deck.summary.manual ? "blue" : "green" },
    { label: "Critical", value: deck.summary.critical, detail: "Ưu tiên cao nhất", icon: LockKeyhole, tone: deck.summary.critical ? "red" : "green" },
    { label: "Blocked", value: deck.summary.blocked, detail: "Thiếu cấu hình/dữ liệu", icon: ShieldCheck, tone: deck.summary.blocked ? "yellow" : "green" }
  ] as const;

  return (
    <AdminShell
      title="AI Execution Center"
      restaurantName={session.restaurant.name}
      restaurantId={session.restaurantId}
      entitlement={entitlement}
      subtitle="Một hàng đợi duyệt tập trung cho recommendation, workflow, menu, growth và support AI"
      showLiveActionCenter={false}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/ai-control" className="dashboard-secondary-action">
              <SlidersHorizontal size={16} />
              AI Control
            </Link>
            <Link href="/dashboard/ai-automation" className="dashboard-secondary-action">
              <GitBranch size={16} />
              AI Automation
            </Link>
            <Link href="/dashboard/ai-apply" className="dashboard-secondary-action">
              <FileCheck2 size={16} />
              AI Apply
            </Link>
          </div>
          <Link href="/api/admin/ai/execution-center" className="dashboard-secondary-action">
            API execution
            <ArrowRight size={15} />
          </Link>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="admin-stat-tile p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="dashboard-stat-icon">
                    <Icon size={18} />
                  </span>
                  <Badge tone={card.tone}>{card.label}</Badge>
                </div>
                <p className="metric-number mt-4 text-2xl font-semibold tabular-nums">{card.value}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{card.detail}</p>
              </article>
            );
          })}
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <ClipboardCheck size={15} />
                Approval queue
              </p>
              <h2 className="dashboard-section-title mt-1">Quyết định AI cần xử lý</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {deck.lanes.map((lane) => (
                <Badge key={lane.id} tone={statusTone(lane.id)}>{lane.label}: {lane.count}</Badge>
              ))}
            </div>
          </div>
          {deck.items.length ? (
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {deck.items.slice(0, 24).map((item) => (
                <ExecutionCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="mt-3 grid min-h-24 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--muted-foreground)]">
              Chưa có quyết định AI đang mở. Khi các studio tạo recommendation, workflow hoặc opportunity, chúng sẽ gom về đây.
            </div>
          )}
        </section>

        <section className="dashboard-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dashboard-eyebrow inline-flex items-center gap-2">
                <ShieldCheck size={15} />
                Execution runbook
              </p>
              <h2 className="dashboard-section-title mt-1">Luật vận hành trước khi tự động hóa</h2>
            </div>
            <Badge>{deck.summary.confirmFirst} confirm-first</Badge>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {deck.runbook.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5">
                <p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                <p className="mt-1 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
