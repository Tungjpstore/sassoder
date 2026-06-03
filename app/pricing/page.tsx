import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MonitorPlay, Route, ShieldCheck, Sparkles, TrendingUp, WalletCards } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { MarketingFunnelTracker } from "@/components/marketing/funnel-tracker";
import { PricingPageJsonLd, pricingFaqItems } from "@/components/seo/pricing-page-json-ld";
import { formatVnd } from "@/lib/money";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getPlatformSiteConfig } from "@/services/platform-public-service";
import { getPublicActivePlans } from "@/services/subscription-service";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "Bảng giá LogiVN - Pro, Premium cho quán cafe và nhà hàng",
  description:
    "So sánh LogiVN Pro 99K và Premium 199K cho QR ordering, order tại bàn, AI assistant, VietQR, nhân sự, tồn kho và báo cáo.",
  path: "/pricing"
});

const pricingSignals = [
  { value: "99K", label: "Pro để bắt đầu QR ordering gọn" },
  { value: "199K", label: "Premium cho AI và vận hành sâu hơn" },
  { value: "30 ngày", label: "dùng thử trước khi nâng cấp" },
  { value: "0 POS", label: "không bắt buộc mua máy riêng" }
];

const planIntentCopy: Record<string, { badge: string; bestFor: string; roi: string; unlocks: string[] }> = {
  pro: {
    badge: "Bắt đầu nhanh",
    bestFor: "Quán cafe, trà sữa, quán ăn nhỏ cần tối đa 20 bàn, 10 nhân viên và 500 món menu để thay menu giấy nhanh hơn.",
    roi: "Tối ưu chi phí ở giai đoạn đầu: đủ QR, đơn realtime, dashboard và VietQR để kiểm tra độ hợp với quán.",
    unlocks: ["20 bàn", "10 nhân viên", "500 món menu", "Dashboard cơ bản"]
  },
  premium: {
    badge: "Đề xuất tăng trưởng",
    bestFor: "Quán đã có nhịp order ổn định, cần đến 300 bàn, 50 nhân viên, 2.000 món menu, AI, đặt bàn và báo cáo sâu.",
    roi: "Tăng đòn bẩy vận hành: AI giúp đọc doanh thu, dự đoán giờ cao điểm, gợi ý combo và giảm thao tác thủ công.",
    unlocks: ["300 bàn", "50 nhân viên", "2.000 món menu", "AI nâng cao"]
  },
  enterprise: {
    badge: "Nhiều chi nhánh",
    bestFor: "Chuỗi F&B cần tư vấn triển khai, quyền riêng và tích hợp quy trình sẵn có.",
    roi: "Thiết kế phạm vi riêng để rollout theo chi nhánh, hạn chế gián đoạn vận hành.",
    unlocks: ["Tư vấn rollout", "Tích hợp riêng", "Nhiều chi nhánh", "Hỗ trợ ưu tiên"]
  }
};

const comparisonRows = [
  { feature: "Số bàn", pro: "20", premium: "300" },
  { feature: "Nhân viên", pro: "10", premium: "50" },
  { feature: "Món menu", pro: "500", premium: "2.000" },
  { feature: "QR ordering tại bàn", pro: "Có", premium: "Có" },
  { feature: "Đặt món online", pro: "Có", premium: "Có" },
  { feature: "Thanh toán VietQR", pro: "Có", premium: "Có" },
  { feature: "AI assistant vận hành", pro: "Cơ bản", premium: "Nâng cao" },
  { feature: "Đặt bàn, nhận cọc", pro: "Khóa", premium: "Có" },
  { feature: "Báo cáo, tồn kho, nhân sự", pro: "Cốt lõi", premium: "Nâng cao" }
];

const roiScenarios = [
  {
    value: "1 order/ngày",
    title: "Pro đã dễ hoàn vốn",
    text: "Chỉ cần giảm một order bị ghi sai hoặc thêm một món gọi lại mỗi ngày, chi phí 99K trở nên rất nhẹ so với doanh thu giữ được."
  },
  {
    value: "1 ca đông",
    title: "Premium tạo đòn bẩy rõ hơn",
    text: "AI, báo cáo và nhân sự giúp chủ quán xử lý giờ cao điểm bằng tín hiệu vận hành thay vì cảm giác sau khi ca đã qua."
  },
  {
    value: "0 POS",
    title: "Bắt đầu không cần dự án phần cứng",
    text: "LogiVN ưu tiên web, QR và VietQR để quán thử flow thật trước khi quyết định đầu tư thiết bị hoặc rollout rộng hơn."
  }
];

const funnelPaths = [
  {
    icon: MonitorPlay,
    title: "Xem demo trước",
    text: "Dành cho chủ quán muốn hiểu flow scan QR, order, VietQR, dashboard và AI trước khi chọn gói.",
    href: "/demo",
    cta: "Mở demo"
  },
  {
    icon: Route,
    title: "Pilot có hướng dẫn",
    text: "Dành cho quán cần LogiVN gợi ý phạm vi triển khai nhỏ nhất theo mô hình quán, nhân sự và giờ cao điểm.",
    href: "/waitlist",
    cta: "Vào waitlist"
  },
  {
    icon: TrendingUp,
    title: "Signup dùng thử ngay",
    text: "Dành cho quán đã sẵn sàng lên menu, in QR và đo bằng order thật trong 30 ngày.",
    href: "/dashboard/register?plan=pro&source=pricing_path",
    cta: "Tạo quán thử"
  }
];

