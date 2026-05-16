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

function absoluteUrl(route) {
  return `${baseUrl}${route === "/" ? "" : route}`;
}

function unique(values) {
  return new Set(values).size === values.length;
}

function countWords(text) {
  return String(text || "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function arrayValues(block, property) {
  const match = block.match(new RegExp(`${property}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractConfigRoutes(configSource) {
  const publicRoutesBlock = configSource.split("export const SEO_PUBLIC_ROUTES = [")[1]?.split("];")[0] ?? "";
  return [...publicRoutesBlock.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractBlogRoutes(blogSource) {
  const [postSource = "", hubAndEnhancementSource = ""] = blogSource.split("export const BLOG_TOPIC_HUBS");
  const [hubSource = ""] = hubAndEnhancementSource.split("type BlogArticleEnhancement");
  const slugs = [
    ...postSource.matchAll(/slug:\s*"([^"]+)"/g),
    ...hubSource.matchAll(/slug:\s*"([^"]+)"/g)
  ].map((match) => match[1]);
  return ["/blog", ...Array.from(new Set(slugs)).map((slug) => `/blog/${slug}`)];
}

function extractIntentPages(source) {
  const starts = [...source.matchAll(/\n  \{\n    slug:\s*"([^"]+)"/g)].map((match) => ({
    slug: match[1],
    index: match.index ?? 0
  }));

  return starts.map((start, index) => {
    const next = starts[index + 1]?.index ?? source.indexOf("\n];", start.index);
    const block = source.slice(start.index, next > start.index ? next : undefined);
    const pathMatch = block.match(/path:\s*"([^"]+)"/);
    const titleMatch = block.match(/title:\s*"([^"]+)"/);
    const descriptionMatch = block.match(/description:\s*\n?\s*"([^"]+)"/);
    const updatedAtMatch = block.match(/updatedAt:\s*"([^"]+)"/);
    const priorityMatch = block.match(/priority:\s*([0-9.]+)/);
    const sectionSource = block.split("sections: [")[1]?.split("faq: [")[0] ?? "";
    const faqSource = block.split("faq: [")[1]?.split("relatedBlogSlugs:")[0] ?? "";

    return {
      slug: start.slug,
      path: pathMatch?.[1] ?? "",
      title: titleMatch?.[1] ?? "",
      description: descriptionMatch?.[1] ?? "",
      updatedAt: updatedAtMatch?.[1] ?? "",
      priority: priorityMatch ? Number(priorityMatch[1]) : null,
      targetQueries: arrayValues(block, "targetQueries"),
      relatedBlogSlugs: arrayValues(block, "relatedBlogSlugs"),
      relatedHubSlugs: arrayValues(block, "relatedHubSlugs"),
      sectionCount: [...sectionSource.matchAll(/heading:\s*"/g)].length,
      faqCount: [...faqSource.matchAll(/question:\s*"/g)].length,
      wordCount: countWords(block),
      hasSketch: block.includes("sketch:") && block.includes("labels:"),
      hasProofPoints: block.includes("proofPoints:") && [...block.matchAll(/label:\s*"/g)].length >= 3
    };
  });
}

function createCheck({ id, area, status, evidence, action }) {
  return { id, area, status, evidence, action };
}

function renderMarkdown(report) {
  return `${[
    "# Week 5 Indexing + Authority Activation",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Score: ${report.score}/100`,
    "",
    "## Inventory",
    "",
    `- Expected public URLs: ${report.inventory.expectedPublicUrls}`,
    `- Intent pages: ${report.inventory.intentPages}`,
    `- New Week 5 intent pages: ${report.inventory.week5IntentPages}`,
    `- Blog and hub URLs: ${report.inventory.blogUrls}`,
    `- Solution index wired: ${report.inventory.solutionIndexWired ? "yes" : "no"}`,
    `- GSC log inspected URLs: ${report.inventory.gscLoggedUrls}`,
    "",
    "## Indexing Queue",
    "",
    "| URL | Priority | Why |",
    "| --- | --- | --- |",
    ...report.indexingQueue.map((item) => `| ${item.url} | ${item.priority} | ${item.reason} |`),
    "",
    "## Intent Pages",
    "",
    "| Path | Sections | FAQ | Queries | Words |",
    "| --- | --- | --- | --- | --- |",
    ...report.pages.map((page) => `| ${page.path} | ${page.sectionCount} | ${page.faqCount} | ${page.targetQueries.length} | ${page.wordCount} |`),
    "",
    "## Checks",
    "",
    "| Area | Status | Evidence | Action |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((check) => `| ${check.area} | ${check.status.toUpperCase()} | ${check.evidence} | ${check.action} |`),
    "",
    "## Next GSC Actions",
    "",
    ...report.nextGscActions.map((item) => `- ${item}`),
    ""
  ].join("\n")}\n`;
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const config = await readText("lib/seo/config.ts");
  const intentSource = await readText("lib/seo/intent-pages.ts");
  const intentExpansionSource = await readText("lib/seo/intent-page-expansions.ts");
  const intentExpansionBatch2Source = await readText("lib/seo/intent-page-expansion-batch-2.ts");
  const combinedIntentSource = `${intentSource}\n${intentExpansionSource}\n${intentExpansionBatch2Source}`;
  const solutionIndex = await readText("app/giai-phap/page.tsx");
  const intentRoute = await readText("app/giai-phap/[slug]/page.tsx");
  const sitemap = await readText("app/sitemap.ts");
  const llms = await readText("app/llms.txt/route.ts");
  const landing = await readText("components/landing/logivn-landing.tsx");
  const blogIndex = await readText("app/blog/page.tsx");
  const schema = await readText("lib/seo/schema.ts");
  const lighthouserc = await readText("lighthouserc.cjs");
  const packageJson = await readText("package.json");
  const workflow = await readText(".github/workflows/seo-ci.yml");
  const blog = await readText("lib/seo/blog.ts");
  const gscActionLog = await readJsonReport("reports/seo/gsc-action-log.json", { root });

  const configRoutes = extractConfigRoutes(config);
  const pages = extractIntentPages(combinedIntentSource);
  const blogRoutes = extractBlogRoutes(blog);
  const expectedPublicRoutes = Array.from(new Set([...configRoutes, ...pages.map((page) => page.path), ...blogRoutes])).sort();
  const week5Pages = pages.filter((page) => page.updatedAt >= "2026-05-16");
  const duplicateTitles = !unique(pages.map((page) => page.title));
  const duplicateDescriptions = !unique(pages.map((page) => page.description));
  const weakPages = pages.filter(
    (page) =>
      !page.path.startsWith("/giai-phap/") ||
      page.sectionCount < 4 ||
      page.faqCount < 3 ||
      page.relatedBlogSlugs.length < 3 ||
      page.relatedHubSlugs.length < 1 ||
      page.targetQueries.length < 3 ||
      !page.hasSketch ||
      !page.hasProofPoints ||
      page.wordCount < 700
  );
  const loggedInspectionUrls = Array.isArray(gscActionLog?.urlInspection) ? gscActionLog.urlInspection.map((item) => item.url).filter(Boolean) : [];
  const gscLoggedSet = new Set(loggedInspectionUrls.map((url) => url.replace(/\/+$/, "")));
  const missingGscLogUrls = expectedPublicRoutes.map(absoluteUrl).filter((url) => !gscLoggedSet.has(url.replace(/\/+$/, "")));

  const checks = [
    createCheck({
      id: "intent-scale",
      area: "content-scale",
      status: pages.length >= 8 && week5Pages.length >= 4 && weakPages.length === 0 ? "pass" : "fail",
      evidence: `${pages.length} intent pages, ${week5Pages.length} Week 5 pages, ${weakPages.length} weak pages`,
      action: "Keep at least 8 intent pages with 4+ sections, 3+ FAQ, 3+ queries, proof points, related links and sketches."
    }),
    createCheck({
      id: "metadata-uniqueness",
      area: "metadata",
      status: duplicateTitles || duplicateDescriptions ? "fail" : "pass",
      evidence: duplicateTitles || duplicateDescriptions ? "duplicate titles or descriptions detected" : "all intent titles and descriptions are unique",
      action: "Avoid duplicate metadata when adding long-tail pages; the shared metadata template owns the brand suffix."
    }),
    createCheck({
      id: "solution-index",
      area: "indexability",
      status:
        solutionIndex.includes("getAllSeoIntentPages") &&
        solutionIndex.includes("createSeoMetadata") &&
        solutionIndex.includes("buildItemListSchema") &&
        configRoutes.includes("/giai-phap")
          ? "pass"
          : "fail",
      evidence: solutionIndex.includes("getAllSeoIntentPages") ? "/giai-phap lists the intent registry and emits ItemList schema" : "/giai-phap index wiring missing",
      action: "Keep /giai-phap as the public solution hub so crawlers discover every intent page from one URL."
    }),
    createCheck({
      id: "sitemap-llms",
      area: "crawlability",
      status:
        sitemap.includes("SEO_PUBLIC_ROUTES") &&
        sitemap.includes("getAllSeoIntentPages") &&
        llms.includes("Giải pháp LogiVN") &&
        llms.includes("Trang giải pháp theo nhu cầu")
          ? "pass"
          : "fail",
      evidence: `${expectedPublicRoutes.length} expected public routes are represented by shared registries`,
      action: "Keep sitemap and llms.txt generated from shared public route, blog and intent registries."
    }),
    createCheck({
      id: "internal-linking",
      area: "internal-linking",
      status: landing.includes('href="/giai-phap"') && blogIndex.includes('href="/giai-phap"') && intentRoute.includes('href="/giai-phap"') ? "pass" : "fail",
      evidence: "landing, blog and intent detail navigation link to /giai-phap",
      action: "Keep the solution hub linked from high-authority public pages to reduce crawl depth."
    }),
    createCheck({
      id: "geo-extractability",
      area: "geo",
      status: schema.includes("buildIntentLandingSchema") && pages.every((page) => page.targetQueries.length >= 3 && page.hasProofPoints) ? "pass" : "fail",
      evidence: "intent pages expose target queries, proof points, FAQ and Service schema",
      action: "Keep direct answers, dates, proof points and schema aligned so AI search engines can cite the pages."
    }),
    createCheck({
      id: "ci-automation",
      area: "automation",
      status: packageJson.includes('"seo:week5"') && workflow.includes("npm run seo:week5") ? "pass" : "fail",
      evidence: "Week 5 audit is wired into package scripts and SEO CI",
      action: "Run seo:week5 in CI before build so content expansion regressions fail fast."
    }),
    createCheck({
      id: "lighthouse-coverage",
      area: "performance-guard",
      status: lighthouserc.includes("/giai-phap") && lighthouserc.includes("/giai-phap/goi-mon-qr-cho-quan-cafe") ? "pass" : "fail",
      evidence: "Lighthouse CI covers solution index and a representative intent page",
      action: "Keep Lighthouse coverage on the hub and one intent page to catch metadata/performance regressions."
    })
  ];

  const passCount = checks.filter((check) => check.status === "pass").length;
  const score = Math.round((passCount / checks.length) * 100);
  const status = checks.every((check) => check.status === "pass") ? "ready" : "blocked";
  const indexingQueue = [
    ...pages
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
      .slice(0, 8)
      .map((page) => ({
        url: absoluteUrl(page.path),
        priority: page.priority ?? 0,
        reason: page.updatedAt >= "2026-05-16" ? "new Week 5 intent page" : "high-intent commercial page"
      })),
    {
      url: absoluteUrl("/giai-phap"),
      priority: 0.82,
      reason: "solution index hub"
    }
  ];

  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    scope: "week-5-indexing-authority",
    status,
    score,
    inventory: {
      expectedPublicUrls: expectedPublicRoutes.length,
      intentPages: pages.length,
      week5IntentPages: week5Pages.length,
      blogUrls: blogRoutes.length,
      solutionIndexWired: solutionIndex.includes("getAllSeoIntentPages") && configRoutes.includes("/giai-phap"),
      gscLoggedUrls: loggedInspectionUrls.length,
      gscMissingLogUrls: missingGscLogUrls.length
    },
    pages,
    weakPages,
    indexingQueue,
    checks,
    expectedPublicRoutes: expectedPublicRoutes.map(absoluteUrl),
    missingGscLogUrls,
    nextGscActions: [
      "Resubmit https://logivn.com/sitemap.xml in Google Search Console after production deploy.",
      "Run URL Inspection and request indexing for /giai-phap plus the 8 priority /giai-phap/* URLs in the indexing queue.",
      "Wait 7-14 days before judging traffic; compare GSC impressions by page, not only clicks.",
      "If pages stay Discovered - currently not indexed after two weeks, add external citations/backlinks to the solution hub and top two intent pages."
    ]
  };

  await writeJsonReport(path.join(reportsDir, "week5-indexing-authority.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "WEEK5-INDEXING-AUTHORITY.md"), renderMarkdown(report), { root });

  if (status !== "ready") {
    console.error("Week 5 indexing authority report needs review. See reports/seo/week5-indexing-authority.json");
    process.exit(1);
  }

  console.log(`Week 5 indexing authority report generated: ${status} (${score}/100)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
