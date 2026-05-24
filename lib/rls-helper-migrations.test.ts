import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDir = "supabase/migrations";
const rewriteBoundary = "20260513072500_rewrite_unqualified_rls_helpers_after_inventory.sql";
const operationsRepairMigration = "20260518073000_rewrite_public_rls_helpers_after_operations.sql";
const branchAnonRestrictionMigration = "20260519092131_restrict_public_store_branch_reads.sql";
const schemaSql = readFileSync("supabase/schema.sql", "utf8");

function migrationSql(fileName: string) {
  return readFileSync(`${migrationsDir}/${fileName}`, "utf8");
}

test("late feature migrations create RLS policies with private tenant helpers", () => {
  const offenders = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .filter((fileName) => fileName > rewriteBoundary)
    .filter((fileName) => fileName !== operationsRepairMigration)
    .filter((fileName) => /public\.current_(restaurant_id|user_role)\(\)/.test(migrationSql(fileName)));

  assert.deepEqual(offenders, []);
});

test("schema snapshot keeps tenant RLS helpers private", () => {
  assert.match(schemaSql, /create schema if not exists app_private/i);
  assert.match(schemaSql, /create or replace function app_private\.current_restaurant_id\(\)/i);
  assert.match(schemaSql, /create or replace function app_private\.current_user_role\(\)/i);
  assert.match(schemaSql, /grant execute on function app_private\.current_restaurant_id\(\) to authenticated, service_role/i);
  assert.match(schemaSql, /grant execute on function app_private\.current_user_role\(\) to authenticated, service_role/i);
  assert.doesNotMatch(schemaSql, /\bpublic\.current_(restaurant_id|user_role)\(\)/);
});

test("store branches are not directly exposed to anon clients", () => {
  const sql = migrationSql(branchAnonRestrictionMigration);

  assert.doesNotMatch(schemaSql, /public can read active store branches/i);
  assert.match(sql, /drop policy if exists "public can read active store branches" on public\.store_branches/i);
  assert.match(sql, /roles && array\['anon'::name, 'public'::name\]/i);
  assert.match(sql, /raise exception 'store_branches still has anon\/public read policy'/i);
});

test("operations repair migration rewrites active public and unqualified RLS helpers", () => {
  const sql = migrationSql(operationsRepairMigration);

  assert.match(sql, /grant usage on schema app_private to authenticated, service_role/i);
  assert.match(sql, /regexp_replace\([\s\S]*current_restaurant_id\\\(\\\)/i);
  assert.match(sql, /regexp_replace\([\s\S]*current_user_role\\\(\\\)/i);
  assert.match(sql, /raise exception 'RLS policies still reference public tenant helper functions'/i);
});
