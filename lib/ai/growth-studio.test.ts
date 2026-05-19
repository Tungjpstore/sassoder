import assert from "node:assert/strict";
import test from "node:test";
import { buildAiGrowthStudioDeck } from "@/lib/ai/growth-studio";

test("buildAiGrowthStudioDeck blocks campaigns without provider or schemas", () => {
  const deck = buildAiGrowthStudioDeck({
    providerConfigured: false,
    schemas: {
      recommendations: false,
      restaurantMemories: false
    },
    memoryCount: 0
  });

  assert.equal(deck.summary.total, 5);
  assert.equal(deck.summary.blocked, 5);
  assert.equal(deck.copyKits.length, 0);
});

test("buildAiGrowthStudioDeck turns promotion and combo signals into ready campaigns", () => {
  const deck = buildAiGrowthStudioDeck({
    providerConfigured: true,
    schemas: {
      recommendations: true,
      restaurantMemories: true
    },
    memoryCount: 4,
    activePromotionCount: 1,
    recommendations: [
      {
        id: "promo-1",
        type: "promotion",
        priority: "high",
        title: "Doanh thu giờ chiều thấp",
        detail: "Chiều nay doanh thu thấp hơn thường lệ."
      },
      {
        id: "combo-1",
        type: "combo",
        priority: "medium",
        title: "Trà đào bán mạnh",
        detail: "Trà đào có tỷ lệ reorder tốt."
      }
    ],
    playbooks: [
      {
        id: "playbook-quiet-hour",
        domain: "marketing",
        status: "ready",
        title: "Chiến dịch giờ thấp điểm",
        readinessScore: 100
      }
    ]
  });

  const quietHour = deck.campaigns.find((campaign) => campaign.id === "growth-quiet-hour");
  const combo = deck.campaigns.find((campaign) => campaign.id === "growth-combo-builder");

  assert.equal(quietHour?.status, "ready");
  assert.equal(quietHour?.offer.includes("promotion đang chạy"), true);
  assert.equal(combo?.status, "ready");
  assert.equal(deck.summary.ready >= 2, true);
  assert.equal(deck.copyKits.length > 0, true);
});

test("buildAiGrowthStudioDeck keeps configured campaigns as drafts without live signals", () => {
  const deck = buildAiGrowthStudioDeck({
    providerConfigured: true,
    schemas: {
      recommendations: true,
      restaurantMemories: true
    },
    memoryCount: 2
  });

  assert.equal(deck.summary.blocked, 0);
  assert.equal(deck.summary.draft, deck.summary.total);
  assert.equal(deck.campaigns.every((campaign) => campaign.nextAction.length > 0), true);
});
