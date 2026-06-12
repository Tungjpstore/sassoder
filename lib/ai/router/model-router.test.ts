import assert from "node:assert/strict";
import test from "node:test";
import { resolveProviderTimeoutMs } from "./provider-timeouts";

test("resolveProviderTimeoutMs keeps customer MiMo latency tight but widens owner/report windows", () => {
  assert.equal(resolveProviderTimeoutMs("mimo", "customer_ordering", 8_000), 8_000);
  assert.equal(resolveProviderTimeoutMs("mimo", "dashboard_operation", 14_000), 24_000);
  assert.equal(resolveProviderTimeoutMs("mimo", "analytics_reasoning", 14_000), 30_000);
  assert.equal(resolveProviderTimeoutMs("mimo", "tool", 14_000), 20_000);
});

test("resolveProviderTimeoutMs never shortens explicit long-running jobs or non-MiMo providers", () => {
  assert.equal(resolveProviderTimeoutMs("mimo", "batch_report", 45_000), 45_000);
  assert.equal(resolveProviderTimeoutMs("xai", "dashboard_operation", 14_000), 14_000);
  assert.equal(resolveProviderTimeoutMs("deepseek", "analytics_reasoning", undefined), undefined);
});
