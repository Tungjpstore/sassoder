import assert from "node:assert/strict";
import test from "node:test";
import { buildAiApplyLayerDeck, buildAiApplyPlan } from "@/lib/ai/apply-layer";
import type { AiExecutionItem } from "@/lib/ai/execution-center";

const menuItem: AiExecutionItem = {
  id: "menu:combo",
  kind: "menu_opportunity",
  domain: "menu",
  title: "Tạo combo trà đào",
  detail: "Trà đào đang bán mạnh.",
  action: "Tạo combo với topping có biên tốt.",
  actionHref: "/dashboard/menu",
  priority: "high",
  status: "approved",
  safetyMode: "confirm_first",
  estimatedImpact: "Tăng AOV",
  source: "AI Menu Studio",
  blockers: []
};

test("buildAiApplyPlan turns approved menu execution item into ready confirm-first plan", () => {
  const plan = buildAiApplyPlan(menuItem);

  assert.equal(plan.status, "ready");
  assert.equal(plan.risk, "medium");
  assert.equal(plan.confirmationRequired, true);
  assert.equal(plan.targetHref, "/dashboard/menu");
  assert.equal(plan.payloadContract.some((field) => field.field === "price/offer"), true);
});

test("buildAiApplyPlan exposes only real agent actions for approved recommendations", () => {
  const menuRecommendation = buildAiApplyPlan({
    ...menuItem,
    id: "recommendation:combo",
    databaseId: "rec-1",
    kind: "recommendation",
    domain: "menu"
  });
  const inventoryRecommendation = buildAiApplyPlan({
    ...menuItem,
    id: "recommendation:inventory",
    databaseId: "rec-2",
    kind: "recommendation",
    domain: "inventory"
  });
  const pendingRecommendation = buildAiApplyPlan({
    ...menuItem,
    id: "recommendation:pending",
    databaseId: "rec-3",
    kind: "recommendation",
    domain: "growth",
    status: "pending"
  });

  assert.equal(menuRecommendation.agentAction?.kind, "menu_item_draft");
  assert.equal(inventoryRecommendation.agentAction?.kind, "purchase_order_draft");
  assert.equal(pendingRecommendation.agentAction, null);
});

test("buildAiApplyPlan does not expose agent actions for studio-only cards", () => {
  const plan = buildAiApplyPlan(menuItem);

  assert.equal(plan.agentAction, null);
});

test("buildAiApplyPlan keeps blocked items from applying", () => {
  const plan = buildAiApplyPlan({
    ...menuItem,
    id: "growth:blocked",
    domain: "growth",
    status: "blocked",
    blockers: ["Thiếu memory brand."]
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.actionType, "manual_check");
  assert.equal(plan.preconditions.includes("Thiếu memory brand."), true);
});

test("buildAiApplyLayerDeck summarizes approval readiness", () => {
  const deck = buildAiApplyLayerDeck({
    generatedAt: new Date().toISOString(),
    items: [
      menuItem,
      {
        ...menuItem,
        id: "recommendation:pending",
        kind: "recommendation",
        domain: "payment",
        status: "pending",
        priority: "critical"
      },
      {
        ...menuItem,
        id: "support:manual",
        kind: "support_scenario",
        domain: "support",
        status: "manual"
      }
    ],
    summary: {
      total: 3,
      pending: 1,
      approved: 1,
      manual: 1,
      completed: 0,
      blocked: 0,
      critical: 1,
      confirmFirst: 3
    },
    lanes: [],
    runbook: []
  });

  assert.equal(deck.summary.total, 3);
  assert.equal(deck.summary.ready, 1);
  assert.equal(deck.summary.needsApproval, 1);
  assert.equal(deck.summary.manualOnly, 1);
  assert.equal(deck.summary.highRisk, 1);
});
