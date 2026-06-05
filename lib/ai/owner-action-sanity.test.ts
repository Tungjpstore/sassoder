import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("owner order actions ignore stale recentOrders when the current shift has no actionable order", () => {
  const source = read("services/ai-agent-actions.ts");

  assert.match(source, /function isOwnerActionableOrder/);
  assert.match(source, /function ownerOperationalOrders/);
  assert.match(source, /const operationalOrders = ownerOperationalOrders\(orders\)/);
  assert.doesNotMatch(source, /open-latest-order/);
  assert.match(source, /open-active-order/);
  assert.match(source, /open-current-orders/);
  assert.match(source, /shouldOfferOwnerExecutorAction/);
  assert.match(source, /ownerOperationalOrders\(orders\)\.length > 0/);
});

test("owner agent action cards request a server approval plan instead of trusting client confirm flags", () => {
  const actionSource = read("services/ai-agent-actions.ts");
  const executorSource = read("services/ai-owner-agent-executor.ts");

  assert.doesNotMatch(actionSource, /confirm:\s*true/);
  assert.match(actionSource, /mode:\s*"plan"/);
  assert.match(executorSource, /throw new AppError\("Lệnh AI agent cần mã xác nhận an toàn từ server\.", 403\)/);
  assert.match(executorSource, /await issueOwnerAgentApprovalToken/);
  assert.match(executorSource, /await consumeOwnerAgentApprovalToken\(input\.approvalToken/);
});

test("owner prompt router hides raw dashboard paths from user-facing prose", () => {
  const promptRouter = read("services/ai-prompt-router.ts");

  assert.match(promptRouter, /Không hiển thị raw route\/path/);
  assert.match(promptRouter, /mở màn Menu\/Khuyến mãi\/Đơn hàng/);
  assert.match(promptRouter, /action card chứa link thật/);
});
