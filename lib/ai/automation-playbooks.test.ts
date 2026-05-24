import assert from "node:assert/strict";
import test from "node:test";
import { buildAiAutomationPlaybooks } from "@/lib/ai/automation-playbooks";

test("buildAiAutomationPlaybooks blocks playbooks when providers and schemas are missing", () => {
  const deck = buildAiAutomationPlaybooks({
    providerConfigured: false,
    schemas: {
      recommendations: false,
      automationRuns: false,
      restaurantMemories: false
    },
    memoryCount: 0
  });

  assert.equal(deck.summary.total >= 8, true);
  assert.equal(deck.summary.blocked, deck.summary.total);
  assert.equal(deck.playbooks.every((playbook) => playbook.blockers.length > 0), true);
});

test("buildAiAutomationPlaybooks marks live matching workflow playbooks ready", () => {
  const deck = buildAiAutomationPlaybooks({
    providerConfigured: true,
    schemas: {
      recommendations: true,
      automationRuns: true,
      restaurantMemories: true
    },
    memoryCount: 3,
    workflows: [
      {
        id: "workflow-inventory-purchase-plan",
        domain: "inventory",
        priority: "critical",
        title: "Chốt kế hoạch nhập hàng"
      }
    ],
    recommendations: [
      {
        id: "rec-payment",
        type: "payment",
        priority: "critical",
        title: "Đơn QR cần xác nhận"
      }
    ]
  });

  const inventory = deck.playbooks.find((playbook) => playbook.id === "playbook-low-stock-purchase");
  const payment = deck.playbooks.find((playbook) => playbook.id === "playbook-payment-risk");

  assert.equal(inventory?.status, "ready");
  assert.equal(inventory?.linkedWorkflowCount, 1);
  assert.equal(payment?.status, "ready");
  assert.equal(payment?.linkedRecommendationCount, 1);
  assert.equal(deck.summary.criticalOpen >= 2, true);
});

test("buildAiAutomationPlaybooks keeps configured playbooks on watch without live signals", () => {
  const deck = buildAiAutomationPlaybooks({
    providerConfigured: true,
    schemas: {
      recommendations: true,
      automationRuns: true,
      restaurantMemories: true
    },
    memoryCount: 2
  });

  assert.equal(deck.summary.blocked, 0);
  assert.equal(deck.summary.watch > 0, true);
  assert.equal(deck.playbooks.every((playbook) => playbook.readinessScore > 0), true);
});
