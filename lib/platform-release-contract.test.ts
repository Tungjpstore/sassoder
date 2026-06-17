import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return listRouteFiles(path);
      return path.endsWith("/route.ts") ? [path] : [];
    })
    .sort();
}

function listCodeFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return listCodeFiles(path);
      return /\.(ts|tsx)$/.test(path) ? [path] : [];
    })
    .sort();
}

function routeSource(path: string) {
  return readFileSync(path, "utf8");
}

test("admin API routes are protected by dashboard session guards", () => {
  const offenders = listRouteFiles("app/api/admin").filter((path) => {
    const source = routeSource(path);
    return !/require(?:Operational)?DashboardApiSession\(|getSessionProfile\(|requireSession\(|assertAdmin\(/.test(source);
  });

  assert.deepEqual(offenders, []);
});

test("admin API mutations enforce same-origin requests", () => {
  const offenders = listRouteFiles("app/api/admin").filter((path) => {
    const source = routeSource(path);
    const mutates = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(source);
    return mutates && !/assertSameOriginRequest\(/.test(source);
  });

  assert.deepEqual(offenders, []);
});

test("cron and internal API routes keep explicit machine-to-machine guards", () => {
  const cronOffenders = listRouteFiles("app/api/cron").filter((path) => !/assertCronSecret\(/.test(routeSource(path)));
  const internalOffenders = listRouteFiles("app/api/internal").filter(
    (path) => !/assertInternal(?:ApiKey|BackupRequest)\(/.test(routeSource(path))
  );

  assert.deepEqual(cronOffenders, []);
  assert.deepEqual(internalOffenders, []);
});

test("Next production builds fail on TypeScript errors", () => {
  const nextConfig = readFileSync("next.config.ts", "utf8");
  assert.doesNotMatch(nextConfig, /ignoreBuildErrors\s*:\s*true/);
});

test("production dashboard surfaces never import demo workspaces", () => {
  const productionFiles = [
    ...listCodeFiles("app/dashboard"),
    ...listCodeFiles("components/dashboard-v2/real")
  ];
  const offenders = productionFiles.filter((path) => /dashboard-v2\/demo/.test(routeSource(path)));

  assert.deepEqual(offenders, []);
});

test("LogiBot page does not turn branch data failures into empty real data", () => {
  const pageSource = routeSource("app/dashboard/logibot-ai/page.tsx");
  const workspaceSource = routeSource("components/dashboard/logibot-ai-workspace.tsx");

  assert.doesNotMatch(pageSource, /listActiveStoreBranches\([^)]*\)\.catch\(\(\) => \[\]\)/);
  assert.match(pageSource, /branchDataError/);
  assert.match(workspaceSource, /branchDataError/);
});

test("menu recipe inventory failures are visible instead of empty recipe data", () => {
  const pageSource = routeSource("app/dashboard/menu/page.tsx");
  const workspaceSource = routeSource("components/dashboard-v2/real/menu-workspace-v2.tsx");

  assert.doesNotMatch(pageSource, /listInventoryIngredients\([^)]*\)\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(pageSource, /listInventoryRecipeMenuItems\([^)]*\)\.catch\(\(\) => \[\]\)/);
  assert.match(pageSource, /inventoryDataError/);
  assert.match(workspaceSource, /Không thể hiển thị công thức bằng dữ liệu thật/);
});
