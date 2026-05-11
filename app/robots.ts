import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/app-url";
import { SEO_PRIVATE_ROUTE_PREFIXES } from "@/lib/seo/config";

const aiSearchCrawlers = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "PerplexityBot"];

export default function robots(): MetadataRoute.Robots {
  const host = getAppUrl();
  const allow = ["/", "/_next/static/", "/_next/image"];
  const disallow = Array.from(new Set([...SEO_PRIVATE_ROUTE_PREFIXES, "/api/"]));

  return {
    rules: [
      {
        userAgent: "*",
        allow,
        disallow
      },
      ...aiSearchCrawlers.map((userAgent) => ({
        userAgent,
        allow,
        disallow
      }))
    ],
    sitemap: `${host}/sitemap.xml`,
    host
  };
}
