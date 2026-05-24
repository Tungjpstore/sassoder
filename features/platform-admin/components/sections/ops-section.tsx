import { Activity, AlertTriangle, Clock3, ServerCog } from "lucide-react";
import { IntegrationGrid } from "@/features/platform-admin/components/integration-grid";
import {
  MetricCard,
  SectionCard,
  badgeTone,
  formatDateTime,
  formatNumber,
  statusTone
} from "@/features/platform-admin/components/primitives";
import { moduleStatusLabel } from "@/features/platform-admin/labels";
import type { Snapshot } from "@/features/platform-admin/types";

function runStatusLabel(status: string | null | undefined) {
  if (status === "success") return "success";
  if (status === "warn") return "warning";
  if (status === "error") return "error";
  return "no run";
}

function formatDurationMs(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "Chưa có";
  const ms = Math.max(0, Number(value));
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${Math.round(ms / 100) / 10}s`;
}

function formatAgeHours(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "Chưa có";
  const hours = Math.max(0, Number(value));
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} phút`;
  if (hours < 24) return `${Math.round(hours * 10) / 10} giờ`;
  return `${Math.round((hours / 24) * 10) / 10} ngày`;
}

function summaryLine(summary: Record<string, unknown> | undefined) {
  const entries = Object.entries(summary ?? {}).slice(0, 4);
  if (!entries.length) return "Chưa có summary";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

export function OpsControl({ snapshot }: { snapshot: Snapshot }) {
  const cronAttention = snapshot.cronJobs.filter((job) => (job.failureStreak ?? 0) > 0 || (job.lastRunAgeHours ?? 0) > 36).length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Integrations" value={formatNumber(snapshot.integrations.length)} detail={`${snapshot.integrations.filter((item) => item.status === "configured").length} configured`} icon={ServerCog} tone="info" />
        <MetricCard label="Cron jobs" value={formatNumber(snapshot.cronJobs.length)} detail={`${snapshot.cronJobs.filter((job) => job.status === "configured").length} có CRON_SECRET`} icon={Clock3} tone={snapshot.cronJobs.every((job) => job.status === "configured") ? "good" : "warning"} />
        <MetricCard label="Cron attention" value={formatNumber(cronAttention)} detail="Lỗi liên tiếp hoặc quá 36 giờ chưa chạy" icon={Activity} tone={cronAttention ? "danger" : "good"} />
        <MetricCard label="Env warnings" value={formatNumber(snapshot.metrics.integrationWarnings)} detail="Thiếu hoặc mới cấu hình một phần" icon={AlertTriangle} tone={snapshot.metrics.integrationWarnings ? "warning" : "good"} />
      </div>

      <SectionCard title="Cron jobs">
        <div className="grid gap-3 md:grid-cols-3">
          {snapshot.cronJobs.map((job) => (
            <div key={job.key} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{job.name}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <span className={badgeTone(statusTone(job.status))}>{moduleStatusLabel[job.status] ?? job.status}</span>
                  <span className={badgeTone(statusTone(job.lastRunStatus ?? "neutral"))}>{runStatusLabel(job.lastRunStatus)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{job.note}</p>
              <div className="mt-3 grid gap-1 font-mono text-xs text-slate-500">
                <span>{job.path}</span>
                <span>{job.schedule}</span>
                <span>Guard: {job.guard}</span>
                <span>Next: {formatDateTime(job.nextRunAt ?? null)}</span>
                <span>Last: {formatDateTime(job.lastRunAt ?? null)}</span>
                <span>Age: {formatAgeHours(job.lastRunAgeHours)}</span>
                <span>Duration: {formatDurationMs(job.lastDurationMs)}</span>
              </div>
              {(job.failureStreak ?? 0) > 0 || (job.attentionStreak ?? 0) > 0 || (job.lastRunAgeHours ?? 0) > 36 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(job.failureStreak ?? 0) > 0 ? <span className={badgeTone("danger")}>{job.failureStreak} lỗi liên tiếp</span> : null}
                  {(job.attentionStreak ?? 0) > (job.failureStreak ?? 0) ? <span className={badgeTone("warning")}>{job.attentionStreak} lần cần xem</span> : null}
                  {(job.lastRunAgeHours ?? 0) > 36 ? <span className={badgeTone("warning")}>Trễ {formatAgeHours(job.lastRunAgeHours)}</span> : null}
                </div>
              ) : null}
              {job.lastError ? <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-2 text-xs font-semibold text-red-700">{job.lastError}</p> : null}
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{summaryLine(job.lastSummary)}</p>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Recent runs</p>
                <div className="mt-2 grid gap-2">
                  {job.recentRuns?.length ? (
                    job.recentRuns.slice(0, 5).map((run) => (
                      <div key={`${job.key}-${run.startedAt}`} className="grid gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={badgeTone(statusTone(run.status))}>{runStatusLabel(run.status)}</span>
                          <span className="font-mono">{formatDurationMs(run.durationMs)}</span>
                        </div>
                        <span>{formatDateTime(run.startedAt)}</span>
                        <span className="line-clamp-1">{run.error ?? summaryLine(run.summary)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Chưa có lịch sử chạy.</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <IntegrationGrid title="Secrets, storage & runtime" integrations={snapshot.integrations.filter((item) => item.category !== "ai" && item.category !== "maps")} />
    </div>
  );
}
