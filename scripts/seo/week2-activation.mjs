import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJsonReport, writeJsonReport, writeTextReport } from "./report-io.mjs";

const root = process.cwd();
const reportsDir = path.join(root, "reports", "seo");
const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://logivn.com").replace(/\/+$/, "");

async function readText(file) {
  const fullPath = path.join(root, file);
  if (!existsSync(fullPath)) return "";
  return readFile(fullPath, "utf8");
}

function extractBlogInventory(blogSource) {
  const [postSource = "", hubAndFunctionsSource = ""] = blogSource.split("export const BLOG_TOPIC_HUBS");
  const [hubSource = ""] = hubAndFunctionsSource.split("export function getAllBlogPosts");
  const postSlugs = [...postSource.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);
  const hubSlugs = [...hubSource.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);

  return {
    postRoutes: postSlugs.map((slug) => `/blog/${slug}`),
    hubRoutes: hubSlugs.map((slug) => `/blog/${slug}`)
  };
}

function absoluteUrl(route) {
  return `${baseUrl}${route === "/" ? "" : route}`;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return String(url || "")
      .replace(/[#?].*$/, "")
      .replace(/\/+$/, "");
  }
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getMissingUrls(expectedUrls, urls) {
  const known = new Set(urls.map(normalizeUrl));
  return expectedUrls.filter((url) => !known.has(normalizeUrl(url)));
}

function renderMarkdown(report) {
  return `${[
    "# Expanded SEO Activation",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Base URL: ${report.baseUrl}`,
    "",
    "## Inventory",
    "",
    `- Expected public URLs: ${report.inventory.expectedPublicUrls}`,
    `- Blog posts: ${report.inventory.blogPosts}`,
    `- Topic hubs: ${report.inventory.topicHubs}`,
    `- New URLs needing GSC action: ${report.gsc.missingInspectionUrls.length}`,
    `- Firecrawl coverage: ${report.firecrawl.discoveredExpectedUrls}/${report.inventory.expectedPublicUrls}`,
    `- Lighthouse routes checked: ${report.lighthouse.routeCount}`,
    "",
    "## Post-Deploy Queue",
    "",
    ...(report.postDeployQueue.length ? report.postDeployQueue.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## GSC URLs To Inspect After Deploy",
    "",
    ...(report.gsc.missingInspectionUrls.length ? report.gsc.missingInspectionUrls.map((url) => `- ${url}`) : ["- None"]),
    "",
    "## Checks",
    "",
    "| Area | Status | Evidence |",
    "| --- | --- | --- |",
    ...report.checks.map((check) => `| ${check.area} | ${check.status.toUpperCase()} | ${check.evidence} |`),
    ""
  ].join("\n")}\n`;
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const blogSource = await readText("lib/seo/blog.ts");
  const blogInventory = extractBlogInventory(blogSource);
  const publicRoutes = ["/", "/pricing", "/blog", ...blogInventory.postRoutes, ...blogInventory.hubRoutes];
  const expectedUrls = publicRoutes.map(absoluteUrl);
  const blogPosts = blogInventory.postRoutes.length;
  const topicHubs = blogInventory.hubRoutes.length;

  const blogAudit = await readJsonReport("reports/seo/blog-expansion-audit.json", { root });
  const gscSummary = await readJsonReport("reports/seo/gsc-summary.json", { root });
  const firecrawlSummary = await readJsonReport("reports/seo/firecrawl-summary.json", { root });
  const lighthouseSummary = await readJsonReport("reports/seo/lighthouse-summary.json", { root });

  const gscInspectedUrls = Array.isArray(gscSummary?.urlInspection) ? gscSummary.urlInspection.map((item) => item.url).filter(Boolean) : [];
  const gscMissingInspectionUrls = gscSummary?.pageIndexing?.missingInspectionUrls?.length
    ? gscSummary.pageIndexing.missingInspectionUrls
    : getMissingUrls(expectedUrls, gscInspectedUrls);

  const firecrawlDiscoveredUrls = Array.isArray(firecrawlSummary?.pages)
    ? firecrawlSummary.pages.filter((page) => page.discovered).map((page) => page.url)
    : [];
  const firecrawlMissingUrls = firecrawlSummary?.missingUrls?.length ? firecrawlSummary.missingUrls : getMissingUrls(expectedUrls, firecrawlDiscoveredUrls);
  const firecrawlDiscoveredExpectedUrls = numberOrZero(firecrawlSummary?.summary?.discoveredExpectedUrls) || expectedUrls.length - firecrawlMissingUrls.length;

  const lighthouseWeakestPerformance = numberOrZero(lighthouseSummary?.weakestRoute?.categories?.performance);
  const lighthouseAverageSeo = numberOrZero(lighthouseSummary?.categoryAverages?.seo);
  const lighthouseRouteCount = numberOrZero(lighthouseSummary?.routeCount);

  const checks = [
    {
      area: "content-seo",
      status: blogAudit?.status === "ready" ? "pass" : "needs-review",
      evidence: blogAudit ? `${blogAudit.inventory?.postCount ?? blogPosts} posts, score ${blogAudit.score ?? "n/a"}/100` : "blog expansion audit missing"
    },
    {
      area: "lighthouse",
      status: lighthouseWeakestPerformance >= 85 && lighthouseAverageSeo >= 90 ? "pass" : "needs-review",
      evidence: `${lighthouseRouteCount} routes, weakest performance ${lighthouseWeakestPerformance}/100, SEO average ${lighthouseAverageSeo}/100`
    },
    {
      area: "firecrawl",
      status: firecrawlMissingUrls.length === 0 && firecrawlDiscoveredExpectedUrls >= expectedUrls.length ? "pass" : "needs-refresh",
      evidence: `${firecrawlDiscoveredExpectedUrls}/${expectedUrls.length} expected URLs discovered`
    },
    {
      area: "gsc",
      status: gscMissingInspectionUrls.length === 0 ? "pass" : "needs-action",
      evidence: `${gscInspectedUrls.length}/${expectedUrls.length} expected URLs inspected or logged`
    }
  ];

  const postDeployQueue = [
    gscMissingInspectionUrls.length
      ? `After deploy, inspect and request indexing for ${gscMissingInspectionUrls.length} new public URLs in Google Search Console.`
      : null,
    firecrawlMissingUrls.length
      ? "After deploy, rerun npm run seo:firecrawl with FIRECRAWL_API_KEY to refresh crawl evidence for the expanded sitemap."
      : null,
    "After GSC finishes processing, export query/page data into reports/seo/gsc-summary.json or rerun npm run seo:gsc:report with export inputs.",
    "Rerun npm run seo:agentic after Firecrawl and GSC evidence are refreshed."
  ].filter(Boolean);

  const localReady = checks
    .filter((check) => ["content-seo", "lighthouse"].includes(check.area))
    .every((check) => check.status === "pass");
  const externalReady = checks.filter((check) => ["firecrawl", "gsc"].includes(check.area)).every((check) => check.status === "pass");
  const status = localReady && externalReady ? "activated" : localReady ? "ready-for-deploy" : "needs-local-fix";

  const report = {
    generatedAt: new Date().toISOString(),
    scope: "expanded-seo-activation",
    status,
    baseUrl,
    inventory: {
      expectedPublicUrls: expectedUrls.length,
      publicRoutes,
      blogPosts,
      topicHubs
    },
    lighthouse: {
      routeCount: lighthouseRouteCount,
      weakestRoute: lighthouseSummary?.weakestRoute?.route ?? null,
      weakestPerformance: lighthouseWeakestPerformance,
      averageSeo: lighthouseAverageSeo
    },
    firecrawl: {
      status: firecrawlSummary?.status ?? "missing",
      discoveredExpectedUrls: firecrawlDiscoveredExpectedUrls,
      missingUrls: firecrawlMissingUrls
    },
    gsc: {
      status: gscSummary?.status ?? "missing",
      inspectedUrls: gscInspectedUrls.length,
      missingInspectionUrls: gscMissingInspectionUrls
    },
    checks,
    postDeployQueue
  };

  await writeJsonReport(path.join(reportsDir, "week2-activation.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "WEEK2-SEO-ACTIVATION.md"), renderMarkdown(report), { root });

  if (status === "needs-local-fix") {
    console.error("Week 2 SEO activation has local blockers. See reports/seo/week2-activation.json");
    process.exit(1);
  }

  console.log(`Week 2 SEO activation report generated: ${status}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
