import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiMorningBriefActionItems,
  calculateAiMorningBriefCounts,
  normalizeAiMorningBriefRecipients,
  parseAiMorningBriefRecipientsInput,
  resolveAiMorningBriefDate
} from "./morning-brief";
import type { AiOperationInsightsDeck } from "./operation-insights";

function deckWithSeverities(severities: Array<"critical" | "warning" | "opportunity" | "info">): AiOperationInsightsDeck {
  return {
    generatedAt: "2026-05-16T22:00:00.000Z",
    summary: "Có việc cần xử lý trong ca sáng.",
    healthScore: 72,
    primaryInsightId: "insight-0",
    insights: severities.map((severity, index) => ({
      id: `insight-${index}`,
      kind: index % 2 === 0 ? "payment" : "menu",
      severity,
      title: `Insight ${index}`,
      detail: `Chi tiết ${index}`,
      action: `Hành động ${index}`,
      confidence: "medium",
      evidence: [`fixture=${index}`],
      metric: { label: "Số lượng", value: String(index + 1) },
      actionIntent: "orders",
      actionHref: "/dashboard/orders"
    }))
  };
}

test("calculateAiMorningBriefCounts groups insight severity for the brief", () => {
  const counts = calculateAiMorningBriefCounts(deckWithSeverities(["critical", "warning", "warning", "opportunity", "info"]));

  assert.deepEqual(counts, {
    insightCount: 5,
    criticalCount: 1,
    warningCount: 2,
    opportunityCount: 1
  });
});

test("buildAiMorningBriefActionItems keeps the brief compact", () => {
  const items = buildAiMorningBriefActionItems(
    deckWithSeverities(["critical", "warning", "opportunity", "info", "warning", "critical", "opportunity"])
  );

  assert.equal(items.length, 6);
  assert.equal(items[0]?.id, "insight-0");
  assert.equal(items[5]?.id, "insight-5");
  assert.equal(items[0]?.actionHref, "/dashboard/orders");
});

test("resolveAiMorningBriefDate uses Vietnam business day", () => {
  assert.equal(resolveAiMorningBriefDate(new Date("2026-05-16T16:59:00.000Z")), "2026-05-16");
  assert.equal(resolveAiMorningBriefDate(new Date("2026-05-16T17:01:00.000Z")), "2026-05-17");
});

test("normalizeAiMorningBriefRecipients dedupes, lowercases, validates and caps recipients", () => {
  const recipients = normalizeAiMorningBriefRecipients([
    " Owner@LogiVN.com ",
    "owner@logivn.com",
    "invalid",
    "ops@logivn.com",
    "chef@logivn.com"
  ], 2);

  assert.deepEqual(recipients, ["owner@logivn.com", "ops@logivn.com"]);
});

test("parseAiMorningBriefRecipientsInput accepts comma, semicolon and newline lists", () => {
  assert.deepEqual(
    parseAiMorningBriefRecipientsInput("owner@logivn.com, ops@logivn.com\nshift@logivn.com;bad-value"),
    ["owner@logivn.com", "ops@logivn.com", "shift@logivn.com"]
  );
});
