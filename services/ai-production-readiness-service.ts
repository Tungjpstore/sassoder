import "server-only";

import { buildAiApplyLayerDeck } from "@/lib/ai/apply-layer";
import { getAiFutureCapabilities } from "@/lib/ai/future-capabilities";
import { getAiProviderReadiness } from "@/lib/ai/providers/registry";
import { buildAiProductionReadinessDeck } from "@/lib/ai/production-readiness";
import { getAiSchemaReadiness } from "@/lib/ai/schema-readiness";
import { getAiExecutionCenterDeck } from "@/services/ai-execution-center-service";

export async function getAiProductionReadinessDeck(restaurantId: string) {
  const [providers, schemas, futureCapabilities, executionDeck] = await Promise.all([
    Promise.resolve(getAiProviderReadiness()),
    getAiSchemaReadiness(),
    Promise.resolve(getAiFutureCapabilities()),
    getAiExecutionCenterDeck(restaurantId)
  ]);
  const applyDeck = buildAiApplyLayerDeck(executionDeck);

  return buildAiProductionReadinessDeck({
    providers,
    schemas,
    futureCapabilities,
    executionDeck,
    applyDeck
  });
}
