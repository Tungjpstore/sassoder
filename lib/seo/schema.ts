import { absoluteAssetUrl, absoluteSeoUrl, SEO_COMPANY_NAME, SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_IMAGE_PATH, SEO_BRAND_LOGO_PATH, SEO_SITE_NAME } from "@/lib/seo/config";

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${absoluteSeoUrl("/")}/#organization`,
    name: SEO_COMPANY_NAME,
    legalName: SEO_COMPANY_NAME,
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
}

export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${absoluteSeoUrl("/")}/#website`,
    name: SEO_SITE_NAME,
    url: absoluteSeoUrl("/"),
    inLanguage: "vi-VN",
    publisher: {
      "@id": `${absoluteSeoUrl("/")}/#organization`
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteSeoUrl("/")}?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };
}

export function buildSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${absoluteSeoUrl("/")}/#software`,
    name: SEO_SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: absoluteSeoUrl("/"),
    image: absoluteAssetUrl(SEO_DEFAULT_IMAGE_PATH),
    description: SEO_DEFAULT_DESCRIPTION,
    publisher: {
      "@id": `${absoluteSeoUrl("/")}/#organization`
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "VND",
      lowPrice: 99000,
      highPrice: 199000,
      offerCount: 2,
      availability: "https://schema.org/InStock"
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