function getPlanHref(planCode: string | null | undefined, email: string) {
  if (planCode === "enterprise") {
    return `mailto:${email}?subject=${encodeURIComponent("Tư vấn LogiVN cho chuỗi nhiều chi nhánh")}`;
  }

  if (planCode) {
    return `/dashboard/register?plan=${encodeURIComponent(planCode)}`;
  }

  return "/dashboard/register?plan=pro";
}

type PublicPricingPlan = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  monthly_price: number;
  trial_days: number;
  features: string[];
};

type PlanDisplayDetails = {
  eyebrow: string;
  badge: string;
  summary: string;
  limits: string[];
  capabilities: string[];
  securityNote: string;
  secondaryHref: string;
  secondaryLabel: string;
};

function readPrice(value: string) {
  if (value.toLocaleLowerCase("vi-VN").includes("liên hệ")) return 0;
  return Number(value.replace(/[^\d]/g, "")) || 0;
}

function readTrialDays(items: string[]) {
  for (const item of items) {
    const match = item.match(/(\d+)\s*ngày/i);
    if (match) return Number(match[1]);
  }

  return 30;
}

function sanitizePricingText(value: string) {
  const replacements: Array<[RegExp, string]> = [
    [/AI OCR menu/gi, "nhập menu nhanh từ ảnh"],
    [/AI tạo menu/gi, "tạo menu nhanh"],
    [/AI vận hành/gi, "trợ lý thông minh cho vận hành"],
    [/AI requests/gi, "lượt trợ lý thông minh"],
    [/\bAI\b/gi, "trợ lý thông minh"],
    [/\bOCR\b/gi, "nhập từ ảnh"],
    [/QR ordering/gi, "gọi món QR"],
    [/online ordering/gi, "đặt món online"],
    [/order realtime/gi, "đơn theo thời gian thực"],
    [/realtime/gi, "theo thời gian thực"],
    [/dashboard/gi, "bảng quản lý"],
    [/entitlement/gi, "nhóm tính năng"],
    [/SaaS/gi, "phần mềm"],
    [/trial/gi, "dùng thử"]
  ];

  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function planCodeLabel(planCode: string | null) {
  if (!planCode) return "Gói LogiVN";
  if (planCode === "enterprise") return "Tư vấn riêng";
  return planCode.toUpperCase();
}

function getPlanIntent(planCode: string | null) {
  return planIntentCopy[planCode || "pro"] ?? {
    badge: "Gói LogiVN",
    bestFor: "Phù hợp với quán muốn bắt đầu số hóa gọi món và vận hành trên một dashboard rõ ràng.",
    roi: "Giữ chi phí phần mềm dễ hiểu, chỉ nâng cấp khi quán thực sự cần thêm tính năng.",
    unlocks: ["QR ordering", "VietQR", "Dashboard", "Báo cáo"]
  };
}

function getPlanDisplayDetails(plan: PublicPricingPlan): PlanDisplayDetails {
  if (plan.code === "premium") {
    return {
      eyebrow: "Scale plan",
      badge: "Đề xuất",
      summary: "Cho quán đã có nhịp vận hành thật và cần AI, đặt bàn, báo cáo sâu cùng giới hạn lớn hơn.",
      limits: ["300 bàn", "50 nhân viên", "2.000 món menu", "200 promotions"],
      capabilities: ["Đặt bàn và nhận cọc", "AI/OCR menu và ảnh món", "Báo cáo nâng cao", "Phân quyền vận hành sâu"],
      securityNote: "Giới hạn Premium được kiểm tra ở server action, service và trigger DB.",
      secondaryHref: "/demo",
      secondaryLabel: "Xem demo Premium"
    };
  }

  if (plan.code === "enterprise") {
    return {
      eyebrow: "Custom rollout",
      badge: "Tư vấn",
      summary: "Cho chuỗi cần triển khai nhiều chi nhánh, tích hợp riêng và chính sách vận hành theo hợp đồng.",
      limits: ["Nhiều chi nhánh", "Tích hợp riêng", "SLA hỗ trợ", "Quyền riêng"],
      capabilities: ["Tư vấn rollout", "Thiết kế phạm vi riêng", "Đồng bộ dữ liệu", "Hỗ trợ ưu tiên"],
      securityNote: "Phạm vi quyền được cấu hình theo hợp đồng và audit riêng.",
      secondaryHref: "/waitlist",
      secondaryLabel: "Trao đổi nhu cầu"
    };
  }

  return {
    eyebrow: "Starter plan",
    badge: "Gọn để bắt đầu",
    summary: "Cho quán muốn đưa QR ordering, VietQR, menu và dashboard vào vận hành với chi phí dễ kiểm soát.",
    limits: ["20 bàn", "10 nhân viên", "500 món menu", "20 promotions"],
    capabilities: ["QR ordering tại bàn", "Đặt món online", "VietQR và đối soát", "Dashboard cơ bản"],
    securityNote: "Giới hạn Pro được khóa fail-closed, kể cả khi gọi API trực tiếp.",
    secondaryHref: "/waitlist",
    secondaryLabel: "Cần tư vấn thêm"
  };
}

function buildFallbackPlans(siteConfig: Awaited<ReturnType<typeof getPlatformSiteConfig>>): PublicPricingPlan[] {
  return siteConfig.plans.map((plan, index) => ({
    id: `fallback-${plan.code || index}`,
    code: plan.code || null,
    name: plan.name,
    description: sanitizePricingText(plan.subtitle),
    monthly_price: readPrice(plan.price),
    trial_days: readTrialDays(plan.items),
    features: plan.items.map(sanitizePricingText)
  }));
}

async function readCachedPricingPlans() {
  try {
    const plans = await getPublicActivePlans();
    if (plans.length) {
      return plans.map((plan) => ({
        ...plan,
        description: plan.description ? sanitizePricingText(plan.description) : null,
        features: Array.isArray(plan.features)
          ? plan.features.filter((feature): feature is string => typeof feature === "string").map(sanitizePricingText)
          : []
      }));
    }
  } catch {
    return null;
  }

  return null;
}

export default async function PricingPage() {
  const [siteConfig, cachedPlans] = await Promise.all([getPlatformSiteConfig(), readCachedPricingPlans()]);
  const plans = cachedPlans?.length ? cachedPlans : buildFallbackPlans(siteConfig);
  const premium = plans.find((plan) => plan.code === "premium");
  const showcasePlans = plans.filter((plan) => plan.monthly_price > 0).slice(0, 2);
  const trialDays = plans.reduce((max, plan) => Math.max(max, plan.trial_days), 30);

  return (
    <>
      <MarketingFunnelTracker page="/pricing" source="pricing" />
      <PricingPageJsonLd />
      <main className="logivn-pricing-page">
      <style>{styles}</style>

      <header className="lp-header">
        <div className="lp-container lp-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav className="lp-nav-links" aria-label="Điều hướng chính">
            <Link href="/">Trang chủ</Link>
            <Link href="/pricing" className="is-active">
              Bảng giá
            </Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/so-sanh">So sánh</Link>
            <Link href="/dia-phuong">Địa phương</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/waitlist">Waitlist</Link>
            <a href="#compare">So sánh gói</a>
            <a href="#pricing-faq-title">FAQ</a>
            <Link href="/dashboard/login">Đăng nhập</Link>
          </nav>
          <div className="lp-nav-actions">
            <Link className="lp-link" href="/dashboard/login">
              Đăng nhập
            </Link>
            <Link className="lp-btn lp-btn-primary" href="/dashboard/register?plan=pro">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-orb lp-hero-orb-left" aria-hidden="true" />
        <div className="lp-hero-orb lp-hero-orb-right" aria-hidden="true" />

        <div className="lp-container lp-hero-grid">
          <div className="lp-copy">
            <span className="lp-kicker">Bảng giá LogiVN</span>
            <h1>Giá đơn giản cho quán muốn gọi món nhanh hơn và vận hành thông minh hơn.</h1>
            <p>
              Bắt đầu với Pro 99K để đưa QR ordering vào quán. Nâng Premium 199K khi cần AI assistant, báo cáo sâu,
              đặt bàn, nhân sự và tồn kho. Mỗi quán đều có {trialDays} ngày để kiểm tra trước khi trả phí.
            </p>

            <div className="lp-actions">
              <Link className="lp-btn lp-btn-primary" href="/dashboard/register?plan=pro">
                Tạo quán dùng thử
                <ArrowRight size={16} />
              </Link>
              <Link className="lp-btn lp-btn-secondary" href="/demo">
                Xem demo trước
              </Link>
              <Link className="lp-btn lp-btn-tertiary" href="/waitlist">
                Pilot có hướng dẫn
              </Link>
            </div>

            <div className="lp-proof-grid">
              {pricingSignals.map((signal) => (
                <article className="lp-proof-card" key={signal.value}>
                  <strong>{signal.value === "30 ngày" ? `${trialDays} ngày` : signal.value}</strong>
                  <span>{signal.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="lp-stage">
            <div className="lp-stage-frame">
              <Image
                src="/brand/logivn/04-banner-payment-service.png"
                alt="Minh họa thanh toán và nâng cấp gói LogiVN"
                fill
                priority
                fetchPriority="high"
                sizes="(max-width: 1100px) 100vw, 54vw"
              />
            </div>

            <div className="lp-stage-stack">
              {showcasePlans.map((plan) => (
                <article className="lp-stage-card" key={plan.id}>
                  <div className="lp-stage-card-top">
                    <span>{planCodeLabel(plan.code)}</span>
                    <strong>{plan.name}</strong>
                  </div>
                  <p>{plan.description}</p>
                  <b>
                    {formatVnd(plan.monthly_price)}
                    <small>/ tháng</small>
                  </b>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-plans">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-kicker">So sánh nhanh</span>
            <h2>Khởi động với gói đủ rõ cho hiện tại, nâng cấp chỉ khi quán thực sự cần thêm đòn bẩy</h2>
            <p>
              Bảng giá được giữ tối giản để chủ quán ra quyết định nhanh: mỗi gói có vị trí rõ ràng, lời mời hành động rõ
              ràng và chỉ nhấn những khác biệt thật sự quan trọng khi vận hành.
            </p>
          </div>

          <div className="lp-plan-grid">
            {plans.map((plan) => {
              const featured = plan.code === "premium" || (!premium && plan.code === "pro");
              const href = getPlanHref(plan.code, siteConfig.brand.email);
              const isContact = plan.monthly_price <= 0;
              const intent = getPlanIntent(plan.code);
              const details = getPlanDisplayDetails(plan);

              return (
                <article className={`lp-plan-card ${featured ? "is-featured" : ""}`} key={plan.id}>
                  <div className="lp-plan-topbar">
                    <span>{details.eyebrow}</span>
                    <b>{featured ? details.badge : intent.badge}</b>
                  </div>

                  <div className="lp-plan-head">
                    <p>{planCodeLabel(plan.code)}</p>
                    <h3>{plan.name}</h3>
                    <span>{details.summary}</span>
                  </div>

                  <div className="lp-plan-price-row">
                    <strong className="lp-price">
                      {isContact ? "Liên hệ" : formatVnd(plan.monthly_price)}
                      {isContact ? null : <small>/ tháng</small>}
                    </strong>
                    <span>Dùng thử {plan.trial_days} ngày</span>
                  </div>

                  <div className="lp-plan-limits" aria-label={`Giới hạn chính của ${plan.name}`}>
                    {details.limits.map((limit) => (
                      <span key={limit}>{limit}</span>
                    ))}
                  </div>

                  <div className="lp-plan-fit">
                    <strong>Vị trí gói</strong>
                    <p>{intent.bestFor}</p>
                  </div>

                  <div className="lp-plan-stack" aria-label={`Tính năng chính của ${plan.name}`}>
                    {details.capabilities.map((feature) => (
                      <span key={feature}>
                        <Check size={15} />
                        {feature}
                      </span>
                    ))}
                  </div>

                  <p className="lp-plan-security">
                    <ShieldCheck size={16} />
                    {details.securityNote}
                  </p>

                  <p className="lp-roi-note">{intent.roi}</p>

                  {href.startsWith("mailto:") ? (
                    <a className={`lp-btn ${featured ? "lp-btn-primary" : "lp-btn-tertiary"}`} href={href}>
                      {isContact ? "Liên hệ tư vấn" : "Chọn gói này"}
                    </a>
                  ) : (
                    <>
                      <Link className={`lp-btn ${featured ? "lp-btn-primary" : "lp-btn-tertiary"}`} href={href}>
                        {isContact ? "Liên hệ tư vấn" : "Dùng thử gói này"}
                      </Link>
                      <Link className="lp-plan-secondary-link" href={details.secondaryHref}>
                        {details.secondaryLabel}
                        <ArrowRight size={14} />
                      </Link>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lp-section lp-compare" id="compare" aria-labelledby="pricing-compare-title">
        <div className="lp-container lp-compare-shell">
          <div className="lp-section-head">
            <span className="lp-kicker">Pro hay Premium?</span>
            <h2 id="pricing-compare-title">Chọn theo mức độ vận hành, không theo danh sách tính năng dài</h2>
            <p>
              Nếu quán cần thay đổi cách nhận order, bắt đầu bằng Pro. Nếu quán đã có dữ liệu và muốn AI hỗ trợ quyết định
              ca, combo, tồn kho, báo cáo, Premium là gói có đòn bẩy rõ hơn.
            </p>
          </div>

          <div className="lp-compare-table" role="table" aria-label="So sánh nhanh LogiVN Pro và Premium">
            <div className="lp-compare-row lp-compare-head" role="row">
              <span role="columnheader">Nhu cầu</span>
              <strong role="columnheader">Pro 99K</strong>
              <strong role="columnheader">Premium 199K</strong>
            </div>
            {comparisonRows.map((row) => (
              <div className="lp-compare-row" role="row" key={row.feature}>
                <span role="cell">{row.feature}</span>
                <strong role="cell">{row.pro}</strong>
                <strong role="cell">{row.premium}</strong>
              </div>
            ))}
          </div>

          <div className="lp-decision-band">
            <article>
              <Sparkles size={18} />
              <strong>Muốn thử nhanh?</strong>
              <span>Chọn Pro, đưa menu lên, in QR và đo phản ứng khách trong tuần đầu.</span>
            </article>
            <article>
              <ShieldCheck size={18} />
              <strong>Muốn tăng trưởng?</strong>
              <span>Chọn Premium để mở AI, báo cáo sâu và các workflow giảm thao tác thủ công.</span>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section lp-roi" id="roi" aria-labelledby="pricing-roi-title">
        <div className="lp-container lp-roi-shell">
          <div className="lp-section-head">
            <span className="lp-kicker">ROI & đường đi dùng thử</span>
            <h2 id="pricing-roi-title">Giá không chỉ để rẻ, mà để chủ quán dám thử trong một ca bán thật</h2>
            <p>
              Bảng giá được thiết kế để chủ quán chọn bước tiếp theo theo mức sẵn sàng: xem demo, pilot có hướng dẫn
              hoặc tạo tài khoản ngay, thay vì bị ép vào một nút mua duy nhất.
            </p>
          </div>

          <div className="lp-roi-grid">
            {roiScenarios.map((scenario) => (
              <article className="lp-roi-card" key={scenario.title}>
                <span>{scenario.value}</span>
                <h3>{scenario.title}</h3>
                <p>{scenario.text}</p>
              </article>
            ))}
          </div>

          <div className="lp-funnel-grid" aria-label="Đường chuyển đổi từ pricing">
            {funnelPaths.map((path) => {
              const Icon = path.icon;
              return (
                <article className="lp-funnel-card" key={path.title}>
                  <Icon size={21} />
                  <h3>{path.title}</h3>
                  <p>{path.text}</p>
                  <Link href={path.href}>
                    {path.cta}
                    <ArrowRight size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lp-section lp-activation">
        <div className="lp-container">
          <div className="lp-section-head lp-section-head-centered">
            <span className="lp-kicker">Cách kích hoạt</span>
            <h2>Một câu chuyện nâng gói đủ gọn để không làm quán mất niềm tin</h2>
          </div>

          <div className="lp-activation-grid">
            {[
              {
                icon: Sparkles,
                title: "Bắt đầu bằng dùng thử",
                text: "Tạo quán, đưa menu lên và kiểm tra xem nhịp gọi món QR có thật sự khớp với cách phục vụ hiện tại hay không."
              },
              {
                icon: WalletCards,
                title: "Chọn gói khi quán đã sẵn sàng",
                text: "Pro cho nhịp tăng trưởng gọn. Premium cho đặt bàn, nhận cọc, nhập menu nhanh từ ảnh và vận hành sâu hơn."
              },
              {
                icon: ShieldCheck,
                title: "Thanh toán xong là mở đúng quyền",
                text: "LogiVN xác minh VietQR và kích hoạt đúng nhóm tính năng tương ứng để tránh nhầm quyền hoặc mở sai nhu cầu."
              }
            ].map((item) => (
              <article className="lp-activation-card" key={item.title}>
                <span className="lp-activation-icon">
                  <item.icon size={18} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-faq" aria-labelledby="pricing-faq-title">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-kicker">Câu hỏi thường gặp</span>
            <h2 id="pricing-faq-title">Những điểm chủ quán cần rõ trước khi chọn gói LogiVN</h2>
            <p>
              Các câu hỏi được viết ngắn gọn để chủ quán hiểu nhanh về dùng thử, nâng cấp, đặt món online và thanh toán
              VietQR trước khi bắt đầu.
            </p>
          </div>

          <div className="lp-faq-grid">
            {pricingFaqItems.map((item) => (
              <article className="lp-faq-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {premium ? (
        <section className="lp-final">
          <div className="lp-container lp-final-shell">
            <div>
              <span className="lp-kicker">Premium</span>
              <h2>Cần đặt bàn, nhận cọc, nhập menu nhanh từ ảnh và báo cáo sâu hơn cho giờ cao điểm?</h2>
              <p>
                Premium dành cho quán đã vượt qua giai đoạn thử nghiệm và muốn biến vận hành thành một trải nghiệm rõ ràng,
                ít thủ công hơn trong những khung giờ quan trọng nhất.
              </p>
            </div>
            <div className="lp-final-actions">
              <Link className="lp-btn lp-btn-secondary" href="/demo">
                Xem demo
              </Link>
              <Link className="lp-btn lp-btn-primary" href="/dashboard/register?plan=premium">
                Kích hoạt dùng thử Premium
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      ) : null}
      <div className="lp-mobile-sticky" aria-label="Hành động nhanh trên mobile">
        <Link href="/dashboard/register?plan=pro&source=pricing_mobile">Dùng thử</Link>
        <Link href="/demo">Demo</Link>
      </div>
      </main>
    </>
  );
}

const styles = `
.logivn-pricing-page {
  --lp-green: #0F4D3A;
  --lp-green-strong: #0A2F25;
  --lp-sage: #A9C5A1;
  --lp-orange: #F28C28;
  --lp-orange-soft: #F8B86A;
  --lp-ivory: #FFF7EB;
  --lp-paper: #FFFCF6;
  --lp-line: rgba(15, 77, 58, 0.14);
  --lp-text: #203329;
  --lp-muted: rgba(32, 51, 41, 0.72);
  --lp-shadow: 0 24px 60px rgba(26, 34, 31, 0.08);
  --lp-shadow-soft: 0 14px 32px rgba(26, 34, 31, 0.06);
  min-height: 100vh;
  color: var(--lp-text);
  background:
    radial-gradient(circle at 10% 0%, rgba(242, 140, 40, 0.18), transparent 30rem),
    radial-gradient(circle at 90% 16%, rgba(15, 77, 58, 0.12), transparent 22rem),
    linear-gradient(180deg, #FFF8EF 0%, #FFF5E7 36%, #FFF9F2 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-pricing-page * {
  box-sizing: border-box;
}

.logivn-pricing-page a {
  color: inherit;
  text-decoration: none;
}

.logivn-pricing-page h1,
.logivn-pricing-page h2,
.logivn-pricing-page h3,
.logivn-pricing-page p {
  margin: 0;
}

.lp-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.lp-header {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 248, 239, 0.82);
  backdrop-filter: blur(18px);
}

.lp-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.lp-nav-links {
  display: flex;
  align-items: center;
  gap: 14px;
  color: rgba(32, 51, 41, 0.84);
  font-size: 13px;
  font-weight: 700;
}

.lp-nav-links .is-active,
.lp-link {
  color: var(--lp-green);
}

.lp-nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lp-link,
.lp-nav-links a,
.lp-btn {
  transition: color 180ms ease, transform 180ms ease, background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.lp-link,
.lp-nav-links a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
}

.lp-nav-links a {
  justify-content: center;
  min-width: 48px;
  padding-inline: 8px;
}

.lp-nav-links a:hover,
.lp-link:hover {
  color: var(--lp-orange);
}

.lp-btn {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 22px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.lp-btn:hover {
  transform: translateY(-1px);
}

.lp-btn-primary {
  color: #FFF8EF;
  background: linear-gradient(180deg, var(--lp-orange-soft), var(--lp-orange));
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.2);
}

.lp-btn-secondary,
.lp-btn-tertiary {
  color: var(--lp-green);
  border-color: rgba(15, 77, 58, 0.18);
  background: rgba(255, 255, 255, 0.58);
}

.lp-btn-tertiary {
  background: rgba(15, 77, 58, 0.06);
}

.lp-kicker {
  display: inline-flex;
  align-items: center;
  color: var(--lp-orange);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-hero {
  position: relative;
  padding: 42px 0 58px;
  overflow: hidden;
}

.lp-hero-orb {
  position: absolute;
  width: 22rem;
  height: 22rem;
  border-radius: 999px;
  filter: blur(28px);
  opacity: 0.4;
  pointer-events: none;
}

.lp-hero-orb-left {
  left: -10rem;
  top: -7rem;
  background: rgba(242, 140, 40, 0.28);
}

.lp-hero-orb-right {
  right: -10rem;
  top: 6rem;
  background: rgba(15, 77, 58, 0.18);
}

.lp-hero-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 36px;
  align-items: center;
}

.lp-copy {
  max-width: 580px;
}

.lp-copy h1,
.lp-section-head h2,
.lp-plan-head h3,
.lp-final-shell h2 {
  font-family: Georgia, "Times New Roman", serif;
}

.lp-copy h1 {
  margin-top: 16px;
  color: var(--lp-green-strong);
  font-size: clamp(3rem, 6.4vw, 5.4rem);
  line-height: 0.95;
  letter-spacing: 0;
}

.lp-copy p,
.lp-section-head p,
.lp-final-shell p {
  margin-top: 18px;
  color: var(--lp-muted);
  font-size: 16px;
  line-height: 1.8;
  font-weight: 600;
}

.lp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.lp-proof-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 28px;
}

.lp-proof-card {
  min-height: 116px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.44);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: var(--lp-shadow-soft);
  backdrop-filter: blur(12px);
}

.lp-proof-card strong {
  display: block;
  color: var(--lp-green-strong);
  font-size: 22px;
  font-weight: 800;
}

.lp-proof-card span {
  display: block;
  margin-top: 8px;
  color: var(--lp-muted);
  font-size: 13px;
  line-height: 1.6;
  font-weight: 600;
}

.lp-stage {
  position: relative;
  min-height: 38rem;
}

.lp-stage-frame {
  position: relative;
  min-height: 34rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 34px;
  background:
    linear-gradient(180deg, rgba(10, 47, 37, 0.06), rgba(10, 47, 37, 0.18)),
    linear-gradient(135deg, #F7E7D1, #FFF7EB 58%, rgba(169, 197, 161, 0.4));
  box-shadow: var(--lp-shadow);
}

.lp-stage-frame::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(10, 47, 37, 0.04), rgba(10, 47, 37, 0.22)),
    linear-gradient(90deg, rgba(255, 248, 239, 0.18), transparent 18%, transparent 82%, rgba(10, 47, 37, 0.1));
}

.lp-stage-frame img {
  object-fit: cover;
  object-position: center;
}

.lp-stage-stack {
  position: absolute;
  right: 18px;
  bottom: 18px;
  display: grid;
  gap: 12px;
  width: min(320px, calc(100% - 36px));
}

.lp-stage-card {
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.52);
  border-radius: 22px;
  background: rgba(255, 252, 246, 0.84);
  box-shadow: var(--lp-shadow-soft);
  backdrop-filter: blur(12px);
}

.lp-stage-card-top {
  display: grid;
  gap: 6px;
}

.lp-stage-card-top span,
.lp-plan-head p {
  color: var(--lp-orange);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-stage-card strong {
  color: var(--lp-green-strong);
  font-size: 22px;
  line-height: 1.02;
  letter-spacing: 0;
}

.lp-stage-card p {
  margin-top: 10px;
  color: var(--lp-muted);
  font-size: 13px;
  line-height: 1.6;
  font-weight: 600;
}

.lp-stage-card b {
  display: block;
  margin-top: 12px;
  color: var(--lp-green-strong);
  font-size: 24px;
  line-height: 1;
  font-weight: 800;
}

.lp-stage-card small,
.lp-price small {
  font-size: 13px;
  font-weight: 700;
  color: var(--lp-muted);
}

.lp-section {
  padding: 28px 0 46px;
}

.lp-section-head {
  max-width: 760px;
}

.lp-section-head-centered {
  margin: 0 auto;
  text-align: center;
}

.lp-section-head h2,
.lp-final-shell h2 {
  margin-top: 14px;
  color: var(--lp-green-strong);
  font-size: clamp(2.1rem, 5vw, 3.3rem);
  line-height: 0.98;
  letter-spacing: 0;
}

.lp-plan-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 28px;
}

.lp-plan-card {
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  overflow: hidden;
  padding: 22px;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 251, 248, 0.78));
  box-shadow: 0 18px 46px rgba(15, 42, 31, 0.08);
}

.lp-plan-card.is-featured {
  border-color: rgba(15, 77, 58, 0.32);
  background: linear-gradient(180deg, #0F4D3A 0%, #153F33 26%, #FFFFFF 26.2%, #FFFFFF 100%);
  box-shadow: 0 28px 80px rgba(15, 42, 31, 0.18);
}

.lp-plan-topbar {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.lp-plan-topbar span,
.lp-plan-topbar b {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  max-width: 100%;
  padding: 0 10px;
  border: 1px solid rgba(15, 77, 58, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.68);
  color: var(--lp-green);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
  text-transform: uppercase;
}

.lp-plan-topbar b {
  border-color: rgba(242, 140, 40, 0.28);
  color: #9a4a17;
  background: rgba(255, 247, 237, 0.92);
}

.lp-plan-card.is-featured .lp-plan-topbar span {
  border-color: rgba(255, 255, 255, 0.24);
  color: rgba(255, 248, 239, 0.86);
  background: rgba(255, 255, 255, 0.08);
}

.lp-plan-card.is-featured .lp-plan-topbar b {
  border-color: rgba(242, 140, 40, 0.34);
  background: #F28C28;
  color: #FFF8EF;
}

.lp-plan-head h3 {
  margin-top: 14px;
  color: var(--lp-green-strong);
  font-size: 32px;
  line-height: 1;
  letter-spacing: 0;
}

.lp-plan-card.is-featured .lp-plan-head p,
.lp-plan-card.is-featured .lp-plan-head h3,
.lp-plan-card.is-featured .lp-plan-head span {
  color: #FFF8EF;
}

.lp-plan-card.is-featured .lp-plan-head span {
  color: rgba(255, 248, 239, 0.76);
}

.lp-plan-head span,
.lp-trial,
.lp-plan-fit p,
.lp-roi-note {
  display: block;
  margin-top: 10px;
  color: var(--lp-muted);
  font-size: 14px;
  line-height: 1.7;
  font-weight: 600;
}

.lp-plan-price-row {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 14px;
  margin-top: 22px;
}

.lp-plan-price-row > span {
  max-width: 112px;
  color: var(--lp-muted);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 800;
  text-align: right;
}

.lp-plan-fit {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(15, 77, 58, 0.1);
  border-radius: 14px;
  background: rgba(15, 77, 58, 0.045);
}

.lp-plan-fit strong {
  color: var(--lp-green);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-plan-fit p {
  margin-top: 7px;
  line-height: 1.55;
}

.lp-price {
  display: block;
  margin-top: 0;
  color: var(--lp-green-strong);
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
}

.lp-plan-limits {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.lp-plan-limits span {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  padding: 8px 10px;
  border: 1px solid rgba(15, 77, 58, 0.1);
  border-radius: 12px;
  color: var(--lp-green);
  background: rgba(15, 77, 58, 0.055);
  font-size: 12px;
  font-weight: 900;
  text-align: center;
}

.lp-plan-stack {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.lp-plan-stack span,
.lp-plan-security {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--lp-green);
  font-size: 14px;
  line-height: 1.45;
  font-weight: 700;
}

.lp-plan-stack span {
  min-height: 42px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
}

.lp-plan-security {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid rgba(15, 77, 58, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  color: #254236;
  font-size: 13px;
}

.lp-plan-card .lp-btn {
  width: 100%;
  margin-top: auto;
}

.lp-plan-secondary-link {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--lp-green);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.3;
}

.lp-roi-note {
  margin-top: auto;
  padding-top: 18px;
  color: rgba(32, 51, 41, 0.78);
}

.lp-compare {
  padding-top: 34px;
}

.lp-compare-shell {
  padding: 30px;
  border: 1px solid rgba(15, 77, 58, 0.12);
  border-radius: 34px;
  background:
    radial-gradient(circle at 100% 0%, rgba(242, 140, 40, 0.13), transparent 18rem),
    rgba(255, 255, 255, 0.58);
  box-shadow: var(--lp-shadow-soft);
}

.lp-compare-table {
  display: grid;
  gap: 10px;
  margin-top: 26px;
}

.lp-compare-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 58px;
  padding: 12px 16px;
  border: 1px solid rgba(15, 77, 58, 0.1);
  border-radius: 18px;
  background: rgba(255, 252, 246, 0.68);
}

.lp-compare-row span {
  color: var(--lp-muted);
  font-size: 14px;
  line-height: 1.45;
  font-weight: 700;
}

.lp-compare-row strong {
  color: var(--lp-green);
  font-size: 14px;
  line-height: 1.45;
  font-weight: 900;
}

.lp-compare-head {
  background: rgba(15, 77, 58, 0.08);
}

.lp-compare-head span,
.lp-compare-head strong {
  color: var(--lp-green-strong);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-decision-band {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.lp-decision-band article {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 10px;
  align-items: start;
  padding: 16px;
  border-radius: 20px;
  color: var(--lp-green);
  background: rgba(15, 77, 58, 0.08);
}

.lp-decision-band svg {
  margin-top: 2px;
}

.lp-decision-band strong,
.lp-decision-band span {
  grid-column: 2;
}

.lp-decision-band strong {
  color: var(--lp-green-strong);
  font-size: 15px;
  font-weight: 900;
}

.lp-decision-band span {
  color: var(--lp-muted);
  font-size: 13px;
  line-height: 1.55;
  font-weight: 700;
}

.lp-roi-shell {
  padding: 30px;
  border: 1px solid rgba(15, 77, 58, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);
  box-shadow: var(--lp-shadow-soft);
}

.lp-roi-grid,
.lp-funnel-grid {
  display: grid;
  gap: 14px;
}

.lp-roi-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
}

.lp-roi-card,
.lp-funnel-card {
  border: 1px solid var(--lp-line);
  border-radius: 8px;
  background: rgba(255, 252, 246, 0.76);
  box-shadow: 0 16px 36px rgba(26, 34, 31, 0.05);
}

.lp-roi-card {
  min-height: 190px;
  padding: 20px;
}

.lp-roi-card span {
  color: var(--lp-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.lp-roi-card h3,
.lp-funnel-card h3 {
  margin-top: 16px;
  color: var(--lp-green-strong);
  font-size: 24px;
  line-height: 1.06;
  letter-spacing: 0;
}

.lp-roi-card p,
.lp-funnel-card p {
  margin-top: 11px;
  color: var(--lp-muted);
  font-size: 14px;
  line-height: 1.72;
  font-weight: 650;
}

.lp-funnel-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 14px;
}

.lp-funnel-card {
  display: flex;
  min-height: 244px;
  flex-direction: column;
  padding: 20px;
}

.lp-funnel-card svg {
  color: var(--lp-orange);
}

.lp-funnel-card a {
  display: inline-flex;
  width: fit-content;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: auto;
  padding: 0 14px;
  border-radius: 8px;
  color: var(--lp-green);
  background: rgba(15, 77, 58, 0.08);
  font-size: 13px;
  font-weight: 900;
}

.lp-activation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 26px;
}

.lp-activation-card {
  min-height: 220px;
  padding: 22px;
  border: 1px solid var(--lp-line);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: var(--lp-shadow-soft);
}

.lp-activation-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 16px;
  color: var(--lp-green);
  background: rgba(15, 77, 58, 0.08);
}

.lp-activation-card h3 {
  margin-top: 18px;
  color: var(--lp-green-strong);
  font-size: 24px;
  line-height: 1.02;
  letter-spacing: 0;
}

.lp-activation-card p {
  margin-top: 12px;
  color: var(--lp-muted);
  font-size: 14px;
  line-height: 1.75;
  font-weight: 600;
}

.lp-faq-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 26px;
}

.lp-faq-card {
  min-height: 190px;
  padding: 22px;
  border: 1px solid var(--lp-line);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.64);
  box-shadow: var(--lp-shadow-soft);
}

.lp-faq-card h3 {
  color: var(--lp-green-strong);
  font-size: 21px;
  line-height: 1.12;
  letter-spacing: 0;
}

.lp-faq-card p {
  margin-top: 12px;
  color: var(--lp-muted);
  font-size: 14px;
  line-height: 1.75;
  font-weight: 600;
}

.lp-final {
  padding: 8px 0 48px;
}

.lp-final-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 28px 30px;
  border-radius: 32px;
  background:
    radial-gradient(circle at top right, rgba(242, 140, 40, 0.18), transparent 18rem),
    linear-gradient(150deg, #0A2F25 0%, #0F4D3A 55%, #154B3B 100%);
  box-shadow: 0 26px 56px rgba(10, 47, 37, 0.18);
}

.lp-final-shell .lp-kicker {
  color: rgba(248, 184, 106, 0.94);
}

.lp-final-shell h2 {
  color: #FFF8EF;
}

.lp-final-shell p {
  max-width: 42rem;
  color: rgba(255, 248, 239, 0.76);
}

.lp-final-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
}

.lp-mobile-sticky {
  display: none;
}

.lp-nav-links a:focus-visible,
.lp-link:focus-visible,
.lp-btn:focus-visible,
.lp-plan-secondary-link:focus-visible,
.lp-funnel-card a:focus-visible,
.lp-mobile-sticky a:focus-visible {
  outline: 2px solid rgba(242, 140, 40, 0.54);
  outline-offset: 4px;
}

@media (max-width: 1180px) {
  .lp-nav-links {
    display: none;
  }
}

@media (max-width: 1100px) {
  .lp-hero-grid,
  .lp-proof-grid,
  .lp-plan-grid,
  .lp-roi-grid,
  .lp-funnel-grid,
  .lp-decision-band,
  .lp-activation-grid,
  .lp-faq-grid {
    grid-template-columns: 1fr;
  }

  .lp-stage {
    min-height: 32rem;
  }

  .lp-final-shell {
    flex-direction: column;
    align-items: flex-start;
  }

  .lp-final-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .lp-compare-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .lp-compare-head {
    display: none;
  }
}

@media (max-width: 820px) {
  .lp-container {
    width: min(100% - 28px, 640px);
  }

  .lp-nav {
    min-height: 68px;
  }

  .lp-nav-links,
  .lp-link {
    display: none;
  }

  .lp-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .lp-btn,
  .lp-final-shell .lp-btn {
    width: 100%;
  }

  .lp-stage-stack {
    position: relative;
    right: auto;
    bottom: auto;
    width: 100%;
    margin-top: 14px;
  }

  .lp-compare-shell {
    padding: 18px;
    border-radius: 24px;
  }

  .lp-roi-shell {
    padding: 18px;
  }

  .lp-decision-band article {
    grid-template-columns: 32px 1fr;
  }

  .lp-mobile-sticky {
    position: sticky;
    bottom: 0;
    z-index: 42;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid rgba(15, 77, 58, 0.14);
    background: rgba(255, 248, 239, 0.94);
    backdrop-filter: blur(16px);
  }

  .lp-mobile-sticky a {
    display: inline-flex;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 900;
  }

  .lp-mobile-sticky a:first-child {
    color: var(--lp-ivory);
    background: var(--lp-orange);
  }

  .lp-mobile-sticky a:last-child {
    border: 1px solid var(--lp-line);
    color: var(--lp-green);
    background: rgba(255, 255, 255, 0.72);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lp-link,
  .lp-nav-links a,
  .lp-btn,
  .lp-plan-secondary-link,
  .lp-funnel-card a,
  .lp-mobile-sticky a {
    transition: none;
  }
}
`;
