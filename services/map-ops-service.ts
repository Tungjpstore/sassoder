import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { getProviderPolicySnapshot } from "@/services/maps/provider-policy-service";
import { getProviderCircuitSnapshot } from "@/services/maps/provider-runtime";
import { getMapDeliveryReadiness } from "@/services/maps/map-delivery-readiness-service";

type ProviderLogRow = {
  provider: string;
  operation: string;
  outcome: string;
  latency_ms: number;
  estimated_cost_vnd: number;
};

type CacheLogRow = {
  hit: boolean;
  operation: string;
};

type QuoteLogRow = {
  accepted: boolean;
  confidence: string | null;
  is_estimated: boolean | null;
  distance_km: number | null;
  fee: number | null;
  latency_ms: number;
};

type MapOpsWarning = {
  code: "provider_failures" | "low_cache_hit" | "estimated_quotes" | "slow_quotes" | "open_circuit" | "cost_guard";
  severity: "warning" | "critical";
  title: string;
  detail: string;
};

function average(values: number[]) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  if (safeValues.length === 0) return 0;
  return Math.round((safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length) * 100) / 100;
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function buildWarnings(metrics: {
  provider: { requests: number; failureRate: number; avgLatencyMs: number };
  cache: { events: number; hitRate: number };
  quotes: { requests: number; estimatedRate: number; avgLatencyMs: number };
  policy: ReturnType<typeof getProviderPolicySnapshot>;
  circuits: ReturnType<typeof getProviderCircuitSnapshot>;
}): MapOpsWarning[] {
  const warnings: MapOpsWarning[] = [];

  if (metrics.provider.requests >= 10 && metrics.provider.failureRate >= 8) {
    warnings.push({
      code: "provider_failures",
      severity: metrics.provider.failureRate >= 20 ? "critical" : "warning",
      title: "Provider fallback đang tăng",
      detail: `Failure rate ${metrics.provider.failureRate.toFixed(1)}%. Kiểm tra API key, quota và timeout Goong/Mapbox.`
    });
  }

  if (metrics.cache.events >= 30 && metrics.cache.hitRate < 35) {
    warnings.push({
      code: "low_cache_hit",
      severity: "warning",
      title: "Cache hit thấp",
      detail: `Cache hit ${metrics.cache.hitRate.toFixed(1)}%. Nên rà key chuẩn hóa địa chỉ và TTL route/geocode.`
    });
  }

  if (metrics.quotes.requests >= 10 && metrics.quotes.estimatedRate >= 25) {
    warnings.push({
      code: "estimated_quotes",
      severity: metrics.quotes.estimatedRate >= 45 ? "critical" : "warning",
      title: "Quote dùng Haversine nhiều",
      detail: `Estimated quote ${metrics.quotes.estimatedRate.toFixed(1)}%. Độ chính xác hẻm/đường nhỏ có thể giảm.`
    });
  }

  if (metrics.quotes.requests >= 10 && metrics.quotes.avgLatencyMs >= 1800) {
    warnings.push({
      code: "slow_quotes",
      severity: metrics.quotes.avgLatencyMs >= 3000 ? "critical" : "warning",
      title: "Quote giao hàng chậm",
      detail: `Latency trung bình ${metrics.quotes.avgLatencyMs}ms. Cần giảm routed top-N hoặc tăng cache.`
    });
  }

  const openCircuits = metrics.circuits.filter((circuit) => circuit.open);
  if (openCircuits.length > 0) {
    warnings.push({
      code: "open_circuit",
      severity: "warning",
      title: "Circuit breaker đang mở",
      detail: `${openCircuits.map((circuit) => `${circuit.provider}/${circuit.operation}`).join(", ")} đang được bỏ qua tạm thời.`
    });
  }

  const costGuardUsage = metrics.policy.usage.reduce((sum, item) => sum + item.estimatedCostVnd, 0);
  if (metrics.policy.maxDailyCostVnd && costGuardUsage >= metrics.policy.maxDailyCostVnd * 0.8) {
    warnings.push({
      code: "cost_guard",
      severity: costGuardUsage >= metrics.policy.maxDailyCostVnd ? "critical" : "warning",
      title: "Map cost guard gần ngưỡng",
      detail: `Ước tính hôm nay ${costGuardUsage.toLocaleString("vi-VN")}đ / ${metrics.policy.maxDailyCostVnd.toLocaleString("vi-VN")}đ.`
    });
  }

  return warnings;
}

