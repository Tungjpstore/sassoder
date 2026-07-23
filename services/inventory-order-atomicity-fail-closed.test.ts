import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("inventory acceptance fails closed when the ledger or atomic RPC is unavailable", () => {
  const source = readFileSync("services/inventory-service.ts", "utf8");
  assert.doesNotMatch(source, /LOGIVN_ALLOW_INVENTORY_FAIL_OPEN/);
  assert.doesNotMatch(source, /acceptOrderWithoutInventory/);
  assert.match(source, /if \(!allocationPlan\.schemaReady\) \{[\s\S]*throw new AppError\([\s\S]*503/);
  assert.match(source, /Luồng trừ kho nguyên tử chưa sẵn sàng/);
});
