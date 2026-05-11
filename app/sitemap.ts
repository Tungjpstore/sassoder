import type { MetadataRoute } from "next";
import { getAllBlogPosts, getAllBlogTopicHubs, getBlogPath, getBlogTopicHubPath } from "@/lib/seo/blog";
import { SEO_PUBLIC_ROUTES, absoluteSeoUrl } from "@/lib/seo/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    ...SEO_PUBLIC_ROUTES.map((route) => ({
      url: absoluteSeoUrl(route.path),
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority
    })),
    ...getAllBlogPosts().map((post) => ({
      url: absoluteSeoUrl(getBlogPath(post.slug)),
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.65
    })),
    ...getAllBlogTopicHubs().map((hub) => ({
      url: absoluteSeoUrl(getBlogTopicHubPath(hub.slug)),
      lastModified: new Date(hub.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.68
    }))
  ];
}
