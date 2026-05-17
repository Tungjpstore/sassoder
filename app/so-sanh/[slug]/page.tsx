import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, Bot, Check, ClipboardList, QrCode, Search, ShieldCheck, Sparkles } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getAllComparisonPages, getComparisonPage, type ComparisonPage } from "@/lib/seo/comparison-pages";
import { SEO_COMPANY_NAME, absoluteSeoUrl } from "@/lib/seo/config";
import { getSeoIntentPage, type SeoIntentPage } from "@/lib/seo/intent-pages";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildFaqSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;
export const dynamicParams = false;

const comparisonAssets = [
  {
    test: /(sapo|posapp|quán ăn|trà sữa)/i,
    src: "/brand/logivn/03-banner-customer-qr-ordering.png",
    alt: "Khách dùng QR ordering LogiVN để gọi món tại bàn"
  },
  {
    test: /(vietqr|payment|thanh toán)/i,
    src: "/brand/logivn/04-banner-payment-service.png",
    alt: "Thanh toán VietQR và phục vụ tại bàn với LogiVN"
  },
  {
    test: /(ipos|cukcuk|kiotviet|dashboard|pos)/i,
    src: "/brand/logivn/02-banner-owner-dashboard.png",
    alt: "Dashboard LogiVN cho chủ quán so sánh order, doanh thu và vận hành"
  }
];

function getComparisonAsset(page: ComparisonPage) {
  const haystack = `${page.slug} ${page.title} ${page.h1} ${page.description}`;
  return (
    comparisonAssets.find((entry) => entry.test.test(haystack)) ?? {
      src: "/brand/logivn/01-banner-overview-hero-v2.png",
      alt: "Tổng quan LogiVN cho quán cafe, trà sữa và nhà hàng"
    }
  );
}

function relatedComparisonPages(current: ComparisonPage) {
  return getAllComparisonPages()
    .filter((page) => page.slug !== current.slug)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3);
}

function relatedIntentPages(page: ComparisonPage): SeoIntentPage[] {
  return page.relatedIntentSlugs.map((slug) => getSeoIntentPage(slug)).filter((entry): entry is SeoIntentPage => Boolean(entry));
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function buildComparisonWebPageSchema(page: ComparisonPage) {
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
        "@type": "Thing",
        name: page.competitorName,
        description: page.competitorShort
      }
    ],
    keywords: page.keywords.join(", ")
  };
}

