import assert from "node:assert/strict";
import test from "node:test";
import { customerAiToolNames, isAiToolNameAllowedForSurface } from "./surface-policy";

const allToolNames = new Set([
  "summarize_sales",
  "analyze_peak_hour",
  "search_menu",
  "find_best_seller",
  "detect_payment_issue",
  "generate_campaign",
  "create_combo"
]);

test("customer AI tool policy only allows public ordering helpers", () => {
  assert.deepEqual(customerAiToolNames, ["search_menu", "create_combo"]);
  assert.equal(isAiToolNameAllowedForSurface("customer", "search_menu", allToolNames), true);
  assert.equal(isAiToolNameAllowedForSurface("customer", "create_combo", allToolNames), true);
  assert.equal(isAiToolNameAllowedForSurface("customer", "summarize_sales", allToolNames), false);
  assert.equal(isAiToolNameAllowedForSurface("customer", "detect_payment_issue", allToolNames), false);
  assert.equal(isAiToolNameAllowedForSurface("customer", "generate_campaign", allToolNames), false);
});

test("owner AI tool policy still requires known registered tools", () => {
  assert.equal(isAiToolNameAllowedForSurface("owner", "summarize_sales", allToolNames), true);
  assert.equal(isAiToolNameAllowedForSurface("owner", "detect_payment_issue", allToolNames), true);
  assert.equal(isAiToolNameAllowedForSurface("owner", "unknown_internal_tool", allToolNames), false);
});
