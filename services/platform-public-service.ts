import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type PlatformSitePlan = {
  code?: string;
  name: string;
  subtitle: string;
  price: string;
  items: string[];
  action: string;
  featured: boolean;
};

const DEFAULT_LANDING_BANNER_URL = "/brand/logivn/01-banner-overview-hero-v2.png";
const PREVIOUS_LANDING_BANNER_URL = "/brand/logivn/01-banner-overview-hero.png";
const LEGACY_LANDING_BANNER_URL = "/brand/logivn/landing-hero.webp";

const fallbackSiteConfig = {
  brand: {
    companyName: "LogiVN",
    legalName: "LogiVN",
    hotline: "1900 633 876",
    email: "support@logivn.com",
    address: "Tầng 3, 139 Nguyễn Trãi, Quận 1, TP. HCM",
    logoUrl: "/brand/logivn/logo-horizontal-nav.png"
  },
  landing: {
    heroTitle: "Nền tảng gọi món & vận hành thông minh cho quán cafe, nhà hàng Việt",
    heroSubtitle:
      "LogiVN giúp quán tối ưu quy trình - từ gọi món bằng QR, quản lý bàn, gọi phục vụ đến thanh toán không tiền mặt. Phục vụ nhanh hơn, vận hành gọn hơn, doanh thu tốt hơn.",
    primaryCta: "Dùng thử ngay",
    secondaryCta: "Xem demo",
    trustTitle: "Vì sao hơn 5.000+ quán đã chọn LogiVN?",
    dashboardTitle: "Bảng quản lý hiện đại - Dễ dùng trên mọi thiết bị",
    dashboardSubtitle: "Theo dõi hoạt động của quán mọi lúc mọi nơi với giao diện trực quan và báo cáo chi tiết.",
    finalTitle: "Sẵn sàng nâng tầm trải nghiệm và doanh thu cho quán của bạn?",
    finalSubtitle: "Đăng ký demo miễn phí - Trải nghiệm LogiVN ngay hôm nay.",
    footerTagline: "Gọi món QR & vận hành thông minh cho quán Việt.",
    bannerUrl: DEFAULT_LANDING_BANNER_URL
  },
  plans: [
    {
      code: "pro",
      name: "LogiVN Pro",
      subtitle: "Dành cho quán cafe, nhà hàng nhỏ và vừa",
      price: "99.000đ",
      items: ["20 bàn và QR theo bàn", "10 nhân viên", "500 món menu", "Trợ lý thông minh cơ bản", "Dùng thử 30 ngày"],
      action: "Dùng thử miễn phí",
      featured: false
    },
    {
      code: "premium",
      name: "LogiVN Premium",
      subtitle: "Dành cho mô hình cần tự động hóa sâu hơn",
      price: "199.000đ",
      items: ["300 bàn và 50 nhân viên", "2.000 món menu", "Nhập menu nhanh từ ảnh", "Đặt bàn và nhận cọc", "Báo cáo nâng cao"],
      action: "Dùng thử miễn phí",
      featured: true
    },
    {
      code: "enterprise",
      name: "Doanh nghiệp",
      subtitle: "Dành cho chuỗi & nhiều chi nhánh",
      price: "Liên hệ",
      items: ["Quản lý nhiều chi nhánh", "Tích hợp riêng", "Hỗ trợ triển khai"],
      action: "Liên hệ tư vấn",
      featured: false
    }
  ] satisfies PlatformSitePlan[]
};

function readObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return { ...fallback, ...(value as Record<string, unknown>) } as T;
}

function normalizeLandingBannerUrl(value: unknown) {
  if (typeof value !== "string") return DEFAULT_LANDING_BANNER_URL;
  const bannerUrl = value.trim();
  if (!bannerUrl || bannerUrl === LEGACY_LANDING_BANNER_URL || bannerUrl === PREVIOUS_LANDING_BANNER_URL) {
    return DEFAULT_LANDING_BANNER_URL;
  }
  return bannerUrl;
}

function readLandingConfig(value: unknown) {
  const landing = readObject(value, fallbackSiteConfig.landing);
  return {
    ...landing,
    bannerUrl: normalizeLandingBannerUrl(landing.bannerUrl)
  };
}

function readFeatures(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map(sanitizePublicFeatureLabel);
}

function sanitizePublicFeatureLabel(value: string) {
  const normalized = value.trim();
  const replacements: Record<string, string> = {
    "Quản lý đơn realtime": "Quản lý đơn theo thời gian thực",
    "AI trợ lý chủ quán": "Trợ lý thông minh cho chủ quán",
    "AI hỗ trợ khách gọi món": "Hỗ trợ khách gọi món",
    "AI quét OCR menu": "Nhập menu nhanh từ ảnh",
    "AI tạo ảnh menu/logo": "Tạo hình ảnh menu và nhận diện quán",
    "QR ordering": "Gọi món QR",
    "Online ordering": "Đặt món online"
  };

  if (replacements[normalized]) return replacements[normalized];

  return normalized
    .replace(/\bAI\b/gi, "Trợ lý thông minh")
    .replace(/\bOCR\b/gi, "từ ảnh")
    .replace(/\brealtime\b/gi, "theo thời gian thực")
    .replace(/\bQR ordering\b/gi, "gọi món QR")
    .replace(/\bonline ordering\b/gi, "đặt món online")
    .replace(/\bdashboard\b/gi, "bảng quản lý")
    .replace(/\bentitlement\b/gi, "tính năng");
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
}

async function readPlatformSiteConfig() {
  try {
    const supabase = createAdminSupabaseClient() as any;
    const [settingsResult, plansResult] = await Promise.all([
      supabase.from("platform_settings").select("key,value").in("key", ["brand", "landing"]),
      supabase.from("saas_plans").select("name,description,monthly_price,trial_days,features,code,is_active,sort_order").eq("is_active", true).order("sort_order", { ascending: true })
    ]);

    if (settingsResult.error || plansResult.error) {
      console.error("Không đọc được cấu hình landing từ platform_settings", settingsResult.error || plansResult.error);
      return fallbackSiteConfig;
    }

    const settings = new Map((settingsResult.data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
    const plans = (plansResult.data ?? []).map((plan: any, index: number) => ({
      name: plan.name,
      code: plan.code,
      subtitle: plan.description || (plan.code === "pro" ? "Dành cho quán cafe, nhà hàng nhỏ và vừa" : "Dành cho mô hình cần mở rộng"),
      price: plan.monthly_price > 0 ? formatPrice(plan.monthly_price) : "Liên hệ",
      items: [...readFeatures(plan.features).slice(0, 4), `Dùng thử ${plan.trial_days} ngày`],
      action: "Dùng thử miễn phí",
      featured: plan.code === "premium" || (!plansResult.data?.some((item: any) => item.code === "premium") && index === 0)
    })) as PlatformSitePlan[];

    return {
      brand: readObject(settings.get("brand"), fallbackSiteConfig.brand),
      landing: readLandingConfig(settings.get("landing")),
      plans: plans.length ? plans : fallbackSiteConfig.plans
    };
  } catch {
    return fallbackSiteConfig;
  }
}

export const getPlatformSiteConfig = unstable_cache(readPlatformSiteConfig, ["platform-site-config"], {
  tags: ["platform-site-config"],
  revalidate: 3600
});

export type PlatformSiteConfig = Awaited<ReturnType<typeof getPlatformSiteConfig>>;
