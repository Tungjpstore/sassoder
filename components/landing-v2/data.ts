/* Real product data — sourced from:
 *   - lib/billing/catalog.ts (featureCatalog · planCatalog)
 *   - services/platform-public-service.ts
 *   - lib/seo/config.ts
 * This is the single source of truth for landing copy. */

import {
  Activity,
  BarChart3,
  Bell,
  ClipboardList,
  Globe,
  LineChart,
  QrCode,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Utensils,
  WalletCards
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CapabilityIconKey } from "./visuals/icons";

const brand = "/brand/logivn";

export type BannerAsset = { src: string; w: number; h: number };

export const banner: Record<string, BannerAsset> = {
  hero: { src: `${brand}/01-banner-overview-hero-v2.png`, w: 1314, h: 1197 },
  dashboard: { src: `${brand}/02-banner-owner-dashboard.png`, w: 1916, h: 821 },
  customerQr: { src: `${brand}/03-banner-customer-qr-ordering.png`, w: 1916, h: 821 },
  payment: { src: `${brand}/04-banner-payment-service.png`, w: 1916, h: 821 },
  staff: { src: `${brand}/staff-operations-illustration.png`, w: 1536, h: 1024 }
};

/* Hero proof — real metrics aligned with platform-public-service. */
export type Proof = { value: string; label: string };

export const heroProofs: Proof[] = [
  { value: "5.000+", label: "quán Việt đang vận hành cùng LogiVN" },
  { value: "30 ngày", label: "dùng thử đầy đủ trước khi trả phí" },
  { value: "0 đ", label: "phí khởi tạo, không bắt buộc mua POS" }
];

/* Trust strip — short proof chips shown under hero. */
export const trustChips: string[] = [
  "Không cần mua POS",
  "Khách không cần tải app",
  "Thanh toán VietQR",
  "Hỗ trợ tiếng Việt"
];

/* Showcase — alternating real product imagery + benefit copy. */
export type Showcase = {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  bullets: { icon: LucideIcon; label: string }[];
  asset: BannerAsset;
  imageAlt: string;
  stat: { value: string; label: string };
};

export const showcases: Showcase[] = [
  {
    id: "qr",
    eyebrow: "Trải nghiệm khách hàng",
    title: "Khách quét QR là gọi món được ngay",
    text: "Không cần tải app. Khách mở menu theo bàn, chọn món, thêm topping, gọi thêm hoặc gọi phục vụ ngay trên điện thoại.",
    bullets: [
      { icon: QrCode, label: "Gọi món QR theo từng bàn" },
      { icon: Utensils, label: "Menu, topping, combo rõ ràng" },
      { icon: Bell, label: "Gọi phục vụ và gọi thêm món một chạm" },
      { icon: Globe, label: "Đặt món online: đến lấy và giao hàng" }
    ],
    asset: banner.customerQr,
    imageAlt: "Giao diện khách quét QR gọi món trên điện thoại",
    stat: { value: "~15 giây", label: "từ lúc quét QR đến khi gửi order" }
  },
  {
    id: "owner",
    eyebrow: "Bảng điều hành chủ quán",
    title: "Toàn bộ quán trong một màn hình",
    text: "Doanh thu, đơn, bàn, bếp, thanh toán và tồn kho hội tụ một nơi. Tín hiệu quan trọng hiện ngay để ra quyết định trong giờ cao điểm.",
    bullets: [
      { icon: Activity, label: "Đơn hàng theo thời gian thực" },
      { icon: BarChart3, label: "Analytics doanh thu và món bán chạy" },
      { icon: LineChart, label: "Tín hiệu realtime cho giờ cao điểm" },
      { icon: ShieldCheck, label: "Phân quyền nhân sự theo vai trò" }
    ],
    asset: banner.dashboard,
    imageAlt: "Bảng quản lý tổng quan của chủ quán LogiVN",
    stat: { value: "1 màn hình", label: "thay cho nhiều sổ sách rời rạc" }
  },
  {
    id: "payment",
    eyebrow: "Thanh toán & đối soát",
    title: "Thu VietQR gọn, đối soát từng hóa đơn",
    text: "Khách quét chuyển khoản quen thuộc. Trạng thái thanh toán cập nhật tức thì, chủ quán đối soát rõ ràng cuối ca.",
    bullets: [
      { icon: WalletCards, label: "Thanh toán VietQR cho mọi ca bán" },
      { icon: Receipt, label: "Đối soát theo từng hóa đơn" },
      { icon: ClipboardList, label: "Đồng bộ với đơn và bàn" },
      { icon: TrendingUp, label: "Theo dõi tiền chờ thu theo thời gian thực" }
    ],
    asset: banner.payment,
    imageAlt: "Màn hình thanh toán và dịch vụ của LogiVN",
    stat: { value: "Tức thì", label: "trạng thái thanh toán cập nhật realtime" }
  }
];

