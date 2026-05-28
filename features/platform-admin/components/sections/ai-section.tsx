import { Activity, AlertTriangle, Bot, Database, KeyRound, LockKeyhole, Store } from "lucide-react";
import { runPlatformCronJobAction, updateAiProviderConfigAction } from "@/features/platform-admin/actions";
import { IntegrationGrid } from "@/features/platform-admin/components/integration-grid";
import {
  Field,
  MetricCard,
  PrimaryButton,
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

function keySourceLabel(source: string) {
  if (source === "database") return "CSDL mã hoá";
  if (source === "environment") return "ENV server";
  return "Chưa có";
}

function keySourceTone(source: string): Parameters<typeof badgeTone>[0] {
  if (source === "database") return "good";
  if (source === "environment") return "info";
  return "warning";
}

function RunAiOpsButton() {
  return (
    <form action={runPlatformCronJobAction}>
      <input type="hidden" name="jobKey" value="ai-ops" />
      <PrimaryButton tone="soft">Chạy AI</PrimaryButton>
    </form>
  );
}

export function AiControl({ snapshot }: { snapshot: Snapshot }) {
  const aiIntegrations = snapshot.integrations.filter((item) => item.category === "ai");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <MetricCard label="Yêu cầu AI 24h" value={formatNumber(snapshot.aiControl.requests)} detail={`${snapshot.aiControl.successRate}% thành công`} icon={Bot} tone={snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricCard label="Token 24h" value={formatNumber(snapshot.aiControl.tokens)} detail={`${snapshot.aiControl.imageCount} yêu cầu ảnh`} icon={Activity} tone="info" />
        <MetricCard label="Chặn/lỗi" value={formatNumber(snapshot.aiControl.blocked + snapshot.aiControl.failures)} detail="Theo ai_usage_logs gần nhất" icon={AlertTriangle} tone={snapshot.aiControl.blocked + snapshot.aiControl.failures ? "warning" : "neutral"} />
        <MetricCard label="Khoá runtime" value={formatNumber(snapshot.aiControl.runtimeConfig.databaseKeys)} detail={`${snapshot.aiControl.runtimeConfig.configuredProviders} provider sẵn sàng · ${snapshot.aiControl.runtimeConfig.disabledProviders} đã tắt`} icon={LockKeyhole} tone={snapshot.aiControl.runtimeConfig.databaseKeys ? "good" : "info"} />
        <MetricCard label="Tín hiệu chi nhánh" value={formatNumber(snapshot.aiControl.branchInsights.active)} detail={`${snapshot.aiControl.branchInsights.critical} nghiêm trọng · ${snapshot.aiControl.branchInsights.warning} cảnh báo`} icon={Store} tone={snapshot.aiControl.branchInsights.critical ? "danger" : snapshot.aiControl.branchInsights.warning ? "warning" : "good"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Định tuyến AI">
          <dl className="grid gap-3 text-sm">
            {[
              ["Nhà cung cấp chủ quán", snapshot.aiControl.routing.ownerProvider],
              ["Nhà cung cấp khách hàng", snapshot.aiControl.routing.customerProvider],
              ["Nhà cung cấp ảnh", snapshot.aiControl.routing.imageProvider],
              ["Model chủ quán", snapshot.aiControl.routing.ownerModel],
              ["Model ảnh", snapshot.aiControl.routing.imageModel]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                <dd className="mt-2 break-all font-mono text-sm text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Sử dụng nhà cung cấp 24h">
          <div className="grid gap-2">
            {snapshot.aiControl.providers.map((provider) => (
              <div key={provider.provider} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{provider.provider}</p>
                  <span className={badgeTone(provider.failureRate > 10 ? "warning" : "good")}>{provider.failureRate}% lỗi</span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                  <span>{provider.requests} yêu cầu</span>
                  <span>{formatNumber(provider.tokens)} tokens</span>
                  <span>{provider.models.join(", ") || "Chưa có model log"}</span>
                </div>
              </div>
            ))}
            {!snapshot.aiControl.providers.length ? <p className="text-sm text-slate-500">Chưa có AI usage log trong 24h gần nhất.</p> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Khoá API AI & định tuyến runtime">
        <div className="grid gap-3 xl:grid-cols-2">
          {snapshot.aiControl.providerConfigs.map((provider) => (
            <form key={provider.provider} action={updateAiProviderConfigAction} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <input type="hidden" name="provider" value={provider.provider} />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Database size={16} className="text-slate-400" />
                    <p className="text-sm font-semibold text-slate-100">{provider.label}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={badgeTone(provider.configured ? "good" : "warning")}>{provider.configured ? "Sẵn sàng" : "Thiếu khoá"}</span>
                    <span className={badgeTone(keySourceTone(provider.keySource))}>{keySourceLabel(provider.keySource)}</span>
                    <span className={badgeTone(provider.enabled ? "neutral" : "danger")}>{provider.enabled ? "Đang bật" : "Đã tắt"}</span>
                  </div>
                </div>
                <p className="font-mono text-xs font-semibold text-slate-400">{provider.keyPreview}</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  Trạng thái
                  <select name="enabled" defaultValue={provider.enabled ? "true" : "false"} className="h-10 rounded-lg border border-white/10 bg-[#0A1020] px-3 text-sm font-medium text-white outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10">
                    <option value="true">Bật provider</option>
                    <option value="false">Tắt provider</option>
                  </select>
                </label>
                <Field label="Khoá API mới" name="apiKey" type="password" required={false} placeholder="sk-..." />
                <Field label="Base URL" name="baseUrl" required={false} defaultValue={provider.baseUrl} placeholder="https://..." />
                <Field label="Model chat" name="chatModel" required={false} defaultValue={provider.chatModel} />
                <Field label="Model nhanh" name="fastModel" required={false} defaultValue={provider.fastModel} />
                <Field label="Model ảnh" name="imageModel" required={false} defaultValue={provider.imageModel} />
                <Field label="Model OCR" name="ocrModel" required={false} defaultValue={provider.ocrModel} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <input type="checkbox" name="clearApiKey" value="true" className="h-4 w-4 rounded border-white/10 bg-[#0A1020]" />
                  Xoá khoá DB
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{provider.keyFingerprint ? `fp:${provider.keyFingerprint}` : "fp:--"}</span>
                  <span>{formatDateTime(provider.lastRotatedAt ?? provider.updatedAt)}</span>
                  <PrimaryButton tone="soft">
                    <KeyRound size={15} />
                    Lưu cấu hình
                  </PrimaryButton>
                </div>
              </div>
            </form>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Bản tin vận hành AI" action={<RunAiOpsButton />}>
        <div className="grid gap-2">
          {snapshot.aiControl.morningBriefs.recent.map((brief) => (
            <div key={`${brief.restaurantId}-${brief.channel}-${brief.createdAt}`} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">{brief.restaurantName}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={badgeTone(statusTone(brief.status))}>{brief.status}</span>
                  <span className={badgeTone("neutral")}>{brief.channel}</span>
                </div>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-4">
                <span>{brief.briefDate}</span>
                <span>Sức khoẻ {brief.healthScore}/100</span>
                <span>{brief.insights} tín hiệu</span>
                <span>{formatDateTime(brief.sentAt ?? brief.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-300">{brief.summary}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className={badgeTone("neutral")}>{brief.critical} nghiêm trọng</span>
                <span className={badgeTone("neutral")}>{brief.warning} cảnh báo</span>
                <span className={badgeTone("neutral")}>{brief.opportunity} cơ hội</span>
                <span className={badgeTone("neutral")}>{brief.recipients.length} người nhận</span>
              </div>
              {brief.actions.length ? (
                <div className="mt-2 grid gap-1.5">
                  {brief.actions.map((action, index) => (
                    <div key={`${brief.restaurantId}-${brief.createdAt}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={badgeTone(action.severity === "critical" ? "danger" : action.severity === "warning" ? "warning" : "neutral")}>{action.severity}</span>
                        <p className="text-xs font-semibold text-slate-100">{action.title}</p>
                      </div>
                      {action.action ? <p className="mt-1 text-xs leading-5 text-slate-400">{action.action}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {brief.error ? <p className="mt-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-100">{brief.error}</p> : null}
            </div>
          ))}
          {!snapshot.aiControl.morningBriefs.recent.length ? <p className="text-sm text-slate-500">Chưa có Morning Brief trong 7 ngày gần nhất.</p> : null}
        </div>
      </SectionCard>

      <SectionCard title="Tín hiệu vận hành chi nhánh" action={<RunAiOpsButton />}>
        <div className="grid gap-2">
          <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-4">
            <span>{snapshot.aiControl.branchInsights.windowDays} ngày gần nhất</span>
            <span>{snapshot.aiControl.branchInsights.restaurants} quán có tín hiệu</span>
            <span>{snapshot.aiControl.branchInsights.branches} chi nhánh</span>
            <span>Mới nhất {formatDateTime(snapshot.aiControl.branchInsights.latestAt)}</span>
          </div>
          {snapshot.aiControl.branchInsights.recent.map((insight) => (
            <div key={insight.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className={badgeTone(severityTone(insight.severity))}>{insight.severity}</span>
                    <span className={badgeTone(statusTone(insight.status))}>{insight.status}</span>
                    <span className={badgeTone("neutral")}>{insight.branchName}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{insight.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">{insight.restaurantName}</p>
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(insight.lastSeenAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{insight.action}</p>
              {insight.metric ? <span className={badgeTone("neutral")}>{insight.metric}</span> : null}
            </div>
          ))}
          {!snapshot.aiControl.branchInsights.recent.length ? <p className="text-sm text-slate-500">Chưa có branch insight trong 7 ngày gần nhất.</p> : null}
        </div>
      </SectionCard>

      <IntegrationGrid title="Bí mật & cấu hình AI" integrations={aiIntegrations} />
    </div>
  );
}
