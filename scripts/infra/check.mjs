import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([
  ".agents",
  ".codex",
  ".codex-kit",
  ".git",
  ".lighthouseci",
  ".next",
  ".vercel",
  "codex",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "reports",
  "supabase/.temp"
]);
const systemEnvKeys = new Set(["NODE_ENV", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "VERCEL_REGION"]);
const appServiceRoleAllowlist = new Set(["app/api/health/route.ts"]);
const adminClientImportPatterns = [
  /from\s+["']@\/lib\/supabase\/admin["']/,
  /import\(["']@\/lib\/supabase\/admin["']\)/
];

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function collectEnvKeys(text) {
  const keys = new Set();
  const dotPattern = /process\.env\.([A-Z0-9_]+)/g;
  const bracketPattern = /process\.env\[['"]([A-Z0-9_]+)['"]\]/g;

  for (const match of text.matchAll(dotPattern)) keys.add(match[1]);
  for (const match of text.matchAll(bracketPattern)) keys.add(match[1]);

  return keys;
}

function collectSourceFiles(startDir, results = []) {
  for (const entry of readdirSync(startDir)) {
    const absolutePath = path.join(startDir, entry);
    const relativePath = path.relative(rootDir, absolutePath);
    const firstSegment = relativePath.split(path.sep)[0];

    if (
      firstSegment.startsWith(".next") ||
      [...ignoredDirectories].some((ignoredDir) => relativePath === ignoredDir || relativePath.startsWith(`${ignoredDir}${path.sep}`))
    ) {
      continue;
    }

    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      collectSourceFiles(absolutePath, results);
      continue;
    }

    if (sourceExtensions.has(path.extname(entry))) {
      results.push(absolutePath);
    }
  }

  return results;
}

function parseEnvExampleKeys() {
  const envExamplePath = path.join(rootDir, ".env.example");
  const keys = new Set();

  for (const line of readText(envExamplePath).split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) keys.add(match[1]);
  }

  return keys;
}

function validateEnvironmentContract() {
  const declaredKeys = parseEnvExampleKeys();
  const discoveredKeys = new Set();

  for (const filePath of collectSourceFiles(rootDir)) {
    for (const key of collectEnvKeys(readText(filePath))) {
      discoveredKeys.add(key);
    }
  }

  const missingKeys = [...discoveredKeys]
    .filter((key) => !systemEnvKeys.has(key) && !declaredKeys.has(key))
    .sort();

  return {
    discovered: discoveredKeys.size,
    declared: declaredKeys.size,
    missingKeys
  };
}

function cronRouteCandidates(cronPath) {
  const basePath = path.join(rootDir, "app", cronPath.replace(/^\/+/, ""));
  return [`${basePath}/route.ts`, `${basePath}/route.js`];
}

function validateCronContract() {
  const vercelConfigPath = path.join(rootDir, "vercel.json");
  const vercelConfig = JSON.parse(readText(vercelConfigPath));
  const cronEntries = Array.isArray(vercelConfig.crons) ? vercelConfig.crons : [];
  const errors = [];
  const seenPaths = new Set();

  for (const cronEntry of cronEntries) {
    if (!cronEntry?.path || !cronEntry?.schedule) {
      errors.push(`Invalid cron entry: ${JSON.stringify(cronEntry)}`);
      continue;
    }

    if (seenPaths.has(cronEntry.path)) {
      errors.push(`Duplicate cron path in vercel.json: ${cronEntry.path}`);
    }
    seenPaths.add(cronEntry.path);

    const scheduleParts = String(cronEntry.schedule).trim().split(/\s+/);
    if (scheduleParts.length !== 5) {
      errors.push(`Cron schedule must have 5 fields: ${cronEntry.path} -> ${cronEntry.schedule}`);
    }

    const routeFilePath = cronRouteCandidates(cronEntry.path).find((candidate) => existsSync(candidate));
    if (!routeFilePath) {
      errors.push(`Cron route does not exist for ${cronEntry.path}`);
      continue;
    }

    const routeSource = readText(routeFilePath);
    const requiredSnippets = [
      'export const runtime = "nodejs"',
      "export const preferredRegion",
      "export const maxDuration",
      "assertCronSecret"
    ];

    for (const snippet of requiredSnippets) {
      if (!routeSource.includes(snippet)) {
        errors.push(`${path.relative(rootDir, routeFilePath)} is missing "${snippet}"`);
      }
    }
  }

  return {
    cronCount: cronEntries.length,
    errors
  };
}

function validateRepositoryHygiene() {
  const duplicateArtifactPattern = /(?: copy(?: \d+)?| \d+)\.(?:ts|tsx|js|mjs|cjs)$/i;
  const duplicateArtifacts = collectSourceFiles(rootDir)
    .map((filePath) => path.relative(rootDir, filePath))
    .filter((relativePath) => duplicateArtifactPattern.test(path.basename(relativePath)))
    .sort();

  return {
    duplicateArtifacts
  };
}

function validateServiceRoleBoundary() {
  const appDir = path.join(rootDir, "app");
  const directAdminClientFiles = collectSourceFiles(appDir)
    .map((filePath) => ({
      filePath,
      relativePath: path.relative(rootDir, filePath)
    }))
    .filter(({ relativePath }) => !appServiceRoleAllowlist.has(relativePath))
    .filter(({ filePath }) => adminClientImportPatterns.some((pattern) => pattern.test(readText(filePath))))
    .map(({ relativePath }) => relativePath)
    .sort();

  return {
    directAdminClientFiles
  };
}

function printSection(title, lines) {
  console.log(`\n${title}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

const envCheck = validateEnvironmentContract();
const cronCheck = validateCronContract();
const hygieneCheck = validateRepositoryHygiene();
const serviceRoleCheck = validateServiceRoleBoundary();
const failures = [
  ...envCheck.missingKeys.map((key) => `Missing ${key} in .env.example`),
  ...cronCheck.errors,
  ...hygieneCheck.duplicateArtifacts.map((filePath) => `Duplicate source artifact should be removed: ${filePath}`),
  ...serviceRoleCheck.directAdminClientFiles.map(
    (filePath) => `Service-role admin client must stay behind a service boundary: ${filePath}`
  )
];

printSection("Infrastructure contract", [
  `Discovered ${envCheck.discovered} env keys in source and scripts`,
  `Declared ${envCheck.declared} env keys in .env.example`,
  `Validated ${cronCheck.cronCount} Vercel cron definitions`,
  `Scanned ${hygieneCheck.duplicateArtifacts.length} duplicate source artifacts`,
  `Validated ${serviceRoleCheck.directAdminClientFiles.length} direct app service-role violations`
]);

if (failures.length > 0) {
  printSection("Failures", failures);
  process.exit(1);
}

printSection("Status", ["Environment contract, Vercel cron wiring, source hygiene, and service-role boundaries look consistent"]);
