import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateNpmAuditReport } from "./dependency-audit-policy.mjs";
import { evaluateReleaseQaSignoff, releasePreflightExitCode } from "./release-readiness-policy.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
const writeReport = args.has("--write");
const strict = args.has("--strict");
const reportOnly = args.has("--report-only");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const qaMaxAgeDays = 14;

const releaseEnv = readEnvFiles([
  ".env.release.local",
  ".vercel/.env.production.local"
]);

const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  releaseEnv.SUPABASE_PROJECT_REF ||
  readIfExists(path.join(rootDir, "supabase/.temp/project-ref"))?.trim() ||
  "";

const checks = [];
const evidence = {
  generatedAt: new Date().toISOString(),
  projectRef,
  mode: reportOnly ? "report-only" : strict ? "strict" : "blocking",
  commands: {}
};

function readIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8");
}

function readEnvFiles(files) {
  const env = {};

  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath)) continue;

    for (const rawLine of readFileSync(absolutePath, "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
      env[key] = value;
    }
  }

  return env;
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 60_000,
    env: process.env
  });

  return {
    command: [command, ...commandArgs].join(" "),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut: result.error?.code === "ETIMEDOUT",
    error: result.error?.message ?? null
  };
}

function parseJsonFragment(text) {
  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const starts = [firstObject, firstArray].filter((index) => index >= 0);
  if (starts.length === 0) return null;

  const start = Math.min(...starts);
  for (let end = text.length; end > start; end -= 1) {
    const candidate = text.slice(start, end).trim();
    if (!candidate.endsWith("}") && !candidate.endsWith("]")) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trimming trailing CLI notices until a valid JSON fragment is found.
    }
  }

  return null;
}

function addCheck(id, status, summary, details = {}) {
  checks.push({ id, status, summary, ...details });
}

function hasValue(key) {
  const value = process.env[key] ?? releaseEnv[key];
  return typeof value === "string" && value.trim() !== "";
}

function vercelProductionEnvNames() {
  const result = run("npx", ["--yes", "vercel", "env", "list", "production"], { timeoutMs: 120_000 });
  evidence.commands.vercelStaffHrEnv = result;

  if (result.status !== 0) {
    return { names: new Set(), error: summarizeCommandError(result) };
  }

  const names = new Set();
  const output = result.stdout.replace(/\x1b\[[0-9;]*m/g, "");
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]+)\s+Encrypted\s+Production\b/);
    if (match?.[1]) names.add(match[1]);
  }

  return { names, error: null };
}

function migrationStats() {
  const migrationsDir = path.join(rootDir, "supabase/migrations");
  if (!existsSync(migrationsDir)) return { count: 0, duplicateVersions: [] };

  const versions = new Map();
  const files = readdirSync(migrationsDir).filter((entry) => entry.endsWith(".sql")).sort();
  for (const file of files) {
    const version = file.match(/^(\d{14})_/)?.[1];
    if (!version) continue;
    versions.set(version, [...(versions.get(version) ?? []), file]);
  }

  return {
    count: files.length,
    latest: files.at(-1) ?? null,
    duplicateVersions: [...versions.entries()]
      .filter(([, filesForVersion]) => filesForVersion.length > 1)
      .map(([version, filesForVersion]) => `${version}: ${filesForVersion.join(", ")}`)
  };
}

function dependencyReadiness() {
  const audit = run("npm", ["audit", "--audit-level=high", "--json"], { timeoutMs: 120_000 });
  evidence.commands.npmAudit = audit;
  const report = parseJsonFragment(`${audit.stdout}\n${audit.stderr}`);
  if (!report) {
    addCheck("dependency-audit", "block", "npm audit did not return parseable JSON.", {
      error: summarizeCommandError(audit)
    });
    return;
  }

  const evaluation = evaluateNpmAuditReport(report);
  addCheck("dependency-audit", evaluation.status, evaluation.summary, {
    counts: evaluation.counts
  });
}

function localGitStatus() {
  const status = run("git", ["status", "--short", "--branch"], { timeoutMs: 15_000 });
  evidence.commands.gitStatus = status;
  const lines = status.stdout.trim().split("\n").filter(Boolean);
  const dirtyLines = lines.filter((line) => !line.startsWith("## "));
  return { ok: status.status === 0, lines, dirtyLines };
}

function currentReleaseGitContext() {
  const githubEnv = (suffix) => process.env[["GITHUB", ...suffix].join("_")]?.trim() || "";
  let branch = githubEnv(["HEAD", "REF"]) || githubEnv(["REF", "NAME"]);
  let commit = githubEnv(["SHA"]);

  if (!branch) {
    const branchResult = run("git", ["branch", "--show-current"], { timeoutMs: 15_000 });
    evidence.commands.gitCurrentBranch = branchResult;
    if (branchResult.status === 0) branch = branchResult.stdout.trim();
  }

  if (!commit) {
    const commitResult = run("git", ["rev-parse", "HEAD"], { timeoutMs: 15_000 });
    evidence.commands.gitCurrentCommit = commitResult;
    if (commitResult.status === 0) commit = commitResult.stdout.trim();
  }

  return { branch, commit };
}

