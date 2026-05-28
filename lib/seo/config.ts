import { buildSeoUrl, getSeoUrl } from "@/lib/app-url";

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
export const SEO_ORGANIZATION_SAME_AS = parseSameAsUrls(process.env.SEO_ORGANIZATION_SAME_AS);

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
    path: "/demo",
    priority: 0.84,
    changeFrequency: "weekly" as const,
    title: "Demo LogiVN - Xem flow QR ordering, VietQR và AI vận hành",
    description:
      "Xem demo LogiVN cho quán cafe, trà sữa và nhà hàng: khách scan QR, gọi món tại bàn, nhân viên xác nhận, VietQR, dashboard và AI insight."
  },
  {
    path: "/waitlist",
    priority: 0.72,
    changeFrequency: "weekly" as const,
    title: "Waitlist LogiVN - Pilot QR ordering và AI cho quán Việt",
    description:
      "Tham gia waitlist LogiVN để pilot QR ordering, VietQR, AI assistant, quản lý bàn, nhân viên, tồn kho và báo cáo cho quán cafe, trà sữa, nhà hàng."
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
  },
  {
    path: "/dia-phuong",
    priority: 0.76,
    changeFrequency: "weekly" as const,
    title: "LogiVN theo địa phương - TP.HCM, Hà Nội, Đà Nẵng, Cần Thơ, Hải Phòng",
    description:
      "Cụm trang địa phương của LogiVN cho phần mềm quản lý quán cafe, trà sữa, quán ăn và nhà hàng theo bối cảnh vận hành từng thành phố Việt Nam."
  }
];

export const SEO_PRIVATE_ROUTE_PREFIXES = [
  "/platform-control",
  "/api",
  "/auth",
  "/dashboard",
  "/r/*/table",
  "/r/*/reserve"
];

function parseSameAsUrls(value?: string) {
  if (!value) return [] as string[];

  return Array.from(
    new Set(
      value
        .split(",")
        .map((url) => url.trim())
        .filter((url) => /^https:\/\/[^\s,]+$/i.test(url))
    )
  );
}

export function absoluteSeoUrl(path = "/") {
  return buildSeoUrl(path);
}

export function absoluteAssetUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSeoUrl()}${normalizedPath}`;
}