export async function getMapOperationalMetrics(restaurantId: string, windowHours = 24) {
  const supabase = createAdminSupabaseClient();
  const since = new Date(Date.now() - Math.min(Math.max(windowHours, 1), 24 * 30) * 60 * 60 * 1000).toISOString();

  const [providerResult, cacheResult, quoteResult] = await Promise.all([
    supabase
      .from("map_provider_request_logs")
      .select("provider,operation,outcome,latency_ms,estimated_cost_vnd")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .limit(5000),
    supabase
      .from("map_cache_event_logs")
      .select("hit,operation")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .limit(5000),
    supabase
      .from("delivery_quote_metric_logs")
      .select("accepted,confidence,is_estimated,distance_km,fee,latency_ms")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .limit(5000)
  ]);

  throwIfSupabaseError(providerResult.error);
  throwIfSupabaseError(cacheResult.error);
  throwIfSupabaseError(quoteResult.error);

  const providerLogs = (providerResult.data ?? []) as ProviderLogRow[];
  const cacheLogs = (cacheResult.data ?? []) as CacheLogRow[];
  const quoteLogs = (quoteResult.data ?? []) as QuoteLogRow[];
  const providerGroups = new Map<string, { provider: string; operation: string; requests: number; failures: number; avgLatencyMs: number; estimatedCostVnd: number; latencies: number[] }>();

  for (const log of providerLogs) {
    const key = `${log.provider}:${log.operation}`;
    const current = providerGroups.get(key) ?? {
      provider: log.provider,
      operation: log.operation,
      requests: 0,
      failures: 0,
      avgLatencyMs: 0,
      estimatedCostVnd: 0,
      latencies: []
    };
    current.requests += 1;
    if (log.outcome !== "success") current.failures += 1;
    current.estimatedCostVnd += Number(log.estimated_cost_vnd) || 0;
    current.latencies.push(Number(log.latency_ms) || 0);
    providerGroups.set(key, current);
  }

  const providerBreakdown = [...providerGroups.values()].map((group) => ({
    provider: group.provider,
    operation: group.operation,
    requests: group.requests,
    failures: group.failures,
    failureRate: percentage(group.failures, group.requests),
    avgLatencyMs: average(group.latencies),
    estimatedCostVnd: Math.round(group.estimatedCostVnd)
  }));

  const cacheHits = cacheLogs.filter((log) => log.hit).length;
  const acceptedQuotes = quoteLogs.filter((log) => log.accepted).length;
  const estimatedQuotes = quoteLogs.filter((log) => log.is_estimated).length;

  const providerFailures = providerLogs.filter((log) => log.outcome !== "success").length;
  const providerMetrics = {
    requests: providerLogs.length,
    failures: providerFailures,
    failureRate: percentage(providerFailures, providerLogs.length),
    avgLatencyMs: average(providerLogs.map((log) => Number(log.latency_ms) || 0)),
    estimatedCostVnd: Math.round(providerLogs.reduce((sum, log) => sum + (Number(log.estimated_cost_vnd) || 0), 0)),
    breakdown: providerBreakdown
  };
  const cacheMetrics = {
    events: cacheLogs.length,
    hits: cacheHits,
    misses: cacheLogs.length - cacheHits,
    hitRate: percentage(cacheHits, cacheLogs.length)
  };
  const quoteMetrics = {
    requests: quoteLogs.length,
    accepted: acceptedQuotes,
    rejected: quoteLogs.length - acceptedQuotes,
    acceptanceRate: percentage(acceptedQuotes, quoteLogs.length),
    estimated: estimatedQuotes,
    estimatedRate: percentage(estimatedQuotes, quoteLogs.length),
    avgDistanceKm: average(quoteLogs.map((log) => Number(log.distance_km) || 0)),
    avgFee: Math.round(average(quoteLogs.map((log) => Number(log.fee) || 0))),
    avgLatencyMs: average(quoteLogs.map((log) => Number(log.latency_ms) || 0))
  };
  const policy = getProviderPolicySnapshot();
  const circuits = getProviderCircuitSnapshot();
  const readiness = getMapDeliveryReadiness();
  const warnings = buildWarnings({ provider: providerMetrics, cache: cacheMetrics, quotes: quoteMetrics, policy, circuits });

  return {
    windowHours,
    since,
    provider: providerMetrics,
    cache: cacheMetrics,
    quotes: quoteMetrics,
    policy,
    circuits,
    readiness,
    health: {
      status: warnings.some((warning) => warning.severity === "critical")
        ? "critical"
        : warnings.length > 0
          ? "warning"
          : "healthy",
      warnings
    }
  };
}
