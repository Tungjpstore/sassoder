import type { MetadataRoute } from "next";
import { SEO_PUBLIC_ROUTES, absoluteSeoUrl } from "@/lib/seo/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return SEO_PUBLIC_ROUTES.map((route) => ({
    url: absoluteSeoUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));
}

