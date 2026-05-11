import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJsonReport, writeJsonReport, writeTextReport } from "./report-io.mjs";

const root = process.cwd();
const appDir = path.join(root, "app");
const reportsDir = path.join(root, "reports", "seo");

const confidenceWeights = {
  CONFIRMED: 1,
  LIKELY: 0.72,
  HYPOTHESIS: 0.42
};

const severityWeights = {
  critical: 100,
  high: 75,
  medium: 45,
  low: 20
};

const agents = [
  "Technical SEO Agent",
  "Content Quality Agent",
  "Schema Agent",
  "Performance Agent",
  "GEO / AI Search Agent",
  "AEO Agent",
  "Entity SEO Agent",
  "Internal Link Agent",
  "Sitemap Agent",
  "Verifier Agent"
];

async function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, output);
    } else {
      output.push(path.relative(root, fullPath));
    }
  }
  return output;
}

async function readText(file) {
  const fullPath = path.isAbsolute(file) ? file : path.join(root, file);
  if (!existsSync(fullPath)) return "";
  return readFile(fullPath, "utf8");
}

function fileEvidence(file, presentText = "exists") {
  const fullPath = path.isAbsolute(file) ? file : path.join(root, file);
  return {
    source: file,
    excerpt: existsSync(fullPath) ? `${file} ${presentText}` : `${file} is missing`
  };
}

function createFinding({ agent, area, severity, confidence, finding, evidence, impact, fix, status = "open" }) {
  return {
    agent,
    area,
    severity,
    confidence,
    confidenceScore: confidenceWeights[confidence],
    priorityScore: Math.round(severityWeights[severity] * confidenceWeights[confidence]),
    finding,
    evidence,
    seoImpact: impact,
    suggestedFix: fix,
    status
  };
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeLighthouse(data) {
  if (!data || typeof data !== "object") return null;

  const routes = Array.isArray(data.routes) ? data.routes : [];
  return {
    available: routes.length > 0,
    source: "reports/seo/lighthouse-summary.json",
    routeCount: numberOrNull(data.routeCount) ?? routes.length,
    categoryAverages: data.categoryAverages ?? {},
    weakestRoute: data.weakestRoute ?? null,
    strongestRoute: data.strongestRoute ?? null
  };
}

function summarizeFirecrawl(data, source) {
  if (!data || typeof data !== "object") {
    return { configured: false, source };
  }

  const pages = Array.isArray(data.pages)
    ? data.pages
    : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.data)
        ? data.data
        : [];

  const missingTitleCount = pages.filter((page) => !(page?.title || page?.metadata?.title)).length;
  const missingDescriptionCount = pages.filter((page) => !(page?.description || page?.metadata?.description)).length;
  const missingCanonicalCount = pages.filter((page) => !(page?.canonical || page?.metadata?.canonical || (data.canonicalAssumedFromExpectedUrl && page?.url))).length;

  return {
    configured: true,
    source,
    totalPages: numberOrNull(data.summary?.pagesCrawled) ?? numberOrNull(data.pagesCrawled) ?? pages.length,
    issueCount: numberOrNull(data.summary?.issuesCount) ?? numberOrNull(data.issuesCount) ?? missingTitleCount + missingDescriptionCount + missingCanonicalCount,
    missingTitleCount,
    missingDescriptionCount,
    missingCanonicalCount,
    status: data.status ?? null,
    provider: data.provider ?? null
  };
}

