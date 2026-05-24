import { Activity, AlertTriangle, CheckCircle2, Clock3, DatabaseZap, Route, ShieldCheck, Truck } from "lucide-react";
import { formatVnd } from "@/lib/money";
import type { getMapOperationalMetrics } from "@/services/map-ops-service";

type MapOperationalMetrics = Awaited<ReturnType<typeof getMapOperationalMetrics>>;

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function MetricCard({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[#ece7dd] bg-[#fbfaf7] px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf7ef] text-[#0f6944]">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[11px] font-bold text-[#667166]">{label}</span>
          <strong className="mt-0.5 block text-sm text-[#101813]">{value}</strong>
          <span className="mt-1 block text-[11px] font-semibold leading-4 text-[#667166]">{detail}</span>
        </span>
      </div>
    </div>
  );
}

export function MapOperationalMetricsPanel({ metrics }: { metrics: MapOperationalMetrics }) {
  const topProvider = [...metrics.provider.breakdown].sort((left, right) => right.requests - left.requests)[0] ?? null;
  const openCircuitCount = metrics.circuits.filter((circuit) => circuit.open).length;
  const policyCostToday = metrics.policy.usage.reduce((sum, item) => sum + item.estimatedCostVnd, 0);
  const healthTone =
    metrics.health.status === "critical"
      ? "border-[#f2c7b8] bg-[#fff4ef] text-[#9f341b]"
      : metrics.health.status === "warning"
        ? "border-[#f4dfaa] bg-[#fff8e6] text-[#8a5a00]"
        : "border-[#d7e5d9] bg-[#f3faf4] text-[#0f6944]";

  return (
    <section className="rounded-[14px] border border-[#dcebdc] bg-white p-4 shadow-[0_1px_2px_rgba(29,39,32,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-extrabold text-[#101813]">Sức khỏe map & delivery quote</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-[#667166]">
            Tổng hợp {metrics.windowHours} giờ gần nhất từ provider logs, cache logs và delivery quote metrics.
          </p>
        </div>
        <span className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-black ${healthTone}`}>
          {metrics.health.status === "healthy" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {metrics.health.status === "critical" ? "Critical" : metrics.health.status === "warning" ? "Warning" : "Healthy"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        <MetricCard
          icon={<Route size={16} />}
          label="Provider requests"
          value={`${metrics.provider.requests}`}
          detail={`Failure ${formatPercent(metrics.provider.failureRate)} · ${metrics.provider.avgLatencyMs}ms`}
        />
        <MetricCard
          icon={<DatabaseZap size={16} />}
          label="Cache hit"
          value={formatPercent(metrics.cache.hitRate)}
          detail={`${metrics.cache.hits}/${metrics.cache.events} events`}
        />
        <MetricCard
          icon={<Truck size={16} />}
          label="Quote acceptance"
          value={formatPercent(metrics.quotes.acceptanceRate)}
          detail={`${metrics.quotes.accepted}/${metrics.quotes.requests} quote accepted`}
        />
        <MetricCard
          icon={<Clock3 size={16} />}
          label="Quote latency"
          value={`${metrics.quotes.avgLatencyMs}ms`}
          detail={`Estimated ${formatPercent(metrics.quotes.estimatedRate)}`}
        />
        <MetricCard
          icon={<Activity size={16} />}
          label="Ước tính chi phí"
          value={formatVnd(metrics.provider.estimatedCostVnd)}
          detail={topProvider ? `${topProvider.provider}/${topProvider.operation}: ${topProvider.requests} calls` : "Chưa có provider calls"}
        />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-[#ece7dd] bg-[#fbfaf7] px-3 py-2 text-xs font-semibold text-[#667166]">
          <span className="flex items-center gap-2 text-[#101813]">
            <ShieldCheck size={14} className="text-[#0f6944]" />
            Provider policy
          </span>
          <span className="mt-1 block">
            Disabled: {[...metrics.policy.disabledProviders, ...metrics.policy.disabledGeocoders, ...metrics.policy.disabledRouters].join(", ") || "không"}
          </span>
        </div>
        <div className="rounded-xl border border-[#ece7dd] bg-[#fbfaf7] px-3 py-2 text-xs font-semibold text-[#667166]">
          <span className="flex items-center gap-2 text-[#101813]">
            <Activity size={14} className="text-[#0f6944]" />
            Cost guard hôm nay
          </span>
          <span className="mt-1 block">
            {formatVnd(policyCostToday)}{metrics.policy.maxDailyCostVnd ? ` / ${formatVnd(metrics.policy.maxDailyCostVnd)}` : " · chưa đặt ngưỡng"}
          </span>
        </div>
        <div className="rounded-xl border border-[#ece7dd] bg-[#fbfaf7] px-3 py-2 text-xs font-semibold text-[#667166]">
          <span className="flex items-center gap-2 text-[#101813]">
            <Route size={14} className="text-[#0f6944]" />
            Circuit breaker
          </span>
          <span className="mt-1 block">{openCircuitCount > 0 ? `${openCircuitCount} provider đang mở circuit` : "Không có circuit đang mở"}</span>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#ece7dd] bg-[#fbfaf7] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black uppercase text-[#667166]">Release readiness</span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${metrics.readiness.status === "ready" ? "bg-[#e8f6eb] text-[#0f6944]" : metrics.readiness.status === "critical" ? "bg-[#fff0e8] text-[#9f341b]" : "bg-[#fff8e1] text-[#8a5a00]"}`}>
            {metrics.readiness.readyCount}/{metrics.readiness.totalCount} sẵn sàng
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {metrics.readiness.items.map((item) => (
            <div key={item.key} className="rounded-lg border border-[#ece7dd] bg-white px-3 py-2 text-xs font-semibold text-[#667166]">
              <span className="flex items-center justify-between gap-2 text-[#101813]">
                <span>{item.label}</span>
                <span className={item.ready ? "text-[#0f6944]" : item.severity === "critical" ? "text-[#9f341b]" : "text-[#8a5a00]"}>
                  {item.ready ? "OK" : item.severity === "critical" ? "Thiếu" : "Cảnh báo"}
                </span>
              </span>
              <span className="mt-1 block leading-5">{item.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {metrics.health.warnings.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {metrics.health.warnings.map((warning) => (
            <div
              key={warning.code}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                warning.severity === "critical"
                  ? "border-[#f2c7b8] bg-[#fff4ef] text-[#7c2d12]"
                  : "border-[#f4dfaa] bg-[#fffaf0] text-[#6f4d08]"
              }`}
            >
              <span className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="block text-[13px]">{warning.title}</strong>
                  <span className="mt-0.5 block leading-5">{warning.detail}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {metrics.provider.breakdown.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[#ece7dd]">
          <div className="grid min-w-[620px] grid-cols-[1fr_1fr_90px_90px_100px_110px] bg-[#fbfaf7] px-3 py-2 text-xs font-bold text-[#667166]">
            <span>Provider</span>
            <span>Operation</span>
            <span>Calls</span>
            <span>Failure</span>
            <span>Latency</span>
            <span>Cost</span>
          </div>
          {metrics.provider.breakdown.slice(0, 8).map((row) => (
            <div key={`${row.provider}:${row.operation}`} className="grid min-w-[620px] grid-cols-[1fr_1fr_90px_90px_100px_110px] border-t border-[#ece7dd] px-3 py-2 text-xs font-semibold text-[#101813]">
              <span>{row.provider}</span>
              <span>{row.operation}</span>
              <span>{row.requests}</span>
              <span>{formatPercent(row.failureRate)}</span>
              <span>{row.avgLatencyMs}ms</span>
              <span>{formatVnd(row.estimatedCostVnd)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[#ece7dd] bg-[#fbfaf7] px-4 py-3 text-sm font-semibold text-[#667166]">
          Chưa có metric map trong cửa sổ này. Khi khách tìm địa chỉ hoặc quote giao hàng, panel sẽ tự có dữ liệu.
        </div>
      )}
    </section>
  );
}
