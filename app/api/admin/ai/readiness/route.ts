import { requireOperationalDashboardApiSession } from "@/lib/dashboard-api-session";
import { getAiFutureCapabilities } from "@/lib/ai/future-capabilities";
import { getResolvedAiProviderReadiness } from "@/lib/ai/providers/registry";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { fail, ok } from "@/lib/response";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

async function publicProviderReadiness() {
  return (await getResolvedAiProviderReadiness()).map((provider) => ({
    provider: provider.provider,
    configured: provider.configured,
    protocol: provider.protocol,
    missingEnvNames: provider.missingEnvNames,
    chatModel: provider.chatModel,
    fastModel: provider.fastModel,
    imageModel: provider.imageModel,
    ocrModel: provider.ocrModel,
    supportsJsonMode: provider.supportsJsonMode,
    supportsToolCalling: provider.supportsToolCalling,
    supportsImageGeneration: provider.supportsImageGeneration,
    supportsOcr: provider.supportsOcr,
    priority: provider.priority
  }));
}

export async function GET() {
  try {
    await requireOperationalDashboardApiSession({ adminOnly: true, feature: "ai_owner_assistant" });
    const providers = await publicProviderReadiness();
    const configuredProviders = providers.filter((provider) => provider.configured);
    const futureCapabilities = getAiFutureCapabilities();
    const schemas = await getAiSchemaReadiness();

    return ok({
      generatedAt: new Date().toISOString(),
      status: configuredProviders.length > 0 && schemas.ready ? "ready" : "needs_config",
      providers,
      futureCapabilities,
      schemas,
      notes: [
        "Không trả API key hoặc secret.",
        "Provider chỉ được dùng khi configured=true và capability phù hợp task.",
        "Voice/Vision mặc định dormant cho tới khi bật env flag."
      ]
    });
  } catch (error) {
    return fail(error);
  }
}
