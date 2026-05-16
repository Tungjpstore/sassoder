import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, ClipboardList, QrCode, Search, Sparkles, UsersRound } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getAllSeoIntentPages, type SeoIntentPage } from "@/lib/seo/intent-pages";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "Giải pháp LogiVN cho quán cafe, trà sữa và nhà hàng",
  description:
    "Khám phá giải pháp LogiVN cho QR ordering, AI assistant, quản lý bàn, nhân viên, tồn kho, VietQR, báo cáo và vận hành F&B tại Việt Nam.",
  path: "/giai-phap"
});

const prioritySlugs = [
  "quan-ly-quan-cafe",
  "phan-mem-quan-ly-nha-hang",
  "goi-mon-qr-cho-quan-cafe",
  "ai-cho-quan-cafe",
  "phan-mem-cham-cong-nha-hang",
  "quan-ly-ton-kho-nha-hang"
];

const productPillars = [
  {
    icon: QrCode,
    label: "QR ordering",
    title: "Khách scan, chọn món, gửi order đúng bàn",
    text: "Phù hợp quán muốn giảm ghi tay, giảm hỏi lại topping và nhận đơn realtime ngay trong dashboard."
  },
  {
    icon: Bot,
    label: "AI assistant",
    title: "AI đọc dữ liệu vận hành, không chỉ trả lời chung chung",
    text: "Tóm tắt doanh thu, gợi ý giờ cao điểm, combo và việc cần kiểm tra sau từng ca."
  },
  {
    icon: UsersRound,
    label: "Staff operations",
    title: "Nhân viên, ca làm và quyền thao tác rõ hơn",
    text: "Chấm công, phân quyền, dấu vết hoạt động và hiệu suất theo ca nằm cùng hệ thống order."
  },
  {
    icon: ClipboardList,
    label: "Inventory",
    title: "Tồn kho gắn với món bán, không tách khỏi menu",
    text: "Theo dõi nguyên liệu, định mức, nhập kho và cảnh báo thiếu hàng cho quán cafe, trà sữa, nhà hàng."
  }
];

const operatingSignals = [
  ["16+", "trang giải pháp và intent page"],
  ["SEO + GEO", "schema, FAQ, sitemap, llms.txt"],
  ["QR-first", "menu, order, bàn và VietQR"],
  ["AI-era", "insight vận hành từ dữ liệu thật"]
];

const decisionPaths = [
  {
    label: "Bắt đầu nhanh",
    title: "Quán cafe, trà sữa nhỏ",
    text: "Ưu tiên menu sạch, QR ordering, VietQR và báo cáo doanh thu cơ bản.",
    path: "/giai-phap/quan-ly-quan-cafe"
  },
  {
    label: "Vận hành nhiều trạng thái",
    title: "Nhà hàng phục vụ tại bàn",
    text: "Ưu tiên bàn, order realtime, bếp, thanh toán, đặt bàn và nhân viên.",
    path: "/giai-phap/phan-mem-quan-ly-nha-hang"
  },
  {
    label: "Tăng trưởng thông minh",
    title: "Quán đã có dữ liệu",
    text: "Ưu tiên AI assistant, báo cáo sâu, nhân sự, tồn kho và tối ưu giờ cao điểm.",
    path: "/giai-phap/ai-cho-quan-cafe"
  }
];

function bySlug(pages: SeoIntentPage[]) {
  return new Map(pages.map((page) => [page.slug, page]));
}

function priorityPages(pages: SeoIntentPage[]) {
  const map = bySlug(pages);
  return prioritySlugs.map((slug) => map.get(slug)).filter((page): page is SeoIntentPage => Boolean(page));
}

function sortedPages(pages: SeoIntentPage[]) {
  return [...pages].sort((left, right) => right.priority - left.priority);
}

