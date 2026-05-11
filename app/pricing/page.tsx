import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { PricingPageJsonLd, pricingFaqItems } from "@/components/seo/pricing-page-json-ld";
import { formatVnd } from "@/lib/money";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getPlatformSiteConfig } from "@/services/platform-public-service";
import { getPublicActivePlans } from "@/services/subscription-service";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "Bảng giá LogiVN - Pro, Premium cho quán cafe và nhà hàng",
  description: "So sánh gói LogiVN Pro, Premium và gói tư vấn cho gọi món QR, đặt món online, đặt bàn, thanh toán VietQR và báo cáo.",
  path: "/pricing"
});

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
    [/AI/gi, "trợ lý thông minh"],
    [/OCR/gi, "nhập từ ảnh"],
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
            <h1>Chọn gói tăng trưởng phù hợp với nhịp phục vụ của quán.</h1>
            <p>
              Mỗi quán được dùng thử {trialDays} ngày. Khi sẵn sàng gia hạn hoặc nâng cấp, chủ quán tạo VietQR, LogiVN xác
              minh thanh toán và mở đúng nhóm tính năng đã chọn để hành trình mua hàng vẫn giữ được cảm giác tin cậy.
            </p>

            <div className="lp-actions">
              <Link className="lp-btn lp-btn-primary" href="/dashboard/register?plan=pro">
                Tạo quán dùng thử
                <ArrowRight size={16} />
              </Link>
              <Link className="lp-btn lp-btn-secondary" href="/dashboard/login">
                Đã có tài khoản
              </Link>
            </div>

            <div className="lp-proof-grid">
              <article className="lp-proof-card">
                <strong>{trialDays} ngày</strong>
                <span>dùng thử để kiểm tra độ hợp với nhịp vận hành</span>
              </article>
              <article className="lp-proof-card">
                <strong>VietQR</strong>
                <span>gia hạn và nâng cấp minh bạch, đúng thói quen thanh toán</span>
              </article>
              <article className="lp-proof-card">
                <strong>Tính năng đúng gói</strong>
                <span>mỗi gói mở đúng tính năng quán thực sự đã chọn</span>
              </article>
            </div>
          </div>

          <div className="lp-stage">
            <div className="lp-stage-frame">
              <Image
                src="/brand/logivn/04-banner-payment-service.png"
                alt="Minh họa thanh toán và nâng cấp gói LogiVN"
                fill
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
              const featured = plan.code === "pro";
              const href = getPlanHref(plan.code, siteConfig.brand.email);
              const isContact = plan.monthly_price <= 0;

              return (
                <article className={`lp-plan-card ${featured ? "is-featured" : ""}`} key={plan.id}>
                  {featured ? <span className="lp-badge">Phổ biến</span> : null}

                  <div className="lp-plan-head">
                    <p>{planCodeLabel(plan.code)}</p>
                    <h3>{plan.name}</h3>
                    <span>{plan.description}</span>
                  </div>

                  <strong className="lp-price">
                    {isContact ? "Liên hệ" : formatVnd(plan.monthly_price)}
                    {isContact ? null : <small>/ tháng</small>}
                  </strong>
                  <p className="lp-trial">Dùng thử {plan.trial_days} ngày</p>

                  <ul>
                    {plan.features.slice(0, 8).map((feature) => (
                      <li key={feature}>
                        <Check size={16} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {href.startsWith("mailto:") ? (
                    <a className={`lp-btn ${featured ? "lp-btn-primary" : "lp-btn-tertiary"}`} href={href}>
                      {isContact ? "Liên hệ tư vấn" : "Chọn gói này"}
                    </a>
                  ) : (
                    <Link className={`lp-btn ${featured ? "lp-btn-primary" : "lp-btn-tertiary"}`} href={href}>
                      {isContact ? "Liên hệ tư vấn" : "Dùng thử gói này"}
                    </Link>
                  )}
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
            <Link className="lp-btn lp-btn-primary" href="/dashboard/register?plan=premium">
              Kích hoạt dùng thử Premium
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      ) : null}
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
  gap: 30px;
  color: rgba(32, 51, 41, 0.84);
  font-size: 14px;
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
  letter-spacing: 0.16em;
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
  letter-spacing: -0.04em;
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
.lp-plan-head p,
.lp-badge {
  color: var(--lp-orange);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.lp-stage-card strong {
  color: var(--lp-green-strong);
  font-size: 22px;
  line-height: 1.02;
  letter-spacing: -0.03em;
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
  letter-spacing: -0.04em;
}

.lp-plan-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.lp-plan-card {
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  padding: 24px;
  border: 1px solid var(--lp-line);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.64);
  box-shadow: var(--lp-shadow-soft);
}

.lp-plan-card.is-featured {
  border-color: rgba(242, 140, 40, 0.34);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(248, 238, 221, 0.98));
}

.lp-badge {
  position: absolute;
  right: 22px;
  top: 22px;
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  color: #FFF8EF;
  background: var(--lp-green);
}

.lp-plan-head h3 {
  margin-top: 10px;
  color: var(--lp-green-strong);
  font-size: 34px;
  line-height: 0.98;
  letter-spacing: -0.04em;
}

.lp-plan-head span,
.lp-trial {
  display: block;
  margin-top: 10px;
  color: var(--lp-muted);
  font-size: 14px;
  line-height: 1.7;
  font-weight: 600;
}

.lp-price {
  display: block;
  margin-top: 22px;
  color: var(--lp-green-strong);
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
}

.lp-plan-card ul {
  display: grid;
  gap: 10px;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
}

.lp-plan-card li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--lp-green);
  font-size: 14px;
  line-height: 1.6;
  font-weight: 700;
}

.lp-plan-card .lp-btn {
  width: 100%;
  margin-top: auto;
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
  letter-spacing: -0.03em;
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
  letter-spacing: -0.02em;
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

.lp-nav-links a:focus-visible,
.lp-link:focus-visible,
.lp-btn:focus-visible {
  outline: 2px solid rgba(242, 140, 40, 0.54);
  outline-offset: 4px;
}

@media (max-width: 1100px) {
  .lp-hero-grid,
  .lp-proof-grid,
  .lp-plan-grid,
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
}

@media (prefers-reduced-motion: reduce) {
  .lp-link,
  .lp-nav-links a,
  .lp-btn {
    transition: none;
  }
}
`;
