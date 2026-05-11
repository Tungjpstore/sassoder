import {
  SEO_BRAND_LOGO_PATH,
  SEO_COMPANY_NAME,
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_IMAGE_PATH,
  SEO_LEGAL_NAME,
  SEO_ORGANIZATION_SAME_AS,
  SEO_SITE_NAME,
  absoluteAssetUrl,
  absoluteSeoUrl
} from "@/lib/seo/config";
import type { BlogPost } from "@/lib/seo/blog";

function seoRootUrl() {
  return absoluteSeoUrl("/").replace(/\/+$/, "");
}

function schemaId(fragment: "organization" | "website" | "software") {
  return `${seoRootUrl()}/#${fragment}`;
}

export function buildOrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": schemaId("organization"),
    name: SEO_COMPANY_NAME,
    legalName: SEO_LEGAL_NAME,
    url: absoluteSeoUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: absoluteAssetUrl(SEO_BRAND_LOGO_PATH)
    },
    image: absoluteAssetUrl(SEO_DEFAULT_IMAGE_PATH),
    description: SEO_DEFAULT_DESCRIPTION,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@logivn.com",
      telephone: "1900 633 876",
      availableLanguage: ["vi-VN"]
    },
    areaServed: {
      "@type": "Country",
      name: "Việt Nam"
    }
  };

  if (SEO_ORGANIZATION_SAME_AS.length > 0) {
    return {
      ...schema,
      sameAs: [...SEO_ORGANIZATION_SAME_AS]
    };
  }

  return schema;
}

export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": schemaId("website"),
    name: SEO_SITE_NAME,
    url: absoluteSeoUrl("/"),
    inLanguage: "vi-VN",
    publisher: {
      "@id": schemaId("organization")
    }
  };
}

export function buildSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": schemaId("software"),
    name: SEO_SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: absoluteSeoUrl("/"),
    image: absoluteAssetUrl(SEO_DEFAULT_IMAGE_PATH),
    description: SEO_DEFAULT_DESCRIPTION,
    publisher: {
      "@id": schemaId("organization")
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "VND",
      lowPrice: 99000,
      highPrice: 199000,
      offerCount: 2,
      availability: "https://schema.org/InStock",
      url: absoluteSeoUrl("/pricing")
    },
    featureList: [
      "Gọi món bằng QR theo bàn",
      "Quản lý đơn realtime",
      "Thanh toán VietQR và tiền mặt",
      "Đặt món online và đặt bàn trước",
      "AI hỗ trợ vận hành quán"
    ]
  };
}

export function buildBreadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteSeoUrl(item.path)
    }))
  };
}

export function buildFaqSchema(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };
}

export function buildBlogPostingSchema(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${absoluteSeoUrl(`/blog/${post.slug}`)}#article`,
    headline: post.title,
    description: post.description,
    url: absoluteSeoUrl(`/blog/${post.slug}`),
    image: absoluteAssetUrl(SEO_DEFAULT_IMAGE_PATH),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: "vi-VN",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteSeoUrl(`/blog/${post.slug}`)
    },
    author: {
      "@type": "Organization",
      name: SEO_COMPANY_NAME,
      url: absoluteSeoUrl("/")
    },
    publisher: {
      "@id": schemaId("organization")
    },
    keywords: post.keywords.join(", "),
    articleSection: post.category,
    about: {
      "@type": "Thing",
      name: post.topic
    },
    mentions: post.keywords.map((keyword) => ({
      "@type": "Thing",
      name: keyword
    })),
    isAccessibleForFree: true,
    isPartOf: {
      "@type": "Blog",
      name: "Blog LogiVN",
      url: absoluteSeoUrl("/blog")
    }
  };
}

export function buildItemListSchema(items: Array<{ name: string; path: string; description?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteSeoUrl(item.path),
      name: item.name,
      description: item.description
    }))
  };
}
