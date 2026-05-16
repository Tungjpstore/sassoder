import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonReport, writeTextReport } from "./report-io.mjs";

const root = process.cwd();
const reportsDir = path.join(root, "reports", "seo");

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://logivn.com").replace(/\/+$/, "");
const firecrawlBaseUrl = (process.env.FIRECRAWL_BASE_URL || "https://api.firecrawl.dev").replace(/\/+$/, "");
const firecrawlApiKey = (process.env.FIRECRAWL_API_KEY || "").trim();
const required = process.env.SEO_FIRECRAWL_REQUIRED === "1";

async function readText(file) {
  const fullPath = path.join(root, file);
  if (!existsSync(fullPath)) return "";
  return readFile(fullPath, "utf8");
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
    return url.replace(/[#?].*$/, "").replace(/\/+$/, "");
  }
}

function hasValidFirecrawlApiKeyShape(apiKey) {
  return /^fc-[A-Za-z0-9_-]{20,}$/.test(apiKey) && !/\s/.test(apiKey);
}

function buildUnavailableReport({ generatedAt, endpoint, expectedUrls, status, message }) {
  return {
    generatedAt,
    status,
    provider: "firecrawl",
    baseUrl,
    endpoint,
    expectedUrls,
    missingUrls: expectedUrls,
    summary: {
      pagesCrawled: 0,
      linksDiscovered: 0,
      discoveredExpectedUrls: 0,
      missingExpectedUrls: expectedUrls.length,
      missingTitleCount: 0,
      missingDescriptionCount: 0,
      metadataScrapedPages: 0,
      metadataScrapeErrors: 0,
      missingCanonicalCount: 0,
      issuesCount: expectedUrls.length
    },
    pages: expectedUrls.map((url) => ({
      url,
      title: "",
      description: "",
      canonical: null,
      discovered: false,
      metadataSource: null
    })),
    message
  };
}

function getLinkUrl(link) {
  if (typeof link === "string") return link;
  return link?.url || link?.sourceURL || link?.metadata?.sourceURL || "";
}

function getLinkTitle(link) {
  return typeof link === "object" && link ? link.title || link.metadata?.title || "" : "";
}

function getLinkDescription(link) {
  return typeof link === "object" && link ? link.description || link.metadata?.description || "" : "";
}

function getMetadataValue(metadata, keys) {
  if (!metadata || typeof metadata !== "object") return "";
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function postFirecrawl(endpoint, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function scrapeMetadata(url) {
  const endpoint = `${firecrawlBaseUrl}/v2/scrape`;
  const { response, payload } = await postFirecrawl(endpoint, {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
    maxAge: Number(process.env.FIRECRAWL_SCRAPE_MAX_AGE || 172800000),
    location: {
      country: "VN",
      languages: ["vi"]
    }
  });

  if (!response.ok) {
    return {
      ok: false,
      httpStatus: response.status,
      message: payload?.error || payload?.message || "Firecrawl scrape request failed."
    };
  }

  const metadata = payload?.data?.metadata || {};
  return {
    ok: true,
    title: getMetadataValue(metadata, ["title", "ogTitle", "twitter:title"]),
    description: getMetadataValue(metadata, ["description", "ogDescription", "twitter:description"]),
    statusCode: metadata.statusCode,
    sourceURL: metadata.sourceURL || metadata.url || url,
    contentType: metadata.contentType || ""
  };
}

async function fetchSitemapUrls() {
  try {
    const response = await fetch(`${baseUrl}/sitemap.xml`);
    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        urls: [],
        message: `Sitemap request failed with HTTP ${response.status}.`
      };
    }

    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim()).filter(Boolean);
    return {
      ok: true,
      httpStatus: response.status,
      urls
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      urls: [],
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function renderMarkdown(report) {
  const expectedUrls = Array.isArray(report.expectedUrls) ? report.expectedUrls : [];
  const lines = [
    "# Firecrawl SEO Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Base URL: ${report.baseUrl}`,
    `Endpoint: ${report.endpoint}`,
    "",
    "## Expected Public URLs",
    ...(expectedUrls.length ? expectedUrls.map((url) => `- ${url}`) : ["- Not available because the crawl failed before URL discovery completed."]),
    ""
  ];

  if (report.status === "ready") {
    lines.push(
      "## Crawl Summary",
      "",
      `- Discovered public URLs: ${report.summary.discoveredExpectedUrls}/${expectedUrls.length}`,
      `- Missing expected URLs: ${report.summary.missingExpectedUrls}`,
      `- Missing titles: ${report.summary.missingTitleCount}`,
      `- Missing descriptions: ${report.summary.missingDescriptionCount}`,
      `- Metadata scrapes: ${report.summary.metadataScrapedPages}`,
      `- Metadata scrape errors: ${report.summary.metadataScrapeErrors}`,
      "",
      "## Missing URLs",
      ...(report.missingUrls.length ? report.missingUrls.map((url) => `- ${url}`) : ["- None"]),
      ""
    );
  } else {
    lines.push(
      "## Next Step",
      "",
      report.message || "Firecrawl readiness could not complete. Check the JSON report for error details.",
      "",
      "Set `FIRECRAWL_API_KEY` to enable live Firecrawl mapping. Set `SEO_FIRECRAWL_REQUIRED=1` only when CI should fail on missing or incomplete crawl evidence.",
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

async function writeReadiness(report) {
  await writeJsonReport(path.join(reportsDir, "firecrawl-readiness.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "FIRECRAWL-READINESS.md"), renderMarkdown(report), { root });
}

async function writeFullReport(report) {
  await writeReadiness(report);
  await writeJsonReport(path.join(reportsDir, "firecrawl-summary.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "FIRECRAWL-SEO-REPORT.md"), renderMarkdown(report), { root });
}

async function main() {
  const blog = await readText("lib/seo/blog.ts");
  const intentPages = await readText("lib/seo/intent-pages.ts");
  const intentPageExpansions = await readText("lib/seo/intent-page-expansions.ts");
  const intentPageExpansionBatch2 = await readText("lib/seo/intent-page-expansion-batch-2.ts");
  const combinedIntentPages = `${intentPages}\n${intentPageExpansions}\n${intentPageExpansionBatch2}`;
  const expectedUrls = ["/", "/pricing", "/giai-phap", ...extractIntentRoutes(combinedIntentPages), ...extractBlogRoutes(blog)].map(absoluteUrl);
  const generatedAt = new Date().toISOString();
  const endpoint = `${firecrawlBaseUrl}/v2/map`;

  if (!firecrawlApiKey) {
    const report = buildUnavailableReport({
      generatedAt,
      status: "needs-api-key",
      endpoint,
      expectedUrls,
      message: "Firecrawl API key is not configured, so live crawl evidence was not generated."
    });
    await writeFullReport(report);
    console.log("Firecrawl readiness generated: set FIRECRAWL_API_KEY to enable live mapping.");
    if (required) process.exit(1);
    return;
  }

  if (!hasValidFirecrawlApiKeyShape(firecrawlApiKey)) {
    const report = buildUnavailableReport({
      generatedAt,
      status: "invalid-api-key",
      endpoint,
      expectedUrls,
      message: "FIRECRAWL_API_KEY is present but does not match the expected Firecrawl token format."
    });
    await writeFullReport(report);
    console.log("Firecrawl readiness generated: FIRECRAWL_API_KEY is present but invalid.");
    if (required) process.exit(1);
    return;
  }

  const { response, payload } = await postFirecrawl(endpoint, {
    url: baseUrl,
    limit: Number(process.env.FIRECRAWL_LIMIT || 100),
    sitemap: "include",
    location: {
      country: "VN",
      languages: ["vi"]
    }
  });

  if (!response.ok) {
    const report = {
      generatedAt,
      status: "error",
      provider: "firecrawl",
      baseUrl,
      endpoint,
      expectedUrls,
      httpStatus: response.status,
      message: payload?.error || payload?.message || "Firecrawl map request failed."
    };
    await writeReadiness(report);
    console.log(`Firecrawl readiness generated with API error: ${response.status}`);
    if (required) process.exit(1);
    return;
  }

  const rawLinks = Array.isArray(payload.links) ? payload.links : Array.isArray(payload.data?.links) ? payload.data.links : [];
  const sitemap = await fetchSitemapUrls();
  const sitemapUrls = new Set(sitemap.urls.map(normalizeUrl));
  const linksByUrl = new Map();
  for (const link of rawLinks) {
    const url = getLinkUrl(link);
    if (!url) continue;
    linksByUrl.set(normalizeUrl(url), link);
  }

  const pages = expectedUrls.map((url) => {
    const normalizedUrl = normalizeUrl(url);
    const link = linksByUrl.get(normalizedUrl);
    const discoveredInSitemap = sitemapUrls.has(normalizedUrl);
    return {
      url,
      title: getLinkTitle(link),
      description: getLinkDescription(link),
      canonical: link || discoveredInSitemap ? url : null,
      discovered: Boolean(link) || discoveredInSitemap,
      discoverySource: link ? "firecrawl-map" : discoveredInSitemap ? "sitemap" : null,
      metadataSource: link ? "map" : discoveredInSitemap ? "sitemap" : null
    };
  });

  const pagesNeedingMetadata = pages.filter((page) => page.discovered && (!page.title || !page.description));
  const scrapeResults = [];
  for (const page of pagesNeedingMetadata) {
    const metadata = await scrapeMetadata(page.url);
    scrapeResults.push({ url: page.url, ...metadata });
    if (!metadata.ok) continue;
    page.title ||= metadata.title;
    page.description ||= metadata.description;
    page.metadataSource = "scrape";
    page.firecrawlStatusCode = metadata.statusCode;
    page.firecrawlContentType = metadata.contentType;
  }

  const missingUrls = pages.filter((page) => !page.discovered).map((page) => page.url);
  const missingTitleCount = pages.filter((page) => page.discovered && !page.title).length;
  const missingDescriptionCount = pages.filter((page) => page.discovered && !page.description).length;
  const metadataScrapeErrors = scrapeResults.filter((result) => !result.ok).length;
  const summary = {
    pagesCrawled: pages.length,
    linksDiscovered: rawLinks.length,
    sitemapUrlsDiscovered: sitemap.urls.length,
    mapDiscoveredExpectedUrls: expectedUrls.filter((url) => linksByUrl.has(normalizeUrl(url))).length,
    sitemapDiscoveredExpectedUrls: expectedUrls.filter((url) => sitemapUrls.has(normalizeUrl(url))).length,
    discoveredExpectedUrls: pages.filter((page) => page.discovered).length,
    missingExpectedUrls: missingUrls.length,
    missingTitleCount,
    missingDescriptionCount,
    metadataScrapedPages: scrapeResults.filter((result) => result.ok).length,
    metadataScrapeErrors,
    missingCanonicalCount: pages.filter((page) => page.discovered && !page.canonical).length,
    issuesCount: missingUrls.length + missingTitleCount + missingDescriptionCount + metadataScrapeErrors
  };
  const status = summary.issuesCount === 0 ? "ready" : "needs-review";
  const report = {
    generatedAt,
    status,
    provider: "firecrawl-map",
    baseUrl,
    endpoint,
    expectedUrls,
    missingUrls,
    sitemap,
    canonicalAssumedFromExpectedUrl: true,
    summary,
    scrapeResults,
    pages
  };

  await writeFullReport(report);

  if (status !== "ready" && required) {
    console.error("Firecrawl crawl evidence needs review. See reports/seo/firecrawl-summary.json");
    process.exit(1);
  }

  console.log(`Firecrawl mapping completed: ${summary.discoveredExpectedUrls}/${expectedUrls.length} expected URLs discovered.`);
}

main().catch(async (error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    status: "error",
    provider: "firecrawl",
    baseUrl,
    endpoint: `${firecrawlBaseUrl}/v2/map`,
    message: error instanceof Error ? error.message : String(error)
  };
  await writeReadiness(report);
  console.error(error);
  if (required) process.exit(1);
});
