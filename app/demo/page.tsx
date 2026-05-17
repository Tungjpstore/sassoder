import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Clock3, ClipboardCheck, QrCode, Sparkles, UsersRound, WalletCards } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { DemoScenarioSwitcher } from "@/components/marketing/demo-scenario-switcher";
import { MarketingFunnelTracker } from "@/components/marketing/funnel-tracker";
import { SEO_COMPANY_NAME, absoluteAssetUrl, absoluteSeoUrl } from "@/lib/seo/config";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "Demo LogiVN - Xem flow QR ordering, VietQR và AI vận hành",
  description:
    "Xem demo LogiVN cho quán cafe, trà sữa và nhà hàng: khách scan QR, gọi món tại bàn, nhân viên xác nhận, VietQR, dashboard và AI insight.",
  path: "/demo",
  image: "/brand/logivn/02-banner-owner-dashboard.png"
});

const demoMetrics = [
  { value: "5 bước", label: "từ scan QR đến phục vụ" },
  { value: "Realtime", label: "order, bàn và thanh toán" },
  { value: "VietQR", label: "quen thuộc với khách Việt" },
  { value: "AI", label: "gợi ý vận hành theo ca" }
];

const flowSteps = [
  {
    icon: QrCode,
    title: "Khách scan QR",
    text: "Mã QR mở đúng menu theo bàn, khu vực hoặc kênh online."
  },
  {
    icon: ClipboardCheck,
    title: "Chọn món và gửi order",
    text: "Size, topping, ghi chú và combo được đặt trên mobile rõ ràng."
  },
  {
    icon: UsersRound,
    title: "Nhân viên xác nhận",
    text: "Đơn mới xuất hiện trong dashboard để phục vụ hoặc bếp xử lý ngay."
  },
  {
    icon: WalletCards,
    title: "Thanh toán VietQR",
    text: "Khách thanh toán theo thói quen chuyển khoản, quán dễ đối soát hơn."
  },
  {
    icon: BarChart3,
    title: "Chủ quán đọc báo cáo",
    text: "Doanh thu, món bán chạy, giờ cao điểm và hiệu suất hiện cùng một nơi."
  }
];

const liveEvents = [
  "Bàn 12 gửi 3 món mới",
  "Bếp xác nhận Trà đào cam sả",
  "VietQR chờ đối soát hóa đơn #1048",
  "AI nhắc mở thêm nhân sự khung 19h"
];

const demoPanels = [
  {
    label: "Customer mobile",
    title: "Menu QR giúp khách tự quyết định nhanh hơn",
    text: "Tập trung vào món, topping, ghi chú và nút gửi order. Không bắt khách tải app, không bắt nhân viên đứng chờ.",
    image: "/brand/logivn/03-banner-customer-qr-ordering.png",
    points: ["Menu theo bàn", "Order thêm món", "Gọi phục vụ", "Thanh toán VietQR"]
  },
  {
    label: "Owner dashboard",
    title: "Dashboard giữ ca phục vụ ở cùng một nhịp",
    text: "Chủ quán và nhân viên nhìn cùng trạng thái: đơn mới, bàn đang dùng, thanh toán, báo cáo và việc AI gợi ý.",
    image: "/brand/logivn/02-banner-owner-dashboard.png",
    points: ["Order realtime", "Bàn và bếp", "Báo cáo ngày", "AI insight"]
  }
];

const aiInsights = [
  {
    title: "Dự đoán giờ cao điểm",
    text: "Nếu order tăng trước 18h30, LogiVN gợi ý chuẩn bị thêm người nhận món hoặc pha chế."
  },
  {
    title: "Gợi ý combo dễ bán",
    text: "AI đọc món thường đi cùng nhau để đề xuất combo cho QR menu hoặc kênh online."
  },
  {
    title: "Nhắc tồn kho có rủi ro",
    text: "Khi nguyên liệu bán nhanh hơn nhịp nhập kho, chủ quán nhận tín hiệu sớm để xử lý."
  }
];