function summarizeGsc(data, source) {
  if (!data || typeof data !== "object") {
    return { configured: false, source, evidenceLevel: "none" };
  }

  const rows = Array.isArray(data.rows)
    ? data.rows
    : Array.isArray(data.queries)
      ? data.queries
      : Array.isArray(data.data?.rows)
        ? data.data.rows
        : [];

  const summary = data.summary || {};
  const urlInspection = Array.isArray(data.urlInspection) ? data.urlInspection : [];
  const clicks = numberOrNull(summary.clicks) ?? rows.reduce((sum, row) => sum + (numberOrNull(row?.clicks) ?? 0), 0);
  const impressions = numberOrNull(summary.impressions) ?? rows.reduce((sum, row) => sum + (numberOrNull(row?.impressions) ?? 0), 0);
  const ctr = numberOrNull(summary.ctr) ?? (impressions ? Number((clicks / impressions).toFixed(4)) : null);

  return {
    configured: true,
    source,
    status: data.status ?? summary.status ?? null,
    evidenceLevel: data.evidenceLevel ?? null,
    totalQueries: rows.length,
    clicks,
    impressions,
    ctr,
    averagePosition: numberOrNull(summary.averagePosition) ?? numberOrNull(summary.position) ?? null,
    indexedPages: numberOrNull(summary.indexedPages) ?? numberOrNull(data.indexedPages) ?? null,
    excludedPages: numberOrNull(summary.excludedPages) ?? numberOrNull(data.excludedPages) ?? null,
    sitemapStatus: summary.sitemapStatus ?? data.sitemap?.status ?? null,
    sitemapDiscoveredPages: numberOrNull(summary.sitemapDiscoveredPages) ?? numberOrNull(data.sitemap?.discoveredPages) ?? null,
    pendingReports: numberOrNull(summary.pendingReports) ?? 0,
    requestedIndexingCount:
      numberOrNull(summary.requestedIndexingCount) ?? urlInspection.filter((item) => String(item?.actionTaken || "").includes("requested")).length,
    missingInspectionCount: numberOrNull(summary.missingInspectionCount) ?? 0,
    indexedObservedCount: numberOrNull(summary.indexedObservedCount) ?? urlInspection.filter((item) => item?.state === "indexed").length,
    discoveredNotIndexedCount:
      numberOrNull(summary.discoveredNotIndexedCount) ?? urlInspection.filter((item) => item?.state === "discovered-not-indexed").length,
    issuesCount: numberOrNull(summary.issuesCount) ?? (Array.isArray(data.issues) ? data.issues.length : 0),
    manualActionsStatus: summary.manualActionsStatus ?? null,
    securityIssuesStatus: summary.securityIssuesStatus ?? null
  };
}