export function generateStaticParams() {
  return getAllComparisonPages().map((page) => ({
    slug: page.slug
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getComparisonPage(slug);

  if (!page) {
    return createSeoMetadata({
      title: "Trang so sánh không tồn tại",
      description: "Trang so sánh LogiVN không tồn tại hoặc đã được di chuyển.",
      path: "/so-sanh",
      noIndex: true
    });
  }

  return createSeoMetadata({
    title: page.title,
    description: page.description,
    path: page.path
  });
}

export default async function ComparisonDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getComparisonPage(slug);

  if (!page) notFound();

  const asset = getComparisonAsset(page);
  const comparisonSiblings = relatedComparisonPages(page);
  const intents = relatedIntentPages(page);
  const relatedItems = [
    ...comparisonSiblings.map((item) => ({ name: item.h1, path: item.path, description: item.description })),
    ...intents.map((item) => ({ name: item.h1, path: item.path, description: item.description }))
  ];

  return (
    <main className="logivn-comparison-page">
      <JsonLdScript
        id="logivn-comparison-breadcrumb-jsonld"
        scriptKey={`logivn-comparison-breadcrumb-${page.slug}`}
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "So sánh", path: "/so-sanh" },
          { name: page.competitorName, path: page.path }
        ])}
      />
      <JsonLdScript id="logivn-comparison-webpage-jsonld" scriptKey={`logivn-comparison-webpage-${page.slug}`} data={buildComparisonWebPageSchema(page)} />
      <JsonLdScript id="logivn-comparison-faq-jsonld" scriptKey={`logivn-comparison-faq-${page.slug}`} data={buildFaqSchema(page.faq)} />
      <JsonLdScript
        id="logivn-comparison-related-jsonld"
        scriptKey={`logivn-comparison-related-${page.slug}`}
        data={buildItemListSchema(relatedItems)}
      />
      <style>{styles}</style>

      <header className="comparison-detail-header">
        <div className="comparison-detail-container comparison-detail-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng trang so sánh" className="comparison-detail-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/so-sanh" className="is-active">
              So sánh
            </Link>
            <Link href="/dia-phuong">Địa phương</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/blog">Blog</Link>
          </nav>
          <Link className="comparison-detail-nav-cta" href="/demo">
            Xem demo
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="comparison-detail-hero">
        <div className="comparison-detail-container comparison-detail-hero-grid">
          <div className="comparison-detail-hero-copy">
            <Link className="comparison-detail-back" href="/so-sanh">
              <ArrowLeft size={16} />
              Tất cả so sánh
            </Link>
            <span className="comparison-detail-kicker">{page.eyebrow}</span>
            <h1>{page.h1}</h1>
            <p>{page.summary}</p>
            <div className="comparison-detail-meta">
              <span>Cập nhật {formatUpdatedAt(page.updatedAt)}</span>
              <span>{page.competitorName}: {page.competitorShort}</span>
            </div>
            <div className="comparison-detail-actions">
              <Link href={page.cta.primaryPath} className="comparison-detail-button comparison-detail-button-primary">
                {page.cta.primaryLabel}
                <ArrowRight size={16} />
              </Link>
              <Link href={page.cta.secondaryPath} className="comparison-detail-button comparison-detail-button-soft">
                {page.cta.secondaryLabel}
              </Link>
            </div>
          </div>

          <figure className="comparison-detail-visual">
            <Image src={asset.src} alt={asset.alt} width={1600} height={900} priority sizes="(min-width: 1024px) 42vw, 100vw" />
            <figcaption>Đánh giá theo luồng vận hành thật: khách gọi món, nhân viên xác nhận, VietQR và chủ quán xem báo cáo.</figcaption>
          </figure>
        </div>
      </section>

      <section className="comparison-detail-answer" aria-labelledby="comparison-detail-answer-heading">
        <div className="comparison-detail-container comparison-detail-answer-grid">
          <article className="comparison-detail-answer-card">
            <Search size={20} />
            <span>Kết luận nhanh</span>
            <h2 id="comparison-detail-answer-heading">Nên chọn LogiVN hay {page.competitorName}?</h2>
            <p>{page.verdict.decisionRule}</p>
          </article>
          <div className="comparison-detail-verdict-grid">
            <article>
              <QrCode size={19} />
              <span>Khi chọn LogiVN</span>
              <p>{page.verdict.bestForLogivn}</p>
            </article>
            <article>
              <ShieldCheck size={19} />
              <span>Khi cân nhắc {page.competitorName}</span>
              <p>{page.verdict.bestForCompetitor}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="comparison-detail-proof" aria-label="Điểm khác biệt chính">
        <div className="comparison-detail-container comparison-detail-proof-grid">
          {page.proofPoints.map((point) => (
            <article key={point.label}>
              <span>{point.label}</span>
              <strong>{point.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="comparison-detail-body">
        <div className="comparison-detail-container comparison-detail-layout">
          <div className="comparison-detail-content">
            <section className="comparison-detail-matrix" aria-labelledby="comparison-detail-matrix-heading">
              <div className="comparison-detail-section-head">
                <span>Comparison matrix</span>
                <h2 id="comparison-detail-matrix-heading">Bảng so sánh LogiVN và {page.competitorName} theo tiêu chí vận hành</h2>
                <p>Ma trận này ưu tiên tiêu chí mà chủ quán có thể kiểm tra trong ca thật, không chỉ danh sách tính năng trên brochure.</p>
              </div>
              <div className="comparison-detail-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Tiêu chí</th>
                      <th scope="col">LogiVN</th>
                      <th scope="col">{page.competitorName}</th>
                      <th scope="col">Ghi chú quyết định</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.matrix.map((row) => (
                      <tr key={row.criterion}>
                        <th scope="row">{row.criterion}</th>
                        <td data-label="LogiVN">{row.logivn}</td>
                        <td data-label={page.competitorName}>{row.competitor}</td>
                        <td data-label="Ghi chú quyết định">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="comparison-detail-query-box" aria-labelledby="comparison-detail-query-heading">
              <BarChart3 size={20} />
              <div>
                <span>Truy vấn mục tiêu</span>
                <h2 id="comparison-detail-query-heading">Trang này tối ưu cho nhóm tìm kiếm có ý định mua cao</h2>
                <div className="comparison-detail-query-list">
                  {page.targetQueries.map((query) => (
                    <span key={query}>{query}</span>
                  ))}
                </div>
              </div>
            </section>

            {page.sections.map((section) => (
              <section className="comparison-detail-section" key={section.heading}>
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

            <section className="comparison-detail-faq" aria-labelledby="comparison-detail-faq-heading">
              <span>FAQ</span>
              <h2 id="comparison-detail-faq-heading">Câu hỏi thường gặp khi so sánh LogiVN và {page.competitorName}</h2>
              {page.faq.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </section>
          </div>

          <aside className="comparison-detail-sidebar">
            <div className="comparison-detail-side-card">
              <Bot size={20} />
              <span>Vận hành thông minh</span>
              <h2>LogiVN nên được thử như một lớp QR-first cho F&B Việt</h2>
              <p>Điểm mạnh nằm ở luồng order, VietQR, dashboard và insight vận hành, đặc biệt khi chủ quán muốn bắt đầu nhẹ.</p>
              <Link href="/pricing">
                Xem bảng giá
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="comparison-detail-side-card">
              <ClipboardList size={20} />
              <span>Checklist nhanh</span>
              <h2>Kiểm tra trước khi chọn</h2>
              <ul>
                <li>Khách scan QR có gọi món dễ không?</li>
                <li>Nhân viên có xác nhận đơn nhanh không?</li>
                <li>Thanh toán VietQR và báo cáo cuối ca có rõ không?</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <section className="comparison-detail-related">
        <div className="comparison-detail-container">
          <div className="comparison-detail-related-head">
            <span>Đọc tiếp</span>
            <h2>Liên kết liên quan để so sánh sâu hơn trước khi chọn gói</h2>
            <p>Nhóm liên kết này giúp chủ quán đi tiếp sang trang giải pháp hoặc các đối thủ khác trong cùng cụm so sánh.</p>
          </div>
          <div className="comparison-detail-related-grid">
            {relatedItems.slice(0, 7).map((item) => (
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

      <section className="comparison-detail-cta">
        <div className="comparison-detail-container comparison-detail-cta-shell">
          <div>
            <Sparkles size={22} />
            <span>LogiVN Pro và Premium</span>
            <h2>Biến trang so sánh thành một thử nghiệm vận hành thật trong quán.</h2>
            <p>
              Dùng Pro để kiểm chứng QR ordering và order tại bàn. Dùng Premium để mở AI, nhân sự, tồn kho và báo cáo sâu
              hơn khi quán đã có dữ liệu.
            </p>
          </div>
          <div className="comparison-detail-actions">
            <Link href="/pricing" className="comparison-detail-button comparison-detail-button-light">
              So sánh gói
            </Link>
            <Link href="/demo" className="comparison-detail-button comparison-detail-button-light">
              Xem demo
            </Link>
            <Link href="/dashboard/register?plan=pro" className="comparison-detail-button comparison-detail-button-orange">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="comparison-detail-footer">
        <div className="comparison-detail-container">
          Trang so sánh LogiVN và {page.competitorName}, cập nhật {formatUpdatedAt(page.updatedAt)} cho chủ quán cafe,
          trà sữa, quán ăn và nhà hàng Việt.
        </div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-comparison-page {
  --comparison-green: #0F4D3A;
  --comparison-deep: #092E23;
  --comparison-orange: #F28C28;
  --comparison-ivory: #FFF7EB;
  --comparison-paper: #FFFCF6;
  --comparison-line: rgba(15, 77, 58, 0.16);
  --comparison-text: #203329;
  --comparison-muted: rgba(32, 51, 41, 0.72);
  min-height: 100vh;
  color: var(--comparison-text);
  background: linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 38%, #F8FBF5 76%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-comparison-page * { box-sizing: border-box; }
.logivn-comparison-page a { color: inherit; text-decoration: none; }
.logivn-comparison-page h1,
.logivn-comparison-page h2,
.logivn-comparison-page h3,
.logivn-comparison-page p { margin: 0; }

.comparison-detail-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.comparison-detail-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.comparison-detail-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.comparison-detail-nav-links {
  display: flex;
  gap: 20px;
  color: var(--comparison-muted);
  font-size: 14px;
  font-weight: 800;
}

.comparison-detail-nav-links a,
.comparison-detail-nav-cta,
.comparison-detail-button,
.comparison-detail-side-card a,
.comparison-detail-related a,
.comparison-detail-back {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease;
}

.comparison-detail-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}

.comparison-detail-nav-links .is-active,
.comparison-detail-nav-links a:hover { color: var(--comparison-green); }

.comparison-detail-nav-cta,
.comparison-detail-button,
.comparison-detail-side-card a,
.comparison-detail-related a,
.comparison-detail-back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
}

.comparison-detail-nav-cta,
.comparison-detail-side-card a,
.comparison-detail-related a {
  padding: 0 16px;
  color: #FFF8EF;
  background: var(--comparison-green);
}

.comparison-detail-hero {
  padding: 62px 0 28px;
}

.comparison-detail-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.78fr);
  gap: 34px;
  align-items: center;
}

.comparison-detail-back,
.comparison-detail-kicker,
.comparison-detail-answer span,
.comparison-detail-verdict-grid span,
.comparison-detail-section-head span,
.comparison-detail-query-box span,
.comparison-detail-section > span,
.comparison-detail-faq > span,
.comparison-detail-side-card > span,
.comparison-detail-related-head span,
.comparison-detail-cta span {
  color: var(--comparison-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.comparison-detail-back {
  width: fit-content;
  padding: 0 12px;
  border: 1px solid rgba(15, 77, 58, 0.16);
  color: var(--comparison-green);
  background: rgba(255, 255, 255, 0.68);
  text-transform: none;
}

.comparison-detail-kicker {
  display: block;
  margin-top: 22px;
}

.comparison-detail-hero h1,
.comparison-detail-content h2,
.comparison-detail-side-card h2,
.comparison-detail-related-head h2,
.comparison-detail-related h3,
.comparison-detail-cta h2,
.comparison-detail-answer h2 {
  letter-spacing: 0;
}

.comparison-detail-hero h1 {
  max-width: 840px;
  margin-top: 14px;
  color: var(--comparison-deep);
  font-size: 66px;
  line-height: 0.98;
}

.comparison-detail-hero p,
.comparison-detail-content p,
.comparison-detail-side-card p,
.comparison-detail-related p,
.comparison-detail-cta p,
.comparison-detail-answer p,
.comparison-detail-verdict-grid p,
.comparison-detail-footer {
  color: var(--comparison-muted);
  line-height: 1.76;
  font-weight: 650;
}

.comparison-detail-hero p {
  max-width: 760px;
  margin-top: 20px;
  font-size: 17px;
}

.comparison-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.comparison-detail-meta span {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--comparison-green);
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 850;
}

.comparison-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.comparison-detail-button {
  min-height: 48px;
  padding: 0 18px;
}

.comparison-detail-button:hover,
.comparison-detail-nav-cta:hover,
.comparison-detail-side-card a:hover,
.comparison-detail-related a:hover,
.comparison-detail-back:hover {
  transform: translateY(-1px);
}

.comparison-detail-button-primary,
.comparison-detail-button-orange {
  color: #FFF8EF;
  background: var(--comparison-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.18);
}

.comparison-detail-button-soft,
.comparison-detail-button-light {
  color: var(--comparison-green);
  border: 1px solid rgba(15, 77, 58, 0.18);
  background: rgba(255, 255, 255, 0.72);
}

.comparison-detail-visual {
  margin: 0;
}

.comparison-detail-visual img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(15, 77, 58, 0.16);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.16);
}

.comparison-detail-visual figcaption {
  margin-top: 12px;
  color: var(--comparison-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.comparison-detail-answer {
  padding: 18px 0 20px;
}

.comparison-detail-answer-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(320px, 0.64fr);
  gap: 14px;
}

.comparison-detail-answer-card,
.comparison-detail-verdict-grid article,
.comparison-detail-proof-grid article,
.comparison-detail-side-card,
.comparison-detail-query-box,
.comparison-detail-matrix,
.comparison-detail-related article,
.comparison-detail-faq details {
  border: 1px solid var(--comparison-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.comparison-detail-answer-card,
.comparison-detail-verdict-grid article {
  padding: 22px;
}

.comparison-detail-answer svg,
.comparison-detail-verdict-grid svg,
.comparison-detail-side-card svg,
.comparison-detail-query-box svg {
  color: var(--comparison-orange);
}

.comparison-detail-answer span,
.comparison-detail-verdict-grid span {
  display: block;
  margin-top: 12px;
}

.comparison-detail-answer h2 {
  margin-top: 8px;
  color: var(--comparison-deep);
  font-size: 30px;
  line-height: 1.08;
}

.comparison-detail-answer p,
.comparison-detail-verdict-grid p {
  margin-top: 12px;
  font-size: 15px;
}

.comparison-detail-verdict-grid {
  display: grid;
  gap: 14px;
}

.comparison-detail-proof {
  padding: 8px 0 28px;
}

.comparison-detail-proof-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.comparison-detail-proof-grid article {
  padding: 18px;
}

.comparison-detail-proof-grid span {
  display: block;
  color: var(--comparison-orange);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.comparison-detail-proof-grid strong {
  display: block;
  margin-top: 8px;
  color: var(--comparison-deep);
  font-size: 20px;
}

.comparison-detail-body {
  padding: 34px 0 58px;
}

.comparison-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 750px) minmax(280px, 1fr);
  gap: 34px;
  align-items: start;
}

.comparison-detail-content {
  display: grid;
  gap: 26px;
}

.comparison-detail-matrix {
  padding: 22px;
}

.comparison-detail-section-head h2,
.comparison-detail-query-box h2,
.comparison-detail-section h2,
.comparison-detail-faq h2 {
  margin-top: 8px;
  color: var(--comparison-deep);
  font-size: 34px;
  line-height: 1.06;
}

.comparison-detail-section-head p {
  margin-top: 10px;
}

.comparison-detail-table-wrap {
  width: 100%;
  overflow-x: auto;
  margin-top: 20px;
  border: 1px solid rgba(15, 77, 58, 0.12);
  border-radius: 8px;
}

.comparison-detail-table-wrap table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  background: rgba(255, 252, 246, 0.72);
}

.comparison-detail-table-wrap th,
.comparison-detail-table-wrap td {
  border-bottom: 1px solid rgba(15, 77, 58, 0.12);
  padding: 16px;
  text-align: left;
  vertical-align: top;
  color: var(--comparison-text);
  font-size: 14px;
  line-height: 1.58;
}

.comparison-detail-table-wrap thead th {
  color: var(--comparison-green);
  background: rgba(15, 77, 58, 0.07);
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
}

.comparison-detail-table-wrap tbody th {
  color: var(--comparison-deep);
  font-weight: 950;
}

.comparison-detail-table-wrap tr:last-child th,
.comparison-detail-table-wrap tr:last-child td {
  border-bottom: 0;
}

.comparison-detail-query-box {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  padding: 22px;
}

.comparison-detail-query-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.comparison-detail-query-list span {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--comparison-green);
  background: rgba(255, 247, 235, 0.72);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

.comparison-detail-section {
  display: grid;
}

.comparison-detail-section p {
  margin-top: 14px;
  font-size: 16px;
}

.comparison-detail-section ul,
.comparison-detail-side-card ul {
  display: grid;
  gap: 12px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.comparison-detail-section li,
.comparison-detail-side-card li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--comparison-text);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.55;
}

.comparison-detail-section li svg {
  flex: 0 0 auto;
  margin-top: 4px;
  color: var(--comparison-green);
}

.comparison-detail-faq {
  display: grid;
  gap: 12px;
}

.comparison-detail-faq h2 {
  margin-bottom: 8px;
}

.comparison-detail-faq details {
  padding: 0 18px;
}

.comparison-detail-faq summary {
  display: flex;
  min-height: 56px;
  align-items: center;
  color: var(--comparison-deep);
  cursor: pointer;
  font-weight: 900;
}

.comparison-detail-faq p {
  padding-bottom: 18px;
  font-size: 15px;
}

.comparison-detail-sidebar {
  display: grid;
  gap: 14px;
  position: sticky;
  top: 96px;
}

.comparison-detail-side-card {
  padding: 22px;
}

.comparison-detail-side-card span {
  display: block;
  margin-top: 12px;
}

.comparison-detail-side-card h2 {
  margin-top: 10px;
  color: var(--comparison-deep);
  font-size: 28px;
  line-height: 1.04;
}

.comparison-detail-side-card p {
  margin-top: 12px;
  font-size: 14px;
}

.comparison-detail-side-card a {
  width: fit-content;
  margin-top: 18px;
}

.comparison-detail-related {
  padding: 58px 0;
  background: rgba(15, 77, 58, 0.045);
}

.comparison-detail-related-head {
  max-width: 800px;
}

.comparison-detail-related-head h2,
.comparison-detail-cta h2 {
  margin-top: 10px;
  color: var(--comparison-deep);
  font-size: 42px;
  line-height: 1.04;
}

.comparison-detail-related-head p,
.comparison-detail-cta p {
  margin-top: 14px;
  font-size: 16px;
}

.comparison-detail-related-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 26px;
}

.comparison-detail-related article {
  padding: 20px;
}

.comparison-detail-related h3 {
  color: var(--comparison-deep);
  font-size: 22px;
  line-height: 1.12;
}

.comparison-detail-related p {
  margin-top: 12px;
  font-size: 14px;
}

.comparison-detail-related a {
  width: fit-content;
  margin-top: 18px;
}

.comparison-detail-cta {
  padding: 58px 0;
}

.comparison-detail-cta-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  border-radius: 8px;
  padding: 30px;
  color: #FFF8EF;
  background: linear-gradient(135deg, #092E23, #0F4D3A);
}

.comparison-detail-cta svg {
  color: var(--comparison-orange);
}

.comparison-detail-cta h2,
.comparison-detail-cta p,
.comparison-detail-cta span {
  color: #FFF8EF;
}

.comparison-detail-cta h2 {
  max-width: 760px;
}

.comparison-detail-cta p {
  max-width: 720px;
  opacity: 0.84;
}

.comparison-detail-button-light {
  background: rgba(255, 255, 255, 0.94);
}

.comparison-detail-footer {
  padding: 28px 0 40px;
  font-size: 14px;
}

@media (max-width: 1080px) {
  .comparison-detail-hero-grid,
  .comparison-detail-answer-grid,
  .comparison-detail-layout {
    grid-template-columns: 1fr;
  }

  .comparison-detail-sidebar {
    position: static;
  }

  .comparison-detail-related-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .comparison-detail-nav-links {
    display: none;
  }

  .comparison-detail-cta-shell {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .comparison-detail-container {
    width: min(100% - 24px, 1120px);
  }

  .comparison-detail-hero {
    padding-top: 38px;
  }

  .comparison-detail-hero h1 {
    font-size: 40px;
    line-height: 1.03;
  }

  .comparison-detail-section-head h2,
  .comparison-detail-query-box h2,
  .comparison-detail-section h2,
  .comparison-detail-faq h2,
  .comparison-detail-related-head h2,
  .comparison-detail-cta h2,
  .comparison-detail-answer h2 {
    font-size: 29px;
  }

  .comparison-detail-actions,
  .comparison-detail-button {
    width: 100%;
  }

  .comparison-detail-proof-grid,
  .comparison-detail-related-grid {
    grid-template-columns: 1fr;
  }

  .comparison-detail-query-box {
    grid-template-columns: 1fr;
  }

  .comparison-detail-table-wrap table {
    min-width: 0;
  }

  .comparison-detail-table-wrap thead {
    display: none;
  }

  .comparison-detail-table-wrap tbody,
  .comparison-detail-table-wrap tr,
  .comparison-detail-table-wrap th,
  .comparison-detail-table-wrap td {
    display: block;
    width: 100%;
  }

  .comparison-detail-table-wrap tr {
    padding: 14px;
    border-bottom: 1px solid rgba(15, 77, 58, 0.12);
  }

  .comparison-detail-table-wrap tr:last-child {
    border-bottom: 0;
  }

  .comparison-detail-table-wrap th,
  .comparison-detail-table-wrap td {
    border-bottom: 0;
    padding: 6px 0;
  }

  .comparison-detail-table-wrap tbody th {
    font-size: 16px;
  }

  .comparison-detail-table-wrap td::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 3px;
    color: var(--comparison-orange);
    font-size: 11px;
    font-weight: 950;
    text-transform: uppercase;
  }
}
`;