const conversionPaths = [
  {
    title: "Tôi muốn xem giá trước",
    text: "So sánh Pro 99K và Premium 199K theo mức độ vận hành của quán.",
    href: "/pricing",
    cta: "Mở bảng giá"
  },
  {
    title: "Tôi muốn tạo quán thử ngay",
    text: "Bắt đầu bằng Pro để lên menu, in QR và nhận order thật trong 30 ngày.",
    href: "/dashboard/register?plan=pro&source=demo",
    cta: "Tạo quán dùng thử"
  },
  {
    title: "Tôi muốn pilot có hướng dẫn",
    text: "Vào waitlist để LogiVN gom thông tin mô hình quán và gợi ý lộ trình rollout.",
    href: "/waitlist",
    cta: "Vào waitlist"
  }
];

const demoFaqItems = [
  {
    question: "Demo LogiVN có cần cài phần mềm hay app không?",
    answer:
      "Không. LogiVN là nền tảng web-first. Khách quét QR để gọi món trên trình duyệt, còn quán dùng dashboard trên máy tính, máy tính bảng hoặc điện thoại."
  },
  {
    question: "Demo này phù hợp với mô hình quán nào?",
    answer:
      "Demo phù hợp với quán cafe, trà sữa, quán ăn nhỏ, nhà hàng phục vụ tại bàn và chuỗi F&B nhỏ muốn kiểm tra QR ordering, VietQR, nhân viên, tồn kho và báo cáo."
  },
  {
    question: "Sau khi xem demo nên chọn Pro hay Premium?",
    answer:
      "Pro phù hợp khi quán muốn bắt đầu với QR ordering, order tại bàn và dashboard cơ bản. Premium phù hợp khi cần AI assistant, đặt bàn, nhân sự, tồn kho và báo cáo sâu hơn."
  },
  {
    question: "LogiVN AI trong demo hỗ trợ việc gì?",
    answer:
      "AI của LogiVN tập trung vào vận hành thực tế như tóm tắt doanh thu, gợi ý combo, dự đoán giờ cao điểm, nhắc tồn kho và hỗ trợ chủ quán đọc dữ liệu nhanh hơn."
  }
];

function softwareSchemaId() {
  return `${absoluteSeoUrl("/").replace(/\/+$/, "")}/#software`;
}

function buildDemoWebPageSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${absoluteSeoUrl("/demo")}#webpage`,
    name: "Demo LogiVN",
    description:
      "Demo flow QR ordering, order tại bàn, VietQR, dashboard và AI assistant cho quán cafe, trà sữa và nhà hàng Việt.",
    url: absoluteSeoUrl("/demo"),
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
    image: absoluteAssetUrl("/brand/logivn/02-banner-owner-dashboard.png"),
    potentialAction: [
      {
        "@type": "ViewAction",
        name: "Xem bảng giá LogiVN",
        target: absoluteSeoUrl("/pricing")
      },
      {
        "@type": "RegisterAction",
        name: "Tạo quán dùng thử LogiVN",
        target: absoluteSeoUrl("/dashboard/register?plan=pro&source=demo")
      }
    ]
  };
}

function buildDemoHowToSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Cách LogiVN xử lý một flow gọi món QR tại quán",
    description: "Luồng từ khách scan QR, chọn món, quán xác nhận, thanh toán VietQR đến báo cáo và AI insight.",
    totalTime: "PT5M",
    supply: ["Menu QR", "Dashboard LogiVN", "VietQR"],
    step: flowSteps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.text,
      url: `${absoluteSeoUrl("/demo")}#step-${index + 1}`
    }))
  };
}