function supabaseReadiness() {
  if (!projectRef) {
    addCheck("supabase-project", "block", "SUPABASE_PROJECT_REF is missing and supabase/.temp/project-ref was not found.");
    return;
  }

  addCheck("supabase-project", "pass", `Using Supabase project ${projectRef}.`);

  const branches = run("supabase", ["branches", "list", "--project-ref", projectRef, "-o", "json"], { timeoutMs: 45_000 });
  evidence.commands.supabaseBranches = branches;
  const branchJson = parseJsonFragment(branches.stdout);
  evidence.supabaseBranches = branchJson;

  if (branches.status !== 0 || !Array.isArray(branchJson)) {
    addCheck("supabase-branches", "block", "Could not read Supabase branch status.", {
      error: summarizeCommandError(branches)
    });
  } else {
    const previewBranches = branchJson.filter((branch) => branch.is_default !== true);
    addCheck(
      "supabase-branches",
      previewBranches.length > 0 ? "pass" : "warn",
      previewBranches.length > 0
        ? `${previewBranches.length} non-default Supabase branch(es) are available for rehearsal.`
        : "No non-default Supabase branch is available. Use a separate staging project or enable Branching for future migration rehearsals."
    );
  }

  let dryRunState = "unknown";
  if (process.env.RELEASE_SKIP_SUPABASE_DRY_RUN === "1") {
    dryRunState = "skipped";
    addCheck("supabase-dry-run", "warn", "Skipped Supabase migration dry-run because RELEASE_SKIP_SUPABASE_DRY_RUN=1.");
  } else {
    const dryRun = run("supabase", ["db", "push", "--dry-run", "--linked", "--yes"], { timeoutMs: 90_000 });
    evidence.commands.supabaseDryRun = dryRun;
    const combinedOutput = `${dryRun.stdout}\n${dryRun.stderr}`;
    const upToDate = combinedOutput.includes("Remote database is up to date");
    const wouldApply = combinedOutput.includes("Would apply") || combinedOutput.includes("Applying migration");

    if (dryRun.status === 0 && upToDate) {
      dryRunState = "up-to-date";
      addCheck("supabase-dry-run", "pass", "Supabase dry-run reports the remote database is up to date.");
    } else if (dryRun.status === 0 && wouldApply) {
      dryRunState = "pending";
      addCheck("supabase-dry-run", "block", "Supabase dry-run reports pending migrations; rehearse them before production apply.");
    } else if (dryRun.status === 0) {
      dryRunState = "unknown";
      addCheck("supabase-dry-run", "warn", "Supabase dry-run completed, but output was not recognized. Review the attached command output.");
    } else {
      dryRunState = "failed";
      addCheck("supabase-dry-run", "block", "Supabase dry-run failed.", { error: summarizeCommandError(dryRun) });
    }
  }
  evidence.supabaseDryRunState = dryRunState;

  const backups = run("supabase", ["backups", "list", "--project-ref", projectRef, "-o", "json"], { timeoutMs: 45_000 });
  evidence.commands.supabaseBackups = backups;
  const backupJson = parseJsonFragment(backups.stdout);
  evidence.supabaseBackups = backupJson;

  if (backups.status !== 0 || !backupJson) {
    addCheck("supabase-backups", "block", "Could not read Supabase backup/PITR status.", {
      error: summarizeCommandError(backups)
    });
  } else if (backupJson.pitr_enabled === true || backupJson.pitr === true) {
    addCheck("supabase-backups", "pass", "Supabase PITR is enabled.");
  } else {
    const backupCount = Array.isArray(backupJson.backups) ? backupJson.backups.length : 0;
    const codeOnlyRelease = dryRunState === "up-to-date";
    addCheck(
      "supabase-backups",
      codeOnlyRelease ? "warn" : "block",
      codeOnlyRelease
        ? `Supabase PITR is not enabled and ${backupCount} physical backup artifact(s) were listed. No pending migrations were detected, so this is a code-only release warning rather than a deploy blocker.`
        : `Supabase PITR is not enabled and ${backupCount} physical backup artifact(s) were listed. Capture a schema/data dump or enable PITR before any risky production migration.`
    );
  }
}

