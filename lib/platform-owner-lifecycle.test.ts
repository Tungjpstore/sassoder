import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { platformUserBlockIssue, tenantActivationOwnerIssue } from "./platform-owner-lifecycle";

const validOwnerState = {
  tenantId: "tenant-a",
  tenantStatus: "suspended" as const,
  ownerUserId: "owner-a",
  ownerTenantId: "tenant-a",
  ownerRole: "ADMIN" as const,
  ownerAccountStatus: "active" as const,
  ownerStaffRoleCode: "owner",
  ownerEmploymentStatus: "active",
  ownerStaffArchivedAt: null
};

test("tenant activation requires a resolved active canonical owner", () => {
  assert.equal(tenantActivationOwnerIssue(validOwnerState), null);
  assert.match(tenantActivationOwnerIssue({ ...validOwnerState, ownerUserId: null }) ?? "", /chưa có canonical owner/);
  assert.match(tenantActivationOwnerIssue({ ...validOwnerState, ownerAccountStatus: "blocked" }) ?? "", /đang bị khóa/);
  assert.match(tenantActivationOwnerIssue({ ...validOwnerState, ownerStaffRoleCode: "manager" }) ?? "", /không hợp lệ/);
  assert.match(tenantActivationOwnerIssue({ ...validOwnerState, ownerStaffArchivedAt: "2026-07-23T00:00:00.000Z" }) ?? "", /không hoạt động/);
});

test("an active tenant owner cannot be blocked before suspension or ownership transfer", () => {
  assert.match(platformUserBlockIssue({ targetUserId: "owner-a", ownerUserId: "owner-a", tenantStatus: "active" }) ?? "", /Không thể khóa/);
  assert.equal(platformUserBlockIssue({ targetUserId: "manager-a", ownerUserId: "owner-a", tenantStatus: "active" }), null);
  assert.equal(platformUserBlockIssue({ targetUserId: "owner-a", ownerUserId: "owner-a", tenantStatus: "suspended" }), null);
});

test("platform lifecycle mutations call the canonical owner guards", () => {
  const source = readFileSync("services/platform-admin-service.ts", "utf8");
  assert.match(source, /tenantActivationOwnerIssue/);
  assert.match(source, /platformUserBlockIssue/);
  assert.match(source, /owner_user_id/);
});
