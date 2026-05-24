import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readJsonReport, writeJsonReport, writeTextReport } from "./report-io.mjs";

const root = process.cwd();
const reportsDir = path.join(root, "reports", "seo");
const required = process.env.SEO_GSC_REQUIRED === "1";

const inputPaths = {
  actionLog: process.env.SEO_GSC_ACTION_LOG_PATH || "reports/seo/gsc-action-log.json",
  readiness: process.env.SEO_GSC_READINESS_PATH || "reports/seo/gsc-week1-readiness.json",
  combinedExport: process.env.SEO_GSC_EXPORT_PATH || "reports/seo/gsc-export.json",
  performanceExport: process.env.SEO_GSC_PERFORMANCE_PATH || "reports/seo/gsc-performance-export.json",
  indexingExport: process.env.SEO_GSC_INDEXING_PATH || "reports/seo/gsc-indexing-export.json"
};

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return String(url || "")
      .replace(/[#?].*$/, "")
      .replace(/\/+$/, "");
  }
}

function getNestedRows(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.queries)) return data.queries;
  if (Array.isArray(data.data?.rows)) return data.data.rows;
  if (Array.isArray(data.performance?.rows)) return data.performance.rows;
  return [];
}

function normalizeRow(row) {
  const keys = asArray(row?.keys);
  return {
    query: row?.query || keys[0] || null,
    page: row?.page || row?.url || null,
    clicks: numberOrNull(row?.clicks) ?? 0,
    impressions: numberOrNull(row?.impressions) ?? 0,
    ctr: numberOrNull(row?.ctr) ?? null,
    position: numberOrNull(row?.position) ?? numberOrNull(row?.averagePosition) ?? null
  };
}

function summarizePerformance(rows, performanceExport, combinedExport) {
  const summary = performanceExport?.summary || combinedExport?.summary || combinedExport?.performance?.summary || {};
  const normalizedRows = rows.map(normalizeRow);
  const clicks = numberOrNull(summary.clicks) ?? normalizedRows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = numberOrNull(summary.impressions) ?? normalizedRows.reduce((sum, row) => sum + row.impressions, 0);
  const ctr = numberOrNull(summary.ctr) ?? (impressions ? Number((clicks / impressions).toFixed(4)) : null);
  const averagePosition =
    numberOrNull(summary.averagePosition) ??
    numberOrNull(summary.position) ??
    (normalizedRows.length
      ? Number(
          (
            normalizedRows.reduce((sum, row) => sum + (row.position ?? 0), 0) /
            normalizedRows.filter((row) => row.position !== null).length
          ).toFixed(2)
        )
      : null);

  return {
    rows: normalizedRows,
    clicks,
    impressions,
    ctr,
    averagePosition: Number.isFinite(averagePosition) ? averagePosition : null
  };
}

function summarizeIndexing(indexingExport, combinedExport, actionLog, readiness) {
  const source = indexingExport || combinedExport?.indexing || {};
  const summary = source.summary || {};
  const actionPageIndexing = actionLog?.reports?.pageIndexing || {};
  const inspections = asArray(actionLog?.urlInspection);
  const completedInspections = inspections.filter(
    (item) => item?.state !== "pending-inspection" && !String(item?.actionTaken || "").startsWith("pending-")
  );
  const expectedInspectionUrls = asArray(readiness?.urlsToInspect);
  const inspectedUrlSet = new Set(completedInspections.map((item) => normalizeUrl(item?.url)));
  const missingInspectionUrls = expectedInspectionUrls.filter((url) => !inspectedUrlSet.has(normalizeUrl(url)));
  const indexedObservedCount = completedInspections.filter((item) => item?.state === "indexed").length;
  const discoveredNotIndexedCount = completedInspections.filter((item) => item?.state === "discovered-not-indexed").length;
  const requestedIndexingCount = completedInspections.filter((item) => String(item?.actionTaken || "").includes("requested")).length;

  return {
    indexedPages:
      numberOrNull(summary.indexedPages) ??
      numberOrNull(source.indexedPages) ??
      numberOrNull(actionPageIndexing.indexedPages) ??
      (indexedObservedCount || null),
    excludedPages: numberOrNull(summary.excludedPages) ?? numberOrNull(source.excludedPages) ?? numberOrNull(actionPageIndexing.excludedPages),
    expectedInspectionUrls: expectedInspectionUrls.length,
    missingInspectionUrls,
    inspectedUrls: completedInspections.length,
    pendingInspectionUrls: inspections
      .filter((item) => item?.state === "pending-inspection" || String(item?.actionTaken || "").startsWith("pending-"))
      .map((item) => item.url)
      .filter(Boolean),
    indexedObservedCount,
    discoveredNotIndexedCount,
    requestedIndexingCount,
    reasons: asArray(source.reasons).slice(0, 20)
  };
}