function dockerAndDumpReadiness() {
  const docker = run("docker", ["info", "--format", "{{json .ServerVersion}}"], { timeoutMs: 15_000 });
  evidence.commands.dockerInfo = docker;

  if (docker.status === 0 && docker.stdout.trim()) {
    addCheck("docker-daemon", "pass", "Docker daemon is reachable for Supabase CLI dump workflows.");
  } else {
    addCheck("docker-daemon", "warn", "Docker daemon is not reachable; Supabase CLI dump will fail until Docker is running.");
  }

  const pgDump = run("sh", ["-lc", "command -v pg_dump"], { timeoutMs: 10_000 });
  evidence.commands.pgDump = pgDump;
  addCheck(
    "pg-dump",
    pgDump.status === 0 ? "pass" : "warn",
    pgDump.status === 0
      ? "pg_dump is available as a non-Docker fallback when DATABASE_URL is supplied."
      : "pg_dump is not available; use Docker/Supabase CLI or install PostgreSQL client tools for direct dumps."
  );

  const schemaDump = latestSchemaDumpArtifact();
  evidence.schemaDumpArtifact = schemaDump;
  addCheck(
    "schema-dump-artifact",
    schemaDump ? "pass" : "warn",
    schemaDump
      ? `Schema dump artifact exists at ${schemaDump.relativePath} (${schemaDump.sizeBytes} bytes). This does not replace PITR or a full data backup.`
      : "No schema dump artifact was found under reports/release/. Run supabase db dump after Docker is available if schema proof is required."
  );
}

