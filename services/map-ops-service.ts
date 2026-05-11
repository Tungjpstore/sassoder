import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { throwIfSupabaseError } from "@/lib/supabase/errors";

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

function average(values: number[]) {
  const safeValues = values.filter((value) => Number.isFinite(value));
  if (safeValues.length === 0) return 0;
  return Math.round((safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length) * 100) / 100;
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
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

  return {
    windowHours,
    since,
    provider: {
      requests: providerLogs.length,
      failures: providerLogs.filter((log) => log.outcome !== "success").length,
      failureRate: percentage(providerLogs.filter((log) => log.outcome !== "success").length, providerLogs.length),
      avgLatencyMs: average(providerLogs.map((log) => Number(log.latency_ms) || 0)),
      estimatedCostVnd: Math.round(providerLogs.reduce((sum, log) => sum + (Number(log.estimated_cost_vnd) || 0), 0)),
      breakdown: providerBreakdown
    },
    cache: {
      events: cacheLogs.length,
      hits: cacheHits,
      misses: cacheLogs.length - cacheHits,
      hitRate: percentage(cacheHits, cacheLogs.length)
    },
    quotes: {
      requests: quoteLogs.length,
      accepted: acceptedQuotes,
      rejected: quoteLogs.length - acceptedQuotes,
      acceptanceRate: percentage(acceptedQuotes, quoteLogs.length),
      estimated: estimatedQuotes,
      estimatedRate: percentage(estimatedQuotes, quoteLogs.length),
      avgDistanceKm: average(quoteLogs.map((log) => Number(log.distance_km) || 0)),
      avgFee: Math.round(average(quoteLogs.map((log) => Number(log.fee) || 0))),
      avgLatencyMs: average(quoteLogs.map((log) => Number(log.latency_ms) || 0))
    }
  };
}
