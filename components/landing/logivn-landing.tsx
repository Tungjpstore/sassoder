import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  ClipboardList,
  Mail,
  MapPin,
  Phone,
  QrCode,
  Sparkles,
  Store,
  Utensils,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";
import { SEO_HOME_TITLE } from "@/lib/seo/config";
import type { PlatformSiteConfig } from "@/services/platform-public-service";

const brand = "/brand/logivn";

const quickHighlights = [
  { icon: QrCode, label: "QR gọi món tại bàn" },
  { icon: WalletCards, label: "Thanh toán VietQR" },
  { icon: ClipboardList, label: "Đặt bàn nhận cọc" },
  { icon: Sparkles, label: "Trợ lý thông minh" }
];

const platformSignals = [
  {
    icon: QrCode,
    title: "Khách vào bàn là có thể gọi món",
    text: "Giảm thời gian chờ và giảm bước giải thích lại giữa nhân viên với khách."
  },
  {
    icon: Bell,
    title: "Nhân viên phản hồi đúng lúc",
    text: "Gọi phục vụ, gọi thêm món và chuyển bếp theo cùng một nhịp thao tác."
  },
  {
    icon: WalletCards,
    title: "Thanh toán rõ ràng theo thói quen Việt",
    text: "VietQR được đặt đúng chỗ trong hành trình mua hàng, không làm trải nghiệm bị gãy."
  },
  {
    icon: BarChart3,
    title: "Chủ quán nhìn thấy bức tranh tổng thể",
    text: "Đơn hàng, bàn, doanh thu và báo cáo xuất hiện trong cùng một góc nhìn điều hành."
  }
];

const operatingLanes = [
  {
    icon: Sparkles,
    eyebrow: "Chủ quán",
    title: "Nắm nhanh tình hình quán mà không phải ghép nhiều công cụ rời",
    text: "Doanh thu, đơn hàng, bàn, đặt trước và thanh toán được gom vào một nơi để chủ quán nhìn rõ nhịp vận hành mỗi ngày.",
    points: ["Xem các tín hiệu quan trọng trong vài phút.", "Ra quyết định nhanh hơn trong giờ cao điểm."]
  },
  {
    icon: Store,
    eyebrow: "Nhân viên",
    title: "Giảm hỏi lại, giảm thao tác thừa trong từng ca phục vụ",
    text: "Nhân viên theo dõi đơn, gọi phục vụ, bàn đang dùng và trạng thái thanh toán trên cùng một giao diện dễ hiểu.",
    points: ["Phục vụ đúng bàn, đúng món.", "Giữ đội ngũ bình tĩnh khi quán đông."]
  },
  {
    icon: Utensils,
    eyebrow: "Khách hàng",
    title: "Tự gọi món, gọi thêm và thanh toán theo cách quen thuộc",
    text: "Khách quét QR để xem menu, chọn món, gọi thêm hoặc thanh toán bằng VietQR mà không phải chờ nhân viên quay lại.",
    points: ["Menu rõ ràng ngay trên điện thoại.", "Trải nghiệm liền mạch từ bàn đến thanh toán."]
  }
];

const storyMoments = [
  {
    number: "01",
    eyebrow: "Trước giờ đông khách",
    title: "Menu, combo và hình ảnh món được sắp gọn trước khi quán bước vào ca phục vụ",
    text: "LogiVN giúp chủ quán chuẩn hóa menu trên một giao diện đủ sạch để thao tác nhanh, đủ rõ để đội ngũ không phải hỏi lại nhau trong giờ cao điểm.",
    points: [
      "Sửa giá, topping và combo một lần để đồng bộ mọi điểm chạm.",
      "Giữ cảm giác thương hiệu chỉn chu từ trang gọi món đến kênh online."
    ],
    image: `${brand}/01-banner-overview-hero.png`,
    href: "#pricing",
    cta: "Xem gói phù hợp",
    tone: "light"
  },
  {
    number: "02",
    eyebrow: "Khi khách đã ngồi xuống",
    title: "Khách quét QR, gọi món và gọi thêm ngay trên điện thoại mà không làm đứt nhịp quán",
    text: "Hành trình đặt món được rút xuống những thao tác cần thiết nhất, để khách ra quyết định nhanh hơn và nhân viên tập trung nhiều hơn vào phục vụ.",
    points: [
      "Chọn món tại bàn trong vài giây với bố cục rõ và ít ma sát.",
      "Gọi thêm món hoặc gọi nhân viên mà không phải chờ một vòng quay mới."
    ],
    image: `${brand}/03-banner-customer-qr-ordering.png`,
    href: "#workflow",
    cta: "Xem hành trình vận hành",
    tone: "dark"
  },
  {
    number: "03",
    eyebrow: "Sau mỗi khung giờ cao điểm",
    title: "Bảng quản lý gom bàn, bếp, đơn, thanh toán và báo cáo về cùng một nhịp điều hành",
    text: "Chủ quán không cần ghép nhiều công cụ rời để hiểu chuyện gì đang diễn ra. Mọi tín hiệu quan trọng được đặt trong một bề mặt đủ tập trung để ra quyết định nhanh.",
    points: [
      "Theo dõi trạng thái phục vụ theo thời gian thực thay vì kiểm tra thủ công từng nơi.",
      "Chuẩn bị cho tăng trưởng bằng đặt bàn, đặt món online và báo cáo rõ ràng."
    ],
    image: `${brand}/02-banner-owner-dashboard.png`,
    href: "/pricing",
    cta: "Xem bảng giá chi tiết",
    tone: "light"
  }
];

const ownerFlow = [
  "Nhận đơn từ bàn và kênh online trong cùng một nơi",
  "Xác nhận, chuyển bếp và theo dõi trạng thái phục vụ",
  "Kiểm soát bàn, nhân viên và điểm nghẽn trong giờ cao điểm",
  "Đối soát thanh toán và xem báo cáo cuối ngày"
];

const customerFlow = [
  "Quét QR tại bàn hoặc mở link online",
  "Chọn món, topping và combo trong vài thao tác",
  "Gọi thêm món hoặc gọi nhân viên ngay trên điện thoại",
  "Thanh toán gọn bằng VietQR hoặc quy trình tại quầy"
];

const setupSteps = [
  { icon: ClipboardList, title: "Tạo quán", text: "Đăng ký thông tin và cấu hình phong cách phục vụ." },
  { icon: Utensils, title: "Lên menu", text: "Thêm món, phân loại, set giá và tùy chọn bán hàng." },
  { icon: QrCode, title: "In QR", text: "Gắn QR cho từng bàn để khách tự bắt đầu hành trình gọi món." },
  { icon: Sparkles, title: "Vào nhịp", text: "Nhận đơn, thanh toán và theo dõi vận hành trong cùng một hệ." }
];

const testimonials = [
  {
    name: "Anh Minh",
    role: "Chủ quán cafe, Đà Nẵng",
    text: "Điều mình thích nhất là khách tự gọi món rất mượt, còn nhân viên thì đỡ bị rối trong giờ đông khách."
  },
  {
    name: "Chị Hương",
    role: "Quản lý nhà hàng, Hà Nội",
    text: "Bảng quản lý đủ rõ để mình kiểm soát bàn, đơn và báo cáo ngay trên điện thoại khi đang ở ngoài quán."
  },
  {
    name: "Anh Tuấn",
    role: "Chủ chuỗi trà sữa, TP. Hồ Chí Minh",
    text: "Triển khai cho nhiều chi nhánh vẫn giữ được trải nghiệm đồng nhất, từ gọi món QR đến báo cáo cuối ngày."
  }
];

