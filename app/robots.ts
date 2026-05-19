import type { MetadataRoute } from "next";
import { getSeoUrl } from "@/lib/app-url";
import { SEO_PRIVATE_ROUTE_PREFIXES } from "@/lib/seo/config";

const aiSearchCrawlers = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "PerplexityBot"];

function uniqueRouteRules(routes: string[]) {
  const seen = new Set<string>();

  return routes.filter((route) => {
    const key = route === "/" ? route : route.replace(/\/+$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function robots(): MetadataRoute.Robots {
  const host = getSeoUrl();
  const allow = ["/", "/_next/static/", "/_next/image"];
  const disallow = uniqueRouteRules([...SEO_PRIVATE_ROUTE_PREFIXES, "/api/"]);

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
