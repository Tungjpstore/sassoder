import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { readJsonReport, writeJsonReport, writeTextReport } from "./report-io.mjs";

const root = process.cwd();
const reportsDir = path.join(root, "reports", "seo");
const lighthouseDir = path.join(root, ".lighthouseci");

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!chromePath) {
  console.error("Không tìm thấy Chrome/Chromium để chạy Lighthouse CI.");
  console.error("Cài Google Chrome hoặc set CHROME_PATH trước khi chạy npm run lhci.");
  process.exit(1);
}

const lhciBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "lhci.cmd" : "lhci");

if (!existsSync(lhciBin)) {
  console.error("Không tìm thấy @lhci/cli trong node_modules. Hãy chạy npm install trước.");
  process.exit(1);
}

function roundScore(value) {
  return typeof value === "number" ? Math.round(value * 100) : null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeReport(report) {
  const url = new URL(report.finalDisplayedUrl);
  const audits = report.audits ?? {};
  const opportunities = Object.values(audits)
    .filter((audit) => audit?.details?.type === "opportunity" && typeof audit.details.overallSavingsMs === "number" && audit.details.overallSavingsMs > 0)
    .sort((a, b) => b.details.overallSavingsMs - a.details.overallSavingsMs)
    .slice(0, 3)
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      savingsMs: Math.round(audit.details.overallSavingsMs)
    }));

  return {
    url: report.finalDisplayedUrl,
    route: url.pathname || "/",
    fetchTime: report.fetchTime,
    categories: {
      performance: roundScore(report.categories?.performance?.score),
      accessibility: roundScore(report.categories?.accessibility?.score),
      bestPractices: roundScore(report.categories?.["best-practices"]?.score),
      seo: roundScore(report.categories?.seo?.score)
    },
    metrics: {
      lcpMs: numberOrNull(audits["largest-contentful-paint"]?.numericValue),
      cls: numberOrNull(audits["cumulative-layout-shift"]?.numericValue),
      ttfbMs: numberOrNull(audits["server-response-time"]?.numericValue)
    },
    opportunities
  };
}

function average(values) {
  const valid = values.filter((value) => typeof value === "number");
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

async function writeLighthouseSummary() {
  if (!existsSync(lighthouseDir)) return;

  const reportFiles = (await readdir(lighthouseDir)).filter((file) => file.endsWith(".report.json"));
  if (!reportFiles.length) return;

  const latestByUrl = new Map();

  for (const file of reportFiles) {
    const fullPath = path.join(lighthouseDir, file);
    const report = await readJsonReport(fullPath, { root });
    if (!report?.finalDisplayedUrl || !report?.fetchTime) continue;
    const key = report.finalDisplayedUrl;
    const current = latestByUrl.get(key);
    if (!current || new Date(report.fetchTime).getTime() > new Date(current.fetchTime).getTime()) {
      latestByUrl.set(key, report);
    }
  }

  if (!latestByUrl.size) return;

  const routes = [...latestByUrl.values()]
    .map(summarizeReport)
    .sort((left, right) => left.route.localeCompare(right.route));

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceDir: ".lighthouseci",
    routeCount: routes.length,
    categoryAverages: {
      performance: average(routes.map((route) => route.categories.performance)),
      accessibility: average(routes.map((route) => route.categories.accessibility)),
      bestPractices: average(routes.map((route) => route.categories.bestPractices)),
      seo: average(routes.map((route) => route.categories.seo))
    },
    weakestRoute:
      [...routes].sort((left, right) => (left.categories.performance ?? 0) - (right.categories.performance ?? 0))[0] ?? null,
    strongestRoute:
      [...routes].sort((left, right) => (right.categories.performance ?? 0) - (left.categories.performance ?? 0))[0] ?? null,
    routes
  };

  await writeJsonReport(path.join(reportsDir, "lighthouse-summary.json"), summary, { root });
  await writeTextReport(
    path.join(reportsDir, "LIGHTHOUSE-SEO-REPORT.md"),
    [
      "# Lighthouse SEO Report",
      "",
      `Generated: ${summary.generatedAt}`,
      `Routes: ${summary.routeCount}`,
      `Average performance: ${summary.categoryAverages.performance ?? "n/a"}/100`,
      `Average SEO: ${summary.categoryAverages.seo ?? "n/a"}/100`,
      "",
      "| Route | Performance | SEO | LCP | TTFB | Top opportunity |",
      "| --- | --- | --- | --- | --- | --- |",
      ...routes.map((route) => {
        const topOpportunity = route.opportunities[0];
        return `| ${route.route} | ${route.categories.performance ?? "n/a"} | ${route.categories.seo ?? "n/a"} | ${
          route.metrics.lcpMs ? `${Math.round(route.metrics.lcpMs)} ms` : "n/a"
        } | ${route.metrics.ttfbMs ? `${Math.round(route.metrics.ttfbMs)} ms` : "n/a"} | ${
          topOpportunity ? `${topOpportunity.title} (${topOpportunity.savingsMs} ms)` : "None"
        } |`;
      }),
      ""
    ].join("\n"),
    { root }
  );
}

const child = spawn(lhciBin, ["autorun", "--config=lighthouserc.cjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    CHROME_PATH: chromePath
  }
});

child.on("exit", async (code) => {
  try {
    await writeLighthouseSummary();
  } catch (error) {
    console.warn("Không thể ghi Lighthouse summary report:", error);
  }
  process.exit(code ?? 1);
});
