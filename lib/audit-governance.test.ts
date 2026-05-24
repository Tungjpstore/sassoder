import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auditServiceSource = readFileSync("services/audit-log-service.ts", "utf8");
const deleteTestRouteSource = readFileSync("app/api/admin/orders/[orderId]/delete-test/route.ts", "utf8");
const cleanupRouteSource = readFileSync("app/api/admin/orders/cleanup/route.ts", "utf8");
const platformAdminServiceSource = readFileSync("services/platform-admin-service.ts", "utf8");

test("required audit logs fail closed when audit insert fails", () => {
  assert.match(auditServiceSource, /required\?: boolean/);
  assert.match(auditServiceSource, /if \(input\.required\) \{[\s\S]*throw new AppError\("Không ghi được audit log bắt buộc\.", 500\)/);
});

test("destructive order delete writes required audit before mutation", () => {
  assert.ok(deleteTestRouteSource.indexOf("required: true") < deleteTestRouteSource.indexOf("deleteTestOrder("));
  assert.match(deleteTestRouteSource, /phase: "before_delete"/);
  assert.match(deleteTestRouteSource, /phase: "after_delete"/);
});

test("destructive order cleanup writes required audit before mutation", () => {
  assert.ok(cleanupRouteSource.indexOf("required: true") < cleanupRouteSource.indexOf("cleanupTestOrders("));
  assert.match(cleanupRouteSource, /body\.mode === "delete_test"/);
  assert.match(cleanupRouteSource, /phase: "before_cleanup"/);
});

test("platform tenant and user status mutations require audit before update", () => {
  assert.match(platformAdminServiceSource, /required\?: boolean/);
  assert.match(platformAdminServiceSource, /action: "tenant_status_update_requested"[\s\S]*required: true[\s\S]*from\("restaurants"\)\.update/);
  assert.match(platformAdminServiceSource, /action: "platform_user_status_update_requested"[\s\S]*required: true[\s\S]*from\("users"\)\.update/);
});
