import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@/lib/response";
import { assertPublicTenantActive, isPublicTenantActive } from "@/services/tenant-status-guard";

test("isPublicTenantActive allows active tenants without soft delete", () => {
  assert.equal(isPublicTenantActive({ platform_status: "active", deleted_at: null }), true);
  assert.equal(isPublicTenantActive({ deleted_at: null }), true);
});

test("isPublicTenantActive blocks suspended, deleted, and soft-deleted tenants", () => {
  assert.equal(isPublicTenantActive({ platform_status: "suspended", deleted_at: null }), false);
  assert.equal(isPublicTenantActive({ platform_status: "deleted", deleted_at: null }), false);
  assert.equal(isPublicTenantActive({ platform_status: "active", deleted_at: "2026-05-19T00:00:00.000Z" }), false);
  assert.equal(isPublicTenantActive(null), false);
});

test("assertPublicTenantActive hides inactive tenants as not found", () => {
  assert.throws(
    () => assertPublicTenantActive({ platform_status: "suspended", deleted_at: null }),
    (error) => error instanceof AppError && error.status === 404 && error.message === "Không tìm thấy quán"
  );
});
