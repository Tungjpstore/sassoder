import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, Check, ClipboardCheck, Search, ShieldCheck, Sparkles } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getBlogPath, getBlogPost, getBlogTopicHub, getBlogTopicHubPath, type BlogPost, type BlogTopicHub } from "@/lib/seo/blog";
import { getAllSeoIntentPages, getSeoIntentPage, type SeoIntentPage } from "@/lib/seo/intent-pages";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildFaqSchema, buildIntentLandingSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;
export const dynamicParams = false;

type VisualAsset = {
  src: string;
  alt: string;
};

const featureAssets: Array<{ test: RegExp; asset: VisualAsset }> = [
  {
    test: /(qr|menu|order|ban|bàn)/i,
    asset: {
      src: "/brand/logivn/03-banner-customer-qr-ordering.png",
      alt: "Khách dùng điện thoại quét QR để gọi món với LogiVN"
    }
  },
  {
    test: /(vietqr|thanh-toan|thanh toán|payment|coc|cọc)/i,
    asset: {
      src: "/brand/logivn/04-banner-payment-service.png",
      alt: "Thanh toán VietQR và dịch vụ tại bàn trong LogiVN"
    }
  },
  {
    test: /(cham-cong|chấm công|nhan-vien|nhân viên|staff)/i,
    asset: {
      src: "/brand/logivn/staff-operations-illustration.png",
      alt: "Quản lý nhân viên, ca làm và vận hành staff trong LogiVN"
    }
  },
  {
    test: /(ai|bao-cao|báo cáo|ton-kho|tồn kho|inventory|dashboard)/i,
    asset: {
      src: "/brand/logivn/02-banner-owner-dashboard.png",
      alt: "Dashboard chủ quán LogiVN theo dõi order, doanh thu và vận hành"
    }
  }
];

function getVisualAsset(page: SeoIntentPage): VisualAsset {
  const haystack = `${page.slug} ${page.title} ${page.h1} ${page.keywords.join(" ")}`;
  return (
    featureAssets.find((entry) => entry.test.test(haystack))?.asset ?? {
      src: "/brand/logivn/01-banner-overview-hero-v2.png",
      alt: "Tổng quan LogiVN cho quán cafe, trà sữa và nhà hàng"
    }
  );
}

function relatedIntentPages(current: SeoIntentPage) {
  return getAllSeoIntentPages()
    .filter((page) => page.slug !== current.slug)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 4);
}

