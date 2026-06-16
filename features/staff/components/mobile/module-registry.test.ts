import assert from "node:assert/strict";
import test from "node:test";
import { resolveStaffModules, STAFF_MODULES, STAFF_NAV_MAX } from "@/features/staff/components/mobile/module-registry";

function ids(modules: { id: string }[]) {
  return modules.map((module) => module.id);
}

test("baseline modules are always present even with no permissions", () => {
  const resolved = resolveStaffModules(new Set());
  assert.ok(resolved.nav.length <= STAFF_NAV_MAX);
  assert.equal(resolved.nav[0]?.id, "home");
  assert.equal(resolved.nav.at(-1)?.id, "profile");
  // No operational module leaks without its gate permission (Req 10.9).
  const operationalIds = STAFF_MODULES.filter((m) => m.kind === "operational").map((m) => m.id);
  for (const opId of operationalIds) {
    assert.ok(!ids(resolved.allowed).includes(opId), `operational ${opId} must be hidden`);
  }
});

test("kitchen role only unlocks the kitchen operational module", () => {
  const resolved = resolveStaffModules(new Set(["attendance.clock", "kitchen.view", "orders.view"]));
  assert.ok(ids(resolved.allowed).includes("kitchen"));
  assert.ok(!ids(resolved.allowed).includes("cashier"));
  assert.ok(!ids(resolved.allowed).includes("accounting"));
  assert.ok(ids(resolved.nav).includes("kitchen"));
  assert.equal(resolved.nav[0]?.id, "home");
  assert.equal(resolved.nav.at(-1)?.id, "profile");
});

test("cashier role unlocks payments and table modules per granted permissions", () => {
  const resolved = resolveStaffModules(new Set(["payments.confirm", "tables.manage"]));
  assert.ok(ids(resolved.allowed).includes("cashier"));
  assert.ok(ids(resolved.allowed).includes("service"));
  assert.ok(!ids(resolved.allowed).includes("kitchen"));
});

test("nav never exceeds the max tab count and pushes extras to overflow", () => {
  // Owner-like: every gate permission present.
  const allGates = STAFF_MODULES.map((m) => m.gate).filter((g): g is NonNullable<typeof g> => g !== null);
  const resolved = resolveStaffModules(new Set<string>(allGates));
  assert.ok(resolved.nav.length <= STAFF_NAV_MAX);
  assert.ok(resolved.overflow.length > 0, "extra modules should overflow, not vanish");
  // Highest-priority operational (ops) wins a nav slot for multi-permission accounts.
  assert.ok(ids(resolved.nav).includes("ops"));
  // No module is lost: nav + overflow == allowed.
  assert.equal(resolved.nav.length + resolved.overflow.length, resolved.allowed.length);
});

test("manager keeps schedule/requests reachable (nav or overflow)", () => {
  const resolved = resolveStaffModules(new Set(["approvals.review", "shifts.assign", "staff.view"]));
  const reachable = new Set(ids(resolved.allowed));
  assert.ok(reachable.has("schedule"));
  assert.ok(reachable.has("requests"));
  assert.ok(reachable.has("ops"));
});