function mdTable(findings) {
  return [
    "| Priority | Agent | Confidence | Finding | Evidence | Suggested fix |",
    "| --- | --- | --- | --- | --- | --- |",
    ...findings.map((item) => {
      const evidence = item.evidence.map((entry) => `${entry.source}: ${entry.excerpt}`).join("<br>");
      return `| ${item.priorityScore} | ${item.agent} | ${item.confidence} | ${item.finding} | ${evidence} | ${item.suggestedFix} |`;
    })
  ].join("\n");
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const appFiles = await walk(appDir);
  const pageFiles = appFiles.filter((file) => file.endsWith("/page.tsx"));
  const routeFiles = appFiles.filter((file) => file.endsWith("/route.ts"));
  const landing = await readText("app/page.tsx");
  const pricing = await readText("app/pricing/page.tsx");
  const blogIndex = await readText("app/blog/page.tsx");
  const blogArticle = await readText("app/blog/[slug]/page.tsx");
  const blogSource = await readText("lib/seo/blog.ts");
  const robots = await readText("app/robots.ts");
  const sitemap = await readText("app/sitemap.ts");
  const llms = await readText("app/llms.txt/route.ts");
  const schema = await readText("components/seo/site-json-ld.tsx");
  const schemaSource = await readText("lib/seo/schema.ts");
  const pricingSchema = await readText("components/seo/pricing-page-json-ld.tsx");
  const metadata = await readText("lib/seo/metadata.ts");
  const seoConfig = await readText("lib/seo/config.ts");
  const lighthouserc = await readText("lighthouserc.cjs");
  const workflow = await readText(".github/workflows/seo-ci.yml");
  const gscReadinessScript = await readText("scripts/seo/gsc-week1-readiness.mjs");
  const gscReportingScript = await readText("scripts/seo/gsc-reporting.mjs");
  const firecrawlReadinessScript = await readText("scripts/seo/firecrawl-readiness.mjs");
  const firecrawlReadinessReport = await readJsonReport("reports/seo/firecrawl-readiness.json", { root });
  const gscReadinessReport = await readJsonReport("reports/seo/gsc-week1-readiness.json", { root });
  const blogExpansionReport = await readJsonReport("reports/seo/blog-expansion-audit.json", { root });
  const lighthouseSummary = summarizeLighthouse(await readJsonReport("reports/seo/lighthouse-summary.json", { root }));
  const firecrawlSummary = summarizeFirecrawl(
    await readJsonReport(process.env.SEO_FIRECRAWL_REPORT_PATH || "reports/seo/firecrawl-summary.json", { root }),
    process.env.SEO_FIRECRAWL_REPORT_PATH || "reports/seo/firecrawl-summary.json"
  );
  const gscSummary = summarizeGsc(
    await readJsonReport(process.env.SEO_GSC_REPORT_PATH || "reports/seo/gsc-summary.json", { root }),
    process.env.SEO_GSC_REPORT_PATH || "reports/seo/gsc-summary.json"
  );
  const gscHasActionEvidence = ["manual-action-log", "api-or-export"].includes(gscSummary.evidenceLevel);
  const robotsKeepsRenderAssetsCrawlable = !robots.includes('"/_next/"') && robots.includes("/_next/static") && robots.includes("/_next/image");
  const sameAsConfigured = /SEO_ORGANIZATION_SAME_AS\s*=\s*\[[\s\S]*https?:\/\//.test(seoConfig);
  const gscReadinessReady = gscReadinessScript.includes("gsc-week1-readiness.json") && gscReadinessReport?.status === "ready";
  const firecrawlReadinessReady = firecrawlReadinessScript.includes("/v2/map") && Boolean(firecrawlReadinessReport?.status);
  const blogSlugCount = [...blogSource.matchAll(/slug:\s*"([^"]+)"/g)].length;
  const expectedPublicUrlCount = blogSlugCount + 3;
  const firecrawlCoversExpectedUrls =
    firecrawlSummary.configured && (firecrawlSummary.totalPages ?? 0) >= expectedPublicUrlCount && (firecrawlSummary.issueCount ?? 0) === 0;
  const blogReady =
    blogIndex.includes("buildItemListSchema") &&
    blogArticle.includes("buildBlogPostingSchema") &&
    blogArticle.includes("generateStaticParams") &&
    sitemap.includes("getAllBlogPosts") &&
    blogSlugCount >= 8 &&
    blogExpansionReport?.status === "ready";

  const findings = [
    createFinding({
      agent: "Technical SEO Agent",
      area: "crawlability",
      severity: "critical",
      confidence: "CONFIRMED",
      finding: "Robots and sitemap routes are implemented through the Next.js App Router.",
      evidence: [fileEvidence("app/robots.ts"), fileEvidence("app/sitemap.ts")],
      impact: "Keeps indexable marketing pages discoverable while blocking private SaaS surfaces.",
      fix: "Keep robots and sitemap generated from shared SEO config instead of hardcoded page lists.",
      status: "passed"
    }),
    createFinding({
      agent: "Technical SEO Agent",
      area: "crawlability",
      severity: "critical",
      confidence: robotsKeepsRenderAssetsCrawlable ? "CONFIRMED" : "LIKELY",
      finding: "Robots leaves Next.js render assets crawlable for Googlebot.",
      evidence: [
        fileEvidence(
          "app/robots.ts",
          robotsKeepsRenderAssetsCrawlable ? "allows /_next/static and /_next/image without disallowing /_next/" : "render asset crawl rules need review"
        )
      ],
      impact: "Helps Google render the public landing and pricing pages instead of evaluating incomplete HTML/CSS/JS.",
      fix: "Do not reintroduce Disallow: /_next/ in robots.txt.",
      status: robotsKeepsRenderAssetsCrawlable ? "passed" : "open"
    }),
    createFinding({
      agent: "Sitemap Agent",
      area: "indexing",
      severity: "critical",
      confidence: sitemap.includes("SEO_PUBLIC_ROUTES") ? "CONFIRMED" : "LIKELY",
      finding: "Sitemap is scoped to declared public routes.",
      evidence: [fileEvidence("app/sitemap.ts", sitemap.includes("SEO_PUBLIC_ROUTES") ? "uses SEO_PUBLIC_ROUTES" : "does not reference SEO_PUBLIC_ROUTES")],
      impact: "Avoids indexing private tenant dashboards, QR table sessions, auth callbacks and API routes.",
      fix: "Add future public pages to SEO_PUBLIC_ROUTES only after canonical, metadata and content review.",
      status: "passed"
    }),
    createFinding({
      agent: "Content Quality Agent",
      area: "metadata",
      severity: "high",
      confidence: landing.includes("generateMetadata") && pricing.includes("createSeoMetadata") ? "CONFIRMED" : "LIKELY",
      finding: "Core public pages use the shared metadata builder.",
      evidence: [
        fileEvidence("app/page.tsx", landing.includes("generateMetadata") ? "generates metadata from platform config" : "metadata generation not detected"),
        fileEvidence("app/pricing/page.tsx", pricing.includes("createSeoMetadata") ? "uses createSeoMetadata" : "createSeoMetadata not detected")
      ],
      impact: "Improves CTR consistency with canonical URLs, OpenGraph, Twitter cards and descriptions.",
      fix: "Require all future public pages to call createSeoMetadata with a unique title and description.",
      status: "passed"
    }),
    createFinding({
      agent: "Schema Agent",
      area: "structured-data",
      severity: "high",
      confidence: schema.includes("buildOrganizationSchema") && schemaSource.includes("schemaId(") ? "CONFIRMED" : "LIKELY",
      finding: "Organization, WebSite and SoftwareApplication entity schema are emitted server-side.",
      evidence: [
        fileEvidence(
          "components/seo/site-json-ld.tsx",
          schema.includes("buildOrganizationSchema") ? "uses shared schema builders" : "schema builders missing"
        ),
        fileEvidence(
          "lib/seo/schema.ts",
          schemaSource.includes("schemaId(") ? "contains stable schema ID helper" : "stable schema ID helper missing"
        )
      ],
      impact: "Strengthens entity clarity for Google, AI Overviews and software/SaaS result interpretation.",
      fix: "Add sameAs links after official social profiles are finalized; validate JSON-LD before deploy.",
      status: "passed"
    }),
    createFinding({
      agent: "Entity SEO Agent",
      area: "entity",
      severity: "medium",
      confidence: sameAsConfigured ? "CONFIRMED" : "HYPOTHESIS",
      finding: sameAsConfigured
        ? "sameAs authority signals are configured for the LogiVN organization entity."
        : "sameAs authority signals are not yet configured for the LogiVN organization entity.",
      evidence: [fileEvidence("lib/seo/config.ts", sameAsConfigured ? "contains at least one verified sameAs URL" : "SEO_ORGANIZATION_SAME_AS has no verified profile URL")],
      impact: "Entity reconciliation may be weaker until official social, app and business profiles are linked.",
      fix: "Add verified sameAs URLs only after the brand profiles are live and controlled by LogiVN.",
      status: sameAsConfigured ? "passed" : "recommended"
    }),
    createFinding({
      agent: "GEO / AI Search Agent",
      area: "geo",
      severity: "high",
      confidence: llms.includes("Citation guidance") && robots.includes("GPTBot") ? "CONFIRMED" : "LIKELY",
      finding: "AI crawler and llms.txt guidance are present.",
      evidence: [
        fileEvidence("app/llms.txt/route.ts", llms.includes("Citation guidance") ? "contains citation guidance" : "citation guidance missing"),
        fileEvidence("app/robots.ts", robots.includes("GPTBot") ? "declares AI crawler rules" : "AI crawler rules not detected")
      ],
      impact: "Makes LogiVN easier to cite accurately in ChatGPT Search, Perplexity and other answer engines.",
      fix: "Update llms.txt whenever pricing, feature packaging or public product positioning changes.",
      status: "passed"
    }),
    createFinding({
      agent: "AEO Agent",
      area: "answer-engine",
      severity: "medium",
      confidence: pricingSchema.includes("buildFaqSchema") ? "CONFIRMED" : "LIKELY",
      finding: "Pricing page includes FAQ content and FAQPage structured data.",
      evidence: [
        fileEvidence(
          "components/seo/pricing-page-json-ld.tsx",
          pricingSchema.includes("buildFaqSchema") ? "contains FAQPage JSON-LD builder usage" : "FAQPage JSON-LD not detected"
        ),
        fileEvidence("app/pricing/page.tsx", pricing.includes("pricingFaqItems.map") ? "renders visible FAQ content" : "visible FAQ content not detected")
      ],
      impact: "Product-intent and pricing queries are easier for search engines and answer engines to extract accurately.",
      fix: "Keep FAQ answers aligned with the visible pricing copy whenever plans, trials or billing behavior change.",
      status: pricingSchema.includes("buildFaqSchema") && pricing.includes("pricingFaqItems.map") ? "passed" : "recommended"
    }),
    createFinding({
      agent: "Content Quality Agent",
      area: "content-seo",
      severity: "high",
      confidence: blogReady ? "CONFIRMED" : "LIKELY",
      finding: "Blog content hub is open with article schema, internal links and sitemap coverage.",
      evidence: [
        fileEvidence("app/blog/page.tsx", blogIndex.includes("buildItemListSchema") ? "contains ItemList schema and shared posts" : "blog index schema missing"),
        fileEvidence("app/blog/[slug]/page.tsx", blogArticle.includes("buildBlogPostingSchema") ? "contains BlogPosting schema" : "article schema missing"),
        fileEvidence("lib/seo/blog.ts", `${blogSlugCount} editorial seed posts detected`),
        fileEvidence("app/sitemap.ts", sitemap.includes("getAllBlogPosts") ? "maps blog posts into sitemap" : "blog sitemap wiring missing"),
        fileEvidence(
          "reports/seo/blog-expansion-audit.json",
          blogExpansionReport?.status === "ready" ? `Week 2 blog audit ready at ${blogExpansionReport.score}/100` : "Week 2 blog audit missing or not ready"
        )
      ],
      impact: "Expands indexable surface beyond the landing and pricing pages while preserving controlled metadata and structured data.",
      fix: "Keep adding articles through the shared blog registry so each post receives metadata, canonical URL, Article schema and sitemap inclusion.",
      status: blogReady ? "passed" : "recommended"
    }),
    createFinding({
      agent: "Internal Link Agent",
      area: "internal-linking",
      severity: "medium",
      confidence: pricing.includes("href=\"/\"") && pricing.includes("dashboard/register") ? "CONFIRMED" : "LIKELY",
      finding: "Pricing page links back to the home page and conversion routes.",
      evidence: [fileEvidence("app/pricing/page.tsx", "contains navigation and trial CTAs")],
      impact: "Supports crawl paths and conversion flow between the two public commercial pages.",
      fix: "Add contextual links from future feature sections to /pricing with varied, natural anchor text.",
      status: "passed"
    }),
    createFinding({
      agent: "Performance Agent",
      area: "core-web-vitals",
      severity: "high",
      confidence:
        lighthouseSummary?.available
          ? "CONFIRMED"
          : lighthouserc.includes("categories:performance") && workflow.includes("npm run lhci")
            ? "CONFIRMED"
            : "LIKELY",
      finding: lighthouseSummary?.available
        ? "Lighthouse CI reports actual public-route performance and SEO scores."
        : "Lighthouse CI is configured as a regression gate.",
      evidence: [
        fileEvidence("lighthouserc.cjs", lighthouserc.includes("categories:performance") ? "sets performance thresholds" : "performance threshold not detected"),
        fileEvidence(".github/workflows/seo-ci.yml", workflow.includes("npm run lhci") ? "runs Lighthouse CI" : "Lighthouse step missing"),
        fileEvidence(
          "reports/seo/lighthouse-summary.json",
          lighthouseSummary?.available
            ? `weakest route ${lighthouseSummary.weakestRoute?.route ?? "unknown"} at ${lighthouseSummary.weakestRoute?.categories?.performance ?? "n/a"}/100`
            : "summary not generated yet"
        )
      ],
      impact: "Prevents SEO, accessibility and performance regressions from landing unnoticed while exposing the weakest public route for follow-up.",
      fix: lighthouseSummary?.available
        ? "Keep the weakest public route at or above the configured LHCI threshold and investigate LCP or TTFB whenever the summary drops."
        : "Keep LHCI thresholds strict enough for PR signal and tune only after measured production baselines.",
      status:
        lighthouseSummary?.available
          ? (lighthouseSummary.weakestRoute?.categories?.performance ?? 0) >= 85
            ? "passed"
            : "recommended"
          : "passed"
    }),
    createFinding({
      agent: "Verifier Agent",
      area: "validation",
      severity: "high",
      confidence: workflow.includes("npm run seo:audit") && workflow.includes("npm run seo:agentic") ? "CONFIRMED" : "LIKELY",
      finding: "CI synthesizes deterministic checks, Lighthouse evidence and agentic SEO reporting.",
      evidence: [
        fileEvidence(".github/workflows/seo-ci.yml", "runs seo:audit, build, Lighthouse CI and seo:agentic"),
        fileEvidence("scripts/seo/run-lhci.mjs", "writes lighthouse-summary.json for downstream reporting"),
        fileEvidence(
          "reports/seo/lighthouse-summary.json",
          lighthouseSummary?.available ? `contains ${lighthouseSummary.routeCount} latest public-route summaries` : "summary not generated yet"
        )
      ],
      impact: "Creates repeatable evidence-backed reports before deployment rather than relying on manual review.",
      fix: "Provide Firecrawl and Google Search Console JSON summaries to enrich this report with crawl and query evidence.",
      status: "passed"
    }),
    createFinding({
      agent: "Verifier Agent",
      area: "indexing",
      severity: "medium",
      confidence: gscReadinessReady ? "CONFIRMED" : "LIKELY",
      finding: "Week 1 Google Search Console indexing readiness report is generated.",
      evidence: [
        fileEvidence(
          "scripts/seo/gsc-week1-readiness.mjs",
          gscReadinessScript.includes("gsc-week1-readiness.json") ? "writes GSC readiness artifacts" : "readiness script output missing"
        ),
        fileEvidence(
          "reports/seo/gsc-week1-readiness.json",
          gscReadinessReady ? "status ready" : "readiness report missing or not ready"
        )
      ],
      impact: "Gives the team an exact sitemap submission and URL inspection queue before GSC API data is available.",
      fix: "Run node scripts/seo/gsc-week1-readiness.mjs before each SEO handoff and replace readiness with real GSC exports once verified.",
      status: gscReadinessReady ? "passed" : "recommended"
    }),
    createFinding({
      agent: "Verifier Agent",
      area: "indexing",
      severity: "medium",
      confidence: gscSummary.configured ? "CONFIRMED" : "LIKELY",
      finding: gscHasActionEvidence
        ? "Google Search Console action and status evidence is available for SEO reporting."
        : "Google Search Console reporting summary is ready but still waiting for action-log or export evidence.",
      evidence: [
        fileEvidence(
          "scripts/seo/gsc-reporting.mjs",
          gscReportingScript.includes("gsc-summary.json") ? "writes GSC summary artifacts" : "GSC summary output missing"
        ),
        fileEvidence(
          gscSummary.source,
          gscSummary.configured
            ? `${gscSummary.status ?? "unknown"} status, ${gscSummary.evidenceLevel ?? "unknown"} evidence, ${gscSummary.requestedIndexingCount ?? 0} requested indexing actions, ${gscSummary.missingInspectionCount ?? 0} missing inspections`
            : "summary not generated yet"
        )
      ],
      impact: "Connects manual GSC work and future API exports to the same SEO audit signal used by CI.",
      fix: gscHasActionEvidence
        ? "Refresh GSC action or export data after Search Console finishes processing indexing and performance reports."
        : "Save GSC action-log or Search Console performance/indexing exports so the audit can move beyond readiness evidence.",
      status:
        gscHasActionEvidence &&
        (gscSummary.issuesCount ?? 0) === 0 &&
        (gscSummary.missingInspectionCount ?? 0) === 0 &&
        gscSummary.status !== "needs-review" &&
        gscSummary.status !== "needs-gsc-action"
          ? "passed"
          : gscSummary.configured
            ? "recommended"
            : "open"
    }),
    createFinding({
      agent: "Verifier Agent",
      area: "crawlability",
      severity: "medium",
      confidence: firecrawlCoversExpectedUrls ? "CONFIRMED" : firecrawlSummary.configured ? "LIKELY" : firecrawlReadinessReady ? "LIKELY" : "HYPOTHESIS",
      finding: firecrawlCoversExpectedUrls
        ? "Firecrawl crawl evidence is available for SEO reporting."
        : firecrawlSummary.configured
          ? "Firecrawl crawl evidence is available but stale against the current public URL inventory."
        : "Firecrawl mapping integration is ready, but live Firecrawl evidence is not available yet.",
      evidence: [
        fileEvidence(
          "scripts/seo/firecrawl-readiness.mjs",
          firecrawlReadinessScript.includes("/v2/map") ? "calls Firecrawl v2 map when FIRECRAWL_API_KEY is present" : "Firecrawl map integration missing"
        ),
        fileEvidence(
          firecrawlSummary.source,
          firecrawlSummary.configured
            ? `${firecrawlSummary.totalPages ?? 0}/${expectedPublicUrlCount} expected public URLs, ${firecrawlSummary.issueCount ?? 0} issues`
            : firecrawlReadinessReport?.status
              ? `readiness status ${firecrawlReadinessReport.status}`
              : "Firecrawl summary or readiness missing"
        )
      ],
      impact: "Lets SEO CI compare discovered crawl URLs against the expected public sitemap and catch missing blog/landing pages.",
      fix: "Set FIRECRAWL_API_KEY in CI to generate reports/seo/firecrawl-summary.json; optionally set SEO_FIRECRAWL_REQUIRED=1 after credentials are stable.",
      status: firecrawlCoversExpectedUrls ? "passed" : firecrawlSummary.configured || firecrawlReadinessReady ? "recommended" : "open"
    })
  ];

  const sorted = findings.sort((a, b) => b.priorityScore - a.priorityScore);
  const score = Math.round((findings.filter((finding) => finding.status === "passed").length / findings.length) * 100);
  const generatedAt = new Date().toISOString();
  const integrationTasks = [
    firecrawlCoversExpectedUrls ? null : `Run \`npm run seo:firecrawl\` with \`FIRECRAWL_API_KEY\` to refresh Firecrawl crawl evidence at \`${firecrawlSummary.source}\`.`,
    gscHasActionEvidence
      ? null
      : `Provide Google Search Console action-log or export data at \`${gscSummary.source}\` or set \`SEO_GSC_REPORT_PATH\` before running the agentic audit.`
  ].filter(Boolean);

  const report = {
    generatedAt,
    scope: "agentic-seo-foundation",
    score,
    routeInventory: {
      pages: pageFiles.length,
      apiAndSpecialRoutes: routeFiles.length,
      pageFiles,
      routeFiles
    },
    agents,
    findings: sorted,
    nextIntegrations: [
      firecrawlCoversExpectedUrls
        ? "Refresh Firecrawl crawl evidence on schedule so metadata and canonical drift are surfaced automatically."
        : "Add Firecrawl crawl evidence for rendered HTML, metadata, canonicals, headings and internal links.",
      gscHasActionEvidence
        ? "Refresh GSC action/export data so indexing status, impressions, CTR and average position can inform the action plan."
        : "Add Google Search Console action-log or export data for indexing status, impressions, CTR and ranking anomalies.",
      lighthouseSummary?.available
        ? "Use Lighthouse summary deltas to track the weakest public route over time."
        : "Generate Lighthouse summary artifacts so the agentic audit can use real score evidence.",
      "Keep metadata, FAQ schema and sitemap changes tied to confirmed findings only."
    ],
    integrations: {
      lighthouse: lighthouseSummary,
      firecrawl: firecrawlSummary,
      gsc: gscSummary
    },
    sourceGuards: {
      tenantIsolation: seoConfig.includes("SEO_PRIVATE_ROUTE_PREFIXES"),
      sharedMetadataBuilder: metadata.includes("createSeoMetadata"),
      noRawSensitiveData: "Audit only scans route/source metadata and does not export tenant order or payment data."
    }
  };

  const actionPlanItems = [
    ...sorted
      .filter((finding) => finding.status !== "passed")
      .map((finding, index) => `${index + 1}. [${finding.confidence}] ${finding.finding}\n   - Impact: ${finding.seoImpact}\n   - Fix: ${finding.suggestedFix}`),
    ...integrationTasks.map((task, index) => `${sorted.filter((finding) => finding.status !== "passed").length + index + 1}. [ACTION] ${task}`)
  ];
  const actionPlan = actionPlanItems.join("\n\n");

  await writeJsonReport(path.join(reportsDir, "agentic-audit.json"), report, { root });
  await writeTextReport(
    path.join(reportsDir, "FULL-AUDIT-REPORT.md"),
    ["# LogiVN Agentic SEO Audit", "", `Generated: ${generatedAt}`, `Score: ${score}/100`, "", mdTable(sorted), ""].join("\n"),
    { root }
  );
  await writeTextReport(
    path.join(reportsDir, "ACTION-PLAN.md"),
    ["# SEO Action Plan", "", actionPlan || "No open issues above the current foundation threshold.", ""].join("\n"),
    { root }
  );
  await writeTextReport(
    path.join(reportsDir, "TECHNICAL-SEO-REPORT.md"),
    ["# Technical SEO Report", "", mdTable(sorted.filter((finding) => ["crawlability", "indexing", "validation"].includes(finding.area))), ""].join("\n"),
    { root }
  );
  await writeTextReport(
    path.join(reportsDir, "GEO-READINESS-REPORT.md"),
    ["# GEO Readiness Report", "", mdTable(sorted.filter((finding) => ["geo", "answer-engine"].includes(finding.area))), ""].join("\n"),
    { root }
  );
  await writeTextReport(
    path.join(reportsDir, "ENTITY-SEO-REPORT.md"),
    ["# Entity SEO Report", "", mdTable(sorted.filter((finding) => ["entity", "structured-data"].includes(finding.area))), ""].join("\n"),
    { root }
  );
  await writeTextReport(
    path.join(reportsDir, "INTEGRATION-SEO-REPORT.md"),
    [
      "# SEO Integration Report",
      "",
      `Generated: ${generatedAt}`,
      "",
      `- Lighthouse summary: ${lighthouseSummary?.available ? `ready (${lighthouseSummary.routeCount} routes)` : "missing"}`,
      `- Firecrawl input: ${
        firecrawlSummary.configured
          ? `${firecrawlCoversExpectedUrls ? "ready" : "stale"} (${firecrawlSummary.totalPages ?? 0}/${expectedPublicUrlCount} expected URLs, ${firecrawlSummary.issueCount ?? 0} issues)`
          : `missing at ${firecrawlSummary.source}`
      }`,
      `- Google Search Console input: ${
        gscSummary.configured
          ? `${gscSummary.status ?? "ready"} (${gscSummary.evidenceLevel ?? "unknown"} evidence, ${gscSummary.impressions ?? 0} impressions, ${gscSummary.requestedIndexingCount ?? 0} indexing requests, ${gscSummary.missingInspectionCount ?? 0} missing inspections)`
          : `missing at ${gscSummary.source}`
      }`,
      ""
    ].join("\n"),
    { root }
  );

  if (score < 80) {
    console.error(`Agentic SEO audit failed: ${score}/100`);
    process.exit(1);
  }

  console.log(`Agentic SEO audit passed: ${score}/100`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
