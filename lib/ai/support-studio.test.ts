import assert from "node:assert/strict";
import test from "node:test";
import { buildAiSupportStudioDeck } from "@/lib/ai/support-studio";

test("buildAiSupportStudioDeck blocks scenarios without provider or memory schema", () => {
  const deck = buildAiSupportStudioDeck({
    providerConfigured: false,
    schemas: {
      restaurantMemories: false
    }
  });

  assert.equal(deck.summary.total, 8);
  assert.equal(deck.summary.blocked, 8);
  assert.equal(deck.replyKits.length, 0);
});

test("buildAiSupportStudioDeck readies public support scenarios from memory", () => {
  const deck = buildAiSupportStudioDeck({
    providerConfigured: true,
    schemas: {
      restaurantMemories: true,
      recommendations: true
    },
    memories: [
      { id: "menu-1", category: "menu", title: "Menu trà và topping", sensitivity: "public" },
      { id: "policy-1", category: "policy", title: "Giờ mở cửa và đặt bàn", sensitivity: "public" },
      { id: "ops-1", category: "operations", title: "Quy trình giao hàng", sensitivity: "internal" }
    ],
    recommendations: [
      { id: "rec-1", type: "menu", priority: "medium", title: "Trà đào đang bán tốt" }
    ]
  });

  const menuQuestion = deck.scenarios.find((scenario) => scenario.id === "support-menu-question");
  const reservation = deck.scenarios.find((scenario) => scenario.id === "support-reservation-help");

  assert.equal(menuQuestion?.status, "ready");
  assert.equal(reservation?.status, "ready");
  assert.equal(deck.summary.ready >= 6, true);
  assert.equal(deck.replyKits.length > 0, true);
});

test("buildAiSupportStudioDeck keeps sensitive flows in handoff mode", () => {
  const deck = buildAiSupportStudioDeck({
    providerConfigured: true,
    schemas: {
      restaurantMemories: true
    },
    memories: [
      { id: "menu-1", category: "menu", title: "Thành phần menu", sensitivity: "public" },
      { id: "policy-1", category: "policy", title: "Chính sách hoàn tiền và dị ứng", sensitivity: "public" },
      { id: "ops-1", category: "operations", title: "Quy trình chi nhánh", sensitivity: "internal" }
    ]
  });

  const payment = deck.scenarios.find((scenario) => scenario.type === "payment_question");
  const complaint = deck.scenarios.find((scenario) => scenario.type === "complaint_handoff");
  const allergy = deck.scenarios.find((scenario) => scenario.type === "allergy_policy");

  assert.equal(payment?.escalationMode, "human_handoff");
  assert.equal(complaint?.escalationMode, "human_handoff");
  assert.equal(allergy?.escalationMode, "human_handoff");
  assert.equal(payment?.blockedData.includes("quyết định hoàn tiền tự động"), true);
});
