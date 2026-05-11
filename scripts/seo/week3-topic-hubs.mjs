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
  return Array.from(new Set(values));
}

function extractStrings(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function extractArrayItems(source, fieldName) {
  const pattern = new RegExp(`${fieldName}:\\s*\\[([^\\]]*)\\]`, "g");
  return [...source.matchAll(pattern)].map((match) => extractStrings(match[1], /"([^"]+)"/g));
}

function createCheck({ id, area, status, evidence, action }) {
  return { id, area, status, evidence, action };
}

function renderMarkdown(report) {
  const openItems = report.checks.filter((check) => check.status !== "pass");
  return `${[
    "# Week 3 Topic Hub SEO Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Score: ${report.score}/100`,
    "",
    "## Inventory",
    "",
    `- Topic hubs: ${report.inventory.topicHubCount}`,
    `- Hub article links: ${report.inventory.hubArticleLinkCount}`,
    `- Broken hub article links: ${report.inventory.brokenHubArticleLinks.length}`,
    `- Expected public URLs after Week 3: ${report.inventory.expectedPublicUrls}`,
    "",
    "## Checks",
    "",
    "| Area | Status | Evidence | Action |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((check) => `| ${check.area} | ${check.status.toUpperCase()} | ${check.evidence} | ${check.action} |`),
    "",
    "## Open Items",
    "",
    ...(openItems.length ? openItems.map((check) => `- ${check.id}: ${check.action}`) : ["- None"]),
    ""
  ].join("\n")}\n`;
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const blogSource = await readText("lib/seo/blog.ts");
  const articlePage = await readText("app/blog/[slug]/page.tsx");
  const blogIndex = await readText("app/blog/page.tsx");
  const sitemap = await readText("app/sitemap.ts");
  const llms = await readText("app/llms.txt/route.ts");
  const landing = await readText("components/landing/logivn-landing.tsx");
  const lhci = await readText("lighthouserc.cjs");

  const [postSource = "", hubAndFunctionsSource = ""] = blogSource.split("export const BLOG_TOPIC_HUBS");
  const [hubSource = ""] = hubAndFunctionsSource.split("export function getAllBlogPosts");
  const postSlugs = extractStrings(postSource, /slug:\s*"([^"]+)"/g);
  const hubSlugs = extractStrings(hubSource, /slug:\s*"([^"]+)"/g);
  const hubTitles = extractStrings(hubSource, /title:\s*"([^"]+)"/g);
  const hubDescriptions = extractStrings(hubSource, /description:\s*\n?\s*"([^"]+)"/g);
  const hubFaqBlocks = [...hubSource.matchAll(/faq:\s*\[/g)].length;
  const hubSectionBlocks = [...hubSource.matchAll(/sections:\s*\[/g)].length;
  const hubPostSlugGroups = extractArrayItems(hubSource, "postSlugs");
  const hubArticleLinks = hubPostSlugGroups.flat();
  const brokenHubArticleLinks = hubArticleLinks.filter((slug) => !postSlugs.includes(slug));
  const expectedPublicUrls = 2 + 1 + postSlugs.length + hubSlugs.length;

  const checks = [
    createCheck({
      id: "topic-hub-count",
      area: "topical-authority",
      status: hubSlugs.length >= 3 ? "pass" : "fail",
      evidence: `${hubSlugs.length} topic hubs detected`,
      action: "Maintain at least three hub entry points for QR ordering, cafe digitization and restaurant operations."
    }),
    createCheck({
      id: "hub-metadata-unique",
      area: "metadata",
      status:
        hubTitles.length === hubSlugs.length && unique(hubTitles).length === hubTitles.length && unique(hubDescriptions).length === hubDescriptions.length
          ? "pass"
          : "fail",
      evidence: `${hubTitles.length} hub titles and ${hubDescriptions.length} descriptions checked`,
      action: "Keep every topic hub title and description unique to avoid duplicate snippets."
    }),
    createCheck({
      id: "hub-content-depth",
      area: "content-quality",
      status: hubFaqBlocks === hubSlugs.length && hubSectionBlocks === hubSlugs.length && hubPostSlugGroups.every((group) => group.length >= 4) ? "pass" : "fail",
      evidence: `${hubSectionBlocks} section blocks, ${hubFaqBlocks} FAQ blocks, min ${Math.min(...hubPostSlugGroups.map((group) => group.length))} article links per hub`,
      action: "Every topic hub should have visible body sections, FAQ content and at least four supporting article links."
    }),
    createCheck({
      id: "hub-link-integrity",
      area: "internal-linking",
      status: brokenHubArticleLinks.length === 0 && hubArticleLinks.length >= hubSlugs.length * 4 ? "pass" : "fail",
      evidence: `${hubArticleLinks.length} hub article links, ${brokenHubArticleLinks.length} broken`,
      action: "Keep hub postSlugs pointing only to existing blog posts."
    }),
    createCheck({
      id: "route-renders-hubs",
      area: "crawl-optimization",
      status: articlePage.includes("BlogTopicHubPage") && articlePage.includes("getBlogTopicHub") && articlePage.includes("buildItemListSchema") ? "pass" : "fail",
      evidence: articlePage.includes("BlogTopicHubPage") ? "/blog/[slug] renders topic hubs and article pages" : "topic hub route support missing",
      action: "Render topic hubs through the existing blog slug route so canonical URLs stay under /blog/*."
    }),
    createCheck({
      id: "blog-index-hub-discovery",
      area: "crawl-optimization",
      status: blogIndex.includes("getAllBlogTopicHubs") && blogIndex.includes("blog-topic-hubs-heading") ? "pass" : "fail",
      evidence: blogIndex.includes("blog-topic-hubs-heading") ? "/blog exposes Week 3 topic hubs" : "/blog topic hub section missing",
      action: "Expose hub cards from /blog to reduce crawl depth for supporting articles."
    }),
    createCheck({
      id: "sitemap-topic-hubs",
      area: "indexing",
      status: sitemap.includes("getAllBlogTopicHubs") && sitemap.includes("getBlogTopicHubPath") ? "pass" : "fail",
      evidence: sitemap.includes("getAllBlogTopicHubs") ? "sitemap includes topic hubs from shared registry" : "topic hubs missing from sitemap",
      action: "Keep topic hubs in sitemap after every new hub is added."
    }),
    createCheck({
      id: "llms-topic-hubs",
      area: "geo",
      status: llms.includes("## Topic hubs") && llms.includes("getAllBlogTopicHubs") && llms.includes("getBlogTopicHubPath") ? "pass" : "fail",
      evidence: llms.includes("## Topic hubs") ? "llms.txt lists topic hubs" : "llms.txt topic hub section missing",
      action: "Expose topic hubs in llms.txt so AI search systems can cite the canonical cluster pages."
    }),
    createCheck({
      id: "landing-footer-crawl-links",
      area: "internal-linking",
      status: landing.includes("/blog/goi-mon-qr") && landing.includes("/blog/van-hanh-nha-hang") ? "pass" : "fail",
      evidence: landing.includes("/blog/goi-mon-qr") ? "landing footer links to public topic hubs" : "landing topic hub links missing",
      action: "Keep lightweight footer links from the landing page to the highest-value SEO hubs."
    }),
    createCheck({
      id: "lhci-topic-hub-route",
      area: "lighthouse",
      status: lhci.includes("/blog/goi-mon-qr") ? "pass" : "fail",
      evidence: lhci.includes("/blog/goi-mon-qr") ? "Lighthouse CI includes one topic hub route" : "topic hub route missing from Lighthouse CI",
      action: "Check at least one topic hub in Lighthouse CI so metadata, canonical and performance regressions are caught."
    })
  ];

  const passed = checks.filter((check) => check.status === "pass").length;
  const report = {
    generatedAt: new Date().toISOString(),
    scope: "week-3-topic-hubs",
    status: passed === checks.length ? "ready" : "needs-review",
    score: Math.round((passed / checks.length) * 100),
    inventory: {
      topicHubCount: hubSlugs.length,
      topicHubSlugs: hubSlugs,
      supportingPostCount: postSlugs.length,
      hubArticleLinkCount: hubArticleLinks.length,
      brokenHubArticleLinks,
      expectedPublicUrls
    },
    checks
  };

  await writeJsonReport(path.join(reportsDir, "week3-topic-hubs.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "WEEK3-TOPIC-HUBS.md"), renderMarkdown(report), { root });

  if (report.status !== "ready") {
    console.error("Week 3 topic hub SEO report needs review. See reports/seo/week3-topic-hubs.json");
    process.exit(1);
  }

  console.log(`Week 3 topic hub SEO report generated: ${report.status}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
