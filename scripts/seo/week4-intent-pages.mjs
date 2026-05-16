import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonReport, writeTextReport } from "./report-io.mjs";

const root = process.cwd();
const reportsDir = path.join(root, "reports", "seo");

async function readText(file) {
  const fullPath = path.join(root, file);
  if (!existsSync(fullPath)) return "";
  return readFile(fullPath, "utf8");
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
    const priorityMatch = block.match(/priority:\s*([0-9.]+)/);
    const sectionSource = block.split("sections: [")[1]?.split("faq: [")[0] ?? "";
    const faqSource = block.split("faq: [")[1]?.split("relatedBlogSlugs:")[0] ?? "";

    return {
      slug: start.slug,
      path: pathMatch?.[1] ?? "",
      title: titleMatch?.[1] ?? "",
      description: descriptionMatch?.[1] ?? "",
      priority: priorityMatch ? Number(priorityMatch[1]) : null,
      targetQueries: arrayValues(block, "targetQueries"),
      relatedBlogSlugs: arrayValues(block, "relatedBlogSlugs"),
      relatedHubSlugs: arrayValues(block, "relatedHubSlugs"),
      sectionCount: [...sectionSource.matchAll(/heading:\s*"/g)].length,
      faqCount: [...faqSource.matchAll(/question:\s*"/g)].length,
      wordCount: countWords(block),
      hasSketch: block.includes("sketch:") && block.includes("labels:")
    };
  });
}

function createCheck({ id, area, status, evidence, action }) {
  return { id, area, status, evidence, action };
}

function renderMarkdown(report) {
  return `${[
    "# Week 4 Intent Landing Pages",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Score: ${report.score}/100`,
    "",
    "## Inventory",
    "",
    `- Intent pages: ${report.inventory.intentPages}`,
    `- Sitemap wired: ${report.inventory.sitemapWired ? "yes" : "no"}`,
    `- LLMs wired: ${report.inventory.llmsWired ? "yes" : "no"}`,
    `- Lighthouse intent route: ${report.inventory.lighthouseIntentRoute ? "yes" : "no"}`,
    "",
    "## Pages",
    "",
    "| Path | Sections | FAQ | Related blogs | Words |",
    "| --- | --- | --- | --- | --- |",
    ...report.pages.map((page) => `| ${page.path} | ${page.sectionCount} | ${page.faqCount} | ${page.relatedBlogSlugs.length} | ${page.wordCount} |`),
    "",
    "## Checks",
    "",
    "| Area | Status | Evidence | Action |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((check) => `| ${check.area} | ${check.status.toUpperCase()} | ${check.evidence} | ${check.action} |`),
    "",
    "## Post-Deploy Queue",
    "",
    ...report.postDeployQueue.map((item) => `- ${item}`),
    ""
  ].join("\n")}\n`;
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const intentSource = await readText("lib/seo/intent-pages.ts");
  const intentExpansionSource = await readText("lib/seo/intent-page-expansions.ts");
  const intentExpansionBatch2Source = await readText("lib/seo/intent-page-expansion-batch-2.ts");
  const combinedIntentSource = `${intentSource}\n${intentExpansionSource}\n${intentExpansionBatch2Source}`;
  const intentRoute = await readText("app/giai-phap/[slug]/page.tsx");
  const sitemap = await readText("app/sitemap.ts");
  const llms = await readText("app/llms.txt/route.ts");
  const blogIndex = await readText("app/blog/page.tsx");
  const landing = await readText("components/landing/logivn-landing.tsx");
  const firecrawl = await readText("scripts/seo/firecrawl-readiness.mjs");
  const gsc = await readText("scripts/seo/gsc-week1-readiness.mjs");
  const week2 = await readText("scripts/seo/week2-activation.mjs");
  const agentic = await readText("scripts/seo/agentic-audit.mjs");
  const lhci = await readText("lighthouserc.cjs");

  const pages = extractIntentPages(combinedIntentSource);
  const privateRoutePattern = /["'`]\/(?:admin|api|auth|dashboard|r\/)/;
  const duplicateTitle = !unique(pages.map((page) => page.title));
  const duplicateDescription = !unique(pages.map((page) => page.description));
  const titlesWithBrandSuffix = pages.filter((page) => /\|\s*LogiVN\b/i.test(page.title));
  const weakPages = pages.filter(
    (page) =>
      !page.path.startsWith("/giai-phap/") ||
      !page.title ||
      !page.description ||
      page.sectionCount < 4 ||
      page.faqCount < 3 ||
      page.relatedBlogSlugs.length < 3 ||
      page.relatedHubSlugs.length < 1 ||
      page.targetQueries.length < 3 ||
      !page.hasSketch ||
      page.wordCount < 550
  );

  const checks = [
    createCheck({
      id: "intent-inventory",
      area: "content",
      status: pages.length >= 4 && weakPages.length === 0 ? "pass" : "fail",
      evidence: `${pages.length} pages, ${weakPages.length} weak pages`,
      action: "Keep every intent page with 4+ sections, 3+ FAQs, 3+ related blog links, one hub link and a lightweight sketch."
    }),
    createCheck({
      id: "metadata-uniqueness",
      area: "metadata",
      status: duplicateTitle || duplicateDescription || titlesWithBrandSuffix.length ? "fail" : "pass",
      evidence:
        duplicateTitle || duplicateDescription
          ? "duplicate title or description detected"
          : titlesWithBrandSuffix.length
            ? `${titlesWithBrandSuffix.length} titles include a manual LogiVN suffix`
            : "all intent titles and descriptions are unique without duplicated brand suffixes",
      action: "Avoid duplicate snippets and do not add manual | LogiVN suffixes because the shared metadata template owns branding."
    }),
    createCheck({
      id: "static-route-schema",
      area: "structured-data",
      status:
        intentRoute.includes("generateStaticParams") &&
        intentRoute.includes("dynamicParams = false") &&
        intentRoute.includes("createSeoMetadata") &&
        intentRoute.includes("buildIntentLandingSchema") &&
        intentRoute.includes("buildFaqSchema")
          ? "pass"
          : "fail",
      evidence: intentRoute.includes("buildIntentLandingSchema") ? "intent route renders metadata, Service schema and FAQ schema" : "intent schema wiring missing",
      action: "Keep intent pages static so metadata, canonical and JSON-LD are deterministic."
    }),
    createCheck({
      id: "crawl-surface",
      area: "crawlability",
      status: sitemap.includes("getAllSeoIntentPages") && llms.includes("Trang giải pháp theo nhu cầu") ? "pass" : "fail",
      evidence:
        sitemap.includes("getAllSeoIntentPages") && llms.includes("Trang giải pháp theo nhu cầu")
          ? "sitemap and llms.txt include intent pages"
          : "intent pages are missing from sitemap or llms.txt",
      action: "Keep sitemap and llms.txt generated from the shared intent registry."
    }),
    createCheck({
      id: "internal-links",
      area: "internal-linking",
      status: blogIndex.includes("getFeaturedSeoIntentPages") && landing.includes("footerIntentPages") ? "pass" : "fail",
      evidence:
        blogIndex.includes("getFeaturedSeoIntentPages") && landing.includes("footerIntentPages")
          ? "blog index and public landing footer link to intent pages"
          : "internal links to intent pages are incomplete",
      action: "Keep crawl depth shallow by linking solution pages from existing public surfaces."
    }),
    createCheck({
      id: "automation-coverage",
      area: "automation",
      status:
        firecrawl.includes("extractIntentRoutes") &&
        gsc.includes("extractIntentRoutes") &&
        week2.includes("intentPages") &&
        agentic.includes("intentPageCount")
          ? "pass"
          : "fail",
      evidence: "Firecrawl, GSC readiness, Week 2 activation and agentic audit include intent inventory checks",
      action: "Update the shared extraction checks whenever new public route registries are added."
    }),
    createCheck({
      id: "lighthouse-coverage",
      area: "lighthouse",
      status: lhci.includes("/giai-phap/goi-mon-qr-cho-quan-cafe") ? "pass" : "fail",
      evidence: lhci.includes("/giai-phap/goi-mon-qr-cho-quan-cafe") ? "one intent page is part of Lighthouse CI" : "intent route missing from Lighthouse CI",
      action: "Keep one representative /giai-phap route in Lighthouse CI to catch metadata and performance regressions."
    }),
    createCheck({
      id: "private-route-leakage",
      area: "crawl-guard",
      status: privateRoutePattern.test(combinedIntentSource) || privateRoutePattern.test(intentRoute) ? "fail" : "pass",
      evidence: privateRoutePattern.test(combinedIntentSource) || privateRoutePattern.test(intentRoute) ? "private route prefix found" : "no private route prefix detected in intent pages",
      action: "Keep public SEO pages linked to public pages only; avoid dashboard/admin/auth/API URLs in editorial crawl paths."
    })
  ];

  const passCount = checks.filter((check) => check.status === "pass").length;
  const score = Math.round((passCount / checks.length) * 100);
  const status = checks.every((check) => check.status === "pass") ? "ready" : "blocked";
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    scope: "week-4-intent-landing-pages",
    status,
    score,
    inventory: {
      intentPages: pages.length,
      sitemapWired: sitemap.includes("getAllSeoIntentPages"),
      llmsWired: llms.includes("Trang giải pháp theo nhu cầu"),
      lighthouseIntentRoute: lhci.includes("/giai-phap/goi-mon-qr-cho-quan-cafe")
    },
    pages,
    weakPages,
    checks,
    postDeployQueue: [
      "Inspect and request indexing for each /giai-phap URL in Google Search Console after production deploy.",
      "Rerun npm run seo:firecrawl with a valid FIRECRAWL_API_KEY after deploy so crawl evidence includes Week 4 pages.",
      "After 7-14 days, compare GSC queries for QR ordering, VietQR, trà sữa and đặt bàn against the intent page URLs."
    ]
  };

  await writeJsonReport(path.join(reportsDir, "week4-intent-pages.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "WEEK4-INTENT-PAGES.md"), renderMarkdown(report), { root });

  if (status !== "ready") {
    console.error("Week 4 intent SEO report needs review. See reports/seo/week4-intent-pages.json");
    process.exit(1);
  }

  console.log(`Week 4 intent SEO report generated: ${status} (${score}/100)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