export function generateStaticParams() {
  return getAllSeoIntentPages().map((page) => ({
    slug: page.slug
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getSeoIntentPage(slug);

  if (!page) {
    return createSeoMetadata({
      title: "Trang giải pháp không tồn tại",
      description: "Trang giải pháp LogiVN không tồn tại hoặc đã được di chuyển.",
      path: "/",
      noIndex: true
    });
  }

  return createSeoMetadata({
    title: page.title,
    description: page.description,
    path: page.path
  });
}

export default async function SeoIntentLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getSeoIntentPage(slug);

  if (!page) notFound();

  const asset = getVisualAsset(page);
  const siblingPages = relatedIntentPages(page);
  const relatedPosts = page.relatedBlogSlugs.map((relatedSlug) => getBlogPost(relatedSlug)).filter((post): post is BlogPost => Boolean(post));
  const relatedHubs = page.relatedHubSlugs.map((relatedSlug) => getBlogTopicHub(relatedSlug)).filter((hub): hub is BlogTopicHub => Boolean(hub));
  const relatedItems = [
    ...siblingPages.map((intentPage) => ({ name: intentPage.h1, path: intentPage.path, description: intentPage.description })),
    ...relatedHubs.map((hub) => ({ name: hub.title, path: getBlogTopicHubPath(hub.slug), description: hub.description })),
    ...relatedPosts.map((post) => ({ name: post.title, path: getBlogPath(post.slug), description: post.description }))
  ];

  return (
    <main className="logivn-intent-page">
      <JsonLdScript
        id="logivn-intent-breadcrumb-jsonld"
        scriptKey={`logivn-intent-breadcrumb-${page.slug}`}
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Giải pháp", path: "/giai-phap" },
          { name: page.eyebrow, path: page.path }
        ])}
      />
      <JsonLdScript id="logivn-intent-service-jsonld" scriptKey={`logivn-intent-service-${page.slug}`} data={buildIntentLandingSchema(page)} />
      <JsonLdScript id="logivn-intent-faq-jsonld" scriptKey={`logivn-intent-faq-${page.slug}`} data={buildFaqSchema(page.faq)} />
      <JsonLdScript
        id="logivn-intent-related-jsonld"
        scriptKey={`logivn-intent-related-${page.slug}`}
        data={buildItemListSchema(relatedItems)}
      />
      <style>{styles}</style>

      <header className="intent-header">
        <div className="intent-container intent-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng trang giải pháp" className="intent-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/so-sanh">So sánh</Link>
            <Link href="/dia-phuong">Địa phương</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/blog">Blog</Link>
          </nav>
          <Link className="intent-nav-cta" href="/demo">
            Xem demo
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="intent-hero">
        <div className="intent-container intent-hero-grid">
          <div className="intent-hero-copy">
            <Link className="intent-back" href="/giai-phap">
              <ArrowLeft size={16} />
              Tất cả giải pháp
            </Link>
            <span className="intent-kicker">{page.eyebrow}</span>
            <h1>{page.h1}</h1>
            <p>{page.summary}</p>
            <div className="intent-actions">
              <Link href={page.cta.primaryPath} className="intent-button intent-button-primary">
                {page.cta.primaryLabel}
                <ArrowRight size={16} />
              </Link>
              <Link href="/demo" className="intent-button intent-button-soft">
                Xem demo
              </Link>
            </div>
          </div>

          <figure className="intent-visual">
            <Image src={asset.src} alt={asset.alt} width={1600} height={900} priority sizes="(min-width: 1024px) 42vw, 100vw" />
            <figcaption>{page.sketch.caption}</figcaption>
          </figure>
        </div>
      </section>

      <section className="intent-answer" aria-labelledby="intent-answer-heading">
        <div className="intent-container intent-answer-grid">
          <article>
            <Search size={20} />
            <span>Tóm tắt nhanh</span>
            <h2 id="intent-answer-heading">{page.title}</h2>
            <p>{page.description}</p>
          </article>
          <div className="intent-proof-grid">
            {page.proofPoints.map((point) => (
              <article key={point.label}>
                <span>{point.label}</span>
                <strong>{point.value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="intent-body-section">
        <div className="intent-container intent-layout">
          <div className="intent-content">
            <section className="intent-workflow" aria-labelledby="intent-workflow-heading">
              <div className="intent-section-head">
                <span>Workflow</span>
                <h2 id="intent-workflow-heading">{page.sketch.title}</h2>
                <p>{page.sketch.caption}</p>
              </div>
              <div className="intent-step-grid">
                {page.sketch.labels.map((label, index) => (
                  <article key={label}>
                    <small>0{index + 1}</small>
                    <strong>{label}</strong>
                    <p>{page.takeaways[index] ?? page.takeaways[0]}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="intent-query-box" aria-labelledby="intent-query-heading">
              <BarChart3 size={20} />
              <div>
                <span>Truy vấn mục tiêu</span>
                <h2 id="intent-query-heading">Tối ưu cho nhóm tìm kiếm có ý định triển khai</h2>
                <div className="intent-query-list">
                  {page.targetQueries.map((query) => (
                    <span key={query}>{query}</span>
                  ))}
                </div>
              </div>
            </section>

            {page.sections.map((section) => (
              <section className="intent-section" key={section.heading}>
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

            <section className="intent-faq" aria-labelledby="intent-faq-heading">
              <span>FAQ</span>
              <h2 id="intent-faq-heading">Câu hỏi thường gặp trước khi triển khai</h2>
              {page.faq.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </section>
          </div>

          <aside className="intent-sidebar">
            <div className="intent-side-card">
              <ClipboardCheck size={20} />
              <span>Bước tiếp theo</span>
              <h2>Chọn phạm vi thử nhỏ, dễ đo</h2>
              <p>So sánh gói LogiVN và bắt đầu bằng một luồng có tác động rõ: QR, AI, staff, inventory, VietQR hoặc báo cáo.</p>
              <Link href="/pricing">
                Xem bảng giá
                <ArrowRight size={16} />
              </Link>
            </div>

            <div className="intent-side-card">
              <ShieldCheck size={20} />
              <span>Nội dung dễ tham khảo</span>
              <h2>Đọc nhanh nhưng vẫn đủ ngữ cảnh triển khai</h2>
              <p>Có tóm tắt đầu trang, câu hỏi thường gặp, mô tả dịch vụ rõ và liên kết liên quan theo từng cụm nhu cầu.</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="intent-related">
        <div className="intent-container">
          <div className="intent-related-head">
            <span>Đọc tiếp</span>
            <h2>Đọc tiếp theo cụm chủ đề để hiểu LogiVN sâu hơn</h2>
            <p>
              Những liên kết này nối trang giải pháp với tính năng, blog, nhóm bài viết và bảng giá để chủ quán đi tiếp
              theo đúng nhu cầu đang cân nhắc.
            </p>
          </div>
          <div className="intent-related-grid">
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

      <section className="intent-cta">
        <div className="intent-container intent-cta-shell">
          <div>
            <Sparkles size={22} />
            <span>LogiVN Premium</span>
            <h2>Muốn biến nhu cầu này thành luồng vận hành thật trong quán?</h2>
            <p>
              Bắt đầu bằng Pro nếu cần QR ordering gọn. Chọn Premium nếu muốn mở AI, báo cáo sâu, nhân sự, tồn kho và các
              workflow vận hành nâng cao.
            </p>
          </div>
          <div className="intent-actions">
            <Link href="/pricing" className="intent-button intent-button-light">
              So sánh gói
            </Link>
            <Link href="/waitlist" className="intent-button intent-button-light">
              Pilot có hướng dẫn
            </Link>
            <Link href="/pricing" className="intent-button intent-button-orange">
              Chọn gói phù hợp
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="intent-footer">
        <div className="intent-container">
          Trang giải pháp LogiVN, cập nhật {page.updatedAt}. Nội dung phục vụ quyết định triển khai thực tế cho quán cafe,
          trà sữa, quán ăn và nhà hàng Việt.
        </div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-intent-page {
  --intent-green: #0F4D3A;
  --intent-green-strong: #092E23;
  --intent-orange: #F28C28;
  --intent-ivory: #FFF7EB;
  --intent-paper: #FFFCF6;
  --intent-line: rgba(15, 77, 58, 0.16);
  --intent-text: #203329;
  --intent-muted: rgba(32, 51, 41, 0.72);
  min-height: 100vh;
  color: var(--intent-text);
  background: linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 38%, #F8FBF5 76%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-intent-page * { box-sizing: border-box; }
.logivn-intent-page a { color: inherit; text-decoration: none; }
.logivn-intent-page h1,
.logivn-intent-page h2,
.logivn-intent-page h3,
.logivn-intent-page p { margin: 0; }

.intent-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.intent-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.intent-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.intent-nav-links {
  display: flex;
  gap: 20px;
  color: var(--intent-muted);
  font-size: 14px;
  font-weight: 800;
}

.intent-nav-links a,
.intent-nav-cta,
.intent-button,
.intent-side-card a,
.intent-related a,
.intent-back {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease;
}

.intent-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}

.intent-nav-links a:hover { color: var(--intent-green); }

.intent-nav-cta,
.intent-button,
.intent-side-card a,
.intent-related a,
.intent-back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
}

.intent-nav-cta,
.intent-side-card a,
.intent-related a {
  padding: 0 16px;
  color: #FFF8EF;
  background: var(--intent-green);
}

.intent-hero {
  padding: 62px 0 28px;
}

.intent-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.78fr);
  gap: 34px;
  align-items: center;
}

.intent-back,
.intent-kicker,
.intent-answer span,
.intent-query-box span,
.intent-section > span,
.intent-section-head span,
.intent-faq > span,
.intent-side-card > span,
.intent-related-head span,
.intent-cta span {
  color: var(--intent-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.intent-back {
  width: fit-content;
  padding: 0 12px;
  border: 1px solid rgba(15, 77, 58, 0.16);
  color: var(--intent-green);
  background: rgba(255, 255, 255, 0.68);
  text-transform: none;
}

.intent-kicker {
  display: block;
  margin-top: 22px;
}

.intent-hero h1,
.intent-content h2,
.intent-side-card h2,
.intent-related-head h2,
.intent-related h3,
.intent-cta h2,
.intent-answer h2 {
  letter-spacing: 0;
}

.intent-hero h1 {
  max-width: 840px;
  margin-top: 14px;
  color: var(--intent-green-strong);
  font-size: 68px;
  line-height: 0.98;
}

.intent-hero p,
.intent-content p,
.intent-side-card p,
.intent-related p,
.intent-cta p,
.intent-answer p,
.intent-footer {
  color: var(--intent-muted);
  line-height: 1.76;
  font-weight: 650;
}

.intent-hero p {
  max-width: 760px;
  margin-top: 20px;
  font-size: 17px;
}

.intent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.intent-button {
  min-height: 48px;
  padding: 0 18px;
}

.intent-button:hover,
.intent-nav-cta:hover,
.intent-side-card a:hover,
.intent-related a:hover,
.intent-back:hover {
  transform: translateY(-1px);
}

.intent-button-primary,
.intent-button-orange {
  color: #FFF8EF;
  background: var(--intent-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.18);
}

.intent-button-soft,
.intent-button-light {
  color: var(--intent-green);
  border: 1px solid rgba(15, 77, 58, 0.18);
  background: rgba(255, 255, 255, 0.72);
}

.intent-visual {
  margin: 0;
}

.intent-visual img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(15, 77, 58, 0.16);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.16);
}

.intent-visual figcaption {
  margin-top: 12px;
  color: var(--intent-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.intent-answer {
  padding: 18px 0 28px;
}

.intent-answer-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(320px, 0.64fr);
  gap: 14px;
}

.intent-answer article,
.intent-proof-grid article,
.intent-side-card,
.intent-query-box,
.intent-workflow,
.intent-related article,
.intent-faq details {
  border: 1px solid var(--intent-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.intent-answer article {
  padding: 22px;
}

.intent-answer svg,
.intent-side-card svg,
.intent-query-box svg {
  color: var(--intent-orange);
}

.intent-answer span {
  display: block;
  margin-top: 12px;
}

.intent-answer h2 {
  margin-top: 8px;
  color: var(--intent-green-strong);
  font-size: 30px;
  line-height: 1.08;
}

.intent-answer p {
  margin-top: 12px;
  font-size: 15px;
}

.intent-proof-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.intent-proof-grid article {
  padding: 18px;
}

.intent-proof-grid span {
  display: block;
  margin: 0;
  color: var(--intent-orange);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.intent-proof-grid strong {
  display: block;
  margin-top: 8px;
  color: var(--intent-green-strong);
  font-size: 20px;
}

.intent-body-section {
  padding: 34px 0 58px;
}

.intent-layout {
  display: grid;
  grid-template-columns: minmax(0, 750px) minmax(280px, 1fr);
  gap: 34px;
  align-items: start;
}

.intent-content {
  display: grid;
  gap: 26px;
}

.intent-workflow {
  padding: 22px;
}

.intent-section-head h2,
.intent-query-box h2,
.intent-section h2,
.intent-faq h2 {
  margin-top: 8px;
  color: var(--intent-green-strong);
  font-size: 34px;
  line-height: 1.06;
}

.intent-section-head p {
  margin-top: 10px;
}

.intent-step-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.intent-step-grid article {
  min-height: 160px;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  padding: 16px;
  background: rgba(255, 247, 235, 0.64);
}

.intent-step-grid small {
  color: var(--intent-orange);
  font-size: 12px;
  font-weight: 950;
}

.intent-step-grid strong {
  display: block;
  margin-top: 10px;
  color: var(--intent-green-strong);
  font-size: 20px;
}

.intent-step-grid p {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.58;
}

.intent-query-box {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  padding: 22px;
}

.intent-query-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.intent-query-list span {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 8px;
  padding: 0 12px;
  color: var(--intent-green);
  background: rgba(255, 247, 235, 0.72);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}

.intent-section {
  display: grid;
}

.intent-section p {
  margin-top: 14px;
  font-size: 16px;
}

.intent-section ul {
  display: grid;
  gap: 12px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}

.intent-section li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  color: var(--intent-text);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.55;
}

.intent-section li svg {
  flex: 0 0 auto;
  margin-top: 4px;
  color: var(--intent-green);
}

.intent-faq {
  display: grid;
  gap: 12px;
}

.intent-faq h2 {
  margin-bottom: 8px;
}

.intent-faq details {
  padding: 0 18px;
}

.intent-faq summary {
  display: flex;
  min-height: 56px;
  align-items: center;
  color: var(--intent-green-strong);
  cursor: pointer;
  font-weight: 900;
}

.intent-faq p {
  padding-bottom: 18px;
  font-size: 15px;
}

.intent-sidebar {
  display: grid;
  gap: 14px;
  position: sticky;
  top: 96px;
}

.intent-side-card {
  padding: 22px;
}

.intent-side-card span {
  display: block;
  margin-top: 12px;
}

.intent-side-card h2 {
  margin-top: 10px;
  color: var(--intent-green-strong);
  font-size: 28px;
  line-height: 1.04;
}

.intent-side-card p {
  margin-top: 12px;
  font-size: 14px;
}

.intent-side-card a {
  width: fit-content;
  margin-top: 18px;
}

.intent-related {
  padding: 58px 0;
  background: rgba(15, 77, 58, 0.045);
}

.intent-related-head {
  max-width: 800px;
}

.intent-related-head h2,
.intent-cta h2 {
  margin-top: 10px;
  color: var(--intent-green-strong);
  font-size: 42px;
  line-height: 1.04;
}

.intent-related-head p,
.intent-cta p {
  margin-top: 14px;
  font-size: 16px;
}

.intent-related-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 26px;
}

.intent-related article {
  padding: 20px;
}

.intent-related h3 {
  color: var(--intent-green-strong);
  font-size: 22px;
  line-height: 1.12;
}

.intent-related p {
  margin-top: 12px;
  font-size: 14px;
}

.intent-related a {
  width: fit-content;
  margin-top: 18px;
}

.intent-cta {
  padding: 58px 0;
}

.intent-cta-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  border-radius: 8px;
  padding: 30px;
  color: #FFF8EF;
  background: linear-gradient(135deg, #092E23, #0F4D3A);
}

.intent-cta svg {
  color: var(--intent-orange);
}

.intent-cta h2,
.intent-cta p,
.intent-cta span {
  color: #FFF8EF;
}

.intent-cta h2 {
  max-width: 760px;
}

.intent-cta p {
  max-width: 720px;
  opacity: 0.84;
}

.intent-button-light {
  background: rgba(255, 255, 255, 0.94);
}

.intent-footer {
  padding: 28px 0 40px;
  font-size: 14px;
}

@media (max-width: 1080px) {
  .intent-hero-grid,
  .intent-answer-grid,
  .intent-layout {
    grid-template-columns: 1fr;
  }

  .intent-sidebar {
    position: static;
  }

  .intent-step-grid,
  .intent-related-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .intent-nav-links {
    display: none;
  }

  .intent-cta-shell {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .intent-container {
    width: min(100% - 24px, 1120px);
  }

  .intent-hero {
    padding-top: 38px;
  }

  .intent-hero h1 {
    font-size: 42px;
    line-height: 1.02;
  }

  .intent-section-head h2,
  .intent-query-box h2,
  .intent-section h2,
  .intent-faq h2,
  .intent-related-head h2,
  .intent-cta h2,
  .intent-answer h2 {
    font-size: 30px;
  }

  .intent-actions,
  .intent-button {
    width: 100%;
  }

  .intent-step-grid,
  .intent-related-grid {
    grid-template-columns: 1fr;
  }

  .intent-query-box {
    grid-template-columns: 1fr;
  }
}
`;
