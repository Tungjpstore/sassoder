import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonReport, writeTextReport } from "./report-io.mjs";
import siteUrlHelpers from "./site-url.cjs";

const { resolveSeoSiteUrl } = siteUrlHelpers;

const root = process.cwd();
const reportsDir = path.join(root, "reports", "seo");

const baseUrl = resolveSeoSiteUrl();
const sitemapUrl = `${baseUrl}/sitemap.xml`;

async function readText(file) {
  const fullPath = path.join(root, file);
  if (!existsSync(fullPath)) return "";
  return readFile(fullPath, "utf8");
}

function createCheck({ id, area, status, evidence, action }) {
  return { id, area, status, evidence, action };
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

function extractIntentRoutes(intentSource) {
  return [...intentSource.matchAll(/path:\s*"([^"]*\/giai-phap\/[^"]+)"/g)].map((match) => match[1]);
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const robots = await readText("app/robots.ts");
  const sitemap = await readText("app/sitemap.ts");
  const landing = await readText("app/page.tsx");
  const pricing = await readText("app/pricing/page.tsx");
  const schema = await readText("lib/seo/schema.ts");
  const blog = await readText("lib/seo/blog.ts");
  const intentPages = await readText("lib/seo/intent-pages.ts");
  const intentPageExpansions = await readText("lib/seo/intent-page-expansions.ts");
  const intentPageExpansionBatch2 = await readText("lib/seo/intent-page-expansion-batch-2.ts");
  const combinedIntentPages = `${intentPages}\n${intentPageExpansions}\n${intentPageExpansionBatch2}`;
  const publicRoutes = ["/", "/pricing", "/giai-phap", ...extractIntentRoutes(combinedIntentPages), ...extractBlogRoutes(blog)];
  const urlsToInspect = publicRoutes.map((route) => `${baseUrl}${route === "/" ? "" : route}`);

  const checks = [
    createCheck({
      id: "robots-render-assets",
      area: "crawlability",
      status: robots.includes('"/_next/"') ? "fail" : "pass",
      evidence: robots.includes('"/_next/"') ? "robots route still disallows /_next/" : "robots route leaves /_next render assets crawlable",
      action: "Keep /_next/static and /_next/image crawlable so Googlebot can render the landing and pricing pages."
    }),
    createCheck({
      id: "sitemap-public-routes",
      area: "indexing",
      status: sitemap.includes("SEO_PUBLIC_ROUTES") ? "pass" : "fail",
      evidence: sitemap.includes("SEO_PUBLIC_ROUTES") ? "sitemap is generated from SEO_PUBLIC_ROUTES" : "sitemap does not use SEO_PUBLIC_ROUTES",
      action: "Submit the sitemap in Google Search Console after deployment."
    }),
    createCheck({
      id: "landing-brand-keyword",
      area: "metadata",
      status: landing.includes("SEO_HOME_TITLE") && landing.includes("SEO_HOME_DESCRIPTION") ? "pass" : "fail",
      evidence:
        landing.includes("SEO_HOME_TITLE") && landing.includes("SEO_HOME_DESCRIPTION")
          ? "home metadata uses the Week 1 brand + QR ordering title and description"
          : "home metadata is not pinned to the Week 1 SEO title and description",
      action: "Keep the home title unique and brand-led for better brand/entity matching."
    }),
    createCheck({
      id: "schema-stable-entity-ids",
      area: "structured-data",
      status: schema.includes("schemaId(") && schema.includes("replace(/\\/+$/") ? "pass" : "fail",
      evidence:
        schema.includes("schemaId(") && schema.includes("replace(/\\/+$/")
          ? "schema IDs normalize the root URL before adding fragments"
          : "schema IDs may still create duplicate slash fragments",
      action: "Validate Organization, WebSite and SoftwareApplication JSON-LD after deployment."
    }),
    createCheck({
      id: "pricing-visible-faq",
      area: "answer-engine",
      status: pricing.includes("pricingFaqItems.map") ? "pass" : "fail",
      evidence: pricing.includes("pricingFaqItems.map") ? "pricing page renders visible FAQ content from the same FAQ data as JSON-LD" : "pricing FAQ JSON-LD is not visibly mirrored",
      action: "Keep visible FAQ answers synced with FAQPage JSON-LD."
    }),
    createCheck({
      id: "blog-public-routes",
      area: "indexing",
      status: blog.includes("BLOG_POSTS") && sitemap.includes("getAllBlogPosts") ? "pass" : "fail",
      evidence:
        blog.includes("BLOG_POSTS") && sitemap.includes("getAllBlogPosts")
          ? `blog index and ${extractBlogRoutes(blog).length - 1} article URLs are wired into sitemap readiness`
          : "blog routes are not fully wired into sitemap readiness",
      action: "Inspect /blog and the first article URLs in Google Search Console after deployment."
    }),
    createCheck({
      id: "intent-public-routes",
      area: "indexing",
      status: intentPages.includes("SEO_INTENT_PAGES") && sitemap.includes("getAllSeoIntentPages") ? "pass" : "fail",
      evidence:
        intentPages.includes("SEO_INTENT_PAGES") && sitemap.includes("getAllSeoIntentPages")
          ? `${extractIntentRoutes(combinedIntentPages).length} intent landing URLs are wired into sitemap readiness`
          : "intent landing URLs are not wired into sitemap readiness",
      action: "Inspect newly deployed /giai-phap URLs in Google Search Console after deployment."
    })
  ];

  const apiConfigured = Boolean(process.env.GSC_SITE_URL && (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    scope: "week-1-gsc-indexing-readiness",
    baseUrl,
    sitemapUrl,
    urlsToInspect,
    apiReadiness: {
      configured: apiConfigured,
      requiredEnv: ["GSC_SITE_URL", "GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON"],
      note: apiConfigured
        ? "GSC API credentials appear present for a future automated export."
        : "GSC API credentials were not found locally, so this report prepares the exact manual submit and inspection queue."
    },
    manualSubmissionSteps: [
      "Verify https://logivn.com as a Domain or URL-prefix property in Google Search Console.",
      `Submit sitemap: ${sitemapUrl}`,
      ...urlsToInspect.map((url) => `Use URL Inspection for ${url} and request indexing after deployment.`),
      "After 24-72 hours, export Performance and Page indexing summaries to reports/seo/gsc-summary.json for the agentic audit."
    ],
    checks,
    status: checks.every((check) => check.status === "pass") ? "ready" : "blocked"
  };

  await writeJsonReport(path.join(reportsDir, "gsc-week1-readiness.json"), report, { root });
  await writeTextReport(
    path.join(reportsDir, "GSC-WEEK1-READINESS.md"),
    [
      "# Google Search Console Week 1 Readiness",
      "",
      `Generated: ${generatedAt}`,
      `Status: ${report.status}`,
      `Base URL: ${baseUrl}`,
      `Sitemap: ${sitemapUrl}`,
      "",
      "## URLs To Inspect",
      ...urlsToInspect.map((url) => `- ${url}`),
      "",
      "## Checks",
      "| Area | Status | Evidence | Action |",
      "| --- | --- | --- | --- |",
      ...checks.map((check) => `| ${check.area} | ${check.status.toUpperCase()} | ${check.evidence} | ${check.action} |`),
      "",
      "## Manual Submission Queue",
      ...report.manualSubmissionSteps.map((step) => `- ${step}`),
      ""
    ].join("\n"),
    { root }
  );

  if (report.status !== "ready") {
    console.error("GSC Week 1 readiness failed. See reports/seo/gsc-week1-readiness.json");
    process.exit(1);
  }

  console.log("GSC Week 1 readiness passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