function latestSchemaDumpArtifact() {
  const reportDir = path.join(rootDir, "reports/release");
  if (!existsSync(reportDir)) return null;

  const candidates = readdirSync(reportDir)
    .filter((entry) => /^pre-release-schema-.*\.sql$/.test(entry))
    .map((entry) => {
      const absolutePath = path.join(reportDir, entry);
      const stats = statSync(absolutePath);
      return {
        relativePath: path.relative(rootDir, absolutePath),
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs
      };
    })
    .filter((candidate) => candidate.sizeBytes > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return candidates[0] ?? null;
}

function qaReadiness({ currentBranch, currentCommit, currentMigrationCount }) {
  const qaPath = path.join(rootDir, "RELEASE_QA_SIGNOFF.md");
  if (!existsSync(qaPath)) {
    addCheck("authenticated-qa", "block", "RELEASE_QA_SIGNOFF.md is missing.");
    return;
  }

  const qaText = readFileSync(qaPath, "utf8");
  const evaluation = evaluateReleaseQaSignoff({
    text: qaText,
    currentBranch,
    currentCommit,
    currentMigrationCount,
    now: new Date(evidence.generatedAt),
    maxAgeDays: qaMaxAgeDays
  });
  evidence.qaSignoff = {
    status: evaluation.status,
    date: evaluation.date,
    migrationCount: evaluation.migrationCount,
    currentBranch,
    currentCommit,
    maxAgeDays: qaMaxAgeDays,
    blockers: evaluation.blockers
  };
  addCheck(
    "authenticated-qa",
    evaluation.ok ? "pass" : "block",
    evaluation.ok
      ? `Authenticated QA sign-off is approved, current, and matches ${currentBranch} at ${currentCommit}.`
      : `Authenticated QA sign-off failed ${evaluation.blockers.length} release policy check(s).`,
    { reasons: evaluation.blockers.map((item) => item.message) }
  );
}

function monitoringReadiness() {
  const requiredEnv = [
    "MONITORING_WATCH_OWNER",
    "MONITORING_ALERT_EMAIL",
    "MONITORING_LOG_DRAIN_DESTINATION",
    "MONITORING_5XX_THRESHOLD",
    "MONITORING_FIRST_HOUR_WATCH_START",
    "MONITORING_FIRST_HOUR_WATCH_OWNER"
  ];
  const missingEnv = requiredEnv.filter((key) => !hasValue(key));
  const runbookPath = path.join(rootDir, "MONITORING_ALERTING_RUNBOOK.md");
  const runbookText = readIfExists(runbookPath) ?? "";
  const runbookPending = !runbookText || /\b(TBD|Pending|Missing|TODO)\b/i.test(runbookText);

  if (missingEnv.length === 0 && !runbookPending) {
    addCheck("monitoring-alerting", "pass", "Monitoring owner, alert route, log drain and first-hour watch plan are recorded.");
    return;
  }

  addCheck("monitoring-alerting", "block", "Monitoring/alerting sign-off is incomplete.", {
    missingEnv,
    runbook: runbookText ? "present" : "missing",
    runbookPending
  });
}

function staffHrEnvReadiness() {
  const requiredEnv = ["STAFF_ATTENDANCE_QR_SECRET", "STAFF_ATTENDANCE_SESSION_SECRET", "STAFF_PIN_PEPPER"];
  const missingLocalEnv = requiredEnv.filter((key) => !hasValue(key));

  if (missingLocalEnv.length === 0) {
    addCheck("staff-hr-secrets", "pass", "Staff HR attendance QR, session and PIN secrets are configured for release preflight.", {
      source: "local-release-env"
    });
    return;
  }

  const vercelEnv = vercelProductionEnvNames();
  const missingEnv = requiredEnv.filter((key) => !hasValue(key) && !vercelEnv.names.has(key));

  if (missingEnv.length === 0) {
    addCheck("staff-hr-secrets", "pass", "Staff HR attendance QR, session and PIN secrets are configured in Vercel Production.", {
      source: "vercel-production-env"
    });
    return;
  }

  addCheck("staff-hr-secrets", "block", "Staff HR production secrets are incomplete; QR/session/PIN staff flows are not release-ready.", {
    missingEnv,
    missingLocalEnv,
    vercelEnvList: vercelEnv.error ? `unavailable: ${vercelEnv.error}` : "checked"
  });
}

function summarizeCommandError(result) {
  const output = `${result.stderr}\n${result.stdout}`.trim();
  if (result.timedOut) return "Command timed out.";
  if (result.error) return result.error;
  return output.split("\n").slice(0, 6).join("\n");
}

function markdownReport() {
  const lines = [
    "# Release External Blockers Evidence",
    "",
    `Generated: ${evidence.generatedAt}`,
    `Supabase project: ${projectRef || "missing"}`,
    "",
    "## Summary",
    "",
    "| ID | Status | Summary |",
    "| --- | --- | --- |"
  ];

  for (const check of checks) {
    lines.push(`| ${check.id} | ${check.status.toUpperCase()} | ${escapeTable(check.summary)} |`);
  }

  const blockers = checks.filter((check) => check.status === "block");
  const warnings = checks.filter((check) => check.status === "warn");

  const checksWithReasons = checks.filter((check) => Array.isArray(check.reasons) && check.reasons.length > 0);
  if (checksWithReasons.length > 0) {
    lines.push("", "## Check Details", "");
    for (const check of checksWithReasons) {
      lines.push(`### ${check.id}`, "");
      for (const reason of check.reasons) lines.push(`- ${reason}`);
      lines.push("");
    }
  }

  lines.push("", "## Release Decision", "");
  if (blockers.length > 0) {
    lines.push(`NO-GO: ${blockers.length} blocker(s) remain.`);
  } else if (warnings.length > 0) {
    lines.push(`CONDITIONAL GO: no blocking checks failed, but ${warnings.length} warning(s) need release-owner review.`);
  } else {
    lines.push("GO: no blockers or warnings were detected by this preflight.");
  }

  lines.push("", "## Command Evidence", "");
  for (const [name, result] of Object.entries(evidence.commands)) {
    lines.push(`### ${name}`, "", "```text", `$ ${result.command}`);
    const output = `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
    lines.push(output || `(exit ${result.status ?? "unknown"})`, "```", "");
  }

  return `${lines.join("\n")}\n`;
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

const git = localGitStatus();
if (!git.ok) {
  addCheck("git-status", "block", "Could not read git status.");
} else if (git.dirtyLines.length > 0) {
  addCheck("git-status", "warn", `Worktree has ${git.dirtyLines.length} changed/untracked file(s); release artifact must be clean before production.`);
} else {
  addCheck("git-status", "pass", "Worktree is clean.");
}

const migrations = migrationStats();
evidence.migrations = migrations;
addCheck(
  "migration-files",
  migrations.duplicateVersions.length === 0 ? "pass" : "block",
  migrations.duplicateVersions.length === 0
    ? `${migrations.count} SQL migration file(s); latest is ${migrations.latest ?? "none"}; no duplicate versions found.`
    : `Duplicate migration version(s): ${migrations.duplicateVersions.join("; ")}`
);

const releaseGit = currentReleaseGitContext();
evidence.releaseGit = releaseGit;

dependencyReadiness();
supabaseReadiness();
dockerAndDumpReadiness();
qaReadiness({
  currentBranch: releaseGit.branch,
  currentCommit: releaseGit.commit,
  currentMigrationCount: migrations.count
});
monitoringReadiness();
staffHrEnvReadiness();

const report = markdownReport();

if (writeReport) {
  const reportDir = path.join(rootDir, "reports/release");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(path.join(reportDir, `external-blockers-${timestamp}.md`), report);
  writeFileSync(path.join(reportDir, `external-blockers-${timestamp}.json`), `${JSON.stringify({ evidence, checks }, null, 2)}\n`);
}

console.log(report);

const hasBlockers = checks.some((check) => check.status === "block");
process.exitCode = releasePreflightExitCode({ hasBlockers, reportOnly });
