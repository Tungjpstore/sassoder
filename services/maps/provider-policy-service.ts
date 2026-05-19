import type { GeocodingProvider, RoutingProvider } from "@/services/maps/types";

export type ProviderOperation = "geocode" | "reverse" | "route";
type ProviderId = GeocodingProvider | RoutingProvider;

type ProviderUsage = {
  dayKey: string;
  requests: number;
  estimatedCostVnd: number;
};

const providerUsage = new Map<string, ProviderUsage>();

function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function currentDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function usageKey(provider: ProviderId, operation: ProviderOperation) {
  return `${currentDayKey()}:${provider}:${operation}`;
}

function parseList(value: string) {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function readPositiveNumber(name: string) {
  const value = Number(getEnv(name));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readProviderOperationLimit(provider: ProviderId, operation: ProviderOperation) {
  return (
    readPositiveNumber(`MAPS_MAX_DAILY_${provider.toUpperCase()}_${operation.toUpperCase()}_REQUESTS`) ??
    readPositiveNumber(`MAPS_MAX_DAILY_${provider.toUpperCase()}_REQUESTS`) ??
    readPositiveNumber("MAPS_MAX_DAILY_PROVIDER_REQUESTS")
  );
}

function readCostLimit() {
  return readPositiveNumber("MAPS_MAX_DAILY_COST_VND");
}

export function getEstimatedMapProviderCostVnd(provider: string, operation: ProviderOperation) {
  const value = Number(getEnv(`MAPS_COST_VND_${provider.toUpperCase()}_${operation.toUpperCase()}`));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function isProviderEnabledForOperation(provider: ProviderId, operation: ProviderOperation) {
  const disabledProviders = parseList(getEnv("MAPS_DISABLED_PROVIDERS"));
  if (disabledProviders.has(provider)) return false;

  if ((operation === "geocode" || operation === "reverse") && parseList(getEnv("MAPS_DISABLED_GEOCODERS")).has(provider)) {
    return false;
  }
  if (operation === "route" && parseList(getEnv("MAPS_DISABLED_ROUTERS")).has(provider)) return false;

  const operationDisabled = parseList(getEnv(`MAPS_DISABLED_${operation.toUpperCase()}_PROVIDERS`));
  return !operationDisabled.has(provider);
}

export function isProviderWithinDailyBudget(provider: ProviderId, operation: ProviderOperation) {
  const usage = providerUsage.get(usageKey(provider, operation));
  const requestLimit = readProviderOperationLimit(provider, operation);
  if (requestLimit && (usage?.requests ?? 0) >= requestLimit) return false;

  const costLimit = readCostLimit();
  if (!costLimit) return true;

  const totalCost = [...providerUsage.values()]
    .filter((item) => item.dayKey === currentDayKey())
    .reduce((sum, item) => sum + item.estimatedCostVnd, 0);
  return totalCost < costLimit;
}

export function shouldUseProvider(provider: ProviderId, operation: ProviderOperation) {
  return isProviderEnabledForOperation(provider, operation) && isProviderWithinDailyBudget(provider, operation);
}

export function recordProviderPolicyUsage(provider: ProviderId, operation: ProviderOperation) {
  const key = usageKey(provider, operation);
  const current = providerUsage.get(key) ?? {
    dayKey: currentDayKey(),
    requests: 0,
    estimatedCostVnd: 0
  };
  current.requests += 1;
  current.estimatedCostVnd += getEstimatedMapProviderCostVnd(provider, operation);
  providerUsage.set(key, current);
}

export function getProviderPolicySnapshot() {
  const dayKey = currentDayKey();
  const usage = [...providerUsage.entries()]
    .filter(([, value]) => value.dayKey === dayKey)
    .map(([key, value]) => {
      const [, provider, operation] = key.split(":");
      return {
        provider,
        operation,
        requests: value.requests,
        estimatedCostVnd: Math.round(value.estimatedCostVnd)
      };
    });

  return {
    dayKey,
    disabledProviders: [...parseList(getEnv("MAPS_DISABLED_PROVIDERS"))],
    disabledGeocoders: [...parseList(getEnv("MAPS_DISABLED_GEOCODERS"))],
    disabledRouters: [...parseList(getEnv("MAPS_DISABLED_ROUTERS"))],
    maxDailyProviderRequests: readPositiveNumber("MAPS_MAX_DAILY_PROVIDER_REQUESTS"),
    maxDailyCostVnd: readCostLimit(),
    usage
  };
}

export function resetProviderPolicyForTests() {
  providerUsage.clear();
}
