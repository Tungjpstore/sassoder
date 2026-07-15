import type { AiProvider } from "@/lib/ai/router/types";

export type AiProviderRuntimeBlockReason = "quota" | "rate_limit";

export type AiProviderRuntimeBlock = {
  provider: AiProvider;
  reason: AiProviderRuntimeBlockReason;
  message: string;
  blockedUntil: number;
};

const runtimeBlocks = new Map<AiProvider, AiProviderRuntimeBlock>();

function errorStatus(error: unknown) {
  return typeof (error as { status?: unknown })?.status === "number" ? ((error as { status: number }).status) : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "AI provider failed");
}

function readTtlMs(provider: AiProvider, reason: AiProviderRuntimeBlockReason) {
  const providerKey = provider.toUpperCase();
  const reasonKey = reason.toUpperCase();
  const configured = Number(process.env[`AI_${providerKey}_${reasonKey}_BLOCK_TTL_MS`] ?? process.env.AI_PROVIDER_QUOTA_BLOCK_TTL_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return reason === "quota" ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000;
}

export function classifyAiProviderRuntimeError(provider: AiProvider, error: unknown): AiProviderRuntimeBlockReason | null {
  const message = errorMessage(error);
  const status = errorStatus(error);
  if (status === 429) return /too many tokens per day|daily token|quota/i.test(message) ? "quota" : "rate_limit";

  if (provider === "bedrock" && /too many tokens per day|daily token|quota exceeded|service quota|throttl/i.test(message)) {
    return "quota";
  }

  if (/rate limit|too many requests/i.test(message)) return "rate_limit";
  return null;
}

export function recordAiProviderRuntimeFailure(provider: AiProvider, error: unknown, now = Date.now()) {
  const reason = classifyAiProviderRuntimeError(provider, error);
  if (!reason) return null;

  const block: AiProviderRuntimeBlock = {
    provider,
    reason,
    message: errorMessage(error),
    blockedUntil: now + readTtlMs(provider, reason)
  };
  runtimeBlocks.set(provider, block);
  return block;
}

export function clearAiProviderRuntimeBlock(provider: AiProvider) {
  runtimeBlocks.delete(provider);
}

export function getAiProviderRuntimeBlock(provider: AiProvider, now = Date.now()) {
  const block = runtimeBlocks.get(provider);
  if (!block) return null;
  if (block.blockedUntil <= now) {
    runtimeBlocks.delete(provider);
    return null;
  }
  return block;
}

export function resetAiProviderRuntimeHealth(provider?: AiProvider) {
  if (provider) {
    runtimeBlocks.delete(provider);
    return;
  }
  runtimeBlocks.clear();
}
