import { buildAppUrl, getAppUrl } from "@/lib/app-url";

export const SEO_SITE_NAME = "LogiVN";
export const SEO_COMPANY_NAME = "LogiVN";
export const SEO_LEGAL_NAME = "LogiVN";
export const SEO_DEFAULT_TITLE = "LogiVN - Gọi món QR cho quán Việt";
export const SEO_TITLE_TEMPLATE = "%s | LogiVN";
export const SEO_DEFAULT_DESCRIPTION =
  "LogiVN là nền tảng SaaS gọi món bằng QR, quản lý bàn, vận hành đơn realtime, VietQR và AI cho quán cafe, nhà hàng Việt.";
export const SEO_LOCALE = "vi_VN";
export const SEO_LANG = "vi";
export const SEO_THEME_COLOR = "#0F4D3A";
export const SEO_TWITTER_CARD = "summary_large_image";

export const SEO_BRAND_LOGO_PATH = "/brand/logivn/logo-horizontal-transparent.png";
export const SEO_DEFAULT_IMAGE_PATH = "/brand/logivn/01-banner-overview-hero.png";

export const SEO_PUBLIC_ROUTES = [
  {
    path: "/",
    priority: 1,
    changeFrequency: "weekly" as const,
    title: SEO_DEFAULT_TITLE,
    description: SEO_DEFAULT_DESCRIPTION
  },
  {
    path: "/pricing",
    priority: 0.8,
    changeFrequency: "weekly" as const,
    title: "Bảng giá LogiVN - Pro, Premium cho quán cafe và nhà hàng",
    description: "So sánh gói LogiVN Pro, Premium và Enterprise cho QR ordering, đặt món online, đặt bàn, AI vận hành và báo cáo."
  }
];

export const SEO_PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/api",
  "/auth",
  "/dashboard",
  "/r/*/table",
  "/r/*/reserve"
];

export function absoluteSeoUrl(path = "/") {
  return buildAppUrl(path);
}

export function absoluteAssetUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppUrl()}${normalizedPath}`;
}

