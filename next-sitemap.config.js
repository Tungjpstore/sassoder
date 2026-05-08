/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || "https://logivn.com",
  outDir: "reports/seo/generated",
  generateRobotsTxt: true,
  generateIndexSitemap: false,
  exclude: [
    "/admin",
    "/admin/*",
    "/api/*",
    "/auth/*",
    "/dashboard",
    "/dashboard/*",
    "/r/*/table/*",
    "/r/*/reserve"
  ],
  transform: async (config, path) => {
    if (path.startsWith("/dashboard") || path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/auth")) {
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
        disallow: ["/admin/", "/api/", "/auth/", "/dashboard/", "/r/*/table/", "/r/*/reserve/"]
      }
    ],
    additionalSitemaps: ["https://logivn.com/sitemap.xml"]
  }
};

