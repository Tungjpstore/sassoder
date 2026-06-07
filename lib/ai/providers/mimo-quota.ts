import "server-only";

import { AppError } from "@/lib/response";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { AiTaskType } from "@/lib/ai/router/types";

const defaultMonthlyTokenPlan = 4_000_000_000;
const fallbackDailyTaskShares: Record<AiTaskType, number> = {
  customer_ordering: 0.16,
  menu_generation: 0.07,
  upsell: 0.04,
  dashboard_operation: 0.16,
  analytics_reasoning: 0.12,
  business_insight: 0.1,
  batch_report: 0.14,
  batch_inventory: 0.06,
  batch_marketing: 0.05,
  batch_ocr: 0.05,
  batch_embedding: 0.02,
  setup: 0.03,
  branding: 0.03,
  ocr: 0.08,
  image: 0,
  tool: 0.06
};

const memoryUsage = new Map<string, number>();

function readPositiveNumber(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dayStartIso() {
  return `${dayKey()}T00:00:00.000Z`;
}

function taskEnvName(taskType: AiTaskType) {
  return `MIMO_DAILY_TOKENS_${taskType.toUpperCase()}`;
}

function memoryKey(taskType: AiTaskType) {
  return `${dayKey()}:${taskType}`;
}

export function getMimoDailyTaskTokenLimit(taskType: AiTaskType) {
  const taskLimit = readPositiveNumber(taskEnvName(taskType));
  if (taskLimit) return taskLimit;

  const defaultDailyLimit = readPositiveNumber("MIMO_MAX_DAILY_TOKENS") ?? Math.floor(defaultMonthlyTokenPlan / 30);
  const share = fallbackDailyTaskShares[taskType] ?? 0.05;
  return Math.max(1, Math.floor(defaultDailyLimit * share));
}

async function readPersistentTaskUsage(taskType: AiTaskType) {
  const supabase = createAdminSupabaseClient() as any;
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select("input_tokens,output_tokens")
    .eq("provider", "mimo")
    .eq("status", "success")
    .gte("created_at", dayStartIso())
    .contains("metadata", { taskType });

  if (error) return 0;

  return ((data ?? []) as Array<{ input_tokens?: number | null; output_tokens?: number | null }>).reduce(
    (sum, row) => sum + Math.max(0, Number(row.input_tokens ?? 0)) + Math.max(0, Number(row.output_tokens ?? 0)),
    0
  );
}

export async function assertMimoDailyTaskTokenBudget(taskType: AiTaskType, plannedOutputTokens?: number | null) {
  if (process.env.MIMO_DAILY_TOKEN_GUARD_ENABLED === "false") return;

  const limit = getMimoDailyTaskTokenLimit(taskType);
  const used = (await readPersistentTaskUsage(taskType)) + (memoryUsage.get(memoryKey(taskType)) ?? 0);
  const planned = Math.max(0, Number(plannedOutputTokens ?? 0));

  if (used + planned <= limit) return;

  throw new AppError(`MiMo đã chạm hạn mức token/ngày cho task ${taskType}. AI Router sẽ chuyển sang fallback.`, 429);
}

export function recordMimoDailyTaskTokenUsage(taskType: AiTaskType, inputTokens?: number | null, outputTokens?: number | null) {
  const total = Math.max(0, Number(inputTokens ?? 0)) + Math.max(0, Number(outputTokens ?? 0));
  if (total <= 0) return;

  const key = memoryKey(taskType);
  memoryUsage.set(key, (memoryUsage.get(key) ?? 0) + total);
}
