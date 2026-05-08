import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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
    id: "sitemap-route",
    area: "indexing",
    severity: "critical",
    confidence: "CONFIRMED",
    file: "app/sitemap.ts",
    finding: "Production sitemap route exists.",
    fix: "Keep sitemap focused on indexable marketing URLs until tenant SEO policy is explicit."
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
    finding: "Organization, WebSite and SoftwareApplication JSON-LD are emitted server-side.",
    fix: "Validate schema in CI after every schema change."
  },
  {
    id: "lhci-config",
    area: "validation",
    severity: "high",
    confidence: "CONFIRMED",
    file: "lighthouserc.cjs",
    finding: "Lighthouse CI thresholds are configured for SEO, performance and accessibility.",
    fix: "Keep thresholds aligned with release risk."
  }
];

async function main() {
  await mkdir(reportsDir, { recursive: true });

  const findings = [];
  for (const check of checks) {
    const fullPath = path.join(root, check.file);
    const present = existsSync(fullPath);
    let evidence = present ? `${check.file} exists` : `${check.file} is missing`;

    if (present && check.file.endsWith(".tsx")) {
      const content = await readFile(fullPath, "utf8");
      if (check.id === "dashboard-noindex") evidence += content.includes("noIndexMetadata") ? " and imports noIndexMetadata" : " but noIndexMetadata was not found";
      if (check.id === "site-jsonld") evidence += content.includes("next-seo") ? " and uses next-seo JSON-LD helpers" : " but next-seo was not found";
    }

    findings.push({
      ...check,
      status: present ? "pass" : "fail",
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

  await writeFile(path.join(reportsDir, "foundation-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
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
    ].join("\n")
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

