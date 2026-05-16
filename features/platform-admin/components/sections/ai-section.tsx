import { Activity, AlertTriangle, Bot, KeyRound } from "lucide-react";
import { IntegrationGrid } from "@/features/platform-admin/components/integration-grid";
import {
  MetricCard,
  SectionCard,
  badgeTone,
  formatNumber
} from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";

export function AiControl({ snapshot }: { snapshot: Snapshot }) {
  const aiIntegrations = snapshot.integrations.filter((item) => item.category === "ai");

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="AI requests 24h" value={formatNumber(snapshot.aiControl.requests)} detail={`${snapshot.aiControl.successRate}% success`} icon={Bot} tone={snapshot.aiControl.failures ? "warning" : "good"} />
        <MetricCard label="Tokens 24h" value={formatNumber(snapshot.aiControl.tokens)} detail={`${snapshot.aiControl.imageCount} image requests`} icon={Activity} tone="info" />
        <MetricCard label="Blocked/failed" value={formatNumber(snapshot.aiControl.blocked + snapshot.aiControl.failures)} detail="Theo ai_usage_logs gần nhất" icon={AlertTriangle} tone={snapshot.aiControl.blocked + snapshot.aiControl.failures ? "warning" : "neutral"} />
        <MetricCard label="Providers" value={formatNumber(aiIntegrations.filter((item) => item.status === "configured").length)} detail={`${aiIntegrations.length} provider groups tracked`} icon={KeyRound} tone="info" />
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

      <IntegrationGrid title="AI secrets & config" integrations={aiIntegrations} />
    </div>
  );
}
