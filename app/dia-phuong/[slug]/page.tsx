import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, Bot, Check, ClipboardList, MapPin, QrCode, Search, ShieldCheck, Sparkles } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getComparisonPage, type ComparisonPage } from "@/lib/seo/comparison-pages";
import { SEO_COMPANY_NAME, absoluteSeoUrl } from "@/lib/seo/config";
import { getSeoIntentPage, type SeoIntentPage } from "@/lib/seo/intent-pages";
import { getAllLocalSeoPages, getLocalSeoPage, type LocalSeoPage } from "@/lib/seo/local-pages";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildFaqSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;
export const dynamicParams = false;

const localAssets = [
  {
    test: /(da-nang|đà nẵng|reservation|dat-ban|đặt bàn)/i,
    src: "/brand/logivn/04-banner-payment-service.png",
    alt: "LogiVN hỗ trợ đặt bàn, phục vụ và thanh toán VietQR cho nhà hàng"
  },
  {
    test: /(can-tho|cần thơ|quan-an|quán ăn|tra-sua|trà sữa)/i,
    src: "/brand/logivn/03-banner-customer-qr-ordering.png",
    alt: "Khách gọi món bằng menu QR LogiVN tại quán cafe, trà sữa và quán ăn"
  },
  {
    test: /(ha-noi|hà nội|hai-phong|hải phòng|ban|bàn|nha-hang|nhà hàng)/i,
    src: "/brand/logivn/02-banner-owner-dashboard.png",
    alt: "Dashboard LogiVN cho chủ quán theo dõi bàn, order, thanh toán và báo cáo"
  }
];

function getLocalAsset(page: LocalSeoPage) {
  const haystack = `${page.slug} ${page.title} ${page.h1} ${page.description} ${page.keywords.join(" ")}`;
  return (
    localAssets.find((entry) => entry.test.test(haystack)) ?? {
      src: "/brand/logivn/01-banner-overview-hero-v2.png",
      alt: "Tổng quan LogiVN cho quán cafe, trà sữa, quán ăn và nhà hàng Việt"
    }
  );
}

function siblingLocalPages(current: LocalSeoPage) {
  return getAllLocalSeoPages()
    .filter((page) => page.slug !== current.slug)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3);
}

function relatedIntentPages(page: LocalSeoPage): SeoIntentPage[] {
  return page.relatedIntentSlugs.map((slug) => getSeoIntentPage(slug)).filter((entry): entry is SeoIntentPage => Boolean(entry));
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function buildLocalWebPageSchema(page: LocalSeoPage) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${absoluteSeoUrl(page.path)}#webpage`,
    name: page.title,
    headline: page.h1,
    description: page.description,
    url: absoluteSeoUrl(page.path),
    inLanguage: "vi-VN",
    dateModified: page.updatedAt,
    publisher: {
      "@type": "Organization",
      name: SEO_COMPANY_NAME,
      url: absoluteSeoUrl("/")
    },
    about: [
      {
        "@type": "SoftwareApplication",
        name: "LogiVN",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: absoluteSeoUrl("/")
      },
      {
        "@type": "City",
        name: page.cityName
      }
    ],
    areaServed: {
      "@type": "City",
      name: page.cityName
    },
    keywords: page.keywords.join(", ")
  };
}

function buildLocalServiceSchema(page: LocalSeoPage) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${absoluteSeoUrl(page.path)}#service`,
    name: `LogiVN cho quán F&B tại ${page.cityName}`,
    serviceType: "Phần mềm quản lý quán cafe, trà sữa, quán ăn và nhà hàng",
    description: page.description,
    url: absoluteSeoUrl(page.path),
    inLanguage: "vi-VN",
    provider: {
      "@type": "Organization",
      name: SEO_COMPANY_NAME,
      url: absoluteSeoUrl("/")
    },
    areaServed: {
      "@type": "City",
      name: page.cityName
    },
    audience: {
      "@type": "Audience",
      audienceType: `Chủ quán cafe, trà sữa, quán ăn và nhà hàng tại ${page.cityName}`
    }
  };
}

