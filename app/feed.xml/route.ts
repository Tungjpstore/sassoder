import { getAllBlogPosts, getBlogPath } from "@/lib/seo/blog";
import { SEO_COMPANY_NAME, SEO_DEFAULT_DESCRIPTION, absoluteSeoUrl } from "@/lib/seo/config";

export const dynamic = "force-static";
export const revalidate = 3600;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const posts = getAllBlogPosts();
  const latestPost = posts[0];
  const lastBuildDate = latestPost ? new Date(latestPost.updatedAt).toUTCString() : new Date().toUTCString();

  const items = posts
    .map((post) => {
      const url = absoluteSeoUrl(getBlogPath(post.slug));
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.description)}</description>`,
        `      <category>${escapeXml(post.category)}</category>`,
        `      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${SEO_COMPANY_NAME} Blog`)}</title>`,
    `    <link>${escapeXml(absoluteSeoUrl("/blog"))}</link>`,
    `    <atom:link href="${escapeXml(absoluteSeoUrl("/feed.xml"))}" rel="self" type="application/rss+xml" />`,
    `    <description>${escapeXml(SEO_DEFAULT_DESCRIPTION)}</description>`,
    "    <language>vi-VN</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    "    <ttl>60</ttl>",
    items,
    "  </channel>",
    "</rss>"
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400"
    }
  });
}
