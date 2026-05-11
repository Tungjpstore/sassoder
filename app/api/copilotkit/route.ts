import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextResponse, type NextRequest } from "next/server";
import { availableAiProviders, getAiProviderConfig } from "@/lib/ai/providers/registry";
import type { AiProviderConfig } from "@/lib/ai/router/types";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const copilotRuntime = new CopilotRuntime();

function pickCopilotProvider() {
  const providers = availableAiProviders();
  const preferred = process.env.COPILOTKIT_PROVIDER?.trim();
  if (preferred === "qwen" || preferred === "xai") {
    if (providers.includes(preferred)) return preferred;
  }
  if (providers.includes("qwen")) return "qwen";
  if (providers.includes("xai")) return "xai";
  return "qwen";
}

function isModelCompatibleWithProvider(model: string, provider: AiProviderConfig["provider"]) {
  const normalizedModel = model.trim().toLowerCase();
  if (!normalizedModel) return false;
  if (provider === "qwen") return normalizedModel.startsWith("qwen");
  return normalizedModel.startsWith("grok");
}

function pickCopilotModel(aiProvider: AiProviderConfig) {
  const providerSpecificModel =
    aiProvider.provider === "qwen"
      ? process.env.COPILOTKIT_QWEN_MODEL?.trim()
      : process.env.COPILOTKIT_XAI_MODEL?.trim();
  if (providerSpecificModel) return providerSpecificModel;

  const genericModel = process.env.COPILOTKIT_MODEL?.trim();
  if (genericModel && isModelCompatibleWithProvider(genericModel, aiProvider.provider)) return genericModel;

  return aiProvider.fastModel || aiProvider.chatModel;
}

function createServiceAdapter() {
  const provider = pickCopilotProvider();
  const aiProvider = getAiProviderConfig(provider);
  const openai = new OpenAI({
    apiKey: aiProvider.apiKey,
    baseURL: aiProvider.baseUrl
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
    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime: copilotRuntime,
      serviceAdapter: createServiceAdapter(),
      endpoint: "/api/copilotkit"
    });

    return handleRequest(req);
  } catch (error) {
    console.error("[copilotkit] provider setup failed", error);
    return NextResponse.json(
      {
        error: "LogiBot chưa thể kết nối provider AI.",
        message: "Provider AI chưa sẵn sàng. Vui lòng kiểm tra cấu hình Qwen/xAI trên server."
      },
      { status: 503 }
    );
  }
}
