import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync("lib/platform-admin-auth.ts", "utf8");
const adminActionsSource = readFileSync("features/platform-admin/actions.ts", "utf8");
const adminPageSource = readFileSync("app/platform-control/[[...path]]/page.tsx", "utf8");
const adminConsoleSource = readFileSync("components/admin/platform-admin-console.tsx", "utf8");
const devopsSectionsSource = readFileSync("features/platform-admin/components/sections/devops-sections.tsx", "utf8");
const tenantSectionSource = readFileSync("features/platform-admin/components/sections/tenants-section.tsx", "utf8");
const userSectionSource = readFileSync("features/platform-admin/components/sections/users-section.tsx", "utf8");
const hardeningSql = readFileSync("supabase/migrations/20260519190000_platform_admin_governance_hardening.sql", "utf8");

test("platform admin RBAC splits tenant and user destructive permissions", () => {
  for (const permission of ["tenants.suspend", "tenants.restore", "tenants.delete", "users.block", "users.restore"]) {
    assert.match(authSource, new RegExp(`"${permission.replace(".", "\\.")}"`));
    assert.match(hardeningSql, new RegExp(`'${permission.replace(".", "\\.")}'`));
  }

  assert.match(hardeningSql, /delete from public\.platform_admin_role_permissions[\s\S]*role = 'support'[\s\S]*tenants\.write[\s\S]*users\.write/i);
});

test("platform admin actions no longer authorize destructive status changes with broad write permissions", () => {
  assert.doesNotMatch(adminActionsSource, /requirePlatformAdmin\("tenants\.write"\)/);
  assert.doesNotMatch(adminActionsSource, /requirePlatformAdmin\("users\.write"\)/);
  assert.match(adminActionsSource, /status === "active"\) return "tenants\.restore"/);
  assert.match(adminActionsSource, /status === "suspended"\) return "tenants\.suspend"/);
  assert.match(adminActionsSource, /return "tenants\.delete"/);
  assert.match(adminActionsSource, /status === "active" \? "users\.restore" : "users\.block"/);
});

test("platform admin legacy owner sessions are rejected after RBAC or in production", () => {
  assert.match(authSource, /function shouldRejectLegacySession\(status: PlatformAdminAuthStatus\)/);
  assert.match(authSource, /status\.production \|\| \(status\.rbacConfigured && status\.adminUsersConfigured\)/);
  assert.match(authSource, /if \(shouldRejectLegacySession\(status\)\) return unauthenticatedSession/);
});

test("platform admin UI gates tenant and user actions by the current session permissions", () => {
  assert.match(adminPageSource, /<PlatformAdminConsole snapshot=\{snapshot\} session=\{session\}/);
  assert.match(adminConsoleSource, /<Tenants snapshot=\{snapshot\} session=\{session\}/);
  assert.match(adminConsoleSource, /<SettingsCenter snapshot=\{snapshot\} session=\{session\}/);
  assert.match(devopsSectionsSource, /<Users snapshot=\{snapshot\} session=\{session\}/);
  assert.match(tenantSectionSource, /hasPermission\(session, "tenants\.delete"\)/);
  assert.match(userSectionSource, /hasPermission\(session, "users\.block"\)/);
  assert.match(userSectionSource, /hasPermission\(session, "users\.restore"\)/);
});
