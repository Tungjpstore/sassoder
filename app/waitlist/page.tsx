import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Clock3, MapPin, QrCode, Sparkles, Store, UsersRound, WalletCards } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { MarketingFunnelTracker } from "@/components/marketing/funnel-tracker";
import { WaitlistLeadForm } from "@/components/marketing/waitlist-lead-form";
import { SEO_COMPANY_NAME, absoluteAssetUrl, absoluteSeoUrl } from "@/lib/seo/config";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "Waitlist LogiVN - Pilot QR ordering và AI cho quán Việt",
  description:
    "Tham gia waitlist LogiVN để pilot QR ordering, VietQR, AI assistant, quản lý bàn, nhân viên, tồn kho và báo cáo cho quán cafe, trà sữa, nhà hàng.",
  path: "/waitlist",
  image: "/brand/logivn/01-banner-overview-hero-v2.png"
});

const rolloutSignals = [
  { value: "30 ngày", label: "pilot theo một ca bán thật" },
  { value: "QR + VietQR", label: "entry point dễ thử nhất" },
  { value: "AI-ready", label: "chuẩn bị dữ liệu vận hành" },
  { value: "Web-first", label: "không cần mua POS riêng để bắt đầu" }
];

const waitlistTracks = [
  {
    icon: QrCode,
    title: "QR ordering starter",
    text: "Cho quán cần thay menu giấy, nhận order tại bàn và đối soát VietQR rõ hơn.",
    plan: "Pro 99K"
  },
  {
    icon: Sparkles,
    title: "AI operations pilot",
    text: "Cho quán đã có dữ liệu order và muốn AI gợi ý doanh thu, combo, giờ cao điểm, tồn kho.",
    plan: "Premium 199K"
  },
  {
    icon: UsersRound,
    title: "Staff + table workflow",
    text: "Cho nhà hàng hoặc quán đông khách cần quản lý bàn, nhân viên, bếp và trạng thái phục vụ.",
    plan: "Premium"
  }
];

const intakeSteps = [
  {
    title: "Chọn mô hình quán",
    text: "Cafe, trà sữa, quán ăn nhỏ, nhà hàng phục vụ tại bàn hoặc chuỗi F&B nhỏ."
  },
  {
    title: "Nói rõ điểm nghẽn",
    text: "Order chậm, nhân viên hỏi lại, khó đối soát, thiếu báo cáo, tồn kho hoặc cần AI."
  },
  {
    title: "Nhận hướng đi phù hợp",
    text: "Bắt đầu ngay bằng signup hoặc pilot có hướng dẫn theo gói Pro/Premium."
  }
];

const trustBullets = [
  "Không bắt buộc mua máy POS riêng khi bắt đầu.",
  "Khách gọi món bằng trình duyệt, không cần tải app.",
  "Có đường đi từ waitlist sang demo, pricing và signup rõ ràng.",
  "Phù hợp thị trường Việt Nam trước khi mở rộng SEA."
];

const waitlistFaqItems = [
  {
    question: "Waitlist LogiVN khác gì đăng ký dùng thử ngay?",
    answer:
      "Đăng ký dùng thử phù hợp khi quán muốn tự tạo tài khoản ngay. Waitlist phù hợp khi chủ quán muốn LogiVN hiểu mô hình quán, mục tiêu pilot và gợi ý lộ trình triển khai trước."
  },
  {
    question: "Quán nhỏ có nên vào waitlist không?",
    answer:
      "Có. Quán nhỏ thường nên bắt đầu bằng QR ordering, menu số, VietQR và dashboard cơ bản. Waitlist giúp chọn phạm vi thử nhỏ nhất để tránh triển khai quá nặng."
  },
  {
    question: "LogiVN có hỗ trợ AI trong giai đoạn pilot không?",
    answer:
      "Có. Với gói Premium, LogiVN ưu tiên AI assistant cho các việc thực tế như đọc doanh thu, gợi ý combo, dự đoán giờ cao điểm và nhắc tồn kho."
  },
  {
    question: "Nếu muốn dùng ngay thì có cần waitlist không?",
    answer:
      "Không bắt buộc. Chủ quán có thể tạo tài khoản dùng thử trực tiếp từ trang pricing hoặc dashboard register. Waitlist chỉ là luồng pre-step cho quán cần tư vấn rollout."
  }
];

