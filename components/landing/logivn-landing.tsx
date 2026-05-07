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
  Rocket,
  Settings,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Store,
  Utensils,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";
import type { PlatformSiteConfig } from "@/services/platform-public-service";

const brand = "/brand/logivn";

const quickFeatures = [
  { icon: QrCode, label: "QR gọi món nhanh chóng" },
  { icon: Store, label: "Quản lý bàn thông minh" },
  { icon: WalletCards, label: "Thanh toán VietQR" },
  { icon: ShoppingBag, label: "Đặt món online" },
  { icon: ClipboardList, label: "Đặt bàn & nhận cọc" },
  { icon: Bell, label: "Gọi nhân viên ngay lập tức" },
  { icon: Sparkles, label: "AI setup quán" }
];

const valueCards = [
  {
    icon: Rocket,
    title: "Tăng tốc phục vụ & giảm sai sót",
    text: "Khách gọi món trực tiếp qua QR, giảm thời gian chờ và sai order."
  },
  {
    icon: BarChart3,
    title: "Quản lý tập trung, real-time",
    text: "Theo dõi đơn hàng, bàn trống, doanh thu tại mọi nơi duy nhất."
  },
  {
    icon: ClipboardList,
    title: "Thanh toán nhanh - An toàn",
    text: "Hỗ trợ VietQR và nhiều phương thức thanh toán không tiền mặt."
  },
  {
    icon: Settings,
    title: "Dễ dùng - Dễ triển khai",
    text: "Giao diện thân thiện, triển khai nhanh, phù hợp mọi mô hình quán."
  }
];

const storySections = [
  {
    number: "01",
    title: "Quản lý menu & món ăn dễ dàng, trực quan",
    text: "Thêm món, chỉnh giá, phân loại, set topping, combo chỉ trong vài thao tác. Cập nhật ngay trên mọi thiết bị.",
    image: `${brand}/01-banner-overview-hero.png`,
    cta: "Khám phá tính năng",
    tone: "dark"
  },
  {
    number: "02",
    title: "Khách quét QR - gọi món trong vài giây",
    text: "Menu hiển thị đẹp mắt, dễ chọn món, đặt món nhanh chóng và gọi thêm dễ dàng bất cứ lúc nào.",
    image: `${brand}/03-banner-customer-qr-ordering.png`,
    cta: "Tìm hiểu thêm",
    tone: "light"
  },
  {
    number: "03",
    title: "Chủ quán quản lý mọi thứ trong một nơi",
    text: "Nhận order realtime, quản lý bàn, bếp, thanh toán, đặt online, đặt bàn và gợi ý AI trong một dashboard.",
    image: `${brand}/02-banner-owner-dashboard.png`,
    cta: "Xem chi tiết",
    tone: "dark"
  },
  {
    number: "04",
    title: "Thanh toán VietQR, gia hạn gói và mở Premium rõ ràng",
    text: "Chủ quán chọn Pro/Premium, tạo VietQR gia hạn, LogiVN xác minh rồi mở đúng tính năng theo entitlement.",
    image: `${brand}/04-banner-payment-service.png`,
    cta: "Khám phá ngay",
    tone: "light"
  }
];

const ownerFlow = [
  "Nhận order real-time",
  "Xác nhận & chuyển bếp",
  "Theo dõi bàn & nhân viên",
  "Thanh toán & xem báo cáo"
];

const customerFlow = ["Quét QR bàn", "Chọn món & đặt gọi", "Nhận món & gọi thêm", "Thanh toán nhanh chóng"];

const setupSteps = [
  { icon: ClipboardList, title: "Đăng ký quán", text: "Tạo tài khoản và thiết lập thông tin quán." },
  { icon: Utensils, title: "Tạo menu", text: "Thêm món, phân loại, set giá và tuỳ chọn." },
  { icon: QrCode, title: "In QR bàn", text: "In mã QR và đặt tại mỗi bàn." },
  { icon: Smartphone, title: "Bắt đầu nhận order", text: "Quản lý, phục vụ và tăng doanh thu ngay." }
];

