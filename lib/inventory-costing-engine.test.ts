import assert from "node:assert/strict";
import test from "node:test";
import { calculateRecipeCost, calculateRecipeLineCost } from "./inventory-costing-engine";

test("calculateRecipeLineCost includes waste percent safely", () => {
  assert.equal(calculateRecipeLineCost({ quantityPerItem: 0.03, wastePercent: 10, referenceUnitCost: 120000 }), 3960);
  assert.equal(calculateRecipeLineCost({ quantityPerItem: -1, wastePercent: -10, referenceUnitCost: 120000 }), 0);
});

test("calculateRecipeCost returns margin and healthy status for controlled food cost", () => {
  const summary = calculateRecipeCost({
    price: 45000,
    lines: [
      { quantityPerItem: 0.02, wastePercent: 0, referenceUnitCost: 100000 },
      { quantityPerItem: 0.03, wastePercent: 10, referenceUnitCost: 90000 }
    ]
  });

  assert.equal(summary.totalRecipeCost, 4970);
  assert.equal(summary.recipeCostPercent, 11.04);
  assert.equal(summary.grossProfit, 40030);
  assert.equal(summary.grossMarginPercent, 88.96);
  assert.equal(summary.costStatus, "healthy");
  assert.equal(summary.marginWarning, null);
});

test("calculateRecipeCost flags high and critical food cost", () => {
  const high = calculateRecipeCost({
    price: 30000,
    lines: [{ quantityPerItem: 1, wastePercent: 0, referenceUnitCost: 16000 }]
  });
  const critical = calculateRecipeCost({
    price: 30000,
    lines: [{ quantityPerItem: 1, wastePercent: 15, referenceUnitCost: 18000 }]
  });

  assert.equal(high.costStatus, "high");
  assert.match(high.marginWarning ?? "", /cao hơn ngưỡng an toàn/);
  assert.equal(critical.costStatus, "critical");
  assert.match(critical.marginWarning ?? "", /rất cao/);
});

test("calculateRecipeCost handles missing price without fake margin", () => {
  const summary = calculateRecipeCost({
    price: 0,
    lines: [{ quantityPerItem: 1, wastePercent: 0, referenceUnitCost: 12000 }]
  });

  assert.equal(summary.totalRecipeCost, 12000);
  assert.equal(summary.recipeCostPercent, 0);
  assert.equal(summary.grossProfit, -12000);
  assert.equal(summary.grossMarginPercent, 0);
  assert.equal(summary.costStatus, "healthy");
  assert.equal(summary.marginWarning, "Chưa có giá bán để tính margin.");
});
