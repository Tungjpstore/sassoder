import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner prompt router includes operating plans for agent-like actions", () => {
  const source = readFileSync("services/ai-prompt-router.ts", "utf8");

  assert.match(source, /type OwnerRoutePlan/);
  assert.match(source, /dataNeeds/);
  assert.match(source, /operatingActions/);
  assert.match(source, /actionContract/);
  assert.match(source, /outputMode/);
  assert.match(source, /create promotion draft/);
  assert.match(source, /create purchase checklist/);
  assert.match(source, /PO nháp/);
  assert.match(source, /món\/combo nháp bị ẩn/);
  assert.match(source, /Router plan: output=/);
  assert.match(source, /Quy tắc router prompt/);
  assert.match(source, /Không chỉ tư vấn/);
});

test("owner prompt router keeps concrete data requirements per operating domain", () => {
  const source = readFileSync("services/ai-prompt-router.ts", "utf8");

  for (const required of [
    "recentOrders",
    "payment logs",
    "lowStockIngredients",
    "menu categories",
    "staff snapshot",
    "operationInsights"
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
