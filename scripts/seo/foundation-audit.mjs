import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { writeJsonReport, writeTextReport } from "./report-io.mjs";

const root = process.cwd();
const reportsDir = path.join(root, "reports", "seo");

const checks = [
  {
    id: "robots-route",
    area: "crawlability",
    severity: "critical",
    confidence: "CONFIRMED",
    file: "app/robots.ts",
    finding: "Production robots route exists.",
    fix: "Keep private SaaS, dashboard, auth and API routes blocked."
  },
  {
    id: "robots-render-assets",
    area: "crawlability",
    severity: "critical",
    confidence: "CONFIRMED",
    file: "app/robots.ts",
    finding: "Robots keeps Next.js render assets crawlable.",
    fix: "Never disallow /_next/ because Googlebot needs CSS, JS and image assets to render public pages."
  },
  {
    id: "sitemap-route",
    area: "indexing",
    severity: "critical",
    confidence: "CONFIRMED",
    file: "app/sitemap.ts",
    finding: "Production sitemap route exists.",
    fix: "Keep sitemap focused on indexable marketing URLs until tenant SEO policy is explicit."
  },
  {
    id: "rss-feed-route",
    area: "crawl-optimization",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "app/feed.xml/route.ts",
    finding: "RSS feed route exists for editorial discovery.",
    fix: "Keep feed.xml generated from the shared blog registry so new posts are discoverable without hardcoded URLs."
  },
  {
    id: "landing-metadata",
    area: "metadata",
    severity: "high",
    confidence: "CONFIRMED",
    file: "app/page.tsx",
    finding: "Landing metadata is pinned to the Week 1 brand and QR ordering keyword target.",
    fix: "Keep the home title unique, brand-led and aligned with the H1."
  },
  {
    id: "llms-route",
    area: "geo",
    severity: "high",
    confidence: "CONFIRMED",
    file: "app/llms.txt/route.ts",
    finding: "AI search guidance file exists.",
    fix: "Update llms.txt when product positioning, pricing or public pages change."
  },
  {
    id: "favicon-assets",
    area: "metadata",
    severity: "high",
    confidence: "CONFIRMED",
    file: "public/favicon.ico",
    finding: "Root favicon assets exist for browser and Google Search result discovery.",
    fix: "Keep /favicon.ico and 48x48+ PNG favicon variants crawlable at stable root URLs."
  },
  {
    id: "favicon-metadata",
    area: "metadata",
    severity: "high",
    confidence: "CONFIRMED",
    file: "lib/seo/metadata.ts",
    finding: "Shared metadata emits icon links for public pages.",
    fix: "Keep rel icon and apple icon metadata wired through createSeoMetadata."
  },
  {
    id: "dashboard-noindex",
    area: "indexing",
    severity: "critical",
    confidence: "CONFIRMED",
    file: "app/dashboard/layout.tsx",
    finding: "Dashboard route group has noindex metadata.",
    fix: "Do not override this in child dashboard routes."
  },
  {
    id: "site-jsonld",
    area: "schema",
    severity: "high",
    confidence: "CONFIRMED",
    file: "components/seo/site-json-ld.tsx",
    finding: "Organization, WebSite and SoftwareApplication JSON-LD are emitted from shared schema builders.",
    fix: "Validate stable @id fragments and schema output in CI after every schema change."
  },
  {
    id: "lhci-config",
    area: "validation",
    severity: "high",
    confidence: "CONFIRMED",
    file: "lighthouserc.cjs",
    finding: "Lighthouse CI thresholds are configured for SEO, performance and accessibility.",
    fix: "Keep thresholds aligned with release risk."
  },
  {
    id: "seo-ci-workflow",
    area: "validation",
    severity: "high",
    confidence: "CONFIRMED",
    file: ".github/workflows/seo-ci.yml",
    finding: "GitHub Actions SEO workflow exists.",
    fix: "Run SEO audit, typecheck, build and Lighthouse CI for every pull request."
  },
  {
    id: "schema-stable-ids",
    area: "structured-data",
    severity: "high",
    confidence: "CONFIRMED",
    file: "lib/seo/schema.ts",
    finding: "Schema entity IDs normalize the root URL before fragment IDs are appended.",
    fix: "Keep Organization, WebSite and SoftwareApplication @id values stable across deploys."
  },
  {
    id: "pricing-jsonld",
    area: "structured-data",
    severity: "high",
    confidence: "CONFIRMED",
    file: "components/seo/pricing-page-json-ld.tsx",
    finding: "Pricing page emits FAQ and breadcrumb JSON-LD.",
    fix: "Keep visible pricing FAQ copy and JSON-LD answers in sync whenever packages or entitlements change."
  },
  {
    id: "pricing-visible-faq",
    area: "answer-engine",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "app/pricing/page.tsx",
    finding: "Pricing FAQ structured data is mirrored by visible FAQ content.",
    fix: "Do not emit FAQPage JSON-LD without matching visible page copy."
  },
  {
    id: "pricing-isr",
    area: "performance",
    severity: "high",
    confidence: "CONFIRMED",
    file: "app/pricing/page.tsx",
    finding: "Pricing page uses cached public plan data instead of per-request dynamic rendering.",
    fix: "Keep pricing on ISR/cached public data so SEO crawlers receive a fast, stable public page."
  },
  {
    id: "blog-index-route",
    area: "content-seo",
    severity: "high",
    confidence: "CONFIRMED",
    file: "app/blog/page.tsx",
    finding: "Blog index route exists with metadata, internal links and ItemList structured data.",
    fix: "Keep /blog focused on topic clusters and link naturally to landing and pricing pages."
  },
  {
    id: "blog-article-route",
    area: "content-seo",
    severity: "high",
    confidence: "CONFIRMED",
    file: "app/blog/[slug]/page.tsx",
    finding: "Blog article route emits Article, FAQ and breadcrumb structured data.",
    fix: "Require every article to have unique title, description, canonical path and visible FAQ copy before adding it to sitemap."
  },
  {
    id: "blog-sitemap",
    area: "indexing",
    severity: "high",
    confidence: "CONFIRMED",
    file: "app/sitemap.ts",
    finding: "Blog index and article URLs are included in the sitemap.",
    fix: "Keep blog sitemap generation tied to the shared blog content registry."
  },
  {
    id: "lhci-summary-reporting",
    area: "validation",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "scripts/seo/run-lhci.mjs",
    finding: "Lighthouse CI writes summary artifacts for downstream SEO reporting.",
    fix: "Keep reports/seo/lighthouse-summary.json stable so the agentic audit can consume real score evidence."
  },
  {
    id: "blog-expansion-audit",
    area: "content-seo",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "scripts/seo/blog-expansion-audit.mjs",
    finding: "Week 2 blog expansion has an automated content and internal-linking quality gate.",
    fix: "Run npm run seo:blog after adding blog posts, topic clusters or article schema changes."
  },
  {
    id: "week2-activation-report",
    area: "validation",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "scripts/seo/week2-activation.mjs",
    finding: "Week 2 SEO activation report separates local readiness from post-deploy Firecrawl and GSC actions.",
    fix: "Run npm run seo:week2 before deploy handoffs and after refreshing Firecrawl/GSC evidence."
  },
  {
    id: "gsc-week1-readiness",
    area: "indexing",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "scripts/seo/gsc-week1-readiness.mjs",
    finding: "Google Search Console Week 1 indexing readiness can be generated without sensitive credentials.",
    fix: "Run this before deploys and attach reports/seo/GSC-WEEK1-READINESS.md to SEO handoffs."
  },
  {
    id: "gsc-reporting",
    area: "indexing",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "scripts/seo/gsc-reporting.mjs",
    finding: "Google Search Console action logs and exports are normalized into SEO summary artifacts.",
    fix: "Keep reports/seo/gsc-summary.json as the agentic audit input for indexing, performance and GSC action evidence."
  },
  {
    id: "firecrawl-readiness",
    area: "crawlability",
    severity: "medium",
    confidence: "CONFIRMED",
    file: "scripts/seo/firecrawl-readiness.mjs",
    finding: "Firecrawl mapping integration can generate live crawl evidence when credentials are available.",
    fix: "Set FIRECRAWL_API_KEY in CI to write reports/seo/firecrawl-summary.json; keep the script non-blocking without credentials."
  }
];

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const findings = [];
  for (const check of checks) {
    const fullPath = path.join(root, check.file);
    const present = existsSync(fullPath);
    let evidence = present ? `${check.file} exists` : `${check.file} is missing`;
    let status = present ? "pass" : "fail";
    const content = present ? await readFile(fullPath, "utf8") : "";

    if (present) {
      if (check.id === "dashboard-noindex") evidence += content.includes("noIndexMetadata") ? " and imports noIndexMetadata" : " but noIndexMetadata was not found";
      if (check.id === "robots-render-assets") {
        const keepsAssetsCrawlable = !content.includes('"/_next/"') && content.includes("/_next/static") && content.includes("/_next/image");
        status = keepsAssetsCrawlable ? "pass" : "fail";
        evidence += keepsAssetsCrawlable ? " and explicitly allows Next.js render assets" : " but /_next render asset handling is unsafe";
      }
      if (check.id === "landing-metadata") {
        const hasPinnedMetadata = content.includes("SEO_HOME_TITLE") && content.includes("SEO_HOME_DESCRIPTION");
        status = hasPinnedMetadata ? "pass" : "fail";
        evidence += hasPinnedMetadata ? " and uses SEO_HOME_TITLE + SEO_HOME_DESCRIPTION" : " but Week 1 SEO title/description were not found";
      }
      if (check.id === "rss-feed-route") {
        const hasFeed = content.includes("getAllBlogPosts") && content.includes("application/rss+xml") && content.includes("feed.xml");
        status = hasFeed ? "pass" : "fail";
        evidence += hasFeed ? " and emits RSS from shared blog posts" : " but RSS feed generation is incomplete";
      }
      if (check.id === "favicon-assets") {
        const requiredFavicons = ["public/favicon.ico", "public/favicon-48x48.png", "public/icon.png", "public/apple-icon.png"];
        const missingFavicons = requiredFavicons.filter((file) => !existsSync(path.join(root, file)));
        status = missingFavicons.length === 0 ? "pass" : "fail";
        evidence = missingFavicons.length
          ? `missing favicon assets: ${missingFavicons.join(", ")}`
          : "root favicon.ico, 48x48 PNG, 512x512 icon and apple icon exist";
      }
      if (check.id === "favicon-metadata") {
        const hasIconMetadata =
          content.includes("icons:") &&
          content.includes("/favicon.ico") &&
          content.includes("/favicon-48x48.png") &&
          content.includes("/apple-icon.png");
        status = hasIconMetadata ? "pass" : "fail";
        evidence += hasIconMetadata ? " and emits favicon/apple icon metadata" : " but favicon metadata is incomplete";
      }
      if (check.id === "site-jsonld") {
        const usesSchemaBuilders = content.includes("buildOrganizationSchema") && content.includes("buildWebSiteSchema") && content.includes("buildSoftwareApplicationSchema");
        status = usesSchemaBuilders ? "pass" : "fail";
        evidence += usesSchemaBuilders ? " and uses shared schema builders" : " but shared schema builders were not found";
      }
      if (check.id === "schema-stable-ids") {
        const hasStableIds = content.includes("schemaId(") && content.includes("replace(/\\/+$/");
        status = hasStableIds ? "pass" : "fail";
        evidence += hasStableIds ? " and normalizes schema fragment IDs" : " but schema ID normalization was not found";
      }
      if (check.id === "pricing-jsonld") {
        evidence += content.includes("buildFaqSchema") && content.includes("buildBreadcrumbSchema")
          ? " and includes FAQ + breadcrumb schema builders"
          : " but FAQ/breadcrumb schema builders were not both found";
      }
      if (check.id === "pricing-visible-faq") {
        status = content.includes("pricingFaqItems.map") ? "pass" : "fail";
        evidence += content.includes("pricingFaqItems.map") ? " and renders pricingFaqItems visibly" : " but visible pricingFaqItems were not found";
      }
      if (check.id === "pricing-isr") {
        const usesCachedPublicPlans = content.includes("revalidate = 3600") && content.includes("getPublicActivePlans") && !content.includes('dynamic = "force-dynamic"');
        status = usesCachedPublicPlans ? "pass" : "fail";
        evidence += usesCachedPublicPlans ? " and uses ISR with cached public plans" : " but pricing still appears to be dynamic or uncached";
      }
      if (check.id === "blog-index-route") {
        const hasBlogSignals = content.includes("createSeoMetadata") && content.includes("buildItemListSchema") && content.includes("getAllBlogPosts");
        status = hasBlogSignals ? "pass" : "fail";
        evidence += hasBlogSignals ? " and includes metadata + ItemList + shared blog posts" : " but blog metadata or ItemList wiring is incomplete";
      }
      if (check.id === "blog-article-route") {
        const hasArticleSignals = content.includes("buildBlogPostingSchema") && content.includes("buildFaqSchema") && content.includes("generateStaticParams");
        status = hasArticleSignals ? "pass" : "fail";
        evidence += hasArticleSignals ? " and includes Article + FAQ schema with static params" : " but article schema or static params are incomplete";
      }
      if (check.id === "blog-sitemap") {
        const includesBlog = content.includes("getAllBlogPosts") && content.includes("getBlogPath");
        status = includesBlog ? "pass" : "fail";
        evidence += includesBlog ? " and maps blog posts into sitemap entries" : " but blog posts are not mapped into sitemap entries";
      }
      if (check.id === "lhci-summary-reporting") {
        evidence += content.includes("lighthouse-summary.json")
          ? " and writes lighthouse-summary.json"
          : " but lighthouse-summary.json output was not found";
      }
      if (check.id === "blog-expansion-audit") {
        const writesReport = content.includes("blog-expansion-audit.json") && content.includes("BLOG-EXPANSION-REPORT.md");
        status = writesReport ? "pass" : "fail";
        evidence += writesReport ? " and writes blog expansion reports" : " but blog expansion report outputs were not found";
      }
      if (check.id === "week2-activation-report") {
        const writesReport = content.includes("week2-activation.json") && content.includes("WEEK2-SEO-ACTIVATION.md");
        status = writesReport ? "pass" : "fail";
        evidence += writesReport ? " and writes Week 2 activation reports" : " but Week 2 activation report outputs were not found";
      }
      if (check.id === "gsc-week1-readiness") {
        const writesReport = content.includes("gsc-week1-readiness.json") && content.includes("GSC-WEEK1-READINESS.md");
        status = writesReport ? "pass" : "fail";
        evidence += writesReport ? " and writes JSON + Markdown readiness reports" : " but readiness report outputs were not found";
      }
      if (check.id === "gsc-reporting") {
        const writesSummary = content.includes("gsc-summary.json") && content.includes("GSC-SEO-REPORT.md");
        status = writesSummary ? "pass" : "fail";
        evidence += writesSummary ? " and writes GSC summary artifacts" : " but GSC summary outputs were not found";
      }
      if (check.id === "firecrawl-readiness") {
        const hasFirecrawlMap = content.includes("/v2/map") && content.includes("firecrawl-summary.json");
        status = hasFirecrawlMap ? "pass" : "fail";
        evidence += hasFirecrawlMap ? " and can write Firecrawl summary artifacts" : " but Firecrawl map integration was not found";
      }
    }

    findings.push({
      ...check,
      status,
      evidence,
      seoImpact:
        check.area === "crawlability"
          ? "Search engines receive explicit crawl rules and sitemap discovery."
          : check.area === "geo"
            ? "AI search crawlers receive concise citation guidance."
            : check.area === "validation"
              ? "SEO regressions can fail pull requests before deployment."
              : "Search engines receive clearer indexability and entity signals."
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: "seo-foundation",
    score: Math.round((findings.filter((finding) => finding.status === "pass").length / findings.length) * 100),
    findings
  };

  await writeJsonReport(path.join(reportsDir, "foundation-audit.json"), report, { root });
  await writeTextReport(
    path.join(reportsDir, "FOUNDATION-SEO-REPORT.md"),
    [
      "# LogiVN SEO Foundation Report",
      "",
      `Generated: ${report.generatedAt}`,
      `Score: ${report.score}/100`,
      "",
      "| Area | Status | Confidence | Finding | Evidence | Fix |",
      "| --- | --- | --- | --- | --- | --- |",
      ...findings.map((finding) =>
        `| ${finding.area} | ${finding.status.toUpperCase()} | ${finding.confidence} | ${finding.finding} | ${finding.evidence} | ${finding.fix} |`
      ),
      ""
    ].join("\n"),
    { root }
  );

  if (findings.some((finding) => finding.status === "fail")) {
    console.error("SEO foundation audit failed. See reports/seo/foundation-audit.json");
    process.exit(1);
  }

  console.log(`SEO foundation audit passed: ${report.score}/100`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
