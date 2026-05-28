/** @type {import('next-sitemap').IConfig} */
const { assertProductionSeoSiteUrl, resolveSeoSiteUrl } = require("./scripts/seo/site-url.cjs");

const siteUrl = resolveSeoSiteUrl();
assertProductionSeoSiteUrl(siteUrl);

module.exports = {
  siteUrl,
  outDir: "reports/seo/generated",
  generateRobotsTxt: true,
  generateIndexSitemap: false,
  exclude: [
    "/platform-control",
    "/platform-control/*",
    "/api/*",
    "/auth/*",
    "/dashboard",
    "/dashboard/*",
    "/r/*/table/*",
    "/r/*/reserve"
  ],
  transform: async (config, path) => {
    if (path.startsWith("/dashboard") || path.startsWith("/platform-control") || path.startsWith("/api") || path.startsWith("/auth")) {
      return null;
    }

    return {
      loc: path,
      changefreq: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.8,
      lastmod: new Date().toISOString()
    };
  },
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/platform-control/", "/api/", "/auth/", "/dashboard/", "/r/*/table/", "/r/*/reserve/"]
      }
    ],
    additionalSitemaps: [`${siteUrl}/sitemap.xml`]
  }
};
