import type { AiOperationInsight, AiOperationInsightsDeck } from "@/lib/ai/operation-insights";

export type AiMorningBriefActionItem = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  action: string;
  metric?: AiOperationInsight["metric"];
  actionIntent?: string;
  actionHref?: string;
};

export type AiMorningBriefCounts = {
  insightCount: number;
  criticalCount: number;
  warningCount: number;
  opportunityCount: number;
};

const vietnamUtcOffsetHours = 7;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resolveAiMorningBriefDate(now: Date) {
  return new Date(now.getTime() + vietnamUtcOffsetHours * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function normalizeAiMorningBriefRecipients(values: Array<string | null | undefined>, limit = 10) {
  return [
    ...new Set(
      values
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value && emailPattern.test(value)))
    )
  ].slice(0, limit);
}

export function parseAiMorningBriefRecipientsInput(value: string) {
  return normalizeAiMorningBriefRecipients(value.split(/[\n,;]+/));
}

export function calculateAiMorningBriefCounts(deck: AiOperationInsightsDeck): AiMorningBriefCounts {
  return {
    insightCount: deck.insights.length,
    criticalCount: deck.insights.filter((insight) => insight.severity === "critical").length,
    warningCount: deck.insights.filter((insight) => insight.severity === "warning").length,
    opportunityCount: deck.insights.filter((insight) => insight.severity === "opportunity").length
  };
}

export function buildAiMorningBriefActionItems(deck: AiOperationInsightsDeck): AiMorningBriefActionItem[] {
  return deck.insights.slice(0, 6).map((insight) => ({
    id: insight.id,
    kind: insight.kind,
    severity: insight.severity,
    title: insight.title,
    action: insight.action,
    metric: insight.metric,
    actionIntent: insight.actionIntent,
    actionHref: insight.actionHref
  }));
}
