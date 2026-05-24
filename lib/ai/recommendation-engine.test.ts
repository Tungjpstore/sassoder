import assert from "node:assert/strict";
import test from "node:test";
import { buildAiRecommendationDeck } from "./recommendation-engine";
import type { AiOperationInsightsDeck } from "./operation-insights";

const generatedAt = "2026-05-17T08:00:00.000Z";

test("buildAiRecommendationDeck turns menu insights into combo recommendations", () => {
  const deck = buildAiRecommendationDeck({
    operationInsights: {
      generatedAt,
      healthScore: 84,
      summary: "Menu signal",
      primaryInsightId: "menu-top-item",
      insights: [
        {
          id: "menu-top-item",
          kind: "menu",
          severity: "opportunity",
          title: "Bạc xỉu bán chạy",
          detail: "Bạc xỉu có số lượng bán cao trong khung sáng.",
          action: "Tạo combo Bạc xỉu + topping.",
          confidence: "high",
          evidence: ["quantity=12"],
          actionHref: "/dashboard/menu"
        }
      ]
    }
  });

  assert.equal(deck.recommendations[0]?.type, "combo");
  assert.equal(deck.recommendations[0]?.priority, "medium");
  assert.equal(deck.recommendations[0]?.actionHref, "/dashboard/menu");
});

test("buildAiRecommendationDeck prioritizes inventory and payment risks", () => {
  const operationInsights: AiOperationInsightsDeck = {
    generatedAt,
    healthScore: 62,
    summary: "Risk signal",
    primaryInsightId: "inventory-risk",
    insights: [
      {
        id: "payment-waiting",
        kind: "payment",
        severity: "warning",
        title: "Thanh toán treo",
        detail: "Có 3 giao dịch chờ xác nhận.",
        action: "Xác nhận thanh toán.",
        confidence: "medium",
        evidence: ["waiting=3"]
      },
      {
        id: "inventory-risk",
        kind: "inventory",
        severity: "critical",
        title: "Kho thiếu nguyên liệu",
        detail: "Trân châu dưới ngưỡng.",
        action: "Tạo kế hoạch nhập.",
        confidence: "high",
        evidence: ["lowStock=4"],
        metric: { label: "Nguyên liệu thiếu", value: "4" }
      }
    ]
  };

  const deck = buildAiRecommendationDeck({ operationInsights });

  assert.equal(deck.recommendations[0]?.type, "inventory");
  assert.equal(deck.recommendations[0]?.priority, "critical");
  assert.equal(deck.recommendations[1]?.type, "payment");
});
