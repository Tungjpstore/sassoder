import type { AiProvider, AiTaskType } from "./types";

const mimoTaskMinimumTimeoutMs: Partial<Record<AiTaskType, number>> = {
  dashboard_operation: 24_000,
  analytics_reasoning: 30_000,
  business_insight: 30_000,
  batch_report: 30_000,
  tool: 20_000
};

export function resolveProviderTimeoutMs(provider: AiProvider, taskType: AiTaskType, requestedTimeoutMs?: number) {
  const requested = Number.isFinite(requestedTimeoutMs) && Number(requestedTimeoutMs) > 0 ? Number(requestedTimeoutMs) : 0;
  if (provider !== "mimo") return requested || undefined;

  const minimum = mimoTaskMinimumTimeoutMs[taskType] ?? 0;
  return Math.max(requested, minimum) || undefined;
}
