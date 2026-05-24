import { Activity, AlertTriangle, Bot, KeyRound, Store } from "lucide-react";
import { IntegrationGrid } from "@/features/platform-admin/components/integration-grid";
import {
  MetricCard,
  SectionCard,
  badgeTone,
  formatDateTime,
  formatNumber,
  statusTone
} from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";

function severityTone(severity: string): Parameters<typeof badgeTone>[0] {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "opportunity") return "good";
  return "info";
}

export function AiControl({ snapshot }: { snapshot: Snapshot }) {
  const aiIntegrations = snapshot.integrations.filter((item) => item.category === "ai");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <MetricCard label="AI requests 24h" value={formatNumber(snapshot.aiControl.requests)} detail={`${snapshot.aiControl.successRate}% success`} icon={Bot} tone={snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricCard label="Tokens 24h" value={formatNumber(snapshot.aiControl.tokens)} detail={`${snapshot.aiControl.imageCount} image requests`} icon={Activity} tone="info" />
        <MetricCard label="Blocked/failed" value={formatNumber(snapshot.aiControl.blocked + snapshot.aiControl.failures)} detail="Theo ai_usage_logs gần nhất" icon={AlertTriangle} tone={snapshot.aiControl.blocked + snapshot.aiControl.failures ? "warning" : "neutral"} />
        <MetricCard label="Morning briefs" value={formatNumber(snapshot.aiControl.morningBriefs.generated)} detail={`${snapshot.aiControl.morningBriefs.sent} sent · ${snapshot.aiControl.morningBriefs.failed} failed`} icon={KeyRound} tone={snapshot.aiControl.morningBriefs.failed ? "warning" : "info"} />
        <MetricCard label="Branch insights" value={formatNumber(snapshot.aiControl.branchInsights.active)} detail={`${snapshot.aiControl.branchInsights.critical} critical · ${snapshot.aiControl.branchInsights.warning} warning`} icon={Store} tone={snapshot.aiControl.branchInsights.critical ? "danger" : snapshot.aiControl.branchInsights.warning ? "warning" : "good"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="AI routing">
          <dl className="grid gap-3 text-sm">
            {[
              ["Owner provider", snapshot.aiControl.routing.ownerProvider],
              ["Customer provider", snapshot.aiControl.routing.customerProvider],
              ["Image provider", snapshot.aiControl.routing.imageProvider],
              ["Owner model", snapshot.aiControl.routing.ownerModel],
              ["Image model", snapshot.aiControl.routing.imageModel]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                <dd className="mt-2 break-all font-mono text-sm text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Provider usage 24h">
          <div className="grid gap-2">
            {snapshot.aiControl.providers.map((provider) => (
              <div key={provider.provider} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{provider.provider}</p>
                  <span className={badgeTone(provider.failureRate > 10 ? "warning" : "good")}>{provider.failureRate}% lỗi</span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <span>{provider.requests} requests</span>
                  <span>{formatNumber(provider.tokens)} tokens</span>
                  <span>{provider.models.join(", ") || "Chưa có model log"}</span>
                </div>
              </div>
            ))}
            {!snapshot.aiControl.providers.length ? <p className="text-sm text-slate-500">Chưa có AI usage log trong 24h gần nhất.</p> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="AI Ops Morning Briefs">
        <div className="grid gap-2">
          {snapshot.aiControl.morningBriefs.recent.map((brief) => (
            <div key={`${brief.restaurantId}-${brief.channel}-${brief.createdAt}`} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">{brief.restaurantName}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={badgeTone(statusTone(brief.status))}>{brief.status}</span>
                  <span className={badgeTone("neutral")}>{brief.channel}</span>
                </div>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                <span>{brief.briefDate}</span>
                <span>Health {brief.healthScore}/100</span>
                <span>{brief.insights} insights</span>
                <span>{formatDateTime(brief.sentAt ?? brief.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{brief.summary}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className={badgeTone("neutral")}>{brief.critical} critical</span>
                <span className={badgeTone("neutral")}>{brief.warning} warning</span>
                <span className={badgeTone("neutral")}>{brief.opportunity} opportunity</span>
                <span className={badgeTone("neutral")}>{brief.recipients.length} recipients</span>
              </div>
              {brief.actions.length ? (
                <div className="mt-2 grid gap-1.5">
                  {brief.actions.map((action, index) => (
                    <div key={`${brief.restaurantId}-${brief.createdAt}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={badgeTone(action.severity === "critical" ? "danger" : action.severity === "warning" ? "warning" : "neutral")}>{action.severity}</span>
                        <p className="text-xs font-semibold text-slate-950">{action.title}</p>
                      </div>
                      {action.action ? <p className="mt-1 text-xs leading-5 text-slate-500">{action.action}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {brief.error ? <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{brief.error}</p> : null}
            </div>
          ))}
          {!snapshot.aiControl.morningBriefs.recent.length ? <p className="text-sm text-slate-500">Chưa có Morning Brief trong 7 ngày gần nhất.</p> : null}
        </div>
      </SectionCard>

      <SectionCard title="AI Ops Branch Insights">
        <div className="grid gap-2">
          <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-4">
            <span>{snapshot.aiControl.branchInsights.windowDays} ngày gần nhất</span>
            <span>{snapshot.aiControl.branchInsights.restaurants} quán có tín hiệu</span>
            <span>{snapshot.aiControl.branchInsights.branches} chi nhánh</span>
            <span>Mới nhất {formatDateTime(snapshot.aiControl.branchInsights.latestAt)}</span>
          </div>
          {snapshot.aiControl.branchInsights.recent.map((insight) => (
            <div key={insight.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className={badgeTone(severityTone(insight.severity))}>{insight.severity}</span>
                    <span className={badgeTone(statusTone(insight.status))}>{insight.status}</span>
                    <span className={badgeTone("neutral")}>{insight.branchName}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{insight.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{insight.restaurantName}</p>
                </div>
                <span className="text-xs text-slate-500">{formatDateTime(insight.lastSeenAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">{insight.action}</p>
              {insight.metric ? <span className={badgeTone("neutral")}>{insight.metric}</span> : null}
            </div>
          ))}
          {!snapshot.aiControl.branchInsights.recent.length ? <p className="text-sm text-slate-500">Chưa có branch insight trong 7 ngày gần nhất.</p> : null}
        </div>
      </SectionCard>

      <IntegrationGrid title="AI secrets & config" integrations={aiIntegrations} />
    </div>
  );
}