const pricing = [
  {
    name: "Cơ bản",
    subtitle: "Dành cho quán nhỏ",
    price: "199.000đ",
    items: ["QR gọi món", "Quản lý bàn & order", "Báo cáo cơ bản"],
    action: "Dùng thử miễn phí",
    featured: false
  },
  {
    name: "Nâng cao",
    subtitle: "Dành cho quán phát triển",
    price: "399.000đ",
    items: ["Tất cả tính năng gói Cơ bản", "Gọi nhân viên", "Thanh toán VietQR", "Báo cáo nâng cao"],
    action: "Dùng thử miễn phí",
    featured: true
  },
  {
    name: "Doanh nghiệp",
    subtitle: "Dành cho chuỗi & nhiều chi nhánh",
    price: "Liên hệ",
    items: ["Quản lý nhiều chi nhánh", "Phân quyền nâng cao", "Hỗ trợ & triển khai riêng"],
    action: "Liên hệ tư vấn",
    featured: false
  }
];

const testimonials = [
  {
    name: "Anh Minh",
    role: "Chủ quán Cafe, Đà Nẵng",
    text: "LogiVN giúp quán mình phục vụ nhanh hơn rõ rệt, khách tự gọi món qua QR rất tiện, nhân viên đỡ bị sót order."
  },
  {
    name: "Chị Hương",
    role: "Quán lý nhà hàng, Hà Nội",
    text: "Quản lý được mọi thứ trên điện thoại, xem báo cáo mỗi ngày. Thanh toán VietQR cũng nhanh và chính xác."
  },
  {
    name: "Anh Tuấn",
    role: "Chủ chuỗi trà sữa, TP. Hồ Chí Minh",
    text: "Triển khai cho cả chuỗi rất dễ, tính năng đầy đủ, đội ngũ hỗ trợ nhiệt tình. Rất đáng đồng tiền."
  }
];

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

