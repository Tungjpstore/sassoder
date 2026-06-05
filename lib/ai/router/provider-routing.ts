import type { AiCompletionOptions, AiProvider, AiProviderConfig, AiTaskType } from "@/lib/ai/router/types";

type ProviderRoutingCandidate = Pick<
  AiProviderConfig,
  "provider" | "supportsJsonMode" | "supportsToolCalling" | "supportsImageGeneration" | "supportsOcr"
>;

const reasoningTasks = new Set<AiTaskType>(["analytics_reasoning", "business_insight"]);
const batchTasks = new Set<AiTaskType>(["batch_report", "batch_inventory", "batch_marketing", "batch_ocr", "batch_embedding"]);
const fastOperationalTasks = new Set<AiTaskType>(["customer_ordering", "upsell", "dashboard_operation", "tool"]);
const creativeTasks = new Set<AiTaskType>(["menu_generation", "branding"]);
const deterministicTasks = new Set<AiTaskType>(["setup", "ocr", "image", "batch_ocr", "batch_embedding"]);

function supportsTask(candidate: ProviderRoutingCandidate, taskType: AiTaskType, options?: AiCompletionOptions) {
  if (taskType === "ocr") return candidate.supportsOcr;
  if (taskType === "image") return candidate.supportsImageGeneration;
  if (options?.jsonMode && !candidate.supportsJsonMode) return false;
  if (options?.tools?.length && !candidate.supportsToolCalling) return false;
  return true;
}

export function buildAiProviderOrder(input: {
  taskType: AiTaskType;
  preferredProvider?: AiProvider;
  options?: AiCompletionOptions;
  candidates: ProviderRoutingCandidate[];
}) {
  const capable = input.candidates.filter((candidate) => supportsTask(candidate, input.taskType, input.options)).map((candidate) => candidate.provider);
  if (capable.length === 0) return [];

  if (input.taskType === "ocr") {
    return [...(capable.includes("qwen") ? ["qwen" as AiProvider] : []), ...capable.filter((provider) => provider !== "qwen")];
  }

  if (batchTasks.has(input.taskType)) {
    const preferred = input.preferredProvider && capable.includes(input.preferredProvider) ? input.preferredProvider : null;
    const ordered: AiProvider[] = preferred ? [preferred] : capable.includes("nvidia") ? ["nvidia"] : [];
    const fallbackPreference: AiProvider[] = ["nvidia", "qwen", "bedrock", "openai", "gemini", "xai", "vercel_gateway", "claude"];
    for (const provider of fallbackPreference) {
      if (capable.includes(provider) && !ordered.includes(provider)) ordered.push(provider);
    }
    return ordered;
  }

  const preferred = input.preferredProvider && capable.includes(input.preferredProvider) ? input.preferredProvider : null;
  const primary =
    preferred ??
    (reasoningTasks.has(input.taskType) && capable.includes("openai")
      ? "openai"
      : reasoningTasks.has(input.taskType) && capable.includes("xai")
        ? "xai"
        : creativeTasks.has(input.taskType) && capable.includes("gemini")
          ? "gemini"
          : fastOperationalTasks.has(input.taskType) && capable.includes("qwen")
            ? "qwen"
            : capable[0]);

  const ordered: AiProvider[] = primary ? [primary] : [];
  const fallbackPreference: AiProvider[] = deterministicTasks.has(input.taskType)
    ? ["qwen", "openai", "gemini", "bedrock", "nvidia", "xai", "vercel_gateway"]
    : reasoningTasks.has(input.taskType)
      ? ["openai", "xai", "claude", "gemini", "bedrock", "qwen", "nvidia", "vercel_gateway"]
      : ["qwen", "bedrock", "openai", "gemini", "xai", "vercel_gateway", "claude", "nvidia"];

  for (const provider of fallbackPreference) {
    if (capable.includes(provider) && !ordered.includes(provider)) ordered.push(provider);
  }

  return ordered;
}
