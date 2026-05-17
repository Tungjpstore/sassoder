import assert from "node:assert/strict";
import test from "node:test";
import { buildAiAutomationWorkflows } from "./automation-workflows";

test("buildAiAutomationWorkflows creates confirm-first inventory purchase workflow", () => {
  const workflows = buildAiAutomationWorkflows({
    snapshot: {
      inventory: {
        lowStockCount: 4,
        projectedPurchaseValue: 720000,
        reorderSuggestionCount: 3,
        highReorderCount: 1,
        openAlertCount: 2
      }
    }
  });

  const workflow = workflows.find((item) => item.id === "workflow-inventory-purchase-plan");
  assert.ok(workflow);
  assert.equal(workflow.priority, "critical");
  assert.equal(workflow.executionMode, "confirm_first");
  assert.ok(workflow?.steps.some((step) => step.status === "needs_confirmation"));
  assert.ok(workflow?.actions.some((action) => action.href === "/dashboard/inventory"));
});

test("buildAiAutomationWorkflows creates marketing workflow for quiet revenue", () => {
  const workflows = buildAiAutomationWorkflows({
    snapshot: {
      summary24h: {
        orderCount: 0,
        paidRevenue: 0
      },
      promotions: []
    }
  });

  const workflow = workflows.find((item) => item.domain === "marketing");
  assert.ok(workflow);
  assert.equal(workflow?.priority, "high");
  assert.ok(workflow?.actions.some((action) => action.type === "prompt"));
});

test("buildAiAutomationWorkflows creates inventory expiry alert sweep workflow", () => {
  const workflows = buildAiAutomationWorkflows({
    snapshot: {
      inventory: {
        expiringBatchCount: 4,
        openAlertCount: 6
      }
    }
  });

  const workflow = workflows.find((item) => item.id === "workflow-inventory-expiry-alert-sweep");
  assert.ok(workflow);
  assert.equal(workflow.priority, "high");
  assert.equal(workflow.executionMode, "manual_only");
  assert.ok(workflow.evidence.includes("expiringBatches=4"));
});

test("buildAiAutomationWorkflows creates staffing workflow from operation insights", () => {
  const workflows = buildAiAutomationWorkflows({
    snapshot: {
      operationInsights: {
        insights: [
          {
            id: "staffing-coverage",
            kind: "staffing",
            severity: "warning",
            title: "Thiếu người ca tối",
            detail: "Ca 19h-21h có coverage thấp.",
            action: "Mở nhân sự để điều phối lại ca tối.",
            confidence: "high",
            evidence: ["coverage=42"]
          }
        ]
      }
    }
  });

  const workflow = workflows.find((item) => item.domain === "staffing");
  assert.ok(workflow);
  assert.equal(workflow?.confidence, "high");
  assert.equal(workflow?.actions[0]?.href, "/dashboard/staff");
});