export function generateStaticParams() {
  return getAllLocalSeoPages().map((page) => ({
    slug: page.slug
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getLocalSeoPage(slug);

  if (!page) {
    return createSeoMetadata({
      title: "Trang địa phương không tồn tại",
      description: "Trang địa phương LogiVN không tồn tại hoặc đã được di chuyển.",
      path: "/dia-phuong",
      noIndex: true
    });
  }

  return createSeoMetadata({
    title: page.title,
    description: page.description,
    path: page.path
  });
}

export default async function LocalSeoDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getLocalSeoPage(slug);

  if (!page) notFound();

  const asset = getLocalAsset(page);
  const localSiblings = siblingLocalPages(page);
  const intents = relatedIntentPages(page);
  const comparisons = page.relatedComparisonSlugs.map((relatedSlug) => getComparisonPage(relatedSlug)).filter((item): item is ComparisonPage => Boolean(item));
  const relatedItems = [
    ...intents.map((item) => ({ name: item.h1, path: item.path, description: item.description })),
    ...comparisons.map((item) => ({ name: item.h1, path: item.path, description: item.description })),
    ...localSiblings.map((item) => ({ name: item.h1, path: item.path, description: item.description }))
  ];

  return (
    <main className="logivn-local-page">
      <JsonLdScript
        id="logivn-local-breadcrumb-jsonld"
        scriptKey={`logivn-local-breadcrumb-${page.slug}`}
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Địa phương", path: "/dia-phuong" },
          { name: page.cityName, path: page.path }
        ])}
      />
      <JsonLdScript id="logivn-local-webpage-jsonld" scriptKey={`logivn-local-webpage-${page.slug}`} data={buildLocalWebPageSchema(page)} />
      <JsonLdScript id="logivn-local-service-jsonld" scriptKey={`logivn-local-service-${page.slug}`} data={buildLocalServiceSchema(page)} />
      <JsonLdScript id="logivn-local-faq-jsonld" scriptKey={`logivn-local-faq-${page.slug}`} data={buildFaqSchema(page.faq)} />
      <JsonLdScript id="logivn-local-related-jsonld" scriptKey={`logivn-local-related-${page.slug}`} data={buildItemListSchema(relatedItems)} />
      <style>{styles}</style>

      <header className="local-detail-header">
        <div className="local-detail-container local-detail-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng trang địa phương" className="local-detail-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/so-sanh">So sánh</Link>
            <Link href="/dia-phuong" className="is-active">
              Địa phương
            </Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Bảng giá</Link>
          </nav>
          <Link className="local-detail-nav-cta" href="/demo">
            Xem demo
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="local-detail-hero">
        <div className="local-detail-container local-detail-hero-grid">
          <div className="local-detail-hero-copy">
            <Link className="local-detail-back" href="/dia-phuong">
              <ArrowLeft size={16} />
              Tất cả địa phương
            </Link>
            <span className="local-detail-kicker">{page.eyebrow}</span>
            <h1>{page.h1}</h1>
            <p>{page.summary}</p>
            <div className="local-detail-meta">
              <span>{page.regionLabel}</span>
              <span>Cập nhật {formatUpdatedAt(page.updatedAt)}</span>
              <span>{page.shortCityName}</span>
            </div>
            <div className="local-detail-actions">
              <Link href={page.cta.primaryPath} className="local-detail-button local-detail-button-primary">
                {page.cta.primaryLabel}
                <ArrowRight size={16} />
              </Link>
              <Link href={page.cta.secondaryPath} className="local-detail-button local-detail-button-soft">
                {page.cta.secondaryLabel}
              </Link>
            </div>
          </div>

          <figure className="local-detail-visual">
            <Image src={asset.src} alt={asset.alt} width={1600} height={900} priority sizes="(min-width: 1024px) 42vw, 100vw" />
            <figcaption>{page.operatingModel.caption}</figcaption>
          </figure>
        </div>
      </section>

      <section className="local-detail-answer" aria-labelledby="local-detail-answer-heading">
        <div className="local-detail-container local-detail-answer-grid">
          <article className="local-detail-answer-card">
            <MapPin size={20} />
            <span>Phù hợp theo địa phương</span>
            <h2 id="local-detail-answer-heading">LogiVN phù hợp quán F&B tại {page.cityName} khi nào?</h2>
            <p>{page.description}</p>
          </article>
          <div className="local-detail-proof-grid">
            {page.marketSignals.map((signal) => (
              <article key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="local-detail-body">
        <div className="local-detail-container local-detail-layout">
          <div className="local-detail-content">
            <section className="local-detail-workflow" aria-labelledby="local-detail-workflow-heading">
              <div className="local-detail-section-head">
                <span>Mô hình vận hành</span>
                <h2 id="local-detail-workflow-heading">{page.operatingModel.title}</h2>
                <p>{page.operatingModel.caption}</p>
              </div>
              <div className="local-detail-step-grid">
                {page.operatingModel.labels.map((label, index) => (
                  <article key={label}>
                    <small>0{index + 1}</small>
                    <strong>{label}</strong>
                    <p>{page.localAngles[index] ?? page.localAngles[0]}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="local-detail-query-box" aria-labelledby="local-detail-query-heading">
              <BarChart3 size={20} />
              <div>
                <span>Truy vấn mục tiêu</span>
                <h2 id="local-detail-query-heading">Tối ưu cho nhóm tìm kiếm phần mềm theo địa phương</h2>
                <div className="local-detail-query-list">
                  {page.targetQueries.map((query) => (
                    <span key={query}>{query}</span>
                  ))}
                </div>
              </div>
            </section>

            {page.sections.map((section) => (
              <section className="local-detail-section" key={section.heading}>
                <span>{section.eyebrow}</span>
                <h2>{section.heading}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>
                      <Check size={15} />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section className="local-detail-faq" aria-labelledby="local-detail-faq-heading">
              <span>FAQ</span>
              <h2 id="local-detail-faq-heading">Câu hỏi thường gặp về LogiVN tại {page.cityName}</h2>
              {page.faq.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </section>
          </div>

          <aside className="local-detail-sidebar">
            <div className="local-detail-side-card">
              <QrCode size={20} />
              <span>Bước bắt đầu</span>
              <h2>Bắt đầu nhỏ bằng QR ordering, VietQR và dashboard</h2>
              <p>Nội dung theo địa phương nên đưa chủ quán về một thử nghiệm dễ đo trong ca thật, không ép triển khai toàn bộ hệ thống ngay.</p>
              <Link href="/pricing">
                Xem bảng giá
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="local-detail-side-card">
              <Bot size={20} />
              <span>AI-ready</span>
              <h2>Dữ liệu địa phương giúp AI gợi ý thực tế hơn</h2>
              <p>Khi order, bàn, VietQR và báo cáo nằm cùng nơi, LogiVN có thể tóm tắt ca bán và gợi ý việc cần kiểm.</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="local-detail-related">
        <div className="local-detail-container">
          <div className="local-detail-related-head">
            <span>Đọc tiếp</span>
            <h2>Đọc tiếp để nối địa phương với nhu cầu triển khai cụ thể</h2>
            <p>
              Các liên kết này giúp chủ quán đi từ bối cảnh địa phương sang giải pháp, so sánh phần mềm và bảng giá phù
              hợp.
            </p>
          </div>
          <div className="local-detail-related-grid">
            {relatedItems.slice(0, 8).map((item) => (
              <article key={item.path}>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <Link href={item.path}>
                  Đọc tiếp
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="local-detail-cta">
        <div className="local-detail-container local-detail-cta-shell">
          <div>
            <Sparkles size={22} />
            <span>LogiVN tại {page.cityName}</span>
            <h2>Biến nhu cầu địa phương thành một thử nghiệm vận hành thật.</h2>
            <p>
              Chọn Pro để thử QR ordering và menu. Chọn Premium khi quán cần AI, nhân viên, tồn kho và báo cáo sâu hơn.
            </p>
          </div>
          <div className="local-detail-actions">
            <Link href="/pricing" className="local-detail-button local-detail-button-light">
              So sánh gói
            </Link>
            <Link href="/demo" className="local-detail-button local-detail-button-light">
              Xem demo
            </Link>
            <Link href="/dashboard/register?plan=pro" className="local-detail-button local-detail-button-orange">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="local-detail-footer">
        <div className="local-detail-container">
          Trang địa phương LogiVN cho {page.cityName}, cập nhật {formatUpdatedAt(page.updatedAt)}. Nội dung phục vụ quyết
          định triển khai thực tế cho chủ quán Việt.
        </div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-local-page {
  --local-green: #0F4D3A;
  --local-deep: #092E23;
  --local-orange: #F28C28;
  --local-ivory: #FFF7EB;
  --local-line: rgba(15, 77, 58, 0.16);
  --local-text: #203329;
  --local-muted: rgba(32, 51, 41, 0.72);
  min-height: 100vh;
  color: var(--local-text);
  background: linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 38%, #F8FBF5 76%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-local-page * { box-sizing: border-box; }
.logivn-local-page a { color: inherit; text-decoration: none; }
.logivn-local-page h1,
.logivn-local-page h2,
.logivn-local-page h3,
.logivn-local-page p { margin: 0; }

.local-detail-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.local-detail-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.local-detail-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.local-detail-nav-links {
  display: flex;
  gap: 20px;
  color: var(--local-muted);
  font-size: 14px;
  font-weight: 800;
}

.local-detail-nav-links a,
.local-detail-nav-cta,
.local-detail-button,
.local-detail-side-card a,
.local-detail-related a,
.local-detail-back {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease;
}

.local-detail-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}

.local-detail-nav-links .is-active,
.local-detail-nav-links a:hover { color: var(--local-green); }

.local-detail-nav-cta,
.local-detail-button,
.local-detail-side-card a,
.local-detail-related a,
.local-detail-back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
}

.local-detail-nav-cta,
.local-detail-side-card a,
.local-detail-related a {
  padding: 0 16px;
  color: #FFF8EF;
  background: var(--local-green);
}

.local-detail-hero {
  padding: 62px 0 28px;
}

.local-detail-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.78fr);
  gap: 34px;
  align-items: center;
}

.local-detail-back,
.local-detail-kicker,
.local-detail-answer span,
.local-detail-proof-grid span,
.local-detail-section-head span,
.local-detail-query-box span,
.local-detail-section > span,
.local-detail-faq > span,
.local-detail-side-card > span,
.local-detail-related-head span,
.local-detail-cta span {
  color: var(--local-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.local-detail-back {
  width: fit-content;
  padding: 0 12px;
  border: 1px solid rgba(15, 77, 58, 0.16);
  color: var(--local-green);
  background: rgba(255, 255, 255, 0.68);
  text-transform: none;
}

.local-detail-kicker {
  display: block;
  margin-top: 22px;
}

.local-detail-hero h1,
.local-detail-content h2,
.local-detail-side-card h2,
.local-detail-related-head h2,
.local-detail-related h3,
.local-detail-cta h2,
.local-detail-answer h2 {
  letter-spacing: 0;
}

.local-detail-hero h1 {
  max-width: 860px;
  margin-top: 14px;
  color: var(--local-deep);
  font-size: 64px;
  line-height: 0.98;
}

.local-detail-hero p,
.local-detail-content p,
.local-detail-side-card p,
.local-detail-related p,
.local-detail-cta p,
.local-detail-answer p,
.local-detail-footer {
  color: var(--local-muted);
  line-height: 1.76;
  font-weight: 650;
}

.local-detail-hero p {
  max-width: 760px;
  margin-top: 20px;
  font-size: 17px;
}

.local-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.local-detail-meta span {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--local-green);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 850;
}

.local-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.local-detail-button {
  min-height: 48px;
  padding: 0 18px;
}

.local-detail-button:hover,
.local-detail-nav-cta:hover,
.local-detail-side-card a:hover,
.local-detail-related a:hover,
.local-detail-back:hover {
  transform: translateY(-1px);
}

.local-detail-button-primary,
.local-detail-button-orange {
  color: #FFF8EF;
  background: var(--local-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.18);
}

.local-detail-button-soft,
.local-detail-button-light {
  color: var(--local-green);
  border: 1px solid rgba(15, 77, 58, 0.18);
  background: rgba(255, 255, 255, 0.72);
}

.local-detail-visual {
  margin: 0;
}

.local-detail-visual img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(15, 77, 58, 0.16);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.16);
}

.local-detail-visual figcaption {
  margin-top: 12px;
  color: var(--local-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.local-detail-answer {
  padding: 18px 0 28px;
}

.local-detail-answer-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(320px, 0.64fr);
  gap: 14px;
}

.local-detail-answer-card,
.local-detail-proof-grid article,
.local-detail-side-card,
.local-detail-query-box,
.local-detail-workflow,
.local-detail-related article,
.local-detail-faq details {
  border: 1px solid var(--local-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.local-detail-answer-card {
  padding: 22px;
}

.local-detail-answer svg,
.local-detail-side-card svg,
.local-detail-query-box svg {
  color: var(--local-orange);
}

.local-detail-answer span {
  display: block;
  margin-top: 12px;
}

.local-detail-answer h2 {
  margin-top: 8px;
  color: var(--local-deep);
  font-size: 30px;
  line-height: 1.08;
}

.local-detail-answer p {
  margin-top: 12px;
  font-size: 15px;
}

.local-detail-proof-grid {
  display: grid;
  gap: 14px;
}

.local-detail-proof-grid article {
  padding: 18px;
}

.local-detail-proof-grid span {
  display: block;
  margin: 0;
  color: var(--local-orange);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.local-detail-proof-grid strong {
  display: block;
  margin-top: 8px;
  color: var(--local-deep);
  font-size: 20px;
}

.local-detail-body {
  padding: 34px 0 58px;
}

.local-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 750px) minmax(280px, 1fr);
  gap: 34px;
  align-items: start;
}

.local-detail-content {
  display: grid;
  gap: 26px;
}

.local-detail-workflow {
  padding: 22px;
}

.local-detail-section-head h2,
.local-detail-query-box h2,
.local-detail-section h2,
.local-detail-faq h2 {
  margin-top: 8px;
  color: var(--local-deep);
  font-size: 34px;
  line-height: 1.06;
}

.local-detail-section-head p {
  margin-top: 10px;
}

.local-detail-step-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.local-detail-step-grid article {
  min-height: 160px;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  padding: 16px;
  background: rgba(255, 247, 235, 0.64);
}

.local-detail-step-grid small {
  color: var(--local-orange);
  font-size: 12px;
  font-weight: 950;
}

.local-detail-step-grid strong {
  display: block;
  margin-top: 10px;
  color: var(--local-deep);
  font-size: 20px;
}

.local-detail-step-grid p {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.58;
}

.local-detail-query-box {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  padding: 22px;
}

.local-detail-query-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.local-detail-query-list span {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--local-green);
  background: rgba(255, 247, 235, 0.72);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

.local-detail-section {
  display: grid;
}

.local-detail-section p {
  margin-top: 14px;
  font-size: 16px;
}

.local-detail-section ul {
  display: grid;
  gap: 12px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.local-detail-section li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--local-text);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.55;
}

.local-detail-section li svg {
  flex: 0 0 auto;
  margin-top: 4px;
  color: var(--local-green);
}

.local-detail-faq {
  display: grid;
  gap: 12px;
}

.local-detail-faq h2 {
  margin-bottom: 8px;
}

.local-detail-faq details {
  padding: 0 18px;
}

.local-detail-faq summary {
  display: flex;
  min-height: 56px;
  align-items: center;
  color: var(--local-deep);
  cursor: pointer;
  font-weight: 900;
}

.local-detail-faq p {
  padding-bottom: 18px;
  font-size: 15px;
}

.local-detail-sidebar {
  display: grid;
  gap: 14px;
  position: sticky;
  top: 96px;
}

.local-detail-side-card {
  padding: 22px;
}

.local-detail-side-card span {
  display: block;
  margin-top: 12px;
}

.local-detail-side-card h2 {
  margin-top: 10px;
  color: var(--local-deep);
  font-size: 28px;
  line-height: 1.04;
}

.local-detail-side-card p {
  margin-top: 12px;
  font-size: 14px;
}

.local-detail-side-card a {
  width: fit-content;
  margin-top: 18px;
}

.local-detail-related {
  padding: 58px 0;
  background: rgba(15, 77, 58, 0.045);
}

.local-detail-related-head {
  max-width: 800px;
}

.local-detail-related-head h2,
.local-detail-cta h2 {
  margin-top: 10px;
  color: var(--local-deep);
  font-size: 42px;
  line-height: 1.04;
}

.local-detail-related-head p,
.local-detail-cta p {
  margin-top: 14px;
  font-size: 16px;
}

.local-detail-related-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 26px;
}

.local-detail-related article {
  padding: 20px;
}

.local-detail-related h3 {
  color: var(--local-deep);
  font-size: 22px;
  line-height: 1.12;
}

.local-detail-related p {
  margin-top: 12px;
  font-size: 14px;
}

.local-detail-related a {
  width: fit-content;
  margin-top: 18px;
}

.local-detail-cta {
  padding: 58px 0;
}

.local-detail-cta-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  border-radius: 8px;
  padding: 30px;
  color: #FFF8EF;
  background: linear-gradient(135deg, #092E23, #0F4D3A);
}

.local-detail-cta svg {
  color: var(--local-orange);
}

.local-detail-cta h2,
.local-detail-cta p,
.local-detail-cta span {
  color: #FFF8EF;
}

.local-detail-cta h2 {
  max-width: 760px;
}

.local-detail-cta p {
  max-width: 720px;
  opacity: 0.84;
}

.local-detail-button-light {
  background: rgba(255, 255, 255, 0.94);
}

.local-detail-footer {
  padding: 28px 0 40px;
  font-size: 14px;
}

@media (max-width: 1080px) {
  .local-detail-hero-grid,
  .local-detail-answer-grid,
  .local-detail-layout {
    grid-template-columns: 1fr;
  }

  .local-detail-sidebar {
    position: static;
  }

  .local-detail-step-grid,
  .local-detail-related-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .local-detail-nav-links {
    display: none;
  }

  .local-detail-cta-shell {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .local-detail-container {
    width: min(100% - 24px, 1120px);
  }

  .local-detail-hero {
    padding-top: 38px;
  }

  .local-detail-hero h1 {
    font-size: 40px;
    line-height: 1.03;
  }

  .local-detail-section-head h2,
  .local-detail-query-box h2,
  .local-detail-section h2,
  .local-detail-faq h2,
  .local-detail-related-head h2,
  .local-detail-cta h2,
  .local-detail-answer h2 {
    font-size: 29px;
  }

  .local-detail-actions,
  .local-detail-button {
    width: 100%;
  }

  .local-detail-step-grid,
  .local-detail-related-grid {
    grid-template-columns: 1fr;
  }

  .local-detail-query-box {
    grid-template-columns: 1fr;
  }
}
`;