function softwareSchemaId() {
  return `${absoluteSeoUrl("/").replace(/\/+$/, "")}/#software`;
}

function buildWaitlistWebPageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${absoluteSeoUrl("/waitlist")}#webpage`,
    name: "Waitlist LogiVN",
    description:
      "Waitlist pilot QR ordering, VietQR, AI assistant, quản lý bàn, nhân viên, tồn kho và báo cáo cho quán Việt.",
    url: absoluteSeoUrl("/waitlist"),
    inLanguage: "vi-VN",
    isPartOf: {
      "@type": "WebSite",
      name: SEO_COMPANY_NAME,
      url: absoluteSeoUrl("/")
    },
    about: {
      "@type": "SoftwareApplication",
      "@id": softwareSchemaId()
    },
    image: absoluteAssetUrl("/brand/logivn/01-banner-overview-hero-v2.png"),
    potentialAction: [
      {
        "@type": "RegisterAction",
        name: "Tham gia waitlist LogiVN",
        target: absoluteSeoUrl("/waitlist")
      },
      {
        "@type": "RegisterAction",
        name: "Tạo tài khoản dùng thử LogiVN",
        target: absoluteSeoUrl("/dashboard/register?plan=pro&source=waitlist")
      }
    ]
  };
}

export default function WaitlistPage() {
  return (
    <main className="logivn-waitlist-page">
      <MarketingFunnelTracker page="/waitlist" source="waitlist" />
      <JsonLdScript
        id="logivn-waitlist-breadcrumb-jsonld"
        scriptKey="logivn-waitlist-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Waitlist", path: "/waitlist" }
        ])}
      />
      <JsonLdScript id="logivn-waitlist-webpage-jsonld" scriptKey="logivn-waitlist-webpage" data={buildWaitlistWebPageSchema()} />
      <JsonLdScript id="logivn-waitlist-faq-jsonld" scriptKey="logivn-waitlist-faq" data={buildFaqSchema(waitlistFaqItems)} />
      <style>{styles}</style>

      <header className="waitlist-header">
        <div className="waitlist-container waitlist-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav className="waitlist-nav-links" aria-label="Điều hướng waitlist">
            <Link href="/">Trang chủ</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/waitlist" className="is-active">
              Waitlist
            </Link>
          </nav>
          <Link className="waitlist-nav-cta" href="/dashboard/register?plan=pro&source=waitlist_nav">
            Dùng thử ngay
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="waitlist-hero">
        <div className="waitlist-container waitlist-hero-grid">
          <div className="waitlist-hero-copy">
            <span className="waitlist-kicker">Pilot cohort</span>
            <h1>Vào waitlist để triển khai LogiVN đúng nhịp quán của bạn.</h1>
            <p>
              Nếu quán chưa muốn signup ngay, waitlist là bước nhẹ để LogiVN hiểu mô hình vận hành, điểm nghẽn và gợi ý
              phạm vi pilot: QR ordering, VietQR, AI, bàn, nhân viên, tồn kho hoặc báo cáo.
            </p>
            <div className="waitlist-actions">
              <a className="waitlist-button waitlist-button-primary" href="#waitlist-form">
                Điền thông tin pilot
                <ArrowRight size={16} />
              </a>
              <Link className="waitlist-button waitlist-button-soft" href="/demo">
                Xem demo trước
              </Link>
            </div>
          </div>

          <figure className="waitlist-visual">
            <Image
              src="/brand/logivn/01-banner-overview-hero-v2.png"
              alt="Không gian LogiVN cho quán cafe, trà sữa và nhà hàng đang chuẩn bị pilot QR ordering"
              width={1600}
              height={900}
              priority
              sizes="(min-width: 1024px) 46vw, 100vw"
            />
            <figcaption>
              <Clock3 size={15} />
              Pilot nhỏ, dữ liệu thật, quyết định nhanh hơn.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="waitlist-signals" aria-label="Tín hiệu waitlist LogiVN">
        <div className="waitlist-container waitlist-signal-grid">
          {rolloutSignals.map((signal) => (
            <article key={signal.value}>
              <strong>{signal.value}</strong>
              <span>{signal.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="waitlist-section" aria-labelledby="waitlist-form-title">
        <div className="waitlist-container waitlist-form-layout">
          <div className="waitlist-section-head">
            <span className="waitlist-kicker">Signup pre-step</span>
            <h2 id="waitlist-form-title">Cho LogiVN biết quán đang cần giải quyết việc gì trước.</h2>
            <p>
              Form này giữ friction thấp: đủ dữ liệu để phân luồng Pro/Premium, nhưng vẫn cho chủ quán đi thẳng sang tạo
              tài khoản dùng thử khi đã sẵn sàng.
            </p>
            <ul className="waitlist-trust-list">
              {trustBullets.map((item) => (
                <li key={item}>
                  <Check size={15} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <WaitlistLeadForm />
        </div>
      </section>

      <section className="waitlist-section waitlist-section-muted">
        <div className="waitlist-container">
          <div className="waitlist-section-head waitlist-section-head-centered">
            <span className="waitlist-kicker">Choose your track</span>
            <h2>Ba nhánh waitlist theo mức độ sẵn sàng của quán.</h2>
            <p>
              Chủ quán không cần đọc hết mọi tính năng. Chỉ cần chọn nhánh gần nhất với điểm nghẽn hiện tại, website sẽ
              dẫn tiếp sang demo, pricing hoặc signup.
            </p>
          </div>

          <div className="waitlist-track-grid">
            {waitlistTracks.map((track) => {
              const Icon = track.icon;
              return (
                <article className="waitlist-track-card" key={track.title}>
                  <div className="waitlist-track-topline">
                    <Icon size={21} />
                    <span>{track.plan}</span>
                  </div>
                  <h3>{track.title}</h3>
                  <p>{track.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="waitlist-section">
        <div className="waitlist-container waitlist-rollout-layout">
          <div className="waitlist-section-head">
            <span className="waitlist-kicker">Lộ trình pilot</span>
            <h2>Waitlist giúp chọn phạm vi thử đúng trước khi tạo tài khoản.</h2>
            <p>
              Hành trình được chia thành ba bước ngắn để chủ quán nói rõ mô hình quán, điểm nghẽn và hướng triển khai,
              thay vì phải điền một form dài khi chưa chắc nên bắt đầu từ đâu.
            </p>
          </div>

          <div className="waitlist-step-list">
            {intakeSteps.map((step, index) => (
              <article className="waitlist-step-row" key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="waitlist-section waitlist-product-section">
        <div className="waitlist-container waitlist-product-grid">
          <div className="waitlist-product-card">
            <Store size={22} />
            <h3>Cho chủ quán đang mở rộng từ giấy bút sang dashboard.</h3>
            <p>LogiVN giúp bắt đầu nhỏ bằng menu QR và order tại bàn trước khi mở thêm AI, nhân sự và tồn kho.</p>
          </div>
          <div className="waitlist-product-card">
            <WalletCards size={22} />
            <h3>Cho quán muốn thanh toán quen thuộc hơn với khách Việt.</h3>
            <p>VietQR nằm trong flow gọi món để khách chuyển khoản nhanh, còn quán giữ trạng thái thanh toán rõ hơn.</p>
          </div>
          <div className="waitlist-product-card">
            <BarChart3 size={22} />
            <h3>Cho đội ngũ cần quyết định bằng dữ liệu thay vì cảm giác.</h3>
            <p>Báo cáo và AI insight giúp chủ quán nhìn ca cao điểm, món bán chạy và rủi ro tồn kho trong ngày.</p>
          </div>
        </div>
      </section>

      <section className="waitlist-section waitlist-faq" aria-labelledby="waitlist-faq-title">
        <div className="waitlist-container waitlist-faq-grid">
          <div className="waitlist-section-head">
            <span className="waitlist-kicker">FAQ</span>
            <h2 id="waitlist-faq-title">Những câu hỏi cần rõ trước khi vào waitlist.</h2>
          </div>
          <div className="waitlist-faq-list">
            {waitlistFaqItems.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="waitlist-final">
        <div className="waitlist-container waitlist-final-shell">
          <div>
            <span className="waitlist-kicker">Start small, learn fast</span>
            <h2>Không cần rollout lớn. Hãy bắt đầu bằng một flow QR order thật.</h2>
            <p>Điền waitlist nếu cần định hướng, hoặc tạo tài khoản ngay nếu quán đã sẵn sàng chạy thử trong ca bán tới.</p>
          </div>
          <div className="waitlist-final-actions">
            <Link className="waitlist-button waitlist-button-light" href="/demo">
              Xem demo
            </Link>
            <Link className="waitlist-button waitlist-button-orange" href="/dashboard/register?plan=pro&source=waitlist_final">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="waitlist-footer">
        <div className="waitlist-container">
          <MapPin size={16} />
          <span>LogiVN waitlist cho SaaS F&amp;B Việt Nam: QR ordering, VietQR, AI, staff, inventory và reports.</span>
        </div>
      </footer>

      <div className="waitlist-mobile-cta" aria-label="Hành động nhanh">
        <a href="#waitlist-form">Vào waitlist</a>
        <Link href="/demo">Xem demo</Link>
      </div>
    </main>
  );
}

const styles = `
.logivn-waitlist-page {
  --waitlist-green: #0F4D3A;
  --waitlist-deep: #082D23;
  --waitlist-orange: #F28C28;
  --waitlist-orange-strong: #D86E13;
  --waitlist-ivory: #FFF7EB;
  --waitlist-paper: #FFFCF6;
  --waitlist-line: rgba(15, 77, 58, 0.16);
  --waitlist-text: #203329;
  --waitlist-muted: rgba(32, 51, 41, 0.72);
  min-height: 100vh;
  color: var(--waitlist-text);
  background: linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 36%, #F7FBF5 78%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-waitlist-page * { box-sizing: border-box; }
.logivn-waitlist-page a { color: inherit; text-decoration: none; }
.logivn-waitlist-page h1,
.logivn-waitlist-page h2,
.logivn-waitlist-page h3,
.logivn-waitlist-page p { margin: 0; }

.waitlist-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.waitlist-header {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.waitlist-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.waitlist-nav-links {
  display: flex;
  align-items: center;
  gap: 18px;
  color: var(--waitlist-muted);
  font-size: 14px;
  font-weight: 850;
}

.waitlist-nav-links a,
.waitlist-nav-cta,
.waitlist-button,
.waitlist-form button,
.waitlist-mobile-cta a {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.waitlist-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding-inline: 6px;
}

.waitlist-nav-links .is-active,
.waitlist-nav-links a:hover {
  color: var(--waitlist-green);
}

.waitlist-nav-cta,
.waitlist-button,
.waitlist-form button,
.waitlist-mobile-cta a {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
}

.waitlist-nav-cta {
  min-height: 44px;
  padding: 0 18px;
  color: var(--waitlist-ivory);
  background: var(--waitlist-green);
}

.waitlist-hero {
  padding: 72px 0 34px;
}

.waitlist-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.96fr) minmax(360px, 0.86fr);
  gap: 36px;
  align-items: center;
}

.waitlist-kicker {
  color: var(--waitlist-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.waitlist-hero h1,
.waitlist-section-head h2,
.waitlist-final h2 {
  color: var(--waitlist-deep);
  letter-spacing: 0;
}

.waitlist-hero h1 {
  max-width: 840px;
  margin-top: 14px;
  font-size: clamp(3rem, 6.3vw, 5.15rem);
  line-height: 0.95;
}

.waitlist-hero p,
.waitlist-section-head p,
.waitlist-track-card p,
.waitlist-step-row p,
.waitlist-product-card p,
.waitlist-faq-list p,
.waitlist-final p,
.waitlist-footer {
  color: var(--waitlist-muted);
  line-height: 1.72;
  font-weight: 650;
}

.waitlist-hero p {
  max-width: 740px;
  margin-top: 20px;
  font-size: 17px;
}

.waitlist-actions,
.waitlist-final-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.waitlist-button {
  padding: 0 20px;
}

.waitlist-button:hover,
.waitlist-nav-cta:hover,
.waitlist-form button:hover,
.waitlist-mobile-cta a:hover {
  transform: translateY(-1px);
}

.waitlist-button-primary,
.waitlist-button-orange,
.waitlist-form button {
  color: var(--waitlist-ivory);
  background: var(--waitlist-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.18);
}

.waitlist-button-soft,
.waitlist-button-light {
  border: 1px solid var(--waitlist-line);
  color: var(--waitlist-green);
  background: rgba(255, 255, 255, 0.76);
}

.waitlist-visual {
  margin: 0;
}

.waitlist-visual img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--waitlist-line);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.15);
}

.waitlist-visual figcaption {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  gap: 9px;
  margin-top: 12px;
  padding: 11px 14px;
  border: 1px solid var(--waitlist-line);
  border-radius: 8px;
  color: var(--waitlist-green);
  background: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.45;
}

.waitlist-signals {
  padding: 14px 0 30px;
}

.waitlist-signal-grid,
.waitlist-track-grid,
.waitlist-product-grid {
  display: grid;
  gap: 14px;
}

.waitlist-signal-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.waitlist-signal-grid article,
.waitlist-form,
.waitlist-track-card,
.waitlist-step-row,
.waitlist-product-card,
.waitlist-faq-list details {
  border: 1px solid var(--waitlist-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.waitlist-signal-grid article {
  padding: 18px;
}

.waitlist-signal-grid strong {
  display: block;
  color: var(--waitlist-deep);
  font-size: 24px;
}

.waitlist-signal-grid span {
  display: block;
  margin-top: 6px;
  color: var(--waitlist-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.5;
}

.waitlist-section {
  padding: 58px 0;
}

.waitlist-section-muted,
.waitlist-faq {
  background: rgba(15, 77, 58, 0.045);
}

.waitlist-section-head {
  max-width: 780px;
}

.waitlist-section-head-centered {
  margin: 0 auto;
  text-align: center;
}

.waitlist-section-head h2,
.waitlist-final h2 {
  margin-top: 12px;
  font-size: clamp(2rem, 4.4vw, 3rem);
  line-height: 1.02;
}

.waitlist-section-head p,
.waitlist-final p {
  margin-top: 14px;
  font-size: 16px;
}

.waitlist-form-layout,
.waitlist-rollout-layout,
.waitlist-faq-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(360px, 1fr);
  gap: 34px;
  align-items: start;
}

.waitlist-trust-list {
  display: grid;
  gap: 10px;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
}

.waitlist-trust-list li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--waitlist-green);
  font-size: 14px;
  font-weight: 800;
  line-height: 1.55;
}

.waitlist-form {
  display: grid;
  gap: 14px;
  padding: 22px;
}

.waitlist-form label,
.waitlist-form fieldset {
  display: grid;
  gap: 8px;
  color: var(--waitlist-deep);
  font-size: 13px;
  font-weight: 900;
}

.waitlist-form input,
.waitlist-form select {
  width: 100%;
  min-height: 48px;
  border: 1px solid rgba(15, 77, 58, 0.18);
  border-radius: 8px;
  padding: 0 13px;
  color: var(--waitlist-deep);
  background: rgba(255, 252, 246, 0.9);
  font: inherit;
  font-weight: 750;
}

.waitlist-form input::placeholder {
  color: rgba(32, 51, 41, 0.42);
}

.waitlist-form fieldset {
  margin: 0;
  padding: 14px;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  background: rgba(15, 77, 58, 0.04);
}

.waitlist-form fieldset label {
  grid-template-columns: 44px 1fr;
  align-items: center;
  min-height: 48px;
  color: var(--waitlist-muted);
  font-size: 14px;
  line-height: 1.45;
}

.waitlist-form input[type="radio"] {
  appearance: none;
  width: 44px;
  min-height: 44px;
  margin: 0;
  border-radius: 999px;
  accent-color: var(--waitlist-orange);
  background:
    radial-gradient(circle at center, transparent 0 6px, transparent 7px),
    rgba(255, 252, 246, 0.92);
  cursor: pointer;
}

.waitlist-form input[type="radio"]:checked {
  border-color: rgba(242, 140, 40, 0.64);
  background:
    radial-gradient(circle at center, var(--waitlist-orange) 0 7px, transparent 8px),
    rgba(255, 247, 235, 0.96);
}

.waitlist-form fieldset label span {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
}

.waitlist-form button {
  width: 100%;
  margin-top: 4px;
}

.waitlist-form button:disabled {
  cursor: not-allowed;
  opacity: 0.68;
  transform: none;
}

.waitlist-form p,
.waitlist-form-message {
  color: var(--waitlist-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
  text-align: center;
}

.waitlist-form-message {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
}

.waitlist-form-message.is-error {
  border: 1px solid rgba(216, 110, 19, 0.28);
  color: #9a4a17;
  background: rgba(255, 241, 232, 0.9);
}

.waitlist-form-success {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid rgba(15, 77, 58, 0.18);
  border-radius: 8px;
  color: var(--waitlist-green);
  background: rgba(231, 242, 234, 0.84);
}

.waitlist-form-success strong {
  color: var(--waitlist-deep);
  font-size: 15px;
  font-weight: 950;
}

.waitlist-form-success span {
  color: var(--waitlist-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.waitlist-form-success a {
  display: inline-flex;
  width: fit-content;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 8px;
  color: var(--waitlist-ivory);
  background: var(--waitlist-green);
  font-size: 13px;
  font-weight: 950;
}

.waitlist-form p a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--waitlist-orange-strong);
  font-weight: 950;
}

.waitlist-track-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
}

.waitlist-track-card,
.waitlist-product-card {
  min-height: 224px;
  padding: 22px;
}

.waitlist-track-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: var(--waitlist-orange);
}

.waitlist-track-topline span {
  color: var(--waitlist-green);
  font-size: 12px;
  font-weight: 950;
}

.waitlist-track-card h3,
.waitlist-step-row strong,
.waitlist-product-card h3,
.waitlist-faq-list summary {
  color: var(--waitlist-deep);
  letter-spacing: 0;
}

.waitlist-track-card h3,
.waitlist-product-card h3 {
  margin-top: 20px;
  font-size: 23px;
  line-height: 1.08;
}

.waitlist-track-card p,
.waitlist-product-card p {
  margin-top: 11px;
  font-size: 14px;
}

.waitlist-step-list {
  display: grid;
  gap: 12px;
}

.waitlist-step-row {
  display: grid;
  grid-template-columns: 54px minmax(140px, 0.5fr) minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  min-height: 96px;
  padding: 16px;
}

.waitlist-step-row span {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 8px;
  color: var(--waitlist-ivory);
  background: var(--waitlist-green);
  font-size: 13px;
  font-weight: 950;
}

.waitlist-step-row strong {
  font-size: 18px;
  line-height: 1.2;
}

.waitlist-step-row p {
  font-size: 14px;
}

.waitlist-product-section {
  padding-top: 0;
}

.waitlist-product-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.waitlist-product-card svg {
  color: var(--waitlist-orange);
}

.waitlist-faq-list {
  display: grid;
  gap: 12px;
}

.waitlist-faq-list details {
  padding: 18px;
}

.waitlist-faq-list summary {
  cursor: pointer;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.35;
}

.waitlist-faq-list p {
  margin-top: 12px;
  font-size: 14px;
}

.waitlist-final {
  padding: 64px 0 54px;
}

.waitlist-final-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 30px;
  border-radius: 8px;
  color: var(--waitlist-ivory);
  background: linear-gradient(135deg, #082D23 0%, #0F4D3A 64%, #24624D 100%);
  box-shadow: 0 24px 64px rgba(9, 46, 35, 0.18);
}

.waitlist-final h2 {
  max-width: 740px;
  color: var(--waitlist-ivory);
}

.waitlist-final p {
  max-width: 720px;
  color: rgba(255, 247, 235, 0.78);
}

.waitlist-final .waitlist-kicker {
  color: #F8B86A;
}

.waitlist-footer {
  padding: 20px 0 90px;
  color: var(--waitlist-muted);
  font-size: 13px;
  font-weight: 800;
}

.waitlist-footer .waitlist-container {
  display: flex;
  align-items: center;
  gap: 9px;
}

.waitlist-mobile-cta {
  display: none;
}

.waitlist-nav-links a:focus-visible,
.waitlist-nav-cta:focus-visible,
.waitlist-button:focus-visible,
.waitlist-form input:focus-visible,
.waitlist-form select:focus-visible,
.waitlist-form button:focus-visible,
.waitlist-faq-list summary:focus-visible,
.waitlist-mobile-cta a:focus-visible {
  outline: 2px solid rgba(242, 140, 40, 0.55);
  outline-offset: 4px;
}

@media (max-width: 1080px) {
  .waitlist-hero-grid,
  .waitlist-form-layout,
  .waitlist-rollout-layout,
  .waitlist-faq-grid {
    grid-template-columns: 1fr;
  }

  .waitlist-signal-grid,
  .waitlist-track-grid,
  .waitlist-product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .waitlist-container {
    width: min(100% - 28px, 640px);
  }

  .waitlist-nav {
    min-height: 68px;
  }

  .waitlist-nav-links {
    display: none;
  }

  .waitlist-hero {
    padding-top: 48px;
  }

  .waitlist-actions,
  .waitlist-final-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .waitlist-button,
  .waitlist-nav-cta,
  .waitlist-final-actions .waitlist-button {
    width: 100%;
  }

  .waitlist-step-row {
    grid-template-columns: 1fr;
  }

  .waitlist-final-shell {
    flex-direction: column;
    align-items: flex-start;
  }

  .waitlist-mobile-cta {
    position: sticky;
    bottom: 0;
    z-index: 45;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid rgba(15, 77, 58, 0.14);
    background: rgba(255, 248, 239, 0.94);
    backdrop-filter: blur(16px);
  }

  .waitlist-mobile-cta a:first-child {
    color: var(--waitlist-ivory);
    background: var(--waitlist-orange);
  }

  .waitlist-mobile-cta a:last-child {
    border: 1px solid var(--waitlist-line);
    color: var(--waitlist-green);
    background: rgba(255, 255, 255, 0.72);
  }
}

@media (max-width: 620px) {
  .waitlist-hero h1 {
    font-size: clamp(2.55rem, 14vw, 3.45rem);
  }

  .waitlist-signal-grid,
  .waitlist-track-grid,
  .waitlist-product-grid {
    grid-template-columns: 1fr;
  }

  .waitlist-section {
    padding: 46px 0;
  }

  .waitlist-track-card,
  .waitlist-product-card {
    min-height: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .waitlist-nav-links a,
  .waitlist-nav-cta,
  .waitlist-button,
  .waitlist-form button,
  .waitlist-mobile-cta a {
    transition: none;
  }
}
`;
