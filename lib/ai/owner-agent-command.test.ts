import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOwnerAgentCommand,
  normalizeOwnerAgentDomain,
  ownerAgentDefaultCommandByDomain,
  ownerAgentToolRegistry,
  type OwnerAgentDomain
} from "@/lib/ai/owner-agent-command";

const domains: OwnerAgentDomain[] = [
  "setup",
  "overview",
  "orders",
  "kitchen",
  "menu",
  "inventory",
  "tables",
  "payments",
  "promotions",
  "staff",
  "online",
  "reservations",
  "reports",
  "settings",
  "security",
  "growth",
  "support",
  "branch"
];

test("owner agent registry covers every operating domain with an executable contract", () => {
  for (const domain of domains) {
    const command = ownerAgentDefaultCommandByDomain[domain];
    const contract = ownerAgentToolRegistry[command];

    assert.ok(contract, `missing contract for ${domain}`);
    assert.equal(contract.domain, domain);
    assert.equal(contract.command, command);
    assert.ok(contract.route.startsWith("/dashboard"));
    assert.ok(contract.reads.length > 0);
    assert.ok(contract.writes.length > 0);
    assert.ok(["safe", "confirm", "manual_only"].includes(contract.safety));
  }
});

test("owner agent parser maps Vietnamese owner commands to concrete executor commands", () => {
  assert.equal(normalizeOwnerAgentDomain(null, "tạo menu mới cho quán trà sữa"), "menu");
  assert.equal(normalizeOwnerAgentCommand(null, "menu", "tạo menu mới cho quán trà sữa"), "create_menu_draft");

  assert.equal(normalizeOwnerAgentDomain(null, "tạo PO nhập hàng từ tồn thấp"), "inventory");
  assert.equal(normalizeOwnerAgentCommand(null, "inventory", "tạo PO nhập hàng từ tồn thấp"), "create_purchase_order_draft");

  assert.equal(normalizeOwnerAgentDomain(null, "viết kịch bản trả lời khách hỏi đặt bàn"), "support");
  assert.equal(normalizeOwnerAgentCommand(null, "support", "viết kịch bản trả lời khách hỏi đặt bàn"), "create_support_playbook");

  assert.equal(normalizeOwnerAgentDomain(null, "chi nhánh nào yếu nhất"), "branch");
  assert.equal(normalizeOwnerAgentCommand(null, "branch", "chi nhánh nào yếu nhất"), "create_branch_watchlist");
});

test("owner agent registry keeps high-risk writes confirm-first or manual-only", () => {
  for (const contract of Object.values(ownerAgentToolRegistry)) {
    const writesDatabase = contract.writes.some((item) => item !== "none");
    if (writesDatabase) {
      assert.equal(contract.confirmationRequired, true, `${contract.command} must require confirmation`);
      assert.notEqual(contract.safety, "safe", `${contract.command} cannot be marked safe`);
    }
  }

  assert.equal(ownerAgentToolRegistry.create_payment_reconciliation.safety, "manual_only");
  assert.deepEqual(ownerAgentToolRegistry.create_payment_reconciliation.writes, ["none"]);
});
