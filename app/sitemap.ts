import type { MetadataRoute } from "next";
import { getAllBlogPosts, getAllBlogTopicHubs, getBlogPath, getBlogTopicHubPath } from "@/lib/seo/blog";
import { getAllComparisonPages } from "@/lib/seo/comparison-pages";
import { SEO_PUBLIC_ROUTES, absoluteSeoUrl } from "@/lib/seo/config";
import { getAllSeoIntentPages } from "@/lib/seo/intent-pages";
import { getAllLocalSeoPages } from "@/lib/seo/local-pages";

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
    })),
    ...getAllSeoIntentPages().map((page) => ({
      url: absoluteSeoUrl(page.path),
      lastModified: new Date(page.updatedAt),
      changeFrequency: page.changeFrequency,
      priority: page.priority
    })),
    ...getAllComparisonPages().map((page) => ({
      url: absoluteSeoUrl(page.path),
      lastModified: new Date(page.updatedAt),
      changeFrequency: page.changeFrequency,
      priority: page.priority
    })),
    ...getAllLocalSeoPages().map((page) => ({
      url: absoluteSeoUrl(page.path),
      lastModified: new Date(page.updatedAt),
      changeFrequency: page.changeFrequency,
      priority: page.priority
    }))
  ];
}
