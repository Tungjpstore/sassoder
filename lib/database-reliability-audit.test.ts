import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDir = "supabase/migrations";
const migrationFiles = readdirSync(migrationsDir)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
const schemaSql = readFileSync("supabase/schema.sql", "utf8");
const migrationLog = readFileSync("MIGRATION_LOG.md", "utf8");
const anonExposureBoundary = "20260519092131_restrict_public_store_branch_reads.sql";

function migrationSql(fileName: string) {
  return readFileSync(`${migrationsDir}/${fileName}`, "utf8");
}

function gitOutput(args: string[]) {
  try {
    return execFileSync("git", args, { encoding: "utf8" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`Git migration contract command failed: git ${args.join(" ")} (${message})`);
  }
}

function lineNumber(sql: string, index: number) {
  return sql.slice(0, index).split("\n").length;
}

test("migration files have monotonic unique timestamps", () => {
  const invalidNames = migrationFiles.filter((fileName) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(fileName));
  assert.deepEqual(invalidNames, []);

  const timestamps = migrationFiles.map((fileName) => fileName.slice(0, 14));
  assert.deepEqual(timestamps, [...timestamps].sort());
  assert.equal(new Set(timestamps).size, timestamps.length);
});

test("migration inventory matches local and Git tracked state", () => {
  const gitTrackedPaths = gitOutput(["ls-files", "--", "supabase/migrations/*.sql"])
    .split("\n")
    .filter(Boolean);
  const untrackedMigrationPaths = gitOutput(["status", "--short", "--untracked-files=all", "--", "supabase/migrations"])
    .split("\n")
    .map((line) => line.trim().match(/^\?\?\s+(.+\.sql)$/)?.[1])
    .filter((path): path is string => path !== undefined);
  const localPaths = migrationFiles.map((fileName) => `${migrationsDir}/${fileName}`);
  const gitTrackedPathsSorted = [...gitTrackedPaths].sort();
  const latestMigration = migrationFiles.at(-1);

  assert.deepEqual(
    untrackedMigrationPaths,
    [],
    `SQL migrations must be staged before this contract can pass: ${untrackedMigrationPaths.join(", ")}`
  );
  assert.ok(latestMigration, "Expected at least one local SQL migration");
  const latestMigrationPath = `${migrationsDir}/${latestMigration}`;
  assert.ok(gitTrackedPathsSorted.includes(latestMigrationPath), `Latest migration is missing from Git inventory: ${latestMigrationPath}`);
  assert.deepEqual(gitTrackedPathsSorted, [...localPaths].sort());
});

test("migration history is append-only", () => {
  const removedOrRenamedPaths = gitOutput(["diff", "--name-status", "--find-renames", "HEAD", "--", migrationsDir])
    .split("\n")
    .filter((line) => /^(?:D|R\d*)\t/.test(line));

  assert.deepEqual(removedOrRenamedPaths, [], "Existing migration files cannot be deleted or renamed");
});

test("migration history never deletes or renames files", () => {
  const historicalRemovedOrRenamedPaths = gitOutput([
    "log",
    "HEAD",
    "--format=",
    "--name-status",
    "--diff-filter=DR",
    "--find-renames",
    "--full-history",
    "--",
    migrationsDir
  ])
    .split("\n")
    .filter((line) => /^(?:D|R\d*)\t/.test(line));

  assert.deepEqual(historicalRemovedOrRenamedPaths, [], "Migration history cannot delete or rename existing files");
});

test("schema snapshot has no public tenant helper calls", () => {
  assert.doesNotMatch(schemaSql, /\bpublic\.current_(restaurant_id|user_role)\(\)/);
  assert.match(schemaSql, /create schema if not exists app_private/i);
  assert.match(schemaSql, /grant execute on function app_private\.current_restaurant_id\(\) to authenticated, service_role/i);
  assert.match(schemaSql, /grant execute on function app_private\.current_user_role\(\) to authenticated, service_role/i);
  assert.match(schemaSql, /create index users_lower_email_idx on public\.users \(lower\(email\)\)/i);
});

test("schema snapshot exposes only intentional anon surfaces", () => {
  const anonPolicies = [...schemaSql.matchAll(/create policy\s+"([^"]+)"[\s\S]*?;/gi)]
    .filter((match) => /\bto\s+(public|anon)\b|\bto\s+[^;\n]*\banon\b/i.test(match[0]))
    .map((match) => ({
      line: lineNumber(schemaSql, match.index ?? 0),
      name: match[1],
      sql: match[0].replace(/\s+/g, " ").trim()
    }));

  assert.deepEqual(
    anonPolicies.map((policy) => policy.name).sort(),
    ["anon can receive customer order broadcasts", "public can read menu images"].sort()
  );
  assert.ok(anonPolicies.every((policy) => /storage\.objects|realtime\.messages/i.test(policy.sql)), JSON.stringify(anonPolicies));
  assert.doesNotMatch(schemaSql, /public can read active store branches/i);
});

test("late migrations do not reopen public table policies to anon", () => {
  const offenders: string[] = [];

  for (const fileName of migrationFiles.filter((fileName) => fileName > anonExposureBoundary)) {
    const sql = migrationSql(fileName);
    for (const match of sql.matchAll(/create policy\s+"([^"]+)"[\s\S]*?;/gi)) {
      const policySql = match[0];
      if (
        /on\s+public\./i.test(policySql) &&
        (/\bto\s+(public|anon)\b/i.test(policySql) || /\bto\s+[^;\n]*\banon\b/i.test(policySql))
      ) {
        offenders.push(`${fileName}:${lineNumber(sql, match.index ?? 0)}:${match[1]}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("public views do not bypass tenant RLS", () => {
  const latestDefinitions = new Map<string, { fileName: string; line: number; sql: string }>();

  for (const fileName of migrationFiles) {
    const sql = migrationSql(fileName);
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.([a-z0-9_]+)[\s\S]*?;/gi)) {
      latestDefinitions.set(match[1], {
        fileName,
        line: lineNumber(sql, match.index ?? 0),
        sql: match[0]
      });
    }
  }

  const offenders = Array.from(latestDefinitions, ([viewName, definition]) => ({ viewName, ...definition }))
    .filter((definition) => !/security_invoker\s*=\s*true/i.test(definition.sql))
    .map((definition) => `${definition.fileName}:${definition.line}:${definition.viewName}`);

  assert.deepEqual(offenders, []);
});

test("destructive data operations are explicitly allowlisted", () => {
  const destructiveDataLines: string[] = [];

  for (const fileName of migrationFiles) {
    const sql = migrationSql(fileName);
    sql.split("\n").forEach((line, index) => {
      if (/\b(truncate|delete\s+from|drop\s+table)\b/i.test(line)) {
        destructiveDataLines.push(`${fileName}:${index + 1}:${line.trim()}`);
      }
    });
  }

  const allowed = destructiveDataLines.filter(
    (line) =>
      /20260507101500_auth_rate_limits_and_recovery\.sql:\d+:\s*delete from public\.auth_rate_limits/i.test(line) ||
      /20260510210000_order_lifecycle_hardening\.sql:\d+:\s*delete from public\.orders/i.test(line) ||
      /20260516165316_inventory_po_receiving_v2\.sql:\d+:\s*drop table if exists pg_temp\.po_receipt_requests/i.test(line) ||
      /20260519190000_platform_admin_governance_hardening\.sql:\d+:\s*delete from public\.platform_admin_role_permissions/i.test(line) ||
      /20260605093000_telegram_single_tenant_connection_lock\.sql:\d+:\s*delete from public\.telegram_sessions ts/i.test(line) ||
      /20260722100000_staff_owner_boundary_hardening\.sql:\d+:\s*delete from public\.staff_role_permissions permissions/i.test(line) ||
      /20260723193000_staff_payroll_atomic_regeneration\.sql:\d+:\s*delete from public\.staff_payslips/i.test(line)
  );

  assert.deepEqual(destructiveDataLines, allowed);
});

test("migration log records backup restore and rollback expectations", () => {
  assert.match(migrationLog, /Backup \/ Restore \/ Rollback/i);
  assert.match(migrationLog, /supabase db dump/i);
  assert.match(migrationLog, /restore rehearsal/i);
  assert.match(migrationLog, /point-in-time recovery/i);
});
