import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";

type SitemapEntry = Awaited<ReturnType<typeof sitemap>>[number];
type RobotsConfig = ReturnType<typeof robots>;

const root = process.cwd();
const outputDir = path.join(root, "reports", "seo", "generated");

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(value: SitemapEntry["lastModified"]) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function renderSitemapXml(entries: SitemapEntry[]) {
  const urls = entries
    .map((entry) => {
      const lastModified = formatDate(entry.lastModified);
      return [
        "<url>",
        `<loc>${escapeXml(entry.url)}</loc>`,
        lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : null,
        entry.changeFrequency ? `<changefreq>${escapeXml(entry.changeFrequency)}</changefreq>` : null,
        typeof entry.priority === "number" ? `<priority>${entry.priority}</priority>` : null,
        "</url>"
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    ""
  ].join("\n");
}

function asArray<T>(value: T | T[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function renderRobotsTxt(config: RobotsConfig) {
  const lines: string[] = [];

  for (const rule of asArray(config.rules)) {
    for (const userAgent of asArray(rule.userAgent)) {
      lines.push(`User-agent: ${userAgent}`);
    }
    for (const allow of asArray(rule.allow)) {
      lines.push(`Allow: ${allow}`);
    }
    for (const disallow of asArray(rule.disallow)) {
      lines.push(`Disallow: ${disallow}`);
    }
    lines.push("");
  }

  if (config.host) {
    lines.push(`Host: ${config.host}`);
  }

  for (const sitemapUrl of asArray(config.sitemap)) {
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

function assertProductionUrls(entries: SitemapEntry[], config: RobotsConfig) {
  const urls = [...entries.map((entry) => entry.url), ...asArray(config.sitemap), config.host].filter(Boolean) as string[];
  const localUrl = urls.find((url) => /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(url));

  if (localUrl && process.env.SEO_ALLOW_LOCAL_SITEMAP !== "1") {
    throw new Error(`Generated SEO URL must not be local: ${localUrl}`);
  }
}

async function main() {
  const entries = sitemap();
  const robotsConfig = robots();

  assertProductionUrls(entries, robotsConfig);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "sitemap.xml"), renderSitemapXml(entries));
  await writeFile(path.join(outputDir, "robots.txt"), renderRobotsTxt(robotsConfig));
  await writeFile(
    path.join(outputDir, "summary.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sitemapUrlCount: entries.length,
        firstUrl: entries[0]?.url ?? null,
        robotsSitemap: robotsConfig.sitemap,
        host: robotsConfig.host
      },
      null,
      2
    )}\n`
  );

  console.log(`SEO sitemap generated: ${entries.length} URLs`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
