import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("inventory workspace requires the explicit inventory.view permission", () => {
  const source = readFileSync("app/dashboard/inventory/page.tsx", "utf8");
  assert.match(source, /requireDashboardPermissionAccess\("inventory_basic",\s*"inventory\.view",\s*\{\s*allowAdminBypass: false\s*\}\)/);
  assert.doesNotMatch(source, /requireDashboardAccess\("inventory_basic"\)/);
});

test("dashboard permission access supports disabling the legacy ADMIN bypass", () => {
  const source = readFileSync("lib/dashboard-access.ts", "utf8");
  assert.match(source, /allowAdminBypass\?: boolean/);
  assert.match(source, /options\.allowAdminBypass !== false/);
});
