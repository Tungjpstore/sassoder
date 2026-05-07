import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from "@copilotkit/runtime";
import OpenAI from "openai";
import type { NextRequest } from "next/server";
import { getAiProviderConfig } from "@/lib/ai/providers/registry";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

const copilotRuntime = new CopilotRuntime();

function createServiceAdapter() {
  const qwen = getAiProviderConfig("qwen");
  const openai = new OpenAI({
    apiKey: qwen.apiKey,
    baseURL: qwen.baseUrl
  });

  return new OpenAIAdapter({
    openai,
    model: process.env.COPILOTKIT_MODEL || qwen.chatModel,
    keepSystemRole: true,
    maxInputTokens: 12_000
  });
}

export async function POST(req: NextRequest) {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: copilotRuntime,
    serviceAdapter: createServiceAdapter(),
    endpoint: "/api/copilotkit"
  });

  return handleRequest(req);
}
