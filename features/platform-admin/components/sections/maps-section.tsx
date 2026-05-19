import { Banknote, CheckCircle2, Database, MapPinned } from "lucide-react";
import { IntegrationGrid } from "@/features/platform-admin/components/integration-grid";
import {
  MetricCard,
  SectionCard,
  badgeTone,
  formatNumber
} from "@/features/platform-admin/components/primitives";
import { formatVnd } from "@/lib/money";
import type { Snapshot } from "@/features/platform-admin/types";

export function MapsControl({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Provider calls 24h" value={formatNumber(snapshot.mapControl.provider.requests)} detail={`${snapshot.mapControl.provider.failureRate}% lỗi`} icon={MapPinned} tone={snapshot.mapControl.provider.failureRate > 10 ? "warning" : "good"} />
        <MetricCard label="Map cost est." value={formatVnd(snapshot.mapControl.provider.estimatedCostVnd)} detail="Ước tính từ env cost accounting" icon={Banknote} tone="info" />
        <MetricCard label="Cache hit" value={`${snapshot.mapControl.cache.hitRate}%`} detail={`${snapshot.mapControl.cache.events} cache events`} icon={Database} tone="neutral" />
        <MetricCard label="Quote accept" value={`${snapshot.mapControl.quotes.acceptanceRate}%`} detail={`${snapshot.mapControl.quotes.requests} delivery quotes`} icon={CheckCircle2} tone="good" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Maps routing config">
          <dl className="grid gap-3 text-sm">
            {[
              ["Geocoder", snapshot.mapControl.routing.geocoder],
              ["Geocoder fallback", snapshot.mapControl.routing.geocoderFallbacks],
              ["Router", snapshot.mapControl.routing.router],
              ["Router fallback", snapshot.mapControl.routing.routerFallbacks],
              ["Cache namespace", snapshot.mapControl.routing.cacheNamespace]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                <dd className="mt-2 break-all font-mono text-sm text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title="Provider breakdown 24h">
          <div className="grid gap-2">
            {snapshot.mapControl.provider.breakdown.map((provider) => (
              <div key={provider.provider} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">{provider.provider}</p>
                  <span className={badgeTone(provider.failureRate > 10 ? "warning" : "good")}>{provider.failureRate}% lỗi</span>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                  <span>{provider.requests} calls</span>
                  <span>{provider.failures} failures</span>
                  <span>{provider.avgLatencyMs}ms avg</span>
                  <span>{formatVnd(provider.estimatedCostVnd)}</span>
                </div>
              </div>
            ))}
            {!snapshot.mapControl.provider.breakdown.length ? <p className="text-sm text-slate-500">Chưa có map provider log trong 24h gần nhất.</p> : null}
          </div>
        </SectionCard>
      </div>

      <IntegrationGrid title="Maps integrations" integrations={snapshot.integrations.filter((item) => item.category === "maps" || item.key === "persistent-cache")} />
    </div>
  );
}