export default function SeoIntentIndexPage() {
  const pages = sortedPages(getAllSeoIntentPages());
  const featuredPages = priorityPages(pages);

  return (
    <main className="logivn-solution-index">
      <JsonLdScript
        id="logivn-solution-index-breadcrumb-jsonld"
        scriptKey="logivn-solution-index-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Giải pháp", path: "/giai-phap" }
        ])}
      />
      <JsonLdScript
        id="logivn-solution-index-itemlist-jsonld"
        scriptKey="logivn-solution-index-itemlist"
        data={buildItemListSchema(pages.map((page) => ({ name: page.h1, path: page.path, description: page.description })))}
      />
      <style>{styles}</style>

      <header className="solution-header">
        <div className="solution-container solution-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng giải pháp" className="solution-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/giai-phap" className="is-active">
              Giải pháp
            </Link>
            <Link href="/so-sanh">So sánh</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/blog">Blog</Link>
          </nav>
          <Link className="solution-nav-cta" href="/dashboard/register?plan=premium">
            Dùng thử
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="solution-hero">
        <div className="solution-container solution-hero-grid">
          <div className="solution-hero-copy">
            <span className="solution-kicker">LogiVN solution hub</span>
            <h1>Chọn đúng giải pháp để quán gọi món nhanh hơn, phục vụ rõ hơn và tăng trưởng thông minh hơn.</h1>
            <p>
              Đây là trung tâm giải pháp cho chủ quán cafe, trà sữa và nhà hàng Việt: QR ordering, AI assistant, quản lý
              bàn, nhân viên, tồn kho, VietQR, đặt bàn và báo cáo trong cùng một hệ thống web-first.
            </p>
            <div className="solution-actions">
              <Link href="/pricing" className="solution-button solution-button-primary">
                Xem gói phù hợp
                <ArrowRight size={16} />
              </Link>
              <Link href="/giai-phap/goi-mon-qr-cho-quan-cafe" className="solution-button solution-button-soft">
                Khám phá QR ordering
              </Link>
            </div>
          </div>

          <figure className="solution-hero-visual">
            <Image
              src="/brand/logivn/02-banner-owner-dashboard.png"
              alt="Dashboard LogiVN cho chủ quán theo dõi order, doanh thu, bàn và menu"
              width={1600}
              height={900}
              priority
              sizes="(min-width: 1024px) 46vw, 100vw"
            />
            <figcaption>Dashboard vận hành cho chủ quán: order, bàn, doanh thu và menu trong một màn hình.</figcaption>
          </figure>
        </div>
      </section>

      <section className="solution-signals" aria-label="Tín hiệu sản phẩm và SEO">
        <div className="solution-container solution-signal-grid">
          {operatingSignals.map(([value, label]) => (
            <article key={value}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="solution-section">
        <div className="solution-container">
          <div className="solution-section-head">
            <span className="solution-kicker">Feature acquisition</span>
            <h2>Những trụ cột sản phẩm cần được tìm thấy trước khi chủ quán so sánh phần mềm</h2>
            <p>
              Mỗi trụ cột dưới đây nối một nhu cầu vận hành thật với một trang giải pháp có schema, FAQ, internal link và
              CTA rõ về pricing/signup.
            </p>
          </div>

          <div className="solution-pillar-grid">
            {productPillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article className="solution-pillar" key={pillar.label}>
                  <Icon size={22} />
                  <span>{pillar.label}</span>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="solution-section solution-section-muted">
        <div className="solution-container">
          <div className="solution-section-head">
            <span className="solution-kicker">Ưu tiên chuyển đổi</span>
            <h2>Các trang nên đưa vào chiến dịch SEO, AI search và ads retargeting trước</h2>
            <p>
              Đây là nhóm có ý định triển khai cao: người đọc đã có vấn đề rõ và dễ đi tiếp sang bảng giá hoặc đăng ký
              thử LogiVN.
            </p>
          </div>

          <div className="solution-priority-grid">
            {featuredPages.map((page) => (
              <article className="solution-priority-card" key={page.slug}>
                <div className="solution-card-topline">
                  <span>{page.eyebrow}</span>
                  <small>{page.updatedAt}</small>
                </div>
                <h3>
                  <Link href={page.path}>{page.h1}</Link>
                </h3>
                <p>{page.summary}</p>
                <ul>
                  {page.targetQueries.slice(0, 3).map((query) => (
                    <li key={query}>
                      <Check size={15} />
                      {query}
                    </li>
                  ))}
                </ul>
                <Link className="solution-card-link" href={page.path}>
                  Xem giải pháp
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-section">
        <div className="solution-container solution-decision-layout">
          <div className="solution-section-head">
            <span className="solution-kicker">Decision path</span>
            <h2>Đi từ bài toán vận hành đến phạm vi triển khai nhỏ nhất</h2>
            <p>
              Chủ quán không cần đọc hết mọi tính năng. Website nên giúp họ chọn hướng đi theo mô hình quán, mức độ vận
              hành và dữ liệu đang có.
            </p>
          </div>
          <div className="solution-decision-list">
            {decisionPaths.map((item) => (
              <Link href={item.path} className="solution-decision-row" key={item.title}>
                <span>{item.label}</span>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-section solution-section-muted">
        <div className="solution-container">
          <div className="solution-section-head">
            <span className="solution-kicker">Toàn bộ cụm giải pháp</span>
            <h2>Tất cả trang được sitemap, llms.txt và schema phát hiện tự động</h2>
            <p>
              Nội dung được viết theo answer-first, có truy vấn mục tiêu, FAQ, related content và CTA để phục vụ cả Google
              lẫn AI search engines.
            </p>
          </div>

          <div className="solution-grid">
            {pages.map((page) => (
              <article className="solution-card" key={page.slug}>
                <div className="solution-card-topline">
                  <span>{page.eyebrow}</span>
                  <small>{page.updatedAt}</small>
                </div>
                <h3>
                  <Link href={page.path}>{page.h1}</Link>
                </h3>
                <p>{page.description}</p>
                <div className="solution-query-row">
                  {page.targetQueries.slice(0, 2).map((query) => (
                    <span key={query}>{query}</span>
                  ))}
                </div>
                <Link className="solution-card-link" href={page.path}>
                  Mở trang
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="solution-cta">
        <div className="solution-container solution-cta-shell">
          <div>
            <Sparkles size={22} />
            <h2>Biến traffic tìm kiếm thành tài khoản dùng thử LogiVN.</h2>
            <p>
              Mỗi trang giải pháp đưa chủ quán từ một vấn đề cụ thể đến bảng giá, signup hoặc nội dung liên quan. Đó là
              đường đi ngắn hơn từ SEO sang doanh thu.
            </p>
          </div>
          <div className="solution-actions">
            <Link href="/pricing" className="solution-button solution-button-light">
              So sánh Pro và Premium
            </Link>
            <Link href="/dashboard/register?plan=premium" className="solution-button solution-button-orange">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="solution-footer">
        <div className="solution-container">
          <Search size={16} />
          <span>LogiVN solution hub, cập nhật cho QR ordering, AI, staff, inventory, VietQR và vận hành F&B Việt Nam.</span>
        </div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-solution-index {
  --solution-green: #0F4D3A;
  --solution-deep: #092E23;
  --solution-orange: #F28C28;
  --solution-ivory: #FFF7EB;
  --solution-paper: #FFFCF6;
  --solution-mint: #E6F2EA;
  --solution-line: rgba(15, 77, 58, 0.16);
  --solution-text: #21342B;
  --solution-muted: rgba(33, 52, 43, 0.72);
  min-height: 100vh;
  color: var(--solution-text);
  background: linear-gradient(180deg, #FFF8EF 0%, #FFF3E5 34%, #F8FBF5 72%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-solution-index * { box-sizing: border-box; }
.logivn-solution-index a { color: inherit; text-decoration: none; }
.logivn-solution-index h1,
.logivn-solution-index h2,
.logivn-solution-index h3,
.logivn-solution-index p { margin: 0; }

.solution-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.solution-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.solution-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.solution-nav-links {
  display: flex;
  gap: 20px;
  color: var(--solution-muted);
  font-size: 14px;
  font-weight: 800;
}

.solution-nav-links a,
.solution-nav-cta,
.solution-button,
.solution-card-link,
.solution-decision-row {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease;
}

.solution-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}

.solution-nav-links .is-active,
.solution-nav-links a:hover { color: var(--solution-green); }

.solution-nav-cta,
.solution-button,
.solution-card-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
}

.solution-nav-cta {
  min-height: 44px;
  padding: 0 18px;
  color: var(--solution-ivory);
  background: var(--solution-green);
}

.solution-hero {
  padding: 72px 0 34px;
}

.solution-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.82fr);
  gap: 34px;
  align-items: center;
}

.solution-kicker {
  color: var(--solution-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.solution-hero h1,
.solution-section-head h2,
.solution-cta h2 {
  color: var(--solution-deep);
  letter-spacing: 0;
}

.solution-hero h1 {
  max-width: 780px;
  margin-top: 14px;
  font-size: 72px;
  line-height: 0.96;
}

.solution-hero p,
.solution-section-head p,
.solution-card p,
.solution-priority-card p,
.solution-pillar p,
.solution-decision-row p,
.solution-cta p,
.solution-footer {
  color: var(--solution-muted);
  line-height: 1.72;
  font-weight: 650;
}

.solution-hero p {
  max-width: 720px;
  margin-top: 20px;
  font-size: 17px;
}

.solution-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.solution-button {
  min-height: 48px;
  padding: 0 20px;
}

.solution-button:hover,
.solution-nav-cta:hover,
.solution-card-link:hover,
.solution-decision-row:hover {
  transform: translateY(-1px);
}

.solution-button-primary,
.solution-button-orange {
  color: var(--solution-ivory);
  background: var(--solution-orange);
}

.solution-button-soft,
.solution-button-light {
  border: 1px solid var(--solution-line);
  color: var(--solution-green);
  background: rgba(255, 255, 255, 0.72);
}

.solution-hero-visual {
  margin: 0;
}

.solution-hero-visual img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(15, 77, 58, 0.16);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.16);
}

.solution-hero-visual figcaption {
  margin-top: 12px;
  color: var(--solution-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.solution-signals {
  padding: 14px 0 30px;
}

.solution-signal-grid,
.solution-pillar-grid,
.solution-priority-grid,
.solution-grid {
  display: grid;
  gap: 14px;
}

.solution-signal-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.solution-signal-grid article,
.solution-card,
.solution-priority-card,
.solution-pillar,
.solution-decision-row {
  border: 1px solid var(--solution-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.solution-signal-grid article {
  padding: 18px;
}

.solution-signal-grid strong {
  display: block;
  color: var(--solution-deep);
  font-size: 24px;
}

.solution-signal-grid span {
  display: block;
  margin-top: 6px;
  color: var(--solution-muted);
  font-size: 13px;
  font-weight: 750;
}

.solution-section {
  padding: 56px 0;
}

.solution-section-muted {
  background: rgba(15, 77, 58, 0.045);
}

.solution-section-head {
  max-width: 780px;
}

.solution-section-head h2 {
  margin-top: 12px;
  font-size: 44px;
  line-height: 1.04;
}

.solution-section-head p {
  margin-top: 14px;
  font-size: 16px;
}

.solution-pillar-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 28px;
}

.solution-pillar {
  padding: 20px;
}

.solution-pillar svg {
  color: var(--solution-orange);
}

.solution-pillar span,
.solution-card-topline,
.solution-priority-card > span {
  color: var(--solution-orange);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.solution-pillar span {
  display: block;
  margin-top: 14px;
}

.solution-pillar h3,
.solution-card h3,
.solution-priority-card h3 {
  margin-top: 12px;
  color: var(--solution-deep);
  font-size: 22px;
  line-height: 1.16;
}

.solution-pillar p,
.solution-card p,
.solution-priority-card p {
  margin-top: 12px;
  font-size: 14px;
}

.solution-priority-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
}

.solution-card,
.solution-priority-card {
  padding: 20px;
}

.solution-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.solution-card-topline small {
  color: var(--solution-muted);
  font-size: 12px;
  font-weight: 800;
}

.solution-priority-card h3 {
  font-size: 27px;
}

.solution-priority-card ul {
  display: grid;
  gap: 9px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.solution-priority-card li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--solution-green);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.5;
}

.solution-priority-card li svg {
  flex: 0 0 auto;
  margin-top: 3px;
}

.solution-card-link {
  min-height: 44px;
  margin-top: 18px;
  color: var(--solution-green);
}

.solution-decision-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(360px, 0.72fr);
  gap: 34px;
  align-items: start;
}

.solution-decision-list {
  display: grid;
  gap: 12px;
}

.solution-decision-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  min-height: 112px;
  padding: 18px 18px 18px 20px;
}

.solution-decision-row span {
  color: var(--solution-orange);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.solution-decision-row strong {
  display: block;
  margin-top: 7px;
  color: var(--solution-deep);
  font-size: 22px;
}

.solution-decision-row p {
  grid-column: 1 / -1;
  max-width: 540px;
  margin-top: 7px;
  font-size: 14px;
}

.solution-decision-row svg {
  align-self: center;
  color: var(--solution-green);
}

.solution-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 28px;
}

.solution-query-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.solution-query-row span {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  border-radius: 8px;
  padding: 0 10px;
  color: var(--solution-green);
  background: rgba(15, 77, 58, 0.08);
  font-size: 11px;
  font-weight: 850;
}

.solution-cta {
  padding: 58px 0;
}

.solution-cta-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 30px;
  border-radius: 8px;
  color: var(--solution-ivory);
  background: linear-gradient(135deg, #092E23, #0F4D3A);
}

.solution-cta svg { color: var(--solution-orange); }
.solution-cta h2 {
  max-width: 740px;
  margin-top: 12px;
  color: var(--solution-ivory);
  font-size: 40px;
  line-height: 1.05;
}
.solution-cta p {
  max-width: 700px;
  margin-top: 10px;
  color: rgba(255, 247, 235, 0.82);
}

.solution-footer {
  padding: 26px 0 34px;
  font-size: 13px;
}

.solution-footer .solution-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.solution-footer svg {
  color: var(--solution-orange);
}

@media (max-width: 1080px) {
  .solution-hero-grid,
  .solution-decision-layout {
    grid-template-columns: 1fr;
  }

  .solution-pillar-grid,
  .solution-grid,
  .solution-signal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .solution-priority-grid {
    grid-template-columns: 1fr;
  }

  .solution-nav-links {
    display: none;
  }

  .solution-cta-shell {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .solution-container {
    width: min(100% - 24px, 520px);
  }

  .solution-hero {
    padding-top: 42px;
  }

  .solution-hero h1 {
    font-size: 44px;
    line-height: 1;
  }

  .solution-section-head h2,
  .solution-cta h2 {
    font-size: 32px;
  }

  .solution-pillar-grid,
  .solution-grid,
  .solution-signal-grid {
    grid-template-columns: 1fr;
  }

  .solution-actions,
  .solution-button {
    width: 100%;
  }

  .solution-button {
    min-height: 50px;
  }
}
`;