/* Full capability map — grouped from featureCatalog. Shows the
 * real breadth of the platform, not just 4 highlights. */
export type CapabilityGroup = {
  iconKey: CapabilityIconKey;
  title: string;
  caption: string;
  items: { label: string; badge?: "AI" | "PRO" | "PREMIUM" }[];
};

export const capabilityGroups: CapabilityGroup[] = [
  {
    iconKey: "storefront",
    title: "Vận hành tại quán",
    caption: "Lõi phục vụ mỗi ca bán",
    items: [
      { label: "Gọi món QR theo bàn", badge: "PRO" },
      { label: "Quản lý sơ đồ bàn & khu vực", badge: "PRO" },
      { label: "Đơn hàng theo thời gian thực", badge: "PRO" },
      { label: "Quản lý menu & giá realtime", badge: "PRO" },
      { label: "Đặt món online: pickup & giao", badge: "PRO" },
      { label: "Phân quyền nhân viên theo vai trò", badge: "PREMIUM" }
    ]
  },
  {
    iconKey: "payment",
    title: "Thanh toán & đặt chỗ",
    caption: "Từ gọi món đến thu tiền",
    items: [
      { label: "Thanh toán VietQR", badge: "PRO" },
      { label: "Đối soát hóa đơn", badge: "PRO" },
      { label: "Đặt bàn & nhận cọc", badge: "PREMIUM" },
      { label: "Chăm sóc khách quay lại", badge: "PREMIUM" }
    ]
  },
  {
    iconKey: "inventory",
    title: "Tồn kho & giá vốn",
    caption: "Kiểm soát thất thoát",
    items: [
      { label: "Kho cơ bản & cảnh báo thiếu hàng", badge: "PRO" },
      { label: "PO, nhà cung cấp, lô & HSD", badge: "PREMIUM" },
      { label: "Kiểm kê, điều chuyển, hao hụt", badge: "PREMIUM" },
      { label: "AI đọc hóa đơn nhập kho", badge: "AI" },
      { label: "AI gợi ý mua hàng & cảnh báo", badge: "AI" }
    ]
  },
  {
    iconKey: "ai",
    title: "Trợ lý AI",
    caption: "Đọc dữ liệu, gợi ý hành động",
    items: [
      { label: "Trợ lý vận hành cho chủ quán", badge: "AI" },
      { label: "Tạo menu & mô tả món", badge: "AI" },
      { label: "Tạo ảnh món & banner", badge: "PREMIUM" },
      { label: "Trợ lý hỏi đáp nhanh", badge: "AI" },
      { label: "Trợ lý nâng cao theo ngữ cảnh", badge: "PREMIUM" }
    ]
  },
  {
    iconKey: "analytics",
    title: "Báo cáo & tăng trưởng",
    caption: "Nhìn được thay vì đoán",
    items: [
      { label: "Analytics cơ bản & xuất PDF", badge: "PRO" },
      { label: "Báo cáo thông minh & dự báo", badge: "PREMIUM" },
      { label: "Tín hiệu theo thời gian thực", badge: "PREMIUM" },
      { label: "Marketing thông minh", badge: "PREMIUM" }
    ]
  },
  {
    iconKey: "brand",
    title: "Thương hiệu & tự động hóa",
    caption: "Mở rộng chuyên nghiệp",
    items: [
      { label: "Branding & QR nhận diện", badge: "PRO" },
      { label: "Nhận diện QR nâng cao", badge: "PREMIUM" },
      { label: "Tên miền riêng", badge: "PREMIUM" },
      { label: "Quy trình tự động nhiều bước", badge: "PREMIUM" }
    ]
  }
];

