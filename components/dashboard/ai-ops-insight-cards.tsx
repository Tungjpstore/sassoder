import Link from "next/link";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, Clock3, EyeOff, Lightbulb, MailCheck, ShieldCheck, Sparkles } from "lucide-react";
import { updateAiOperationInsightStatusAction } from "@/app/dashboard/actions";
import type { AiOperationInsight, AiOperationInsightsDeck } from "@/lib/ai/operation-insights";
import type { AiMorningBriefRun } from "@/services/ai-morning-brief-service";

const intentRouteMap: Record<string, string> = {
  overview: "/dashboard",
  orders: "/dashboard/orders",
  kitchen: "/dashboard/orders",
  menu: "/dashboard/menu",
  inventory: "/dashboard/inventory",
  tables: "/dashboard/tables",
  payments: "/dashboard/payments",
  promotions: "/dashboard/promotions",
  staff: "/dashboard/staff",
  reports: "/dashboard/analytics",
  growth: "/dashboard/promotions"
};

function cardTone(insight: AiOperationInsight) {
  if (insight.severity === "critical") {
    return {
      icon: AlertTriangle,
      label: "Xử lý ngay",
      frame: "border-[#E11D48]/24 bg-[rgba(225,29,72,0.07)]",
      mark: "border-[#E11D48]/20 bg-[rgba(225,29,72,0.1)] text-[#BE123C]",
      pill: "bg-[rgba(225,29,72,0.1)] text-[#BE123C]"
    };
  }

  if (insight.severity === "warning") {
    return {
      icon: Clock3,
      label: "Cần chú ý",
      frame: "border-[var(--accent)]/24 bg-[rgba(245,158,11,0.08)]",
      mark: "border-[var(--accent)]/20 bg-[rgba(245,158,11,0.12)] text-[var(--accent)]",
      pill: "bg-[rgba(245,158,11,0.12)] text-[var(--accent)]"
    };
  }

  if (insight.severity === "opportunity") {
    return {
      icon: Lightbulb,
      label: "Cơ hội",
      frame: "border-[var(--primary)]/18 bg-[var(--primary-soft)]",
      mark: "border-[var(--primary)]/15 bg-[var(--surface)] text-[var(--primary)]",
      pill: "bg-[var(--surface)] text-[var(--primary)]"
    };
  }

  return {
    icon: CheckCircle2,
    label: "Theo dõi",
    frame: "border-[var(--border)] bg-[var(--surface)]",
    mark: "border-[var(--border)] bg-[var(--soft-surface)] text-[var(--primary)]",
    pill: "bg-[var(--soft-surface)] text-[var(--muted-foreground)]"
  };
}

function insightHref(insight: AiOperationInsight) {
  return insight.actionHref || intentRouteMap[insight.actionIntent ?? ""] || "/dashboard";
}

function healthTone(score: number) {
  if (score < 60) return "text-[#BE123C]";
  if (score < 80) return "text-[var(--accent)]";
  return "text-[var(--primary)]";
}

function briefStatusLabel(status: AiMorningBriefRun["status"]) {
  if (status === "sent") return "Đã gửi";
  if (status === "failed") return "Lỗi gửi";
  if (status === "skipped") return "Bỏ qua";
  return "Đã tạo";
}

function briefTone(status: AiMorningBriefRun["status"]) {
  if (status === "failed") return "border-[#E11D48]/20 bg-[rgba(225,29,72,0.08)] text-[#BE123C]";
  if (status === "skipped") return "border-[var(--accent)]/20 bg-[rgba(245,158,11,0.08)] text-[var(--accent)]";
  return "border-[var(--primary)]/15 bg-[var(--primary-soft)] text-[var(--primary)]";
}

function formatBriefDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export function AiOpsInsightCards({
  deck,
  morningBrief
}: {
  deck: AiOperationInsightsDeck;
  morningBrief?: AiMorningBriefRun | null;
}) {
  const visibleInsights = deck.insights.slice(0, 3);
  const hasInsights = visibleInsights.length > 0;

  return (
    <section className="grid gap-3" aria-labelledby="ai-ops-radar-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <BrainCircuit size={15} />
            AI Ops Radar
          </p>
          <h2 id="ai-ops-radar-title" className="dashboard-section-title mt-1">
            {deck.summary}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {morningBrief ? (
            <Link href="/dashboard/ai-ops" className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 transition hover:-translate-y-0.5 ${briefTone(morningBrief.status)}`}>
              <MailCheck size={16} />
              <span className="text-xs font-semibold">Brief {formatBriefDate(morningBrief.briefDate)}</span>
              <strong className="text-xs font-semibold">{briefStatusLabel(morningBrief.status)}</strong>
            </Link>
          ) : null}
          <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
            <ShieldCheck size={16} className={healthTone(deck.healthScore)} />
            <span className="text-xs font-semibold text-[var(--muted-foreground)]">Health</span>
            <strong className={`metric-number text-lg ${healthTone(deck.healthScore)}`}>{deck.healthScore}/100</strong>
          </div>
        </div>
      </div>

      {hasInsights ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {visibleInsights.map((insight) => {
            const tone = cardTone(insight);
            const Icon = tone.icon;
            const persistedId = insight.lifecycle?.databaseId;
            return (
              <article
                key={insight.id}
                className={`group grid min-h-[156px] content-between gap-4 rounded-xl border p-4 transition hover:-translate-y-0.5 hover:border-[var(--primary)]/35 ${tone.frame}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${tone.mark}`}>
                    <Icon size={18} />
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${tone.pill}`}>
                    {tone.label}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-[var(--foreground)]">{insight.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{insight.detail}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                        {insight.metric?.label ?? "Action"}
                      </span>
                      <strong className="metric-number block truncate text-sm text-[var(--foreground)]">
                        {insight.metric?.value ?? insight.action}
                      </strong>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {persistedId ? (
                        <>
                          <form action={updateAiOperationInsightStatusAction}>
                            <input type="hidden" name="insightId" value={persistedId} />
                            <input type="hidden" name="status" value="resolved" />
                            <button
                              type="submit"
                              className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                              aria-label={`Đánh dấu đã xử lý ${insight.title}`}
                              title="Đã xử lý"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          </form>
                          <form action={updateAiOperationInsightStatusAction}>
                            <input type="hidden" name="insightId" value={persistedId} />
                            <input type="hidden" name="status" value="dismissed" />
                            <button
                              type="submit"
                              className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                              aria-label={`Ẩn insight ${insight.title}`}
                              title="Ẩn thẻ"
                            >
                              <EyeOff size={15} />
                            </button>
                          </form>
                        </>
                      ) : null}
                      <Link
                        href={insightHref(insight)}
                        className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition hover:border-[var(--primary)]"
                        aria-label={`Mở ${insight.title}`}
                        title="Mở khu vực xử lý"
                      >
                        <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-[112px] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 text-center">
          <div className="max-w-md">
            <Sparkles size={20} className="mx-auto text-[var(--primary)]" />
            <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">Ca bán đang ổn</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              AI Ops chưa thấy rủi ro rõ. Khi có thanh toán treo, bàn quá giờ hoặc cơ hội upsell, thẻ hành động sẽ tự nổi lên tại đây.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