export function LogiVNLanding({ siteConfig }: { siteConfig: PlatformSiteConfig }) {
  const { brand: siteBrand, landing, plans } = siteConfig;
  const trialDays = plans.reduce((max, plan) => {
    const match = plan.items.join(" ").match(/(\d+)\s*ngày/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 30);

  return (
    <div className="logivn-brand-page">
      <style>{styles}</style>

      <header className="lv-header">
        <div className="lv-container lv-nav">
          <Logo logoUrl={siteBrand.logoUrl} label={siteBrand.companyName} priority />
          <nav className="lv-nav-links" aria-label="Điều hướng chính">
            <a href="#solution">Giải pháp</a>
            <a href="#features">Tính năng</a>
            <a href="#workflow">Quy trình</a>
            <Link href="/pricing">Bảng giá</Link>
            <a href="#contact">Liên hệ</a>
          </nav>
          <div className="lv-nav-actions">
            <Link className="lv-login" href="/dashboard/login">
              Đăng nhập
            </Link>
            <Link className="lv-btn lv-btn-orange lv-btn-sm" href="/dashboard/register?plan=pro">
              Đăng ký demo
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lv-hero" id="solution">
          <div className="lv-container lv-hero-grid">
            <div className="lv-hero-copy">
              <h1>{landing.heroTitle}</h1>
              <p>{landing.heroSubtitle}</p>
              <div className="lv-hero-actions">
                <Link className="lv-btn lv-btn-green" href="/dashboard/register?plan=pro">
                  {landing.primaryCta}
                  <ArrowRight size={18} />
                </Link>
                <a className="lv-btn lv-btn-outline" href="#workflow">
                  {landing.secondaryCta}
                  <span className="lv-play">▶</span>
                </a>
              </div>
            </div>

            <div className="lv-hero-media" aria-label="Không gian nhà hàng và giao diện LogiVN">
              <Image
                src={landing.bannerUrl}
                alt={`${siteBrand.companyName} trong không gian nhà hàng Việt`}
                fill
                sizes="(max-width: 900px) 100vw, 58vw"
                priority
              />
            </div>
          </div>

          <div className="lv-container lv-quickbar" aria-label="Các tính năng nhanh">
            {quickFeatures.map((item) => (
              <div className="lv-quick-item" key={item.label}>
                <item.icon size={22} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lv-section lv-values" id="features">
          <div className="lv-container">
            <h2 className="lv-centered-title">
              {landing.trustTitle}
            </h2>
            <div className="lv-value-grid">
              {valueCards.map((card) => (
                <article className="lv-value-card" key={card.title}>
                  <card.icon size={42} />
                  <div>
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lv-section lv-story">
          <div className="lv-container lv-story-list">
            {storySections.map((section) => (
              <Link className="lv-story-card" href="#pricing" key={section.number} aria-label={`${section.cta}: ${section.title}`}>
                <Image src={section.image} alt={section.title} fill sizes="100vw" />
              </Link>
            ))}
          </div>
        </section>

        <section className="lv-workflow" id="workflow">
          <div className="lv-container">
            <h2>LogiVN hoạt động như thế nào?</h2>
            <div className="lv-flow-grid">
              <div className="lv-flow-card">
                <h3>Quy trình dành cho Chủ quán</h3>
                <div className="lv-flow-line">
                  {ownerFlow.map((step) => (
                    <div className="lv-flow-step" key={step}>
                      <span>
                        <Store size={20} />
                      </span>
                      <b>{step}</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lv-flow-card">
                <h3>Trải nghiệm dành cho Khách hàng</h3>
                <div className="lv-flow-line">
                  {customerFlow.map((step) => (
                    <div className="lv-flow-step" key={step}>
                      <span>
                        <QrCode size={20} />
                      </span>
                      <b>{step}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lv-steps">
          <div className="lv-container">
            <h2>Bắt đầu với LogiVN chỉ trong 4 bước</h2>
            <div className="lv-steps-grid">
              {setupSteps.map((step, index) => (
                <article className="lv-step-card" key={step.title}>
                  <div className="lv-step-visual">
                    <step.icon size={38} />
                  </div>
                  <span>{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lv-section lv-dashboard">
          <div className="lv-container lv-dashboard-grid">
            <div>
              <SectionLabel>Dashboard quản lý</SectionLabel>
              <h2>{landing.dashboardTitle}</h2>
              <p>{landing.dashboardSubtitle}</p>
              <div className="lv-dashboard-features">
                {[
                  "Dashboard tổng quan",
                  "Báo cáo doanh thu",
                  "Quản lý đơn hàng",
                  "Đặt món online",
                  "Đặt bàn & nhận cọc",
                  "AI setup quán"
                ].map((item) => (
                  <span key={item}>
                    <Check size={15} />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="lv-dashboard-image">
              <Image src={`${brand}/02-banner-owner-dashboard.png`} alt="Dashboard quản lý LogiVN" fill sizes="55vw" />
            </div>
          </div>
        </section>

        <section className="lv-section lv-pricing" id="pricing">
          <div className="lv-container">
            <h2 className="lv-centered-title">Gói dịch vụ phù hợp với mọi mô hình quán</h2>
            <div className="lv-pricing-grid">
              {plans.map((plan) => (
                <article className={`lv-price-card ${plan.featured ? "lv-price-featured" : ""}`} key={plan.name}>
                  {plan.featured && <span className="lv-popular">Phổ biến</span>}
                  <h3>{plan.name}</h3>
                  <p>{plan.subtitle}</p>
                  <strong>
                    {plan.price}
                    {plan.price !== "Liên hệ" && <small>/tháng</small>}
                  </strong>
                  <ul>
                    {plan.items.map((item) => (
                      <li key={item}>
                        <Check size={16} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={`lv-btn ${plan.featured ? "lv-btn-orange" : "lv-btn-green"}`}
                    href={`/dashboard/register?plan=${encodeURIComponent(plan.code === "premium" ? "premium" : "pro")}`}
                  >
                    {plan.action}
                  </Link>
                </article>
              ))}
              <article className="lv-trial-card">
                <h3>Dùng thử miễn phí {trialDays} ngày</h3>
                <p>Không cần thẻ tín dụng</p>
                <ul>
                  <li>Triển khai nhanh</li>
                  <li>Hỗ trợ 1-1 tận tình</li>
                  <li>Dữ liệu an toàn, bảo mật</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="lv-section lv-testimonials">
          <div className="lv-container">
            <h2 className="lv-centered-title">Hơn 5.000+ chủ quán tin tưởng LogiVN</h2>
            <div className="lv-testimonial-grid">
              {testimonials.map((item) => (
                <article className="lv-testimonial-card" key={item.name}>
                  <div className="lv-avatar">{item.name.slice(0, 2)}</div>
                  <div>
                    <h3>{item.name}</h3>
                    <span>{item.role}</span>
                  </div>
                  <p>{item.text}</p>
                  <div className="lv-stars">★★★★★</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lv-final" id="contact">
          <div className="lv-container lv-final-grid">
            <div>
              <h2>{landing.finalTitle}</h2>
              <p>{landing.finalSubtitle}</p>
            </div>
            <Link className="lv-btn lv-btn-orange" href="/dashboard/register?plan=pro">
              Đăng ký demo ngay
              <ArrowRight size={18} />
            </Link>
            <div className="lv-final-qr">
              <Image src={`${brand}/04-banner-payment-service.png`} alt="QR thanh toán LogiVN" fill sizes="180px" />
            </div>
          </div>
        </section>
      </main>

      <footer className="lv-footer">
        <div className="lv-container lv-footer-grid">
          <div className="lv-footer-brand">
            <Logo logoUrl={siteBrand.logoUrl} label={siteBrand.companyName} light />
            <p>{landing.footerTagline}</p>
            <div className="lv-socials">
              <span>f</span>
              <span>t</span>
              <span>in</span>
              <span>yt</span>
            </div>
          </div>
          <div>
            <h3>Sản phẩm</h3>
            <a href="#features">Tính năng</a>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/dashboard/register?plan=pro">Dùng thử</Link>
          </div>
          <div>
            <h3>Công ty</h3>
            <a href="#solution">Về chúng tôi</a>
            <a href="#workflow">Blog</a>
            <a href="#contact">Tuyển dụng</a>
          </div>
          <div>
            <h3>Hỗ trợ</h3>
            <a href="mailto:support@logivn.com">Trung tâm trợ giúp</a>
            <a href="#workflow">Hướng dẫn sử dụng</a>
            <a href="#contact">Chính sách bảo mật</a>
          </div>
          <div>
            <h3>Liên hệ</h3>
            <p>
              <Phone size={15} /> {siteBrand.hotline}
            </p>
            <p>
              <Mail size={15} /> {siteBrand.email}
            </p>
            <p>
              <MapPin size={15} /> {siteBrand.address}
            </p>
            <form className="lv-newsletter">
              <input aria-label="Email nhận tin" placeholder="Nhập email của bạn" />
              <button type="button" aria-label="Đăng ký nhận tin">
                <ArrowRight size={16} />
              </button>
            </form>
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
  --lv-green-2: #0F4D3A;
  --lv-green-3: #A9C5A1;
  --lv-orange: #F28C28;
  --lv-orange-2: #F28C28;
  --lv-cream: #FFF7EB;
  --lv-cream-2: #FFF7EB;
  --lv-paper: #FFF7EB;
  --lv-line: rgba(15, 77, 58, 0.14);
  --lv-text: #2B2B2B;
  --lv-muted: rgba(43, 43, 43, 0.68);
  min-height: 100vh;
  color: var(--lv-text);
  background:
    radial-gradient(circle at 8% 0%, rgba(242, 140, 40, 0.13), transparent 360px),
    linear-gradient(180deg, #FFF7EB 0%, #FFF7EB 36%, #FFF7EB 100%);
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
  letter-spacing: 0;
}

.logivn-brand-page h1,
.logivn-brand-page h2,
.logivn-brand-page h3,
.lv-nav-links,
.lv-login,
.lv-btn,
.lv-section-label {
  font-family: var(--font-sora), var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.lv-container {
  width: min(1210px, calc(100% - 40px));
  margin: 0 auto;
}

.lv-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(255, 247, 235, 0.9);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(169, 197, 161, 0.9);
}

.lv-nav {
  height: 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.lv-logo {
  display: inline-flex;
  align-items: center;
  width: 154px;
  height: 44px;
  overflow: hidden;
}

.lv-logo img {
  width: 154px;
  height: auto;
  object-fit: contain;
}

.lv-logo-light {
  background: rgba(255,255,255,0.92);
  border-radius: 8px;
  padding: 2px 7px;
}

.lv-nav-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 58px;
  color: #2B2B2B;
  font-size: 14px;
  font-weight: 700;
}

.lv-nav-links a {
  transition: color 180ms ease;
}

.lv-nav-links a:hover {
  color: var(--lv-orange);
}

.lv-nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lv-login {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  color: var(--lv-green);
  font-size: 14px;
  font-weight: 600;
}

.lv-btn {
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0 22px;
  font-weight: 700;
  font-size: 15px;
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, color 180ms ease;
}

.lv-btn:hover {
  transform: translateY(-2px);
}

.lv-btn:focus-visible,
.lv-nav-links a:focus-visible,
.lv-login:focus-visible,
.lv-newsletter input:focus-visible,
.lv-newsletter button:focus-visible {
  outline: 3px solid rgba(242, 140, 40, .34);
  outline-offset: 3px;
}

.lv-btn-sm {
  min-height: 42px;
  padding: 0 20px;
  font-size: 14px;
}

.lv-btn-orange {
  color: #FFF7EB !important;
  background: linear-gradient(180deg, var(--lv-orange-2), var(--lv-orange));
  box-shadow: 0 12px 24px rgba(242, 140, 40, 0.26);
}

.lv-btn-green {
  color: #FFF7EB !important;
  background: linear-gradient(180deg, var(--lv-green-2), var(--lv-green));
  box-shadow: 0 12px 24px rgba(15, 77, 58, 0.22);
}

.lv-btn-orange svg,
.lv-btn-green svg {
  color: inherit;
}

.lv-btn-outline {
  color: var(--lv-green);
  border-color: rgba(15, 77, 58, .42);
  background: rgba(255, 247, 235, .82);
}

.lv-play {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(15, 77, 58, .38);
  border-radius: 999px;
  font-size: 10px;
}

.lv-hero {
  position: relative;
  padding: 18px 0 0;
  border-bottom: 1px solid rgba(169, 197, 161, 0.82);
}

.lv-hero::before {
  content: "";
  position: absolute;
  left: -12vw;
  bottom: 0;
  width: 62vw;
  height: 180px;
  background: linear-gradient(10deg, var(--lv-green) 0 52%, transparent 53%);
  opacity: .08;
  pointer-events: none;
}

.lv-hero-grid {
  min-height: 552px;
  display: grid;
  grid-template-columns: 46% 54%;
  align-items: stretch;
  gap: 0;
}

.lv-hero-copy {
  position: relative;
  z-index: 2;
  padding: 38px 22px 62px 0;
}

.lv-hero-copy h1 {
  max-width: 620px;
  color: var(--lv-green);
  font-size: 56px;
  line-height: 1.04;
  font-weight: 700;
}

.lv-hero-copy h1 span {
  color: var(--lv-orange);
}

.lv-hero-copy p {
  max-width: 565px;
  margin-top: 22px;
  color: #2B2B2B;
  font-size: 17px;
  line-height: 1.76;
  font-weight: 600;
}

.lv-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 30px;
}

.lv-hero-media {
  position: relative;
  min-height: 552px;
  overflow: hidden;
  border-radius: 0 0 0 8px;
  box-shadow: inset 20px 0 58px rgba(255, 247, 235, .86);
}

.lv-hero-media::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, #FFF7EB 0%, rgba(255, 247, 235,.78) 12%, rgba(255, 247, 235,0) 30%),
    linear-gradient(180deg, rgba(255, 247, 235,0) 70%, #FFF7EB 100%);
}

.lv-hero-media img {
  object-fit: cover;
  object-position: 69% center;
}

.lv-quickbar {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-top: -48px;
  margin-bottom: 22px;
  padding: 12px;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  background: rgba(255, 247, 235, .92);
  box-shadow: 0 16px 32px rgba(43, 43, 43, .08);
}

.lv-quick-item {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 11px;
  border-right: 1px solid rgba(169, 197, 161, .82);
  color: var(--lv-green);
  font-size: 13px;
  font-weight: 600;
}

.lv-quick-item:last-child {
  border-right: 0;
}

.lv-quick-item svg {
  flex: 0 0 auto;
  color: var(--lv-green);
}

.lv-section {
  padding: 20px 0;
}

.lv-centered-title {
  text-align: center;
  color: var(--lv-green);
  font-size: 30px;
  line-height: 1.2;
  font-weight: 700;
}

.lv-centered-title span {
  color: var(--lv-orange);
}

.lv-value-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 18px;
}

.lv-value-card {
  min-height: 124px;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 14px;
  align-items: start;
  padding: 18px 16px;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  background: rgba(255, 247, 235, .92);
  box-shadow: 0 10px 24px rgba(43, 43, 43, .05);
}

.lv-value-card svg {
  color: var(--lv-green);
}

.lv-value-card h3 {
  color: var(--lv-green);
  font-size: 16px;
  line-height: 1.28;
  font-weight: 700;
}

.lv-value-card p {
  margin-top: 7px;
  color: var(--lv-muted);
  font-size: 13px;
  line-height: 1.52;
  font-weight: 600;
}

.lv-story {
  padding-top: 0;
}

.lv-story-list {
  display: grid;
  gap: 10px;
}

.lv-story-card {
  position: relative;
  display: block;
  aspect-ratio: 1916 / 821;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  background: #FFF7EB;
  box-shadow: 0 12px 28px rgba(43, 43, 43, .06);
}

.lv-story-card img {
  object-fit: contain;
  object-position: center;
}

.lv-workflow,
.lv-steps {
  padding: 12px 0;
}

.lv-workflow h2,
.lv-steps h2 {
  margin-bottom: 14px;
  text-align: center;
  color: var(--lv-green);
  font-size: 24px;
  font-weight: 700;
}

.lv-flow-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.lv-flow-card {
  padding: 15px;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  background: rgba(255, 247, 235, .92);
}

.lv-flow-card h3 {
  margin-bottom: 12px;
  text-align: center;
  color: var(--lv-green);
  font-size: 14px;
  font-weight: 700;
}

.lv-flow-line {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.lv-flow-step {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
  color: var(--lv-green);
  font-size: 12px;
  font-weight: 600;
}

.lv-flow-step span {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(15, 77, 58,.18);
  border-radius: 8px;
  background: #fff;
}

.lv-steps-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.lv-step-card {
  display: grid;
  grid-template-columns: 76px 38px 1fr;
  gap: 13px;
  align-items: center;
  min-height: 96px;
  padding: 13px;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  background: rgba(255, 247, 235, .94);
}

.lv-step-visual {
  display: grid;
  place-items: center;
  height: 66px;
  border-radius: 8px;
  color: var(--lv-green);
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(169, 197, 161,.8);
}

.lv-step-card > span {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  color: var(--lv-green);
  background: #A9C5A1;
  font-weight: 700;
}

.lv-step-card h3 {
  color: var(--lv-green);
  font-size: 15px;
  font-weight: 700;
}

.lv-step-card p {
  margin-top: 4px;
  color: var(--lv-muted);
  font-size: 12px;
  line-height: 1.42;
  font-weight: 400;
}

.lv-dashboard-grid {
  display: grid;
  grid-template-columns: 36% 64%;
  gap: 24px;
  align-items: center;
  padding: 26px 0;
}

.lv-section-label {
  display: inline-flex;
  margin-bottom: 11px;
  color: var(--lv-orange);
  font-size: 14px;
  font-weight: 700;
}

.lv-dashboard h2 {
  color: var(--lv-green);
  font-size: 31px;
  line-height: 1.14;
  font-weight: 700;
}

.lv-dashboard p {
  margin-top: 12px;
  color: var(--lv-muted);
  font-size: 15px;
  line-height: 1.7;
  font-weight: 400;
}

.lv-dashboard-features {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 22px;
}

.lv-dashboard-features span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--lv-green);
  font-size: 13px;
  font-weight: 600;
}

.lv-dashboard-image {
  position: relative;
  min-height: 300px;
  overflow: hidden;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  box-shadow: 0 20px 44px rgba(43, 43, 43, .12);
}

.lv-dashboard-image img {
  object-fit: cover;
  object-position: 58% center;
}

.lv-pricing {
  padding-top: 12px;
}

.lv-pricing-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 22px;
}

.lv-price-card,
.lv-trial-card {
  position: relative;
  min-height: 250px;
  padding: 24px 21px;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  background: rgba(255, 247, 235, .96);
  box-shadow: 0 13px 28px rgba(43, 43, 43, .07);
}

.lv-price-featured {
  border-color: var(--lv-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, .16);
}

.lv-popular {
  position: absolute;
  top: -10px;
  right: 18px;
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 0 14px;
  border-radius: 999px;
  color: #fff;
  background: var(--lv-orange);
  font-size: 12px;
  font-weight: 700;
}

.lv-price-card h3,
.lv-trial-card h3 {
  color: var(--lv-green);
  font-size: 18px;
  font-weight: 700;
}

.lv-price-card p,
.lv-trial-card p {
  margin-top: 4px;
  color: var(--lv-muted);
  font-size: 13px;
  font-weight: 400;
}

.lv-price-card strong {
  display: block;
  margin-top: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--lv-line);
  color: #2B2B2B;
  font-size: 28px;
  font-weight: 700;
}

.lv-price-card small {
  margin-left: 4px;
  color: var(--lv-muted);
  font-size: 13px;
  font-weight: 700;
}

.lv-price-card ul,
.lv-trial-card ul {
  display: grid;
  gap: 10px;
  margin: 17px 0 22px;
  padding: 0;
  list-style: none;
  color: #2B2B2B;
  font-size: 13px;
  font-weight: 500;
}

.lv-price-card li,
.lv-trial-card li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lv-price-card li svg {
  color: var(--lv-orange);
}

.lv-price-card .lv-btn {
  width: 100%;
  min-height: 38px;
  font-size: 13px;
}

.lv-trial-card {
  overflow: hidden;
}

.lv-trial-card::after {
  content: "";
  position: absolute;
  right: -28px;
  bottom: -34px;
  width: 170px;
  height: 122px;
  opacity: .16;
  background: linear-gradient(135deg, transparent 0 28%, var(--lv-green) 29% 31%, transparent 32% 100%);
}

.lv-trial-card li::before {
  content: "✓";
  color: var(--lv-green);
  font-weight: 700;
}

.lv-testimonials {
  padding-top: 4px;
}

.lv-testimonial-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: 18px;
}

.lv-testimonial-card {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--lv-line);
  border-radius: 8px;
  background: rgba(255, 247, 235, .95);
}

.lv-avatar {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  color: #fff;
  background: var(--lv-green);
  font-weight: 700;
}

.lv-testimonial-card h3 {
  color: var(--lv-green);
  font-size: 16px;
  font-weight: 700;
}

.lv-testimonial-card span {
  color: var(--lv-muted);
  font-size: 13px;
  font-weight: 400;
}

.lv-testimonial-card p {
  grid-column: 1 / -1;
  color: #2B2B2B;
  font-size: 14px;
  line-height: 1.68;
  font-weight: 400;
}

.lv-stars {
  grid-column: 1 / -1;
  color: var(--lv-orange);
  font-size: 18px;
  letter-spacing: 0;
}

.lv-final {
  margin-top: 22px;
  padding: 32px 0;
  color: #fff;
  background:
    linear-gradient(90deg, rgba(15, 77, 58,.96), rgba(15, 77, 58,.95)),
    radial-gradient(circle at 20% 20%, rgba(242, 140, 40,.28), transparent 260px);
}

.lv-final-grid {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 170px;
  gap: 32px;
  align-items: center;
}

.lv-final h2 {
  max-width: 650px;
  font-size: 34px;
  line-height: 1.16;
  font-weight: 700;
}

.lv-final p {
  margin-top: 8px;
  color: rgba(255,255,255,.76);
  font-size: 16px;
  font-weight: 400;
}

.lv-final-qr {
  position: relative;
  height: 126px;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
}

.lv-final-qr img {
  object-fit: cover;
  object-position: 88% 62%;
}

.lv-footer {
  padding: 34px 0 20px;
  color: #FFF7EB;
  background: #0F4D3A;
}

.lv-footer-grid {
  display: grid;
  grid-template-columns: 1.7fr 1fr 1fr 1fr 1.6fr;
  gap: 28px;
}

.lv-footer h3 {
  margin-bottom: 12px;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

.lv-footer p,
.lv-footer a {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
  color: rgba(255,255,255,.72);
  font-size: 13px;
  line-height: 1.55;
  font-weight: 400;
}

.lv-footer a:hover {
  color: #fff;
}

.lv-footer-brand p {
  margin-top: 12px;
}

.lv-socials {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.lv-socials span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #0F4D3A;
  background: rgba(255,255,255,.9);
  font-size: 11px;
  font-weight: 700;
}

.lv-newsletter {
  display: flex;
  min-height: 40px;
  margin-top: 12px;
  border-radius: 999px;
  background: #fff;
  overflow: hidden;
}

.lv-newsletter input {
  min-width: 0;
  flex: 1;
  border: 0;
  padding: 0 14px;
  color: var(--lv-green);
  font: inherit;
  font-size: 13px;
}

.lv-newsletter button {
  display: grid;
  place-items: center;
  width: 44px;
  border: 0;
  color: #fff;
  background: var(--lv-orange);
}

.lv-copyright {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,.12);
  color: rgba(255,255,255,.48);
  font-size: 12px;
}

@media (max-width: 1100px) {
  .lv-nav-links {
    gap: 24px;
  }

  .lv-hero-grid {
    grid-template-columns: 1fr;
  }

  .lv-hero-copy {
    padding-right: 0;
  }

  .lv-hero-media {
    min-height: 420px;
    border-radius: 8px;
  }

  .lv-quickbar,
  .lv-value-grid,
  .lv-steps-grid,
  .lv-pricing-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .lv-story-content {
    width: min(520px, 58%);
  }

  .lv-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .lv-dashboard-image {
    min-height: 360px;
  }

  .lv-footer-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 780px) {
  .lv-container {
    width: min(100% - 28px, 560px);
  }

  .lv-nav {
    height: 62px;
  }

  .lv-nav-links,
  .lv-login {
    display: none;
  }

  .lv-logo,
  .lv-logo img {
    width: 132px;
  }

  .lv-hero-copy h1 {
    font-size: 38px;
  }

  .lv-hero-copy p {
    font-size: 15px;
  }

  .lv-hero-media {
    min-height: 330px;
  }

  .lv-quickbar {
    grid-template-columns: 1fr;
    margin-top: 14px;
  }

  .lv-quick-item {
    border-right: 0;
    border-bottom: 1px solid rgba(169, 197, 161, .82);
  }

  .lv-quick-item:last-child {
    border-bottom: 0;
  }

  .lv-centered-title {
    font-size: 24px;
  }

  .lv-value-grid,
  .lv-flow-grid,
  .lv-steps-grid,
  .lv-pricing-grid,
  .lv-testimonial-grid {
    grid-template-columns: 1fr;
  }

  .lv-flow-line {
    grid-template-columns: 1fr 1fr;
  }

  .lv-step-card {
    grid-template-columns: 68px 36px 1fr;
  }

  .lv-dashboard h2 {
    font-size: 25px;
  }

  .lv-dashboard-features,
  .lv-final-grid {
    grid-template-columns: 1fr;
  }

  .lv-dashboard-image {
    min-height: 270px;
  }

  .lv-final h2 {
    font-size: 25px;
  }

  .lv-final-qr {
    display: none;
  }

  .lv-footer-grid {
    grid-template-columns: 1fr;
  }
}
`;