/* How it works — 4 setup steps. */
export type Step = { no: string; title: string; text: string };

export const steps: Step[] = [
  { no: "01", title: "Tạo quán", text: "Đăng ký, nhập thông tin quán và cấu hình phong cách phục vụ trong vài phút." },
  { no: "02", title: "Lên menu", text: "Thêm món, phân loại, đặt giá. Premium nhập nhanh từ ảnh hóa đơn hoặc menu cũ." },
  { no: "03", title: "In QR cho bàn", text: "Gắn mã QR theo từng bàn để khách tự bắt đầu hành trình gọi món." },
  { no: "04", title: "Vào nhịp bán", text: "Nhận đơn, thu VietQR, theo dõi vận hành và để AI đọc tín hiệu giúp bạn." }
];

/* Pricing plans. */
export type Plan = {
  code: string;
  name: string;
  price: string;
  cadence: string;
  tag?: string;
  summary: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

export const plans: Plan[] = [
  {
    code: "pro",
    name: "Pro",
    price: "99.000₫",
    cadence: "/ tháng · dùng thử 30 ngày",
    tag: "Bắt đầu nhanh",
    summary: "Cho quán cafe, trà sữa, quán ăn nhỏ muốn đưa QR ordering vào vận hành ngay.",
    features: [
      "20 bàn · 10 nhân viên · 500 món",
      "Gọi món QR + đặt món online",
      "VietQR + đối soát hóa đơn",
      "Kho cơ bản + analytics + xuất PDF"
    ],
    cta: { label: "Dùng thử Pro miễn phí", href: "/dashboard/register?plan=pro" }
  },
  {
    code: "premium",
    name: "Premium",
    price: "199.000₫",
    cadence: "/ tháng · dùng thử 30 ngày",
    tag: "Đề xuất",
    summary: "Cho quán đã có nhịp ổn định, cần AI, đặt bàn, báo cáo sâu và giới hạn lớn hơn.",
    features: [
      "300 bàn · 50 nhân viên · 2.000 món",
      "Đặt bàn & nhận cọc · loyalty",
      "Trung tâm kho + AI đọc hóa đơn nhập",
      "Báo cáo thông minh + tự động hóa nâng cao"
    ],
    cta: { label: "Dùng thử Premium", href: "/dashboard/register?plan=premium" },
    featured: true
  }
];

/* Detailed feature comparison — sourced from planCatalog entitlements */
export type ComparisonRow = {
  category: string;
  features: {
    label: string;
    pro: boolean | string; // true/false or specific limit like "20 bàn"
    premium: boolean | string;
  }[];
};

export const comparisonRows: ComparisonRow[] = [
  {
    category: "Vận hành cơ bản",
    features: [
      { label: "Số lượng bàn", pro: "20 bàn", premium: "300 bàn" },
      { label: "Số nhân viên", pro: "10 người", premium: "50 người" },
      { label: "Món trong menu", pro: "500 món", premium: "2.000 món" },
      { label: "Gọi món QR theo bàn", pro: true, premium: true },
      { label: "Đặt món online (pickup + giao)", pro: true, premium: true },
      { label: "Quản lý menu realtime", pro: true, premium: true },
      { label: "Đơn hàng theo thời gian thực", pro: true, premium: true },
      { label: "Phân quyền nâng cao theo vai trò", pro: false, premium: true }
    ]
  },
  {
    category: "Thanh toán & khách hàng",
    features: [
      { label: "Thanh toán VietQR", pro: true, premium: true },
      { label: "Đối soát hóa đơn", pro: true, premium: true },
      { label: "Đặt bàn & nhận cọc", pro: false, premium: true },
      { label: "Chăm sóc khách quay lại (loyalty)", pro: false, premium: true }
    ]
  },
  {
    category: "Kho & giá vốn",
    features: [
      { label: "Kho cơ bản & cảnh báo thiếu hàng", pro: true, premium: true },
      { label: "Trung tâm kho (PO, lô/HSD, kiểm kê)", pro: false, premium: true },
      { label: "AI đọc hóa đơn nhập kho", pro: false, premium: "300 lượt/tháng" },
      { label: "AI gợi ý mua hàng & phát hiện bất thường", pro: false, premium: "120 lượt/tháng" }
    ]
  },
  {
    category: "Trợ lý AI",
    features: [
      { label: "Tạo menu & mô tả món", pro: "60 lượt/tháng", premium: "300 lượt/tháng" },
      { label: "Trợ lý hỏi đáp", pro: "500 lượt/tháng", premium: "5.000 lượt/tháng" },
      { label: "Tạo ảnh món & banner", pro: "Dùng thử 1 lần", premium: "120 ảnh/tháng" },
      { label: "Trợ lý nâng cao cho chủ quán", pro: false, premium: "2.000 lượt/tháng" }
    ]
  },
  {
    category: "Báo cáo & tăng trưởng",
    features: [
      { label: "Analytics cơ bản", pro: true, premium: true },
      { label: "Xuất báo cáo PDF", pro: "20 lần/tháng", premium: "200 lần/tháng" },
      { label: "Báo cáo thông minh & dự báo", pro: "Dùng thử 1 lần", premium: "120 lượt/tháng" },
      { label: "Tín hiệu theo thời gian thực", pro: false, premium: true },
      { label: "Marketing thông minh", pro: false, premium: "150 lượt/tháng" }
    ]
  },
  {
    category: "Thương hiệu & tự động hóa",
    features: [
      { label: "Branding cơ bản (logo, màu)", pro: true, premium: true },
      { label: "Nhận diện QR nâng cao", pro: false, premium: true },
      { label: "Tên miền riêng", pro: false, premium: true },
      { label: "Nhận diện thông minh", pro: "Dùng thử 1 lần", premium: "60 lượt/tháng" },
      { label: "Quy trình tự động nhiều bước", pro: false, premium: "300 lượt/tháng" }
    ]
  }
];

export type FAQ = { q: string; a: string };

export const faqs: FAQ[] = [
  {
    q: "LogiVN có cần mua máy POS riêng không?",
    a: "Không. Quán bắt đầu bằng web, điện thoại hoặc máy tính bảng. Khi quy trình ổn định mới đầu tư thêm thiết bị nếu cần."
  },
  {
    q: "Khách có phải tải app để gọi món QR không?",
    a: "Không. Khách quét QR tại bàn hoặc mở link đặt món online để xem menu, chọn món, gửi order và thanh toán VietQR."
  },
  {
    q: "Pro 99K và Premium 199K khác nhau thế nào?",
    a: "Pro đủ để 20 bàn, 10 nhân viên, 500 món bắt đầu QR ordering. Premium nâng lên 300 bàn, 50 nhân viên, 2.000 món, mở AI, đặt bàn, kho nâng cao và báo cáo sâu."
  },
  {
    q: "AI của LogiVN giúp gì cụ thể?",
    a: "AI đọc hóa đơn nhập kho, gợi ý mua hàng, tạo menu và mô tả món, tạo ảnh món và banner, dự báo doanh thu, gợi ý chiến dịch marketing và tóm tắt việc cần làm cho chủ quán."
  },
  {
    q: "Quán có được dùng thử trước khi trả phí không?",
    a: "Có. Mỗi gói có 30 ngày dùng thử đầy đủ để chủ quán kiểm tra sự phù hợp với menu, nhân sự, bàn và nhịp phục vụ trước khi nâng cấp."
  }
];

export type Testimonial = { name: string; role: string; quote: string };

export const testimonials: Testimonial[] = [
  {
    name: "Anh Minh",
    role: "Chủ quán cafe · Đà Nẵng",
    quote: "Khách tự gọi món rất mượt, nhân viên đỡ rối hẳn trong giờ đông."
  },
  {
    name: "Chị Hương",
    role: "Quản lý nhà hàng · Hà Nội",
    quote: "Bảng quản lý đủ rõ để mình kiểm soát bàn, đơn và báo cáo ngay trên điện thoại khi đang ở ngoài quán."
  },
  {
    name: "Anh Tuấn",
    role: "Chủ chuỗi trà sữa · TP.HCM",
    quote: "Triển khai cho nhiều chi nhánh vẫn giữ được trải nghiệm đồng nhất, từ QR đến báo cáo."
  }
];