function summarizeActionLog(actionLog) {
  const reports = actionLog?.reports || {};
  const pendingReports = Object.entries(reports)
    .filter(([, value]) => value?.status === "pending")
    .map(([key]) => key);
  const manualActionsStatus = reports.manualActions?.status || null;
  const securityIssuesStatus = reports.securityIssues?.status || null;
  const sitemapStatus = actionLog?.sitemap?.status || null;
  const sitemapDiscoveredPages = numberOrNull(actionLog?.sitemap?.discoveredPages);

  const issues = [];
  if (actionLog) {
    if (sitemapStatus && sitemapStatus !== "success") issues.push(`Sitemap status is ${sitemapStatus}.`);
    if (actionLog.sitemap?.productionCheck?.httpStatus && actionLog.sitemap.productionCheck.httpStatus !== 200) {
      issues.push(`Production sitemap returned HTTP ${actionLog.sitemap.productionCheck.httpStatus}.`);
    }
    if (actionLog.sitemap?.productionCheck && actionLog.sitemap.productionCheck.validXml === false) {
      issues.push("Production sitemap XML is invalid.");
    }
    if (actionLog.robots?.httpStatus && actionLog.robots.httpStatus !== 200) {
      issues.push(`Production robots.txt returned HTTP ${actionLog.robots.httpStatus}.`);
    }
    if (manualActionsStatus && manualActionsStatus !== "pass") issues.push(`Manual actions status is ${manualActionsStatus}.`);
    if (securityIssuesStatus && securityIssuesStatus !== "pass") issues.push(`Security issues status is ${securityIssuesStatus}.`);
  }

  return {
    sitemapStatus,
    sitemapDiscoveredPages,
    pendingReports,
    manualActionsStatus,
    securityIssuesStatus,
    issues
  };
}

function detectEvidenceLevel({ actionLog, combinedExport, performanceExport, indexingExport, readiness }) {
  if (combinedExport || performanceExport || indexingExport) return "api-or-export";
  if (actionLog) return "manual-action-log";
  if (readiness) return "readiness";
  return "none";
}

function getRecommendations({ evidenceLevel, actionSummary, indexingSummary, performanceSummary }) {
  const recommendations = [];
  if (evidenceLevel === "none") {
    recommendations.push("Run npm run seo:gsc to generate readiness, then add action-log or Search Console export data.");
  }
  if (evidenceLevel === "readiness") {
    recommendations.push("Submit sitemap and URL inspection queue in GSC, then save the action status as reports/seo/gsc-action-log.json.");
  }
  if (actionSummary.pendingReports.length) {
    recommendations.push(`Re-check GSC reports after Google processing completes: ${actionSummary.pendingReports.join(", ")}.`);
  }
  if (
    actionSummary.sitemapDiscoveredPages !== null &&
    indexingSummary.expectedInspectionUrls > 0 &&
    actionSummary.sitemapDiscoveredPages < indexingSummary.expectedInspectionUrls
  ) {
    recommendations.push(
      `GSC currently reports ${actionSummary.sitemapDiscoveredPages}/${indexingSummary.expectedInspectionUrls} sitemap URLs discovered; re-check the sitemap table after Google's next crawl refresh.`
    );
  }
  if (indexingSummary.missingInspectionUrls.length) {
    recommendations.push(
      `Inspect and request indexing for newly deployed public URLs: ${indexingSummary.missingInspectionUrls.join(", ")}.`
    );
  }
  if (indexingSummary.discoveredNotIndexedCount > 0) {
    recommendations.push("Monitor discovered-not-indexed URLs until Google crawls them; avoid resubmitting repeatedly because queue priority does not change.");
  }
  if (performanceSummary.rows.length === 0) {
    recommendations.push("Export GSC Performance query/page rows after impressions appear to track CTR and ranking movement.");
  }
  if (!recommendations.length) {
    recommendations.push("Refresh this summary after every major SEO deployment or GSC export.");
  }
  return recommendations;
}