function getPlanHref(planCode: string | undefined, email: string) {
  if (planCode === "enterprise") {
    return `mailto:${email}?subject=${encodeURIComponent("Tư vấn LogiVN cho chuỗi nhiều chi nhánh")}`;
  }

  if (planCode) {
    return `/dashboard/register?plan=${encodeURIComponent(planCode)}`;
  }

  return "/dashboard/register?plan=pro";
}

function Logo({
  logoUrl = `${brand}/logo-horizontal-nav.png`,
  label = "LogiVN",
  light = false,
  priority = false
}: {
  logoUrl?: string;
  label?: string;
  light?: boolean;
  priority?: boolean;
}) {
  return (
    <Link href="/" className={`lv-logo ${light ? "lv-logo-light" : ""}`} aria-label={label}>
      <Image src={logoUrl} alt={label} width={154} height={40} priority={priority} />
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="lv-section-label">{children}</span>;
}

function CtaLink({
  href,
  className,
  children
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (href.startsWith("mailto:")) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

function getSeoHeroTitle(companyName: string, configuredTitle: string) {
  const normalizedTitle = configuredTitle.toLocaleLowerCase("vi-VN");
  const normalizedCompany = companyName.toLocaleLowerCase("vi-VN");

  if (normalizedTitle.includes(normalizedCompany) && normalizedTitle.includes("qr")) {
    return configuredTitle;
  }

  return SEO_HOME_TITLE;
}

export function LogiVNLanding({ siteConfig }: { siteConfig: PlatformSiteConfig }) {
  const { brand: siteBrand, landing, plans } = siteConfig;
  const heroTitle = getSeoHeroTitle(siteBrand.companyName, landing.heroTitle);
  const trialDays = plans.reduce((max, plan) => {
    const match = plan.items.join(" ").match(/(\d+)\s*ngày/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 30);

  const heroProofs = [
    {
      value: `${trialDays} ngày`,
      label: "dùng thử để kiểm tra độ hợp với nhịp vận hành của quán"
    },
    {
      value: "QR + VietQR",
      label: "từ gọi món đến thanh toán trong cùng một câu chuyện bán hàng"
    },
    {
      value: "1 màn hình",
      label: "để nhìn bàn, bếp, đơn online và báo cáo ở cùng một nơi"
    }
  ];

  return (
    <div className="logivn-brand-page">
      <style>{styles}</style>

      <header className="lv-header">
        <div className="lv-container lv-nav">
          <Logo logoUrl={siteBrand.logoUrl} label={siteBrand.companyName} priority />
          <nav className="lv-nav-links" aria-label="Điều hướng chính">
            <a href="#solution">Giải pháp</a>
            <a href="#features">Lợi ích</a>
            <a href="#journey">Câu chuyện</a>
            <a href="#pricing">Bảng giá</a>
            <a href="#contact">Liên hệ</a>
          </nav>
          <div className="lv-nav-actions">
            <Link className="lv-login" href="/dashboard/login">
              Đăng nhập
            </Link>
            <Link className="lv-btn lv-btn-orange lv-btn-sm" href="/dashboard/register?plan=pro">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lv-hero" id="solution">
          <div className="lv-hero-orb lv-hero-orb-left" aria-hidden="true" />
          <div className="lv-hero-orb lv-hero-orb-right" aria-hidden="true" />
          <div className="lv-hero-pattern" aria-hidden="true" />

          <div className="lv-container lv-hero-shell">
            <div className="lv-hero-copy">
              <span className="lv-kicker">Nền tảng gọi món cho quán Việt</span>
              <h1>{heroTitle}</h1>
              <p>{landing.heroSubtitle}</p>
              <div className="lv-hero-actions">
                <Link className="lv-btn lv-btn-orange" href="/dashboard/register?plan=pro">
                  {landing.primaryCta}
                  <ArrowRight size={18} />
                </Link>
                <Link className="lv-btn lv-btn-outline" href="/pricing">
                  Xem gói phù hợp
                </Link>
              </div>
              <div className="lv-proof-pills" aria-label="Điểm nhấn chuyển đổi">
                {heroProofs.map((proof) => (
                  <article className="lv-proof-pill" key={proof.value}>
                    <strong>{proof.value}</strong>
                    <span>{proof.label}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="lv-hero-stage" aria-label="Không gian sản phẩm LogiVN">
              <div className="lv-stage-frame">
                <Image
                  src={landing.bannerUrl}
                  alt={`${siteBrand.companyName} trong không gian cafe Việt`}
                  fill
                  sizes="(max-width: 1100px) 100vw, 54vw"
                />
              </div>

              <article className="lv-stage-card lv-stage-card-left">
                <span className="lv-stage-icon">
                  <QrCode size={18} />
                </span>
                <div>
                  <strong>Khách quét và gọi món ngay</strong>
                  <p>Ít chờ hơn, ít hỏi lại hơn, giữ cảm giác phục vụ mượt ngay từ bàn đầu tiên.</p>
                </div>
              </article>

              <article className="lv-stage-card lv-stage-card-right">
                <span className="lv-stage-icon">
                  <WalletCards size={18} />
                </span>
                <div>
                  <strong>Thanh toán rõ, nâng gói đúng lúc</strong>
                  <p>VietQR và các gói tính năng được trình bày rõ ràng để chủ quán yên tâm khi mở rộng.</p>
                </div>
              </article>

              <div className="lv-stage-rail">
                {quickHighlights.map((item) => (
                  <span key={item.label}>
                    <item.icon size={14} />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lv-section lv-proof" id="features">
          <div className="lv-container">
            <div className="lv-section-head">
              <SectionLabel>{landing.trustTitle}</SectionLabel>
              <h2>Một trải nghiệm bán hàng và vận hành đủ chỉn chu để khách tin, đủ rõ để chủ quán ra quyết định</h2>
              <p>
                LogiVN tập trung vào những khoảnh khắc ảnh hưởng trực tiếp đến doanh thu, tốc độ phục vụ và cảm giác tin
                cậy của quán: khách gọi món nhanh, nhân viên đỡ rối, chủ quán nhìn được bức tranh tổng thể.
              </p>
            </div>

            <div className="lv-signal-grid">
              {platformSignals.map((signal) => (
                <article className="lv-signal-card" key={signal.title}>
                  <span className="lv-signal-icon">
                    <signal.icon size={18} />
                  </span>
                  <h3>{signal.title}</h3>
                  <p>{signal.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lv-section lv-operating" aria-labelledby="lv-operating-title">
          <div className="lv-container lv-operating-shell">
            <div className="lv-section-head">
              <SectionLabel>Ba điểm chạm chính</SectionLabel>
              <h2 id="lv-operating-title">LogiVN kết nối trải nghiệm của chủ quán, nhân viên và khách hàng trong cùng một hệ thống</h2>
              <p>
                Từ lúc khách quét QR đến khi chủ quán xem báo cáo cuối ngày, mọi bước được thiết kế để phục vụ nhanh hơn,
                hạn chế nhầm lẫn và giữ hình ảnh quán chỉn chu hơn.
              </p>
            </div>

            <div className="lv-operating-grid">
              {operatingLanes.map((lane, index) => (
                <article className="lv-operating-card" key={lane.eyebrow}>
                  <div className="lv-operating-topline">
                    <span>0{index + 1}</span>
                    <div className="lv-operating-icon">
                      <lane.icon size={20} />
                    </div>
                  </div>
                  <p className="lv-operating-eyebrow">{lane.eyebrow}</p>
                  <h3>{lane.title}</h3>
                  <p>{lane.text}</p>
                  <ul>
                    {lane.points.map((point) => (
                      <li key={point}>
                        <Check size={15} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lv-section lv-chapters" id="journey">
          <div className="lv-container">
            {storyMoments.map((section, index) => (
              <article className={`lv-chapter ${index % 2 === 1 ? "lv-chapter-reverse" : ""}`} key={section.number}>
                <div className="lv-chapter-copy">
                  <div className="lv-chapter-meta">
                    <span className="lv-chapter-number">{section.number}</span>
                    <SectionLabel>{section.eyebrow}</SectionLabel>
                  </div>
                  <h3>{section.title}</h3>
                  <p>{section.text}</p>
                  <ul className="lv-chapter-points">
                    {section.points.map((point) => (
                      <li key={point}>
                        <Check size={16} />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Link className="lv-inline-link" href={section.href}>
                    {section.cta}
                    <ArrowRight size={16} />
                  </Link>
                </div>

                <div className={`lv-chapter-media ${section.tone === "dark" ? "is-dark" : ""}`}>
                  <Image src={section.image} alt={section.title} fill sizes="(max-width: 1100px) 100vw, 48vw" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lv-section lv-rhythm" id="workflow">
          <div className="lv-container">
            <div className="lv-section-head lv-section-head-centered">
              <SectionLabel>Nhịp vận hành rõ ràng</SectionLabel>
              <h2>Từ lần quét QR đầu tiên đến lúc đối soát cuối ngày</h2>
              <p>
                Mỗi bước được giữ ở đúng mức cần thiết để nhân viên không bị quá tải, khách không bị lạc hướng và chủ quán
                vẫn giữ được cái nhìn toàn cục.
              </p>
            </div>

            <div className="lv-flow-grid">
              <article className="lv-flow-card">
                <h3>Chủ quán và đội ngũ phục vụ</h3>
                <div className="lv-flow-list">
                  {ownerFlow.map((step, index) => (
                    <div className="lv-flow-step" key={step}>
                      <span>{index + 1}</span>
                      <b>{step}</b>
                    </div>
                  ))}
                </div>
              </article>

              <article className="lv-flow-card">
                <h3>Khách hàng tại bàn hoặc online</h3>
                <div className="lv-flow-list">
                  {customerFlow.map((step, index) => (
                    <div className="lv-flow-step" key={step}>
                      <span>{index + 1}</span>
                      <b>{step}</b>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="lv-steps-grid">
              {setupSteps.map((step, index) => (
                <article className="lv-step-card" key={step.title}>
                  <div className="lv-step-topline">
                    <span>{index + 1}</span>
                    <step.icon size={20} />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lv-section lv-dashboard">
          <div className="lv-container lv-dashboard-shell">
            <div className="lv-dashboard-copy">
              <SectionLabel>Bảng quản lý</SectionLabel>
              <h2>{landing.dashboardTitle}</h2>
              <p>{landing.dashboardSubtitle}</p>
              <div className="lv-dashboard-features">
                {[
                  "Tổng quan quán",
                  "Doanh thu và báo cáo",
                  "Quản lý đơn theo thời gian thực",
                  "Đặt món online",
                  "Đặt bàn và nhận cọc",
                  "Trợ lý thông minh"
                ].map((item) => (
                  <span key={item}>
                    <Check size={15} />
                    {item}
                  </span>
                ))}
              </div>
              <div className="lv-dashboard-actions">
                <Link className="lv-btn lv-btn-orange" href="/dashboard/register?plan=pro">
                  Tạo quán dùng thử
                  <ArrowRight size={18} />
                </Link>
                <Link className="lv-btn lv-btn-ghost" href="/pricing">
                  Xem bảng giá
                </Link>
              </div>
            </div>

            <div className="lv-dashboard-media">
              <div className="lv-dashboard-image">
                <Image
                  src={`${brand}/02-banner-owner-dashboard.png`}
                  alt="Dashboard quản lý LogiVN"
                  fill
                  sizes="(max-width: 1100px) 100vw, 52vw"
                />
              </div>
              <article className="lv-dashboard-note">
                <strong>Góc nhìn vận hành</strong>
                <p>Bàn, bếp, đơn online và báo cáo được gom vào đúng một góc nhìn điều hành.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lv-section lv-pricing" id="pricing">
          <div className="lv-container">
            <div className="lv-pricing-header">
              <div>
                <SectionLabel>Chọn gói tăng trưởng</SectionLabel>
                <h2>Khởi động gọn với dùng thử miễn phí, nâng cấp khi quán cần thêm tính năng vận hành</h2>
              </div>
              <p>
                Dùng thử {trialDays} ngày để xem độ phù hợp với nhịp phục vụ của quán. Khi cần mở rộng, chủ quán chọn gói và
                LogiVN mở đúng nhóm tính năng cho nhu cầu hiện tại.
              </p>
            </div>

            <div className="lv-pricing-grid">
              {plans.map((plan) => {
                const href = getPlanHref(plan.code, siteBrand.email);

                return (
                  <article className={`lv-price-card ${plan.featured ? "lv-price-featured" : ""}`} key={plan.name}>
                    {plan.featured ? <span className="lv-popular">Phổ biến</span> : null}
                    <div className="lv-price-heading">
                      <h3>{plan.name}</h3>
                      <p>{plan.subtitle}</p>
                    </div>
                    <strong>
                      {plan.price}
                      {plan.price !== "Liên hệ" ? <small>/ tháng</small> : null}
                    </strong>
                    <ul>
                      {plan.items.slice(0, 5).map((item) => (
                        <li key={item}>
                          <Check size={16} />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <CtaLink className={`lv-btn ${plan.featured ? "lv-btn-orange" : "lv-btn-green"}`} href={href}>
                      {plan.action}
                    </CtaLink>
                  </article>
                );
              })}
            </div>

            <div className="lv-pricing-note">
              <span>Dùng thử miễn phí {trialDays} ngày, không cần thẻ tín dụng</span>
              <Link href="/pricing">
                Xem bảng giá chi tiết
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className="lv-section lv-testimonials">
          <div className="lv-container">
            <div className="lv-section-head lv-section-head-centered">
              <SectionLabel>Niềm tin từ vận hành thật</SectionLabel>
              <h2>Niềm tin đến từ cảm giác vận hành gọn hơn mỗi ngày, không phải từ lời hứa hoa mỹ</h2>
            </div>

            <div className="lv-testimonial-grid">
              {testimonials.map((item) => (
                <article className="lv-testimonial-card" key={item.name}>
                  <div className="lv-testimonial-top">
                    <div className="lv-avatar">{item.name.slice(0, 2)}</div>
                    <div>
                      <h3>{item.name}</h3>
                      <span>{item.role}</span>
                    </div>
                  </div>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lv-final" id="contact">
          <div className="lv-container lv-final-grid">
            <div className="lv-final-copy">
              <SectionLabel>{landing.finalTitle}</SectionLabel>
              <h2>Sẵn sàng để mỗi bàn phục vụ trông gọn hơn, nhanh hơn và đáng tin hơn?</h2>
              <p>{landing.finalSubtitle}</p>
              <div className="lv-final-actions">
                <Link className="lv-btn lv-btn-orange" href="/dashboard/register?plan=pro">
                  Đăng ký demo ngay
                  <ArrowRight size={18} />
                </Link>
                <a className="lv-btn lv-btn-ghost" href={`mailto:${siteBrand.email}`}>
                  Liên hệ tư vấn
                </a>
              </div>
              <div className="lv-final-contact">
                <span>
                  <Phone size={15} />
                  {siteBrand.hotline}
                </span>
                <span>
                  <Mail size={15} />
                  {siteBrand.email}
                </span>
              </div>
            </div>

            <div className="lv-final-media">
              <Image
                src={`${brand}/04-banner-payment-service.png`}
                alt="Dịch vụ thanh toán và nâng cấp gói của LogiVN"
                fill
                sizes="(max-width: 1100px) 100vw, 42vw"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="lv-footer">
        <div className="lv-container lv-footer-grid">
          <div className="lv-footer-brand">
            <Logo logoUrl={siteBrand.logoUrl} label={siteBrand.companyName} light />
            <p>{landing.footerTagline}</p>
          </div>

          <div>
            <h3>Sản phẩm</h3>
            <a href="#features">Lợi ích</a>
            <a href="#journey">Câu chuyện</a>
            <a href="#pricing">Bảng giá</a>
            <Link href="/blog">Blog vận hành</Link>
            <Link href="/blog/goi-mon-qr">Hub gọi món QR</Link>
            <Link href="/blog/van-hanh-nha-hang">Hub nhà hàng</Link>
          </div>

          <div>
            <h3>Bắt đầu</h3>
            <Link href="/dashboard/register?plan=pro">Tạo quán dùng thử</Link>
            <Link href="/dashboard/login">Đăng nhập</Link>
            <Link href="/pricing">So sánh gói</Link>
          </div>

          <div>
            <h3>Liên hệ</h3>
            <p>
              <Phone size={15} />
              {siteBrand.hotline}
            </p>
            <p>
              <Mail size={15} />
              {siteBrand.email}
            </p>
            <p>
              <MapPin size={15} />
              {siteBrand.address}
            </p>
          </div>
        </div>
        <div className="lv-container lv-copyright">© 2026 {siteBrand.companyName}. All rights reserved.</div>
      </footer>
    </div>
  );
}

const styles = `
.logivn-brand-page {
  --lv-green: #0F4D3A;
  --lv-green-strong: #0A2F25;
  --lv-sage: #A9C5A1;
  --lv-orange: #F28C28;
  --lv-orange-soft: #F8B86A;
  --lv-ivory: #FFF7EB;
  --lv-paper: #FFFCF6;
  --lv-paper-strong: #F8EEDD;
  --lv-line: rgba(15, 77, 58, 0.14);
  --lv-line-strong: rgba(15, 77, 58, 0.24);
  --lv-text: #203329;
  --lv-muted: rgba(32, 51, 41, 0.72);
  --lv-shadow: 0 24px 60px rgba(26, 34, 31, 0.08);
  --lv-shadow-soft: 0 14px 32px rgba(26, 34, 31, 0.06);
  min-height: 100vh;
  color: var(--lv-text);
  background:
    radial-gradient(circle at 12% 0%, rgba(242, 140, 40, 0.18), transparent 32rem),
    radial-gradient(circle at 88% 18%, rgba(15, 77, 58, 0.13), transparent 26rem),
    linear-gradient(180deg, #FFF8EF 0%, #FFF4E6 38%, #FFFBF4 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  overflow-x: hidden;
}

.logivn-brand-page * {
  box-sizing: border-box;
}

.logivn-brand-page a {
  color: inherit;
  text-decoration: none;
}

.logivn-brand-page h1,
.logivn-brand-page h2,
.logivn-brand-page h3,
.logivn-brand-page p {
  margin: 0;
}

.lv-container {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
}

.lv-header {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid rgba(255, 255, 255, 0.32);
  background: rgba(255, 248, 239, 0.82);
  backdrop-filter: blur(18px);
}

.lv-nav {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.lv-logo {
  display: inline-flex;
  width: 154px;
  height: 42px;
  align-items: center;
}

.lv-logo img {
  width: 154px;
  height: auto;
  object-fit: contain;
}

.lv-logo-light {
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
}

.lv-nav-links {
  display: flex;
  align-items: center;
  gap: 34px;
  font-size: 14px;
  font-weight: 700;
  color: rgba(32, 51, 41, 0.84);
}

.lv-nav-links a,
.lv-login,
.lv-btn,
.lv-inline-link,
.lv-pricing-note a {
  transition: color 180ms ease, transform 180ms ease, background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.lv-nav-links a:hover,
.lv-login:hover,
.lv-inline-link:hover,
.lv-pricing-note a:hover {
  color: var(--lv-orange);
}

.lv-nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lv-login {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  color: var(--lv-green);
  font-size: 14px;
  font-weight: 700;
}

.lv-btn {
  display: inline-flex;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0 24px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.lv-btn:hover {
  transform: translateY(-1px);
}

.lv-btn-sm {
  min-height: 44px;
  padding: 0 20px;
  font-size: 14px;
}

.lv-btn-orange {
  color: #FFF8EF;
  background: linear-gradient(180deg, var(--lv-orange-soft), var(--lv-orange));
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.22);
}

.lv-btn-green {
  color: #FFF8EF;
  background: linear-gradient(180deg, #1A654E, var(--lv-green));
  box-shadow: 0 18px 36px rgba(15, 77, 58, 0.2);
}

.lv-btn-outline,
.lv-btn-ghost {
  color: var(--lv-green);
  border-color: rgba(15, 77, 58, 0.2);
  background: rgba(255, 255, 255, 0.58);
}

.lv-btn-ghost {
  background: rgba(255, 255, 255, 0.08);
  color: #FFF8EF;
  border-color: rgba(255, 255, 255, 0.2);
}

.lv-section-label,
.lv-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--lv-orange);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.lv-hero {
  position: relative;
  isolation: isolate;
  padding: 40px 0 84px;
}

.lv-hero-orb,
.lv-hero-pattern {
  position: absolute;
  pointer-events: none;
}

.lv-hero-orb {
  width: 24rem;
  height: 24rem;
  border-radius: 999px;
  filter: blur(26px);
  opacity: 0.45;
}

.lv-hero-orb-left {
  left: -10rem;
  top: -6rem;
  background: rgba(242, 140, 40, 0.28);
}

.lv-hero-orb-right {
  right: -9rem;
  top: 5rem;
  background: rgba(15, 77, 58, 0.18);
}

.lv-hero-pattern {
  inset: 0;
  opacity: 0.06;
  background-image: url("/brand/logivn/vietnam-line-motif.svg");
  background-repeat: no-repeat;
  background-position: right 6% bottom 12%;
  background-size: min(460px, 40vw);
}

.lv-hero-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 0.96fr) minmax(0, 1.04fr);
  gap: 42px;
  align-items: center;
}

.lv-hero-copy {
  max-width: 610px;
}

.lv-hero-copy h1,
.lv-section-head h2,
.lv-operating-card h3,
.lv-chapter-copy h3,
.lv-dashboard-copy h2,
.lv-pricing-header h2,
.lv-final-copy h2,
.lv-testimonial-card h3 {
  font-family: Georgia, "Times New Roman", serif;
}

.lv-hero-copy h1 {
  margin-top: 18px;
  font-size: clamp(3.4rem, 7.2vw, 6.2rem);
  line-height: 0.94;
  letter-spacing: -0.04em;
  color: var(--lv-green-strong);
}

.lv-hero-copy p {
  max-width: 38rem;
  margin-top: 22px;
  color: var(--lv-muted);
  font-size: 17px;
  line-height: 1.8;
  font-weight: 600;
}

.lv-hero-actions,
.lv-dashboard-actions,
.lv-final-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 30px;
}

.lv-proof-pills {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 30px;
}

.lv-proof-pill {
  min-height: 116px;
  padding: 18px 18px 16px;
  border: 1px solid rgba(255, 255, 255, 0.44);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: var(--lv-shadow-soft);
  backdrop-filter: blur(12px);
}

.lv-proof-pill strong {
  display: block;
  color: var(--lv-green-strong);
  font-size: 22px;
  font-weight: 800;
}

.lv-proof-pill span {
  display: block;
  margin-top: 8px;
  color: var(--lv-muted);
  font-size: 13px;
  line-height: 1.6;
  font-weight: 600;
}

.lv-hero-stage {
  position: relative;
  min-height: 40rem;
  padding: 18px 0;
}

.lv-stage-frame {
  position: relative;
  min-height: 38rem;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 34px;
  background:
    linear-gradient(180deg, rgba(10, 47, 37, 0.08), rgba(10, 47, 37, 0.22)),
    linear-gradient(135deg, #F2E0C7, #FFF7EB 58%, rgba(169, 197, 161, 0.38));
  box-shadow: var(--lv-shadow);
}

.lv-stage-frame::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(10, 47, 37, 0.04), rgba(10, 47, 37, 0.22)),
    linear-gradient(90deg, rgba(255, 248, 239, 0.22), transparent 18%, transparent 82%, rgba(10, 47, 37, 0.12));
}

.lv-stage-frame img {
  object-fit: cover;
  object-position: center;
}

.lv-stage-card {
  position: absolute;
  width: min(19rem, 58%);
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 14px;
  align-items: start;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.56);
  border-radius: 22px;
  background: rgba(255, 252, 246, 0.84);
  box-shadow: var(--lv-shadow-soft);
  backdrop-filter: blur(14px);
  animation: lvFloat 9s ease-in-out infinite;
}

.lv-stage-card-left {
  left: -18px;
  bottom: 104px;
}

.lv-stage-card-right {
  right: -10px;
  top: 46px;
  animation-delay: 1.8s;
}

.lv-stage-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 14px;
  color: var(--lv-green);
  background: rgba(15, 77, 58, 0.08);
}

.lv-stage-card strong {
  display: block;
  color: var(--lv-green-strong);
  font-size: 15px;
  line-height: 1.35;
  font-weight: 800;
}

.lv-stage-card p {
  margin-top: 6px;
  color: var(--lv-muted);
  font-size: 13px;
  line-height: 1.6;
  font-weight: 600;
}

.lv-stage-rail {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 36px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.lv-stage-rail span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 999px;
  color: #FFF8EF;
  background: rgba(10, 47, 37, 0.58);
  backdrop-filter: blur(8px);
  font-size: 13px;
  font-weight: 700;
}

.lv-section {
  padding: 44px 0;
}

@supports (content-visibility: auto) {
  .lv-section,
  .lv-final,
  .lv-footer {
    content-visibility: auto;
    contain-intrinsic-size: auto 720px;
  }
}

.lv-section-head {
  max-width: 760px;
}

.lv-section-head-centered {
  margin: 0 auto;
  text-align: center;
}

.lv-section-head h2,
.lv-pricing-header h2,
.lv-final-copy h2 {
  margin-top: 14px;
  font-size: clamp(2.2rem, 5vw, 3.45rem);
  line-height: 0.98;
  letter-spacing: -0.04em;
  color: var(--lv-green-strong);
}

.lv-section-head p,
.lv-pricing-header p,
.lv-final-copy p {
  margin-top: 16px;
  color: var(--lv-muted);
  font-size: 16px;
  line-height: 1.8;
  font-weight: 600;
}

.lv-signal-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.lv-signal-card {
  min-height: 220px;
  padding: 22px;
  border: 1px solid var(--lv-line);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: var(--lv-shadow-soft);
}

.lv-signal-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 16px;
  color: var(--lv-green);
  background: rgba(15, 77, 58, 0.08);
}

.lv-signal-card h3 {
  margin-top: 18px;
  color: var(--lv-green-strong);
  font-size: 22px;
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.lv-signal-card p {
  margin-top: 12px;
  color: var(--lv-muted);
  font-size: 14px;
  line-height: 1.7;
  font-weight: 600;
}

.lv-operating {
  padding-top: 56px;
}

.lv-operating-shell {
  position: relative;
  overflow: hidden;
  padding: 30px;
  border: 1px solid rgba(15, 77, 58, 0.12);
  border-radius: 36px;
  background:
    radial-gradient(circle at 100% 0%, rgba(242, 140, 40, 0.16), transparent 18rem),
    linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(248, 238, 221, 0.76));
  box-shadow: var(--lv-shadow-soft);
}

.lv-operating-shell::before {
  content: "";
  position: absolute;
  inset: auto -4rem -8rem auto;
  width: 20rem;
  height: 20rem;
  border-radius: 999px;
  background: rgba(15, 77, 58, 0.1);
  filter: blur(10px);
}

.lv-operating-shell > * {
  position: relative;
  z-index: 1;
}

.lv-operating-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.lv-operating-card {
  display: flex;
  min-height: 330px;
  flex-direction: column;
  padding: 22px;
  border: 1px solid rgba(15, 77, 58, 0.13);
  border-radius: 28px;
  background: rgba(255, 252, 246, 0.72);
  box-shadow: var(--lv-shadow-soft);
}

.lv-operating-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lv-operating-topline > span {
  color: rgba(15, 77, 58, 0.2);
  font-size: 34px;
  line-height: 1;
  font-weight: 900;
}

.lv-operating-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 16px;
  color: var(--lv-green);
  background: rgba(15, 77, 58, 0.08);
}

.lv-operating-eyebrow {
  margin-top: 24px;
  color: var(--lv-orange);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lv-operating-card h3 {
  margin-top: 10px;
  color: var(--lv-green-strong);
  font-size: 28px;
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.lv-operating-card p:not(.lv-operating-eyebrow) {
  margin-top: 14px;
  color: var(--lv-muted);
  font-size: 14px;
  line-height: 1.7;
  font-weight: 600;
}

.lv-operating-card ul {
  display: grid;
  gap: 10px;
  margin: auto 0 0;
  padding: 22px 0 0;
  list-style: none;
}

.lv-operating-card li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--lv-green);
  font-size: 13px;
  line-height: 1.55;
  font-weight: 800;
}

.lv-chapters .lv-container {
  display: grid;
  gap: 32px;
}

.lv-chapter {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
  gap: 28px;
  align-items: center;
}

.lv-chapter-reverse {
  grid-template-columns: minmax(0, 1.18fr) minmax(0, 0.82fr);
}

.lv-chapter-reverse .lv-chapter-copy {
  order: 2;
}

.lv-chapter-reverse .lv-chapter-media {
  order: 1;
}

.lv-chapter-copy {
  position: relative;
  padding: 26px 8px 26px 0;
}

.lv-chapter-meta {
  display: flex;
  align-items: center;
  gap: 14px;
}

.lv-chapter-number {
  display: inline-flex;
  align-items: center;
  color: rgba(15, 77, 58, 0.14);
  font-size: 54px;
  font-weight: 800;
  line-height: 1;
}

.lv-chapter-copy h3 {
  margin-top: 16px;
  font-size: clamp(2rem, 4.4vw, 3rem);
  line-height: 0.98;
  letter-spacing: -0.04em;
  color: var(--lv-green-strong);
}

.lv-chapter-copy p {
  margin-top: 16px;
  color: var(--lv-muted);
  font-size: 16px;
  line-height: 1.8;
  font-weight: 600;
}

.lv-chapter-points {
  display: grid;
  gap: 12px;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
}

.lv-chapter-points li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--lv-green);
  font-size: 14px;
  line-height: 1.6;
  font-weight: 700;
}

.lv-inline-link,
.lv-pricing-note a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  color: var(--lv-green);
  font-size: 14px;
  font-weight: 800;
}

.lv-chapter-media {
  position: relative;
  aspect-ratio: 1916 / 821;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 34px;
  background:
    radial-gradient(circle at top left, rgba(242, 140, 40, 0.12), transparent 24rem),
    linear-gradient(180deg, #FFF8EF, #FFF3E1);
  box-shadow: var(--lv-shadow);
}

.lv-chapter-media.is-dark {
  background:
    radial-gradient(circle at 18% 16%, rgba(242, 140, 40, 0.2), transparent 16rem),
    linear-gradient(145deg, #0B2F24, #103C31 55%, #154B3B);
}

.lv-chapter-media img,
.lv-dashboard-image img,
.lv-final-media img {
  object-fit: contain;
  object-position: center;
}

.lv-rhythm {
  padding-top: 56px;
}

.lv-flow-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 30px;
}

.lv-flow-card {
  padding: 24px;
  border: 1px solid var(--lv-line);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: var(--lv-shadow-soft);
}

.lv-flow-card h3 {
  color: var(--lv-green-strong);
  font-size: 28px;
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.lv-flow-list {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}

.lv-flow-step {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 12px;
  align-items: start;
}

.lv-flow-step span,
.lv-step-topline span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 999px;
  color: #FFF8EF;
  background: var(--lv-green);
  font-size: 14px;
  font-weight: 800;
}

.lv-flow-step b {
  padding-top: 8px;
  color: var(--lv-green);
  font-size: 14px;
  line-height: 1.6;
  font-weight: 700;
}

.lv-steps-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.lv-step-card {
  min-height: 190px;
  padding: 20px;
  border: 1px solid var(--lv-line);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: var(--lv-shadow-soft);
}

.lv-step-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--lv-green);
}

.lv-step-card h3 {
  margin-top: 18px;
  color: var(--lv-green-strong);
  font-size: 24px;
  line-height: 1.02;
  letter-spacing: -0.03em;
}

.lv-step-card p {
  margin-top: 12px;
  color: var(--lv-muted);
  font-size: 14px;
  line-height: 1.7;
  font-weight: 600;
}

.lv-dashboard {
  padding-top: 54px;
}

.lv-dashboard-shell {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
  gap: 28px;
  padding: 34px;
  overflow: hidden;
  border-radius: 36px;
  background:
    radial-gradient(circle at top right, rgba(242, 140, 40, 0.2), transparent 18rem),
    linear-gradient(145deg, #0A2F25 0%, #0F4D3A 52%, #145542 100%);
  box-shadow: 0 30px 68px rgba(10, 47, 37, 0.22);
}

.lv-dashboard-shell::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.08;
  background-image: url("/brand/logivn/vietnam-line-motif.svg");
  background-repeat: no-repeat;
  background-position: left bottom;
  background-size: 24rem;
}

.lv-dashboard-copy,
.lv-dashboard-media {
  position: relative;
  z-index: 1;
}

.lv-dashboard-copy .lv-section-label,
.lv-final-copy .lv-section-label {
  color: rgba(248, 184, 106, 0.94);
}

.lv-dashboard-copy h2,
.lv-final-copy h2 {
  margin-top: 14px;
  color: #FFF8EF;
  font-size: clamp(2.2rem, 4.8vw, 3.5rem);
  line-height: 0.98;
  letter-spacing: -0.04em;
}

.lv-dashboard-copy p {
  margin-top: 16px;
  color: rgba(255, 248, 239, 0.76);
  font-size: 16px;
  line-height: 1.8;
  font-weight: 600;
}

.lv-dashboard-features {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 26px;
}

.lv-dashboard-features span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  color: #FFF8EF;
  background: rgba(255, 255, 255, 0.08);
  font-size: 13px;
  font-weight: 700;
}

.lv-dashboard-media {
  align-self: center;
}

.lv-dashboard-image {
  position: relative;
  aspect-ratio: 1916 / 821;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.08);
}

.lv-dashboard-note {
  position: absolute;
  left: 18px;
  bottom: 18px;
  max-width: 18rem;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  background: rgba(255, 248, 239, 0.14);
  backdrop-filter: blur(14px);
}

.lv-dashboard-note strong {
  display: block;
  color: #FFF8EF;
  font-size: 15px;
  font-weight: 800;
}

.lv-dashboard-note p {
  margin-top: 8px;
  color: rgba(255, 248, 239, 0.74);
  font-size: 13px;
  line-height: 1.6;
  font-weight: 600;
}

.lv-pricing-header {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 22px;
  align-items: end;
}

.lv-pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.lv-price-card {
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  padding: 24px;
  border: 1px solid var(--lv-line);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.64);
  box-shadow: var(--lv-shadow-soft);
}

.lv-price-featured {
  border-color: rgba(242, 140, 40, 0.34);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(248, 238, 221, 0.98));
}

.lv-popular {
  position: absolute;
  right: 22px;
  top: 22px;
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  color: #FFF8EF;
  background: var(--lv-green);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lv-price-heading h3 {
  font-family: Georgia, "Times New Roman", serif;
  color: var(--lv-green-strong);
  font-size: 34px;
  line-height: 0.98;
  letter-spacing: -0.04em;
}

.lv-price-heading p {
  margin-top: 10px;
  color: var(--lv-muted);
  font-size: 14px;
  line-height: 1.7;
  font-weight: 600;
}

.lv-price-card strong {
  display: block;
  margin-top: 24px;
  color: var(--lv-green-strong);
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
}

.lv-price-card small {
  font-size: 14px;
  font-weight: 700;
  color: var(--lv-muted);
}

.lv-price-card ul {
  display: grid;
  gap: 10px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}

.lv-price-card li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--lv-green);
  font-size: 14px;
  line-height: 1.6;
  font-weight: 700;
}

.lv-price-card .lv-btn {
  width: 100%;
  margin-top: auto;
  justify-content: center;
}

.lv-pricing-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
  padding: 18px 24px;
  border: 1px solid var(--lv-line);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.56);
}

.lv-pricing-note span {
  color: var(--lv-green);
  font-size: 14px;
  font-weight: 700;
}

.lv-testimonials {
  padding-top: 56px;
}

.lv-testimonial-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 26px;
}

.lv-testimonial-card {
  min-height: 100%;
  padding: 24px;
  border: 1px solid var(--lv-line);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: var(--lv-shadow-soft);
}

.lv-testimonial-top {
  display: flex;
  align-items: center;
  gap: 14px;
}

.lv-avatar {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 999px;
  color: #FFF8EF;
  background: linear-gradient(180deg, #1A654E, var(--lv-green));
  font-size: 14px;
  font-weight: 800;
}

.lv-testimonial-card h3 {
  color: var(--lv-green-strong);
  font-size: 24px;
  line-height: 1;
  letter-spacing: -0.03em;
}

.lv-testimonial-card span {
  display: block;
  margin-top: 4px;
  color: var(--lv-muted);
  font-size: 13px;
  font-weight: 600;
}

.lv-testimonial-card p {
  margin-top: 18px;
  color: var(--lv-muted);
  font-size: 15px;
  line-height: 1.75;
  font-weight: 600;
}

.lv-final {
  padding: 58px 0 44px;
}

.lv-final-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  gap: 28px;
  align-items: center;
  padding: 34px;
  overflow: hidden;
  border-radius: 36px;
  background:
    radial-gradient(circle at top right, rgba(242, 140, 40, 0.18), transparent 18rem),
    linear-gradient(150deg, #0A2F25 0%, #0F4D3A 55%, #154B3B 100%);
  box-shadow: 0 28px 60px rgba(10, 47, 37, 0.18);
}

.lv-final-copy {
  max-width: 34rem;
}

.lv-final-copy p {
  color: rgba(255, 248, 239, 0.76);
}

.lv-final-contact {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}

.lv-final-contact span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  color: rgba(255, 248, 239, 0.82);
  background: rgba(255, 255, 255, 0.08);
  font-size: 13px;
  font-weight: 700;
}

.lv-final-media {
  position: relative;
  aspect-ratio: 1916 / 821;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.08);
}

.lv-footer {
  padding: 0 0 36px;
}

.lv-footer-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1.2fr;
  gap: 24px;
  margin-top: 28px;
  padding: 28px 0 0;
  border-top: 1px solid rgba(15, 77, 58, 0.12);
}

.lv-footer h3 {
  margin-bottom: 12px;
  color: var(--lv-green-strong);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lv-footer p,
.lv-footer a {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--lv-muted);
  font-size: 14px;
  line-height: 1.65;
  font-weight: 600;
}

.lv-footer a:hover {
  color: var(--lv-orange);
}

.lv-footer-brand p {
  margin-top: 12px;
  margin-bottom: 0;
  max-width: 18rem;
}

.lv-copyright {
  margin-top: 22px;
  color: rgba(32, 51, 41, 0.52);
  font-size: 12px;
  font-weight: 600;
}

.lv-nav-links a:focus-visible,
.lv-login:focus-visible,
.lv-btn:focus-visible,
.lv-inline-link:focus-visible,
.lv-pricing-note a:focus-visible,
.lv-footer a:focus-visible {
  outline: 2px solid rgba(242, 140, 40, 0.54);
  outline-offset: 4px;
}

@keyframes lvFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@media (max-width: 1120px) {
  .lv-hero-shell,
  .lv-dashboard-shell,
  .lv-final-grid,
  .lv-pricing-header {
    grid-template-columns: 1fr;
  }

  .lv-proof-pills,
  .lv-signal-grid,
  .lv-operating-grid,
  .lv-pricing-grid,
  .lv-testimonial-grid,
  .lv-footer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lv-chapter,
  .lv-chapter-reverse {
    grid-template-columns: 1fr;
  }

  .lv-chapter-reverse .lv-chapter-copy,
  .lv-chapter-reverse .lv-chapter-media {
    order: initial;
  }

  .lv-dashboard-media {
    width: 100%;
  }
}

@media (max-width: 860px) {
  .lv-container {
    width: min(100% - 28px, 640px);
  }

  .lv-nav {
    min-height: 68px;
  }

  .lv-nav-links,
  .lv-login {
    display: none;
  }

  .lv-hero {
    display: flex;
    min-height: calc(100svh - 68px);
    align-items: center;
    padding-top: 26px;
    padding-bottom: 52px;
  }

  .lv-section {
    padding: 36px 0;
  }

  .lv-hero-shell {
    gap: 30px;
  }

  .lv-hero-stage {
    display: none;
  }

  .lv-hero-copy h1 {
    font-size: clamp(3rem, 9vw, 4.35rem);
  }

  .lv-section-head h2,
  .lv-pricing-header h2,
  .lv-final-copy h2,
  .lv-dashboard-copy h2 {
    font-size: clamp(2rem, 6.2vw, 2.8rem);
  }

  .lv-chapter-copy h3 {
    font-size: clamp(1.9rem, 6vw, 2.55rem);
  }

  .lv-proof-pills,
  .lv-signal-grid,
  .lv-operating-grid,
  .lv-flow-grid,
  .lv-steps-grid,
  .lv-pricing-grid,
  .lv-testimonial-grid,
  .lv-footer-grid {
    grid-template-columns: 1fr;
  }

  .lv-hero-stage {
    min-height: auto;
    padding: 0;
  }

  .lv-stage-frame {
    height: min(56vw, 380px);
    min-height: 0;
  }

  .lv-stage-card {
    position: relative;
    width: 100%;
    left: auto;
    right: auto;
    top: auto;
    bottom: auto;
    margin-top: 14px;
    animation: none;
  }

  .lv-stage-rail {
    position: relative;
    left: auto;
    right: auto;
    bottom: auto;
    margin-top: 14px;
  }

  .lv-dashboard-features {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .lv-container {
    width: min(100% - 24px, 520px);
  }

  .lv-header {
    position: relative;
  }

  .lv-nav {
    min-height: 58px;
    gap: 12px;
  }

  .lv-nav-actions {
    gap: 8px;
  }

  .lv-btn,
  .lv-pricing-note {
    width: 100%;
  }

  .lv-btn {
    min-height: 46px;
    gap: 8px;
    padding: 0 16px;
    font-size: 13px;
  }

  .lv-btn-sm {
    width: auto;
    min-height: 44px;
    padding: 0 14px;
    font-size: 12px;
  }

  .lv-hero-actions,
  .lv-dashboard-actions,
  .lv-final-actions,
  .lv-pricing-note {
    flex-direction: column;
    align-items: stretch;
  }

  .lv-logo,
  .lv-logo img {
    width: 118px;
  }

  .lv-section {
    padding: 30px 0;
  }

  .lv-section-label,
  .lv-kicker {
    gap: 6px;
    font-size: 10px;
    letter-spacing: 0.12em;
  }

  .lv-hero {
    padding-top: 18px;
    padding-bottom: 34px;
  }

  .lv-hero-shell {
    gap: 24px;
  }

  .lv-hero-copy h1 {
    margin-top: 12px;
    font-size: clamp(2.35rem, 10.6vw, 3rem);
    line-height: 0.98;
    letter-spacing: -0.03em;
  }

  .lv-hero-copy p {
    margin-top: 14px;
    font-size: 14px;
    line-height: 1.62;
  }

  .lv-hero-actions,
  .lv-dashboard-actions,
  .lv-final-actions {
    gap: 10px;
    margin-top: 20px;
  }

  .lv-proof-pills {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
    margin-top: 18px;
  }

  .lv-proof-pill {
    min-height: 86px;
    padding: 11px 10px 10px;
  }

  .lv-proof-pill strong {
    font-size: 17px;
  }

  .lv-proof-pill span {
    display: -webkit-box;
    margin-top: 5px;
    font-size: 12px;
    line-height: 1.45;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .lv-hero-stage {
    min-height: auto;
    padding: 0;
  }

  .lv-stage-frame {
    height: min(86vw, 360px);
    min-height: 0;
    border-radius: 24px;
  }

  .lv-stage-card {
    grid-template-columns: 34px 1fr;
    gap: 10px;
    margin-top: 10px;
    padding: 12px 13px;
    border-radius: 18px;
  }

  .lv-stage-icon {
    width: 34px;
    height: 34px;
    border-radius: 12px;
  }

  .lv-stage-card strong {
    font-size: 13px;
    line-height: 1.28;
  }

  .lv-stage-card p {
    margin-top: 4px;
    font-size: 11.5px;
    line-height: 1.45;
  }

  .lv-stage-rail {
    gap: 8px;
    margin-top: 10px;
  }

  .lv-stage-rail span {
    min-height: 34px;
    gap: 6px;
    padding: 0 11px;
    font-size: 11.5px;
  }

  .lv-section-head h2,
  .lv-pricing-header h2,
  .lv-final-copy h2,
  .lv-dashboard-copy h2 {
    margin-top: 10px;
    font-size: clamp(1.65rem, 8vw, 2.25rem);
    line-height: 1.03;
    letter-spacing: -0.03em;
  }

  .lv-section-head p,
  .lv-pricing-header p,
  .lv-final-copy p,
  .lv-dashboard-copy p {
    margin-top: 10px;
    font-size: 14px;
    line-height: 1.58;
  }

  .lv-signal-grid,
  .lv-flow-grid,
  .lv-steps-grid,
  .lv-pricing-grid,
  .lv-testimonial-grid {
    gap: 12px;
    margin-top: 18px;
  }

  .lv-signal-card {
    min-height: auto;
    padding: 16px;
    border-radius: 22px;
  }

  .lv-signal-icon {
    width: 36px;
    height: 36px;
    border-radius: 13px;
  }

  .lv-signal-card h3 {
    margin-top: 12px;
    font-size: 18px;
  }

  .lv-signal-card p {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.55;
  }

  .lv-operating {
    padding-top: 30px;
  }

  .lv-operating-shell {
    padding: 18px;
    border-radius: 24px;
  }

  .lv-operating-card {
    min-height: auto;
    padding: 16px;
    border-radius: 22px;
  }

  .lv-operating-topline > span {
    font-size: 28px;
  }

  .lv-operating-icon {
    width: 38px;
    height: 38px;
    border-radius: 13px;
  }

  .lv-operating-eyebrow {
    margin-top: 16px;
    font-size: 10px;
  }

  .lv-operating-card h3 {
    font-size: 20px;
    letter-spacing: -0.03em;
  }

  .lv-operating-card p:not(.lv-operating-eyebrow),
  .lv-operating-card li {
    font-size: 13px;
    line-height: 1.5;
  }

  .lv-operating-card ul {
    margin-top: 0;
    padding-top: 16px;
  }

  .lv-chapters .lv-container {
    gap: 22px;
  }

  .lv-chapter {
    gap: 16px;
  }

  .lv-chapter-copy {
    padding: 8px 0 0;
  }

  .lv-chapter-meta {
    gap: 10px;
  }

  .lv-chapter-number {
    font-size: 38px;
  }

  .lv-chapter-copy h3 {
    margin-top: 10px;
    font-size: clamp(1.55rem, 7.5vw, 2.05rem);
    line-height: 1.03;
    letter-spacing: -0.03em;
  }

  .lv-chapter-copy p {
    margin-top: 10px;
    font-size: 14px;
    line-height: 1.58;
  }

  .lv-chapter-points {
    gap: 8px;
    margin-top: 14px;
  }

  .lv-chapter-points li {
    gap: 8px;
    font-size: 13px;
    line-height: 1.45;
  }

  .lv-inline-link,
  .lv-pricing-note a {
    margin-top: 16px;
    font-size: 13px;
  }

  .lv-chapter-media {
    border-radius: 22px;
    box-shadow: var(--lv-shadow-soft);
  }

  .lv-rhythm {
    padding-top: 30px;
  }

  .lv-flow-card {
    padding: 16px;
    border-radius: 22px;
  }

  .lv-flow-card h3 {
    font-size: 21px;
    letter-spacing: -0.03em;
  }

  .lv-flow-list {
    gap: 9px;
    margin-top: 14px;
  }

  .lv-flow-step {
    grid-template-columns: 32px 1fr;
    gap: 10px;
  }

  .lv-flow-step span,
  .lv-step-topline span {
    width: 32px;
    height: 32px;
    font-size: 12px;
  }

  .lv-flow-step b {
    padding-top: 5px;
    font-size: 13px;
    line-height: 1.45;
  }

  .lv-step-card {
    min-height: auto;
    padding: 16px;
  }

  .lv-step-card h3 {
    margin-top: 12px;
    font-size: 19px;
  }

  .lv-step-card p {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.55;
  }

  .lv-dashboard {
    padding-top: 30px;
  }

  .lv-dashboard-shell,
  .lv-final-grid {
    gap: 18px;
    padding: 18px;
    border-radius: 24px;
  }

  .lv-dashboard-features {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 16px;
  }

  .lv-dashboard-features span {
    min-height: 38px;
    padding: 0 11px;
    border-radius: 13px;
    font-size: 12px;
  }

  .lv-dashboard-note {
    left: 10px;
    bottom: 10px;
    max-width: 13.5rem;
    padding: 10px 12px;
    border-radius: 15px;
  }

  .lv-dashboard-note strong {
    font-size: 12.5px;
  }

  .lv-dashboard-note p {
    margin-top: 4px;
    font-size: 11px;
    line-height: 1.35;
  }

  .lv-price-card {
    padding: 18px;
    border-radius: 22px;
  }

  .lv-popular {
    right: 16px;
    top: 16px;
    min-height: 26px;
    font-size: 10.5px;
  }

  .lv-price-heading h3,
  .lv-price-card strong {
    font-size: 25px;
  }

  .lv-price-heading p,
  .lv-price-card li,
  .lv-pricing-note span {
    font-size: 13px;
    line-height: 1.5;
  }

  .lv-price-card strong,
  .lv-price-card ul {
    margin-top: 16px;
  }

  .lv-price-card ul {
    gap: 8px;
  }

  .lv-pricing-note {
    gap: 10px;
    margin-top: 14px;
    padding: 14px 16px;
    border-radius: 18px;
  }

  .lv-testimonials {
    padding-top: 30px;
  }

  .lv-testimonial-card {
    padding: 16px;
    border-radius: 22px;
  }

  .lv-testimonial-top {
    gap: 10px;
  }

  .lv-avatar {
    width: 38px;
    height: 38px;
    font-size: 12px;
  }

  .lv-testimonial-card h3 {
    font-size: 19px;
  }

  .lv-testimonial-card span {
    font-size: 12px;
  }

  .lv-testimonial-card p {
    margin-top: 12px;
    font-size: 13px;
    line-height: 1.55;
  }

  .lv-final {
    padding: 34px 0 26px;
  }

  .lv-final-contact {
    gap: 8px;
    margin-top: 12px;
  }

  .lv-final-contact span {
    min-height: 34px;
    padding: 0 11px;
    font-size: 12px;
  }

  .lv-proof-pill,
  .lv-flow-card,
  .lv-step-card,
  .lv-price-card,
  .lv-testimonial-card {
    border-radius: 22px;
  }

  .lv-chapter-media,
  .lv-dashboard-image,
  .lv-final-media {
    border-radius: 20px;
  }

  .lv-footer {
    padding-bottom: 26px;
  }

  .lv-footer-grid {
    gap: 12px;
    margin-top: 18px;
    padding-top: 18px;
  }

  .lv-footer h3 {
    margin-bottom: 8px;
    font-size: 12px;
  }

  .lv-footer p,
  .lv-footer a {
    margin-bottom: 7px;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .lv-copyright {
    margin-top: 14px;
  }
}

@media (max-width: 420px) {
  .lv-container {
    width: min(100% - 20px, 400px);
  }

  .lv-hero-copy h1 {
    font-size: clamp(2.15rem, 10.2vw, 2.65rem);
  }

  .lv-stage-frame {
    height: min(80vw, 330px);
  }

  .lv-stage-card-right {
    margin-top: 10px;
  }

  .lv-proof-pills,
  .lv-signal-grid,
  .lv-flow-grid,
  .lv-steps-grid,
  .lv-pricing-grid,
  .lv-testimonial-grid {
    gap: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lv-nav-links a,
  .lv-login,
  .lv-btn,
  .lv-inline-link,
  .lv-pricing-note a {
    transition: none;
  }

  .lv-stage-card {
    animation: none;
  }
}
`;
