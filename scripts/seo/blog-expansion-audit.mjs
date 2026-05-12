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

function extractRelatedSlugs(source) {
  return [...source.matchAll(/relatedSlugs:\s*\[([^\]]*)\]/g)].flatMap((match) => extractStrings(match[1], /"([^"]+)"/g));
}

function extractBalancedObject(source, startIndex) {
  if (startIndex < 0) return "";
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }

  return "";
}

function extractEntryObject(source, slug) {
  const slugIndex = source.indexOf(`slug: "${slug}"`);
  if (slugIndex < 0) return "";
  const objectStart = source.lastIndexOf("{", slugIndex);
  return extractBalancedObject(source, objectStart);
}

function countWords(value) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countStringWords(source) {
  return countWords(extractStrings(source, /"([^"\\]*(?:\\.[^"\\]*)*)"/g).join(" "));
}

function createCheck({ id, area, status, evidence, action }) {
  return { id, area, status, evidence, action };
}

function renderMarkdown(report) {
  const openItems = report.checks.filter((check) => check.status !== "pass");
  return `${[
    "# Blog Expansion SEO Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Score: ${report.score}/100`,
    "",
    "## Inventory",
    "",
    `- Posts: ${report.inventory.postCount}`,
    `- Categories: ${report.inventory.categoryCount}`,
    `- Related links: ${report.inventory.relatedLinkCount}`,
    `- Broken related links: ${report.inventory.brokenRelatedLinks.length}`,
    `- Article word range: ${report.inventory.articleWordRange.min}-${report.inventory.articleWordRange.max}`,
    `- Articles with sketches: ${report.inventory.illustrationCount}/${report.inventory.postCount}`,
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
  const blogIndex = await readText("app/blog/page.tsx");
  const articlePage = await readText("app/blog/[slug]/page.tsx");
  const schema = await readText("lib/seo/schema.ts");
  const sitemap = await readText("app/sitemap.ts");
  const feed = await readText("app/feed.xml/route.ts");
  const llms = await readText("app/llms.txt/route.ts");
  const [postSource = ""] = blogSource.split("export const BLOG_TOPIC_HUBS");
  const enhancementSource = blogSource.slice(Math.max(0, blogSource.indexOf("const BLOG_ARTICLE_ENHANCEMENTS")));
  const hasArticleCitationSummary =
    articlePage.includes("article-citation-note") && articlePage.includes('aria-labelledby="citation-note-heading"');
  const hasArticleSketch = articlePage.includes("function ArticleSketch") && articlePage.includes("article-sketch");

  const slugs = extractStrings(postSource, /slug:\s*"([^"]+)"/g);
  const titles = extractStrings(postSource, /title:\s*"([^"]+)"/g);
  const descriptions = extractStrings(postSource, /description:\s*\n?\s*"([^"]+)"/g);
  const categories = extractStrings(postSource, /category:\s*"([^"]+)"/g);
  const relatedSlugs = extractRelatedSlugs(postSource);
  const brokenRelatedLinks = relatedSlugs.filter((slug) => !slugs.includes(slug));
  const faqBlocks = [...postSource.matchAll(/faq:\s*\[/g)].length;
  const sectionBlocks = [...postSource.matchAll(/sections:\s*\[/g)].length;
  const readingTimes = [...postSource.matchAll(/readingTimeMinutes:\s*(\d+)/g)].map((match) => Number(match[1]));
  const articleWordCounts = slugs.map((slug) => {
    const postObject = extractEntryObject(postSource, slug);
    const enhancementObject = extractEntryObject(enhancementSource, slug);
    return {
      slug,
      words: countStringWords(`${postObject}\n${enhancementObject}`),
      hasIllustration: enhancementObject.includes("illustration:") && enhancementObject.includes("caption:") && enhancementObject.includes("labels:")
    };
  });
  const thinArticles = articleWordCounts.filter((entry) => entry.words < 800 || entry.words > 1000);
  const missingIllustrations = articleWordCounts.filter((entry) => !entry.hasIllustration).map((entry) => entry.slug);
  const wordValues = articleWordCounts.map((entry) => entry.words);

  const checks = [
    createCheck({
      id: "expanded-post-count",
      area: "content-seo",
      status: slugs.length >= 12 ? "pass" : "fail",
      evidence: `${slugs.length} blog posts detected`,
      action: "Maintain at least 12 seed and long-tail posts before opening narrower landing or location pages."
    }),
    createCheck({
      id: "category-breadth",
      area: "topical-authority",
      status: unique(categories).length >= 7 ? "pass" : "fail",
      evidence: `${unique(categories).length} unique categories detected`,
      action: "Cover QR ordering, VietQR, operations, pricing intent, online ordering, reservation and reporting clusters."
    }),
    createCheck({
      id: "unique-metadata",
      area: "metadata",
      status: unique(titles).length === titles.length && unique(descriptions).length === descriptions.length ? "pass" : "fail",
      evidence: `${titles.length} titles and ${descriptions.length} descriptions checked`,
      action: "Keep every blog title and description unique to avoid duplicate snippets."
    }),
    createCheck({
      id: "related-link-integrity",
      area: "internal-linking",
      status: brokenRelatedLinks.length === 0 && relatedSlugs.length >= slugs.length * 2 ? "pass" : "fail",
      evidence: `${relatedSlugs.length} related links, ${brokenRelatedLinks.length} broken`,
      action: "Keep relatedSlugs pointing to existing posts and maintain at least two contextual links per article."
    }),
    createCheck({
      id: "visible-faq-and-sections",
      area: "answer-engine",
      status: faqBlocks === slugs.length && sectionBlocks === slugs.length ? "pass" : "fail",
      evidence: `${faqBlocks} FAQ blocks and ${sectionBlocks} section blocks for ${slugs.length} posts`,
      action: "Require visible sections and FAQ content for every article that emits FAQPage schema."
    }),
    createCheck({
      id: "reading-time-depth",
      area: "content-quality",
      status: readingTimes.every((minutes) => minutes >= 5) ? "pass" : "fail",
      evidence: `Minimum reading time is ${Math.min(...readingTimes)} minutes`,
      action: "Avoid thin posts by keeping each article at 5+ minutes of useful content."
    }),
    createCheck({
      id: "article-word-count-band",
      area: "content-quality",
      status: thinArticles.length === 0 ? "pass" : "fail",
      evidence: thinArticles.length
        ? thinArticles.map((entry) => `${entry.slug}: ${entry.words} words`).join("; ")
        : `All articles are between 800 and 1000 words (${Math.min(...wordValues)}-${Math.max(...wordValues)})`,
      action: "Keep every published blog article in the 800-1000 word band so pages are useful without becoming bloated."
    }),
    createCheck({
      id: "article-sketch-illustrations",
      area: "content-quality",
      status: missingIllustrations.length === 0 && hasArticleSketch ? "pass" : "fail",
      evidence: missingIllustrations.length
        ? `Missing sketches: ${missingIllustrations.join(", ")}`
        : hasArticleSketch
          ? "Every article has structured sketch data and the article template renders inline SVG sketches"
          : "Article sketch component missing",
      action: "Keep one lightweight explanatory sketch with accessible caption and labels for every article."
    }),
    createCheck({
      id: "topic-cluster-index",
      area: "crawl-optimization",
      status: blogIndex.includes("getBlogTopicClusters") && blogIndex.includes("blog-cluster-grid") ? "pass" : "fail",
      evidence: blogIndex.includes("blog-cluster-grid") ? "blog index renders topic cluster cards" : "topic cluster UI missing",
      action: "Expose topic clusters on /blog so crawlers and users can discover related article groups."
    }),
    createCheck({
      id: "article-geo-summary",
      area: "geo",
      status: hasArticleCitationSummary ? "pass" : "fail",
      evidence: hasArticleCitationSummary ? "article template renders citation-ready summary" : "citation-ready summary missing",
      action: "Keep visible author, update date, topic and summary context in every article."
    }),
    createCheck({
      id: "article-schema-context",
      area: "structured-data",
      status: schema.includes("about:") && schema.includes("mentions:") && schema.includes("isAccessibleForFree") ? "pass" : "fail",
      evidence: "BlogPosting schema checked for about, mentions and free-access context",
      action: "Keep Article schema aligned with visible topic and keyword context."
    }),
    createCheck({
      id: "sitemap-blog-registry",
      area: "indexing",
      status: sitemap.includes("getAllBlogPosts") && sitemap.includes("getBlogPath") ? "pass" : "fail",
      evidence: sitemap.includes("getAllBlogPosts") ? "sitemap maps shared blog registry" : "blog sitemap registry missing",
      action: "Keep sitemap generation tied to the shared blog registry instead of hardcoded URLs."
    }),
    createCheck({
      id: "rss-feed-discovery",
      area: "crawl-optimization",
      status: feed.includes("getAllBlogPosts") && feed.includes("application/rss+xml") && llms.includes("/feed.xml") ? "pass" : "fail",
      evidence: feed.includes("application/rss+xml") ? "feed.xml emits RSS from the blog registry" : "RSS feed route missing",
      action: "Keep feed.xml and llms.txt wired to the same blog registry so new editorial URLs are discoverable."
    })
  ];

  const passed = checks.filter((check) => check.status === "pass").length;
  const report = {
    generatedAt: new Date().toISOString(),
    scope: "blog-content-expansion",
    status: passed === checks.length ? "ready" : "needs-review",
    score: Math.round((passed / checks.length) * 100),
    inventory: {
      postCount: slugs.length,
      categoryCount: unique(categories).length,
      categories: unique(categories),
      slugs,
      relatedLinkCount: relatedSlugs.length,
      brokenRelatedLinks,
      articleWordCounts,
      articleWordRange: {
        min: Math.min(...wordValues),
        max: Math.max(...wordValues)
      },
      illustrationCount: articleWordCounts.filter((entry) => entry.hasIllustration).length
    },
    checks
  };

  await writeJsonReport(path.join(reportsDir, "blog-expansion-audit.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "BLOG-EXPANSION-REPORT.md"), renderMarkdown(report), { root });

  if (report.status !== "ready") {
    console.error("Blog expansion audit failed. See reports/seo/blog-expansion-audit.json");
    process.exit(1);
  }

  console.log(`Blog expansion audit passed: ${report.score}/100`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