function renderMarkdown(report) {
  return `${[
    "# Google Search Console SEO Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Evidence level: ${report.evidenceLevel}`,
    "",
    "## Summary",
    "",
    `- Sitemap status: ${report.summary.sitemapStatus || "unknown"}`,
    `- Sitemap discovered pages: ${report.summary.sitemapDiscoveredPages ?? "unknown"}`,
    `- Indexed pages: ${report.summary.indexedPages ?? "unknown"}`,
    `- Excluded/not indexed pages: ${report.summary.excludedPages ?? "unknown"}`,
    `- Expected URL inspections: ${report.summary.expectedInspectionUrls}`,
    `- Inspected URLs: ${report.summary.inspectedUrls}`,
    `- Missing URL inspections: ${report.summary.missingInspectionCount}`,
    `- Requested indexing actions: ${report.summary.requestedIndexingCount}`,
    `- Indexed observed URLs: ${report.summary.indexedObservedCount}`,
    `- Discovered, not indexed URLs: ${report.summary.discoveredNotIndexedCount}`,
    `- Performance impressions: ${report.summary.impressions}`,
    `- Performance clicks: ${report.summary.clicks}`,
    `- Pending GSC reports: ${report.summary.pendingReports}`,
    `- Issues: ${report.summary.issuesCount}`,
    "",
    "## Recommendations",
    "",
    ...report.recommendations.map((item) => `- ${item}`),
    ""
  ].join("\n")}\n`;
}

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const [actionLog, readiness, combinedExport, performanceExport, indexingExport] = await Promise.all([
    readJsonReport(inputPaths.actionLog, { root }),
    readJsonReport(inputPaths.readiness, { root }),
    readJsonReport(inputPaths.combinedExport, { root }),
    readJsonReport(inputPaths.performanceExport, { root }),
    readJsonReport(inputPaths.indexingExport, { root })
  ]);

  const rows = [...getNestedRows(combinedExport), ...getNestedRows(performanceExport)];
  const performanceSummary = summarizePerformance(rows, performanceExport, combinedExport);
  const indexingSummary = summarizeIndexing(indexingExport, combinedExport, actionLog, readiness);
  const actionSummary = summarizeActionLog(actionLog);
  const evidenceLevel = detectEvidenceLevel({ actionLog, combinedExport, performanceExport, indexingExport, readiness });
  const issues = [...actionSummary.issues];

  let status = "ready";
  if (issues.length) {
    status = "needs-review";
  } else if (evidenceLevel === "none" || evidenceLevel === "readiness") {
    status = "needs-gsc-evidence";
  } else if (indexingSummary.missingInspectionUrls.length) {
    status = "needs-gsc-action";
  } else if (actionSummary.pendingReports.length || indexingSummary.discoveredNotIndexedCount > 0 || performanceSummary.rows.length === 0) {
    status = "pending-google-data";
  }

  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    scope: "gsc-seo-reporting",
    status,
    evidenceLevel,
    sourceInputs: inputPaths,
    site: actionLog?.site || readiness?.baseUrl || combinedExport?.site || "https://logivn.com",
    summary: {
      clicks: performanceSummary.clicks,
      impressions: performanceSummary.impressions,
      ctr: performanceSummary.ctr,
      averagePosition: performanceSummary.averagePosition,
      indexedPages: indexingSummary.indexedPages,
      excludedPages: indexingSummary.excludedPages,
      sitemapStatus: actionSummary.sitemapStatus,
      sitemapDiscoveredPages: actionSummary.sitemapDiscoveredPages,
      expectedInspectionUrls: indexingSummary.expectedInspectionUrls,
      inspectedUrls: indexingSummary.inspectedUrls,
      missingInspectionCount: indexingSummary.missingInspectionUrls.length,
      requestedIndexingCount: indexingSummary.requestedIndexingCount,
      indexedObservedCount: indexingSummary.indexedObservedCount,
      discoveredNotIndexedCount: indexingSummary.discoveredNotIndexedCount,
      pendingReports: actionSummary.pendingReports.length,
      manualActionsStatus: actionSummary.manualActionsStatus,
      securityIssuesStatus: actionSummary.securityIssuesStatus,
      issuesCount: issues.length
    },
    rows: performanceSummary.rows.slice(0, 100),
    pageIndexing: indexingSummary,
    urlInspection: asArray(actionLog?.urlInspection),
    issues,
    recommendations: getRecommendations({ evidenceLevel, actionSummary, indexingSummary, performanceSummary })
  };

  await writeJsonReport(path.join(reportsDir, "gsc-summary.json"), report, { root });
  await writeTextReport(path.join(reportsDir, "GSC-SEO-REPORT.md"), renderMarkdown(report), { root });

  if (required && status === "needs-review") {
    console.error("GSC SEO report needs review. See reports/seo/gsc-summary.json");
    process.exit(1);
  }

  console.log(`GSC SEO report generated: ${status} (${evidenceLevel})`);
}

main().catch((error) => {
  console.error(error);
  if (required) process.exit(1);
});
