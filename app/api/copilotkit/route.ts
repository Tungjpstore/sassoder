import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextResponse, type NextRequest } from "next/server";
import { availableAiProviders, getAiProviderConfig, normalizeAiProviderId } from "@/lib/ai/providers/registry";
import { checkPersistentRateLimit } from "@/lib/persistent-rate-limit";
import { AppError, fail } from "@/lib/response";
import { getRequestIpKey } from "@/lib/security/request-ip";
import { assertSameOriginRequest } from "@/lib/security/request-origin";
import type { AiProvider, AiProviderConfig } from "@/lib/ai/router/types";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const copilotRuntime = new CopilotRuntime();
const copilotProviderTimeoutMs = Number(process.env.COPILOTKIT_TIMEOUT_MS || 18_000);

function pickCopilotProvider() {
  const providers = availableAiProviders().filter((provider) => getAiProviderConfig(provider).protocol === "openai-compatible");
  const preferred = normalizeAiProviderId(process.env.COPILOTKIT_PROVIDER);
  if (preferred && providers.includes(preferred)) {
    return preferred;
  }
  return providers[0] ?? "qwen";
}

function isModelCompatibleWithProvider(model: string, provider: AiProviderConfig["provider"]) {
  const normalizedModel = model.trim().toLowerCase();
  if (!normalizedModel) return false;
  if (provider === "qwen") return normalizedModel.startsWith("qwen");
  if (provider === "xai") return normalizedModel.startsWith("grok");
  if (provider === "openai") return normalizedModel.startsWith("gpt") || normalizedModel.startsWith("o");
  if (provider === "gemini") return normalizedModel.startsWith("gemini");
  if (provider === "vercel_gateway") return normalizedModel.includes("/");
  return false;
}

function pickCopilotModel(aiProvider: AiProviderConfig) {
  const envName = `COPILOTKIT_${aiProvider.provider.toUpperCase()}_MODEL`;
  const providerSpecificModel = process.env[envName]?.trim();
  if (providerSpecificModel) return providerSpecificModel;

  const genericModel = process.env.COPILOTKIT_MODEL?.trim();
  if (genericModel && isModelCompatibleWithProvider(genericModel, aiProvider.provider)) return genericModel;

  return aiProvider.fastModel || aiProvider.chatModel;
}

function createServiceAdapter() {
  const provider = pickCopilotProvider() as AiProvider;
  const aiProvider = getAiProviderConfig(provider);
  const openai = new OpenAI({
    apiKey: aiProvider.apiKey,
    baseURL: aiProvider.baseUrl,
    timeout: copilotProviderTimeoutMs,
    maxRetries: 1
  });

  return new OpenAIAdapter({
    openai,
    model: pickCopilotModel(aiProvider),
    disableParallelToolCalls: true,
    keepSystemRole: true,
    maxInputTokens: 12_000
  });
}

export async function POST(req: NextRequest) {
  try {
    assertSameOriginRequest(req, { requireOrigin: process.env.VERCEL_ENV === "production" });
    const allowed = await checkPersistentRateLimit({
      scope: "copilotkit_runtime",
      identifier: "runtime",
      ip: await getRequestIpKey(),
      limit: 30,
      windowMs: 60_000
    });
    if (!allowed) {
      throw new AppError("Bạn thao tác với LogiBot hơi nhanh. Vui lòng thử lại sau.", 429);
    }

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime: copilotRuntime,
      serviceAdapter: createServiceAdapter(),
      endpoint: "/api/copilotkit"
    });

    return handleRequest(req);
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error);
    }

    console.error("[copilotkit] provider setup failed", error);
    return NextResponse.json(
      {
        error: "LogiBot chưa thể kết nối provider AI.",
        message: "Provider AI chưa sẵn sàng. Vui lòng kiểm tra cấu hình AI server-side."
      },
      { status: 503 }
    );
  }
}
