import "server-only";

import { buildAiApplyLayerDeck } from "@/lib/ai/apply-layer";
import { getAiExecutionCenterDeck } from "@/services/ai-execution-center-service";

export async function getAiApplyLayerDeck(restaurantId: string) {
  const executionDeck = await getAiExecutionCenterDeck(restaurantId);
  return buildAiApplyLayerDeck(executionDeck);
}
