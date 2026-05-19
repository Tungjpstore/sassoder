import assert from "node:assert/strict";
import test from "node:test";
import { buildAiMenuStudioDeck, type AiMenuStudioItem } from "@/lib/ai/menu-studio";

const items: AiMenuStudioItem[] = [
  {
    id: "tra-dao",
    categoryId: "drinks",
    categoryName: "Trà trái cây",
    name: "Trà đào cam sả",
    price: 45000,
    imageUrl: null,
    isAvailable: true,
    modifierGroupCount: 0,
    modifierOptionCount: 0,
    isTopSeller: true
  },
  {
    id: "tra-sua",
    categoryId: "drinks",
    categoryName: "Trà sữa",
    name: "Trà sữa trân châu",
    price: 39000,
    imageUrl: "https://example.com/tra-sua.jpg",
    isAvailable: true,
    modifierGroupCount: 2,
    modifierOptionCount: 8
  },
  {
    id: "banh",
    categoryId: "snacks",
    categoryName: "Ăn nhẹ",
    name: "Bánh flan",
    price: 25000,
    imageUrl: null,
    isAvailable: false,
    modifierGroupCount: 0,
    modifierOptionCount: 0
  }
];

test("buildAiMenuStudioDeck creates actionable menu opportunities from menu gaps", () => {
  const deck = buildAiMenuStudioDeck({
    providerConfigured: true,
    schemas: {
      recommendations: true,
      restaurantMemories: true
    },
    items,
    memories: [{ id: "memory-1", category: "menu", title: "Menu trà trái cây", sensitivity: "public" }],
    recommendations: [{ id: "combo-1", type: "combo", priority: "high", title: "Trà đào bán mạnh" }]
  });

  const image = deck.opportunities.find((opportunity) => opportunity.type === "image_refresh");
  const combo = deck.opportunities.find((opportunity) => opportunity.type === "combo_builder");

  assert.equal(deck.summary.totalItems, 3);
  assert.equal(deck.summary.missingImageItems, 1);
  assert.equal(image?.status, "ready");
  assert.equal(combo?.status, "ready");
  assert.equal(deck.promptKits.length > 0, true);
});

test("buildAiMenuStudioDeck blocks generative work without provider and memory", () => {
  const deck = buildAiMenuStudioDeck({
    providerConfigured: false,
    schemas: {
      recommendations: false,
      restaurantMemories: false
    },
    items
  });

  const image = deck.opportunities.find((opportunity) => opportunity.type === "image_refresh");
  const seasonal = deck.opportunities.find((opportunity) => opportunity.type === "seasonal_item");

  assert.equal(image?.status, "blocked");
  assert.equal(seasonal?.status, "blocked");
  assert.equal(deck.summary.blocked >= 4, true);
});

test("buildAiMenuStudioDeck keeps availability cleanup usable without AI provider", () => {
  const deck = buildAiMenuStudioDeck({
    providerConfigured: false,
    schemas: {
      recommendations: false,
      restaurantMemories: false
    },
    items
  });

  const cleanup = deck.opportunities.find((opportunity) => opportunity.type === "availability_cleanup");

  assert.equal(cleanup?.status, "ready");
  assert.equal(cleanup?.blockers.length, 0);
  assert.equal(cleanup?.target, "1 món tạm ngưng");
});
