import { buildAppUrl, getAppUrl } from "@/lib/app-url";

export const SEO_SITE_NAME = "LogiVN";
export const SEO_COMPANY_NAME = "LogiVN";
export const SEO_LEGAL_NAME = "LogiVN";
export const SEO_HOME_TITLE = "LogiVN - Phần mềm gọi món QR cho quán cafe, nhà hàng";
export const SEO_HOME_DESCRIPTION =
  "LogiVN giúp quán cafe, trà sữa và nhà hàng quản lý QR ordering, bàn, VietQR, AI, nhân viên, tồn kho và báo cáo trên một dashboard rõ ràng.";
export const SEO_DEFAULT_TITLE = SEO_HOME_TITLE;
export const SEO_TITLE_TEMPLATE = "%s | LogiVN";
export const SEO_DEFAULT_DESCRIPTION = SEO_HOME_DESCRIPTION;
export const SEO_LOCALE = "vi_VN";
export const SEO_LANG = "vi";
export const SEO_THEME_COLOR = "#0F4D3A";
export const SEO_TWITTER_CARD = "summary_large_image";
export const SEO_ORGANIZATION_SAME_AS = [] as const;

export const SEO_BRAND_LOGO_PATH = "/brand/logivn/logo-horizontal-transparent.png";
export const SEO_DEFAULT_IMAGE_PATH = "/brand/logivn/01-banner-overview-hero-v2.png";

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
    description: "So sánh gói LogiVN Pro, Premium và gói tư vấn cho gọi món QR, đặt món online, đặt bàn, thanh toán VietQR và báo cáo."
  },
  {
    path: "/blog",
    priority: 0.7,
    changeFrequency: "weekly" as const,
    title: "Blog LogiVN - Gọi món QR, VietQR và vận hành quán cafe",
    description: "Kiến thức thực chiến về gọi món QR, thanh toán VietQR, quản lý đơn theo thời gian thực và chuyển đổi số cho quán cafe, nhà hàng Việt."
  },
  {
    path: "/giai-phap",
    priority: 0.82,
    changeFrequency: "weekly" as const,
    title: "Giải pháp LogiVN cho quán cafe, trà sữa và nhà hàng",
    description:
      "Tổng hợp giải pháp LogiVN theo nhu cầu triển khai: QR ordering, AI, quản lý bàn, nhân viên, tồn kho, VietQR, đặt bàn và báo cáo vận hành."
  },
  {
    path: "/so-sanh",
    priority: 0.78,
    changeFrequency: "weekly" as const,
    title: "So sánh LogiVN với KiotViet, CukCuk, Sapo, iPOS và PosApp",
    description:
      "Cụm trang so sánh LogiVN với các phần mềm POS phổ biến theo QR ordering, AI vận hành, VietQR, nhân viên, tồn kho, báo cáo và chi phí triển khai."
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