export default function DemoPage() {
  return (
    <main className="logivn-demo-page">
      <MarketingFunnelTracker page="/demo" source="demo" />
      <JsonLdScript
        id="logivn-demo-breadcrumb-jsonld"
        scriptKey="logivn-demo-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Demo", path: "/demo" }
        ])}
      />
      <JsonLdScript id="logivn-demo-webpage-jsonld" scriptKey="logivn-demo-webpage" data={buildDemoWebPageSchema()} />
      <JsonLdScript id="logivn-demo-howto-jsonld" scriptKey="logivn-demo-howto" data={buildDemoHowToSchema()} />
      <JsonLdScript id="logivn-demo-faq-jsonld" scriptKey="logivn-demo-faq" data={buildFaqSchema(demoFaqItems)} />
      <style>{styles}</style>

      <header className="demo-header">
        <div className="demo-container demo-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav className="demo-nav-links" aria-label="Điều hướng demo">
            <Link href="/">Trang chủ</Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/demo" className="is-active">
              Demo
            </Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/waitlist">Waitlist</Link>
          </nav>
          <Link className="demo-nav-cta" href="/dashboard/register?plan=pro&source=demo_nav">
            Tạo quán thử
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="demo-hero">
        <div className="demo-container demo-hero-grid">
          <div className="demo-hero-copy">
            <span className="demo-kicker">Interactive product story</span>
            <h1>Xem LogiVN vận hành một ca bán từ QR order đến AI insight.</h1>
            <p>
              Demo này mô phỏng hành trình thật của quán Việt: khách scan QR, gửi order tại bàn, nhân viên xác nhận,
              thanh toán VietQR và chủ quán xem báo cáo trong cùng một dashboard.
            </p>
            <div className="demo-actions">
              <Link className="demo-button demo-button-primary" href="/dashboard/register?plan=pro&source=demo_hero">
                Tạo quán dùng thử
                <ArrowRight size={16} />
              </Link>
              <Link className="demo-button demo-button-soft" href="/waitlist">
                Pilot có hướng dẫn
              </Link>
            </div>
          </div>

          <figure className="demo-stage" aria-label="Minh họa dashboard demo LogiVN">
            <Image
              src="/brand/logivn/02-banner-owner-dashboard.png"
              alt="Dashboard LogiVN hiển thị order, bàn, doanh thu và AI insight trong một ca bán"
              width={1600}
              height={900}
              priority
              sizes="(min-width: 1024px) 48vw, 100vw"
            />
            <figcaption>
              <span>
                <Clock3 size={15} />
                Live demo flow
              </span>
              <strong>Order, bàn, VietQR và báo cáo cùng một nơi.</strong>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="demo-metrics" aria-label="Điểm nhấn demo LogiVN">
        <div className="demo-container demo-metric-grid">
          {demoMetrics.map((metric) => (
            <article key={metric.value}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="demo-section" aria-labelledby="demo-flow-title">
        <div className="demo-container">
          <div className="demo-section-head">
            <span className="demo-kicker">QR ordering flow</span>
            <h2 id="demo-flow-title">Một flow gọi món đủ ngắn cho khách, đủ rõ cho nhân viên.</h2>
            <p>
              Mỗi bước trong demo được thiết kế để giảm thao tác hỏi lại, giữ trạng thái đơn rõ ràng và giúp chủ quán
              thấy ngay điểm nghẽn của ca phục vụ.
            </p>
          </div>

          <div className="demo-flow-grid">
            {flowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article className="demo-flow-step" id={`step-${index + 1}`} key={step.title}>
                  <div className="demo-flow-topline">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <Icon size={20} />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              );
            })}
          </div>

          <div className="demo-live-strip" aria-label="Tín hiệu realtime trong demo">
            {liveEvents.map((event) => (
              <span key={event}>
                <span className="demo-live-dot" />
                {event}
              </span>
            ))}
          </div>

          <DemoScenarioSwitcher />
        </div>
      </section>

      <section className="demo-section demo-section-muted">
        <div className="demo-container demo-panel-stack">
          {demoPanels.map((panel) => (
            <article className="demo-panel" key={panel.label}>
              <div className="demo-panel-copy">
                <span className="demo-kicker">{panel.label}</span>
                <h2>{panel.title}</h2>
                <p>{panel.text}</p>
                <div className="demo-check-grid">
                  {panel.points.map((point) => (
                    <span key={point}>
                      <Check size={15} />
                      {point}
                    </span>
                  ))}
                </div>
              </div>
              <figure className="demo-panel-media">
                <Image src={panel.image} alt={panel.title} width={1600} height={900} sizes="(min-width: 1024px) 48vw, 100vw" />
              </figure>
            </article>
          ))}
        </div>
      </section>

      <section className="demo-section demo-ai-section" aria-labelledby="demo-ai-title">
        <div className="demo-container demo-ai-grid">
          <div className="demo-section-head">
            <span className="demo-kicker">AI assistant</span>
            <h2 id="demo-ai-title">AI trong demo không làm màu, nó trả lời câu hỏi chủ quán hỏi mỗi ngày.</h2>
            <p>
              LogiVN đặt AI ở nơi dữ liệu phát sinh: order, bàn, thanh toán, tồn kho và báo cáo. Vì vậy insight không
              đứng ngoài vận hành mà đi cùng quyết định trong ngày.
            </p>
            <Link className="demo-button demo-button-primary" href="/dashboard/register?plan=premium&source=demo_ai">
              Thử Premium AI
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="demo-ai-list">
            {aiInsights.map((insight) => (
              <article className="demo-ai-card" key={insight.title}>
                <Sparkles size={19} />
                <h3>{insight.title}</h3>
                <p>{insight.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="demo-section" aria-labelledby="demo-next-title">
        <div className="demo-container">
          <div className="demo-section-head demo-section-head-centered">
            <span className="demo-kicker">Bước tiếp theo</span>
            <h2 id="demo-next-title">Sau demo, chọn đường đi ít ma sát nhất cho quán.</h2>
            <p>
              Chủ quán có thể đi tiếp theo đúng mức sẵn sàng: xem giá, tạo quán thử hoặc để LogiVN gợi ý phạm vi pilot
              nhỏ trước khi triển khai rộng hơn.
            </p>
          </div>

          <div className="demo-path-grid">
            {conversionPaths.map((path) => (
              <article className="demo-path-card" key={path.title}>
                <h3>{path.title}</h3>
                <p>{path.text}</p>
                <Link href={path.href}>
                  {path.cta}
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="demo-section demo-faq" aria-labelledby="demo-faq-title">
        <div className="demo-container demo-faq-grid">
          <div className="demo-section-head">
            <span className="demo-kicker">FAQ</span>
            <h2 id="demo-faq-title">Câu trả lời ngắn trước khi chủ quán bắt đầu dùng thử.</h2>
          </div>
          <div className="demo-faq-list">
            {demoFaqItems.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="demo-final">
        <div className="demo-container demo-final-shell">
          <div>
            <span className="demo-kicker">Ready to run a real shift</span>
            <h2>Đưa LogiVN vào một ca bán thật và đo bằng order, thời gian chờ, đối soát.</h2>
            <p>Pro đủ để bắt đầu QR ordering. Premium mở AI, đặt bàn, nhân sự, tồn kho và báo cáo sâu hơn khi quán cần.</p>
          </div>
          <div className="demo-final-actions">
            <Link className="demo-button demo-button-light" href="/pricing">
              So sánh gói
            </Link>
            <Link className="demo-button demo-button-orange" href="/dashboard/register?plan=pro&source=demo_final">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <div className="demo-mobile-cta" aria-label="Hành động nhanh">
        <Link href="/dashboard/register?plan=pro&source=demo_mobile">Tạo quán thử</Link>
        <Link href="/pricing">Xem giá</Link>
      </div>
    </main>
  );
}

const styles = `
.logivn-demo-page {
  --demo-green: #0F4D3A;
  --demo-deep: #082D23;
  --demo-orange: #F28C28;
  --demo-orange-strong: #D86E13;
  --demo-ivory: #FFF7EB;
  --demo-paper: #FFFCF6;
  --demo-mint: #E7F2EA;
  --demo-line: rgba(15, 77, 58, 0.16);
  --demo-text: #203329;
  --demo-muted: rgba(32, 51, 41, 0.72);
  min-height: 100vh;
  color: var(--demo-text);
  background:
    linear-gradient(180deg, rgba(255, 247, 235, 0.98) 0%, rgba(255, 244, 229, 0.98) 34%, rgba(248, 251, 245, 0.98) 72%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-demo-page * { box-sizing: border-box; }
.logivn-demo-page a { color: inherit; text-decoration: none; }
.logivn-demo-page h1,
.logivn-demo-page h2,
.logivn-demo-page h3,
.logivn-demo-page p { margin: 0; }

.demo-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.demo-header {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.demo-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.demo-nav-links {
  display: flex;
  align-items: center;
  gap: 18px;
  color: var(--demo-muted);
  font-size: 14px;
  font-weight: 850;
}

.demo-nav-links a,
.demo-nav-cta,
.demo-button,
.demo-path-card a,
.demo-mobile-cta a {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.demo-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding-inline: 6px;
}

.demo-nav-links .is-active,
.demo-nav-links a:hover {
  color: var(--demo-green);
}

.demo-nav-cta,
.demo-button,
.demo-path-card a,
.demo-mobile-cta a {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
}

.demo-nav-cta {
  min-height: 44px;
  padding: 0 18px;
  color: var(--demo-ivory);
  background: var(--demo-green);
}

.demo-hero {
  padding: 72px 0 34px;
}

.demo-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.96fr) minmax(360px, 0.86fr);
  gap: 36px;
  align-items: center;
}

.demo-kicker {
  color: var(--demo-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.demo-hero h1,
.demo-section-head h2,
.demo-panel h2,
.demo-final h2 {
  color: var(--demo-deep);
  letter-spacing: 0;
}

.demo-hero h1 {
  max-width: 840px;
  margin-top: 14px;
  font-size: clamp(3rem, 6.4vw, 5.25rem);
  line-height: 0.95;
}

.demo-hero p,
.demo-section-head p,
.demo-flow-step p,
.demo-panel p,
.demo-ai-card p,
.demo-path-card p,
.demo-faq-list p,
.demo-final p {
  color: var(--demo-muted);
  line-height: 1.72;
  font-weight: 650;
}

.demo-hero p {
  max-width: 720px;
  margin-top: 20px;
  font-size: 17px;
}

.demo-actions,
.demo-final-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.demo-button {
  padding: 0 20px;
}

.demo-button:hover,
.demo-nav-cta:hover,
.demo-path-card a:hover,
.demo-mobile-cta a:hover {
  transform: translateY(-1px);
}

.demo-button-primary,
.demo-button-orange {
  color: var(--demo-ivory);
  background: var(--demo-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.18);
}

.demo-button-soft,
.demo-button-light {
  border: 1px solid var(--demo-line);
  color: var(--demo-green);
  background: rgba(255, 255, 255, 0.76);
}

.demo-stage {
  margin: 0;
}

.demo-stage img,
.demo-panel-media img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--demo-line);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.15);
}

.demo-stage figcaption {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid var(--demo-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
}

.demo-stage figcaption span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--demo-orange-strong);
  font-size: 13px;
  font-weight: 900;
}

.demo-stage figcaption strong {
  color: var(--demo-deep);
  font-size: 13px;
  line-height: 1.45;
  text-align: right;
}

.demo-metrics {
  padding: 14px 0 30px;
}

.demo-metric-grid,
.demo-flow-grid,
.demo-check-grid,
.demo-ai-list,
.demo-path-grid {
  display: grid;
  gap: 14px;
}

.demo-metric-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.demo-metric-grid article,
.demo-flow-step,
.demo-ai-card,
.demo-path-card,
.demo-faq-list details {
  border: 1px solid var(--demo-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.demo-metric-grid article {
  padding: 18px;
}

.demo-metric-grid strong {
  display: block;
  color: var(--demo-deep);
  font-size: 24px;
}

.demo-metric-grid span {
  display: block;
  margin-top: 6px;
  color: var(--demo-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.5;
}

.demo-section {
  padding: 58px 0;
}

.demo-section-muted {
  background: rgba(15, 77, 58, 0.045);
}

.demo-section-head {
  max-width: 780px;
}

.demo-section-head-centered {
  margin: 0 auto;
  text-align: center;
}

.demo-section-head h2,
.demo-panel h2,
.demo-final h2 {
  margin-top: 12px;
  font-size: clamp(2rem, 4.4vw, 3rem);
  line-height: 1.02;
}

.demo-section-head p,
.demo-panel p,
.demo-final p {
  margin-top: 14px;
  font-size: 16px;
}

.demo-flow-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 28px;
}

.demo-flow-step {
  min-height: 236px;
  padding: 18px;
}

.demo-flow-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--demo-orange);
}

.demo-flow-topline span {
  font-size: 12px;
  font-weight: 950;
}

.demo-flow-step h3,
.demo-ai-card h3,
.demo-path-card h3,
.demo-faq-list summary {
  color: var(--demo-deep);
  letter-spacing: 0;
}

.demo-flow-step h3 {
  margin-top: 24px;
  font-size: 21px;
  line-height: 1.12;
}

.demo-flow-step p {
  margin-top: 10px;
  font-size: 14px;
}

.demo-live-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.demo-live-strip span {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border: 1px solid rgba(242, 140, 40, 0.2);
  border-radius: 8px;
  color: var(--demo-green);
  background: rgba(255, 247, 235, 0.78);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.35;
}

.demo-live-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--demo-orange);
  box-shadow: 0 0 0 6px rgba(242, 140, 40, 0.12);
  animation: demoPulse 1800ms ease-in-out infinite;
}

.demo-scenario {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.demo-scenario-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.demo-scenario-tabs button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--demo-line);
  border-radius: 8px;
  padding: 0 14px;
  color: var(--demo-green);
  background: rgba(255, 255, 255, 0.72);
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition: background 180ms ease, color 180ms ease, transform 180ms ease;
}

.demo-scenario-tabs button.is-active {
  color: var(--demo-ivory);
  background: var(--demo-green);
}

.demo-scenario-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--demo-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.demo-scenario-panel span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--demo-orange-strong);
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
}

.demo-scenario-panel h3 {
  margin-top: 9px;
  color: var(--demo-deep);
  font-size: 24px;
  line-height: 1.08;
}

.demo-scenario-panel strong {
  align-self: start;
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--demo-ivory);
  background: var(--demo-orange);
  font-size: 18px;
}

.demo-scenario-events {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.demo-scenario-events p {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--demo-green);
  background: rgba(15, 77, 58, 0.07);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.4;
}

.demo-panel-stack {
  display: grid;
  gap: 34px;
}

.demo-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(360px, 1fr);
  gap: 28px;
  align-items: center;
}

.demo-panel:nth-child(even) {
  grid-template-columns: minmax(360px, 1fr) minmax(0, 0.82fr);
}

.demo-panel:nth-child(even) .demo-panel-copy {
  order: 2;
}

.demo-check-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 22px;
}

.demo-check-grid span {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--demo-line);
  border-radius: 8px;
  color: var(--demo-green);
  background: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 850;
}

.demo-ai-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(360px, 1fr);
  gap: 34px;
  align-items: start;
}

.demo-ai-list {
  grid-template-columns: 1fr;
}

.demo-ai-card {
  min-height: 156px;
  padding: 20px;
}

.demo-ai-card svg {
  color: var(--demo-orange);
}

.demo-ai-card h3 {
  margin-top: 18px;
  font-size: 22px;
  line-height: 1.08;
}

.demo-ai-card p {
  margin-top: 10px;
  font-size: 14px;
}

.demo-path-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
}

.demo-path-card {
  display: flex;
  min-height: 236px;
  flex-direction: column;
  padding: 22px;
}

.demo-path-card h3 {
  font-size: 24px;
  line-height: 1.05;
}

.demo-path-card p {
  margin-top: 12px;
  font-size: 14px;
}

.demo-path-card a {
  width: fit-content;
  margin-top: auto;
  padding: 0 16px;
  color: var(--demo-green);
  background: rgba(15, 77, 58, 0.08);
}

.demo-faq {
  background: rgba(15, 77, 58, 0.045);
}

.demo-faq-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.72fr) minmax(360px, 1fr);
  gap: 34px;
  align-items: start;
}

.demo-faq-list {
  display: grid;
  gap: 12px;
}

.demo-faq-list details {
  padding: 18px;
}

.demo-faq-list summary {
  cursor: pointer;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.35;
}

.demo-faq-list p {
  margin-top: 12px;
  font-size: 14px;
}

.demo-final {
  padding: 64px 0 82px;
}

.demo-final-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 30px;
  border-radius: 8px;
  color: var(--demo-ivory);
  background: linear-gradient(135deg, #082D23 0%, #0F4D3A 64%, #24624D 100%);
  box-shadow: 0 24px 64px rgba(9, 46, 35, 0.18);
}

.demo-final h2 {
  max-width: 760px;
  color: var(--demo-ivory);
}

.demo-final p {
  max-width: 720px;
  color: rgba(255, 247, 235, 0.78);
}

.demo-final .demo-kicker {
  color: #F8B86A;
}

.demo-mobile-cta {
  display: none;
}

.demo-nav-links a:focus-visible,
.demo-nav-cta:focus-visible,
.demo-button:focus-visible,
.demo-path-card a:focus-visible,
.demo-scenario-tabs button:focus-visible,
.demo-faq-list summary:focus-visible,
.demo-mobile-cta a:focus-visible {
  outline: 2px solid rgba(242, 140, 40, 0.55);
  outline-offset: 4px;
}

@keyframes demoPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.78); opacity: 0.72; }
}

@media (max-width: 1080px) {
  .demo-hero-grid,
  .demo-panel,
  .demo-panel:nth-child(even),
  .demo-ai-grid,
  .demo-faq-grid {
    grid-template-columns: 1fr;
  }

  .demo-panel:nth-child(even) .demo-panel-copy {
    order: 0;
  }

  .demo-flow-grid,
  .demo-path-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .demo-live-strip,
  .demo-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .demo-scenario-events {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .demo-container {
    width: min(100% - 28px, 640px);
  }

  .demo-nav {
    min-height: 68px;
  }

  .demo-nav-links {
    display: none;
  }

  .demo-hero {
    padding-top: 48px;
  }

  .demo-actions,
  .demo-final-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .demo-button,
  .demo-nav-cta,
  .demo-final-actions .demo-button {
    width: 100%;
  }

  .demo-stage figcaption,
  .demo-final-shell {
    flex-direction: column;
    align-items: flex-start;
  }

  .demo-stage figcaption strong {
    text-align: left;
  }

  .demo-mobile-cta {
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

  .demo-mobile-cta a:first-child {
    color: var(--demo-ivory);
    background: var(--demo-orange);
  }

  .demo-mobile-cta a:last-child {
    border: 1px solid var(--demo-line);
    color: var(--demo-green);
    background: rgba(255, 255, 255, 0.72);
  }
}

@media (max-width: 620px) {
  .demo-hero h1 {
    font-size: clamp(2.55rem, 14vw, 3.45rem);
  }

  .demo-metric-grid,
  .demo-flow-grid,
  .demo-live-strip,
  .demo-check-grid,
  .demo-path-grid,
  .demo-scenario-panel {
    grid-template-columns: 1fr;
  }

  .demo-section {
    padding: 46px 0;
  }

  .demo-flow-step,
  .demo-path-card {
    min-height: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-nav-links a,
  .demo-nav-cta,
  .demo-button,
  .demo-path-card a,
  .demo-live-dot,
  .demo-scenario-tabs button,
  .demo-mobile-cta a {
    animation: none;
    transition: none;
  }
}
`;
