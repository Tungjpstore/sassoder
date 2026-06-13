import { Activity, AlertTriangle, CheckCircle2, Clock3, DatabaseZap, Route, ShieldCheck, Truck } from "lucide-react";
import { formatVnd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { getMapOperationalMetrics } from "@/services/map-ops-service";

/* MapOperationalMetricsPanel — read-only panel sức khoẻ map & delivery quote.
 * Đã chuyển sang design token v2 (var(--d-*)) để khớp Settings v2. */

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
    <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--d-r-md)] bg-[var(--d-primary-soft)] text-[var(--d-primary)]">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">{label}</span>
          <strong className="d-num mt-0.5 block text-[length:var(--d-fs-sm)] text-[var(--d-text)]">{value}</strong>
          <span className="mt-1 block text-[length:var(--d-fs-2xs)] font-semibold leading-4 text-[var(--d-text-muted)]">{detail}</span>
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
      ? "border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]"
      : metrics.health.status === "warning"
        ? "border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"
        : "border-[var(--d-ok-fg)]/30 bg-[var(--d-ok-bg)] text-[var(--d-ok-fg)]";

  return (
    <section className="rounded-[var(--d-r-lg)] border border-[var(--d-line)] bg-[var(--d-surface)] p-[var(--d-s-4)] shadow-[var(--d-sh-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[length:var(--d-fs-h3)] font-bold text-[var(--d-text)]">Sức khoẻ map &amp; delivery quote</h3>
          <p className="mt-1 text-[length:var(--d-fs-xs)] leading-5 text-[var(--d-text-muted)]">
            Tổng hợp {metrics.windowHours} giờ gần nhất từ provider logs, cache logs và delivery quote metrics.
          </p>
        </div>
        <span className={cn("inline-flex h-9 items-center gap-2 rounded-[var(--d-r-md)] border px-3 text-[length:var(--d-fs-xs)] font-bold", healthTone)}>
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
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
          <span className="flex items-center gap-2 text-[var(--d-text)]">
            <ShieldCheck size={14} className="text-[var(--d-primary)]" />
            Provider policy
          </span>
          <span className="mt-1 block">
            Disabled: {[...metrics.policy.disabledProviders, ...metrics.policy.disabledGeocoders, ...metrics.policy.disabledRouters].join(", ") || "không"}
          </span>
        </div>
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
          <span className="flex items-center gap-2 text-[var(--d-text)]">
            <Activity size={14} className="text-[var(--d-primary)]" />
            Cost guard hôm nay
          </span>
          <span className="mt-1 block">
            {formatVnd(policyCostToday)}{metrics.policy.maxDailyCostVnd ? ` / ${formatVnd(metrics.policy.maxDailyCostVnd)}` : " · chưa đặt ngưỡng"}
          </span>
        </div>
        <div className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
          <span className="flex items-center gap-2 text-[var(--d-text)]">
            <Route size={14} className="text-[var(--d-primary)]" />
            Circuit breaker
          </span>
          <span className="mt-1 block">{openCircuitCount > 0 ? `${openCircuitCount} provider đang mở circuit` : "Không có circuit đang mở"}</span>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[length:var(--d-fs-2xs)] font-bold uppercase tracking-[var(--d-track-wide)] text-[var(--d-text-faint)]">Release readiness</span>
          <span className={cn(
            "rounded-[var(--d-r-pill)] px-2.5 py-1 text-[length:var(--d-fs-2xs)] font-bold",
            metrics.readiness.status === "ready" ? "bg-[var(--d-ok-bg)] text-[var(--d-ok-fg)]" : metrics.readiness.status === "critical" ? "bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]" : "bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"
          )}>
            {metrics.readiness.readyCount}/{metrics.readiness.totalCount} sẵn sàng
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {metrics.readiness.items.map((item) => (
            <div key={item.key} className="rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text-muted)]">
              <span className="flex items-center justify-between gap-2 text-[var(--d-text)]">
                <span>{item.label}</span>
                <span className={item.ready ? "text-[var(--d-ok-fg)]" : item.severity === "critical" ? "text-[var(--d-danger-fg)]" : "text-[var(--d-orange-600)]"}>
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
              className={cn(
                "rounded-[var(--d-r-md)] border px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold",
                warning.severity === "critical"
                  ? "border-[var(--d-danger-fg)]/30 bg-[var(--d-danger-bg)] text-[var(--d-danger-fg)]"
                  : "border-[var(--d-orange)]/30 bg-[var(--d-accent-soft)] text-[var(--d-orange-600)]"
              )}
            >
              <span className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="block text-[length:var(--d-fs-sm)]">{warning.title}</strong>
                  <span className="mt-0.5 block leading-5">{warning.detail}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {metrics.provider.breakdown.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-[var(--d-r-md)] border border-[var(--d-line)]">
          <div className="grid min-w-[620px] grid-cols-[1fr_1fr_90px_90px_100px_110px] bg-[var(--d-surface-2)] px-3 py-2 text-[length:var(--d-fs-xs)] font-bold text-[var(--d-text-faint)]">
            <span>Provider</span>
            <span>Operation</span>
            <span>Calls</span>
            <span>Failure</span>
            <span>Latency</span>
            <span>Cost</span>
          </div>
          {metrics.provider.breakdown.slice(0, 8).map((row) => (
            <div key={`${row.provider}:${row.operation}`} className="grid min-w-[620px] grid-cols-[1fr_1fr_90px_90px_100px_110px] border-t border-[var(--d-line)] px-3 py-2 text-[length:var(--d-fs-xs)] font-semibold text-[var(--d-text)]">
              <span>{row.provider}</span>
              <span>{row.operation}</span>
              <span className="d-num">{row.requests}</span>
              <span className="d-num">{formatPercent(row.failureRate)}</span>
              <span className="d-num">{row.avgLatencyMs}ms</span>
              <span className="d-num">{formatVnd(row.estimatedCostVnd)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--d-r-md)] border border-[var(--d-line)] bg-[var(--d-surface-2)] px-4 py-3 text-[length:var(--d-fs-sm)] font-semibold text-[var(--d-text-muted)]">
          Chưa có metric map trong cửa sổ này. Khi khách tìm địa chỉ hoặc quote giao hàng, panel sẽ tự có dữ liệu.
        </div>
      )}
    </section>
  );
}
