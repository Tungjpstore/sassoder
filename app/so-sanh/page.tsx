import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, ClipboardList, QrCode, Search, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getAllComparisonPages } from "@/lib/seo/comparison-pages";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "So sánh LogiVN với KiotViet, CukCuk, Sapo, iPOS và PosApp",
  description:
    "So sánh LogiVN với các phần mềm POS phổ biến tại Việt Nam theo QR ordering, AI vận hành, VietQR, nhân viên, tồn kho, báo cáo và chi phí triển khai.",
  path: "/so-sanh"
});

const evaluationCriteria = [
  {
    icon: QrCode,
    label: "QR-first",
    title: "Order tại bàn phải là luồng chính, không phải tính năng phụ",
    text: "Ưu tiên trải nghiệm khách scan QR, chọn món, gửi đơn đúng bàn và nhân viên xác nhận nhanh trong ca thật."
  },
  {
    icon: Bot,
    label: "AI vận hành",
    title: "AI cần đọc được dữ liệu quán và gợi ý việc cần làm",
    text: "So sánh theo use case thực tế như doanh thu, giờ cao điểm, combo, nhân sự và tồn kho thay vì chatbot chung chung."
  },
  {
    icon: ClipboardList,
    label: "Vận hành gọn",
    title: "Chọn phần mềm theo phạm vi cần triển khai trong 30 ngày",
    text: "Quán nhỏ nên bắt đầu từ menu, bàn, VietQR và báo cáo trước khi mở rộng sang module sâu hơn."
  },
  {
    icon: UsersRound,
    label: "Đội ngũ",
    title: "Nhân viên part-time phải dùng được khi quán đông",
    text: "Một hệ thống tốt cần giảm thao tác lặp lại, giữ trạng thái đơn rõ và không làm ca bán nặng hơn."
  }
];

const hubSignals = [
  ["5", "trang so sánh ưu tiên"],
  ["99K / 199K", "gói công khai dễ thử"],
  ["QR + AI", "định vị khác biệt"],
  ["F&B Việt", "ngữ cảnh vận hành nội địa"]
];

const decisionGuides = [
  {
    title: "Chọn LogiVN khi muốn modernize order trước",
    text: "Phù hợp quán cafe, trà sữa, quán ăn nhỏ và nhà hàng muốn giảm lỗi order, giảm chờ thanh toán và có dashboard rõ.",
    path: "/pricing"
  },
  {
    title: "Cân nhắc đối thủ khi cần hệ sinh thái POS rộng",
    text: "Nếu quán đã có quy trình lớn, nhiều phần cứng hoặc nhu cầu bán hàng đa kênh, hãy so sánh tổng chi phí và thời gian triển khai.",
    path: "/so-sanh/logivn-vs-kiotviet"
  },
  {
    title: "Ra quyết định bằng một ca bán thật",
    text: "Đừng chọn theo danh sách tính năng dài. Hãy kiểm tra scan QR, xác nhận đơn, VietQR, báo cáo cuối ca và thao tác của nhân viên.",
    path: "/giai-phap/qr-order-nha-hang"
  }
];

function sortedComparisonPages() {
  return getAllComparisonPages().sort((left, right) => right.priority - left.priority);
}

export default function ComparisonIndexPage() {
  const pages = sortedComparisonPages();

  return (
    <main className="logivn-comparison-index">
      <JsonLdScript
        id="logivn-comparison-index-breadcrumb-jsonld"
        scriptKey="logivn-comparison-index-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "So sánh", path: "/so-sanh" }
        ])}
      />
      <JsonLdScript
        id="logivn-comparison-index-itemlist-jsonld"
        scriptKey="logivn-comparison-index-itemlist"
        data={buildItemListSchema(pages.map((page) => ({ name: page.h1, path: page.path, description: page.description })))}
      />
      <style>{styles}</style>

      <header className="comparison-header">
        <div className="comparison-container comparison-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng so sánh" className="comparison-nav-links">
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
          <Link className="comparison-nav-cta" href="/demo">
            Xem demo
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="comparison-hero">
        <div className="comparison-container comparison-hero-grid">
          <div className="comparison-hero-copy">
            <span className="comparison-kicker">LogiVN comparison hub</span>
            <h1>So sánh LogiVN với các phần mềm POS phổ biến trước khi chọn hệ thống cho quán.</h1>
            <p>
              Cụm trang này giúp chủ quán cafe, trà sữa, quán ăn nhỏ và nhà hàng so sánh LogiVN với KiotViet, CukCuk,
              Sapo, iPOS và PosApp theo tiêu chí vận hành thật: QR ordering, AI, VietQR, nhân viên, tồn kho, báo cáo và
              chi phí bắt đầu.
            </p>
            <div className="comparison-actions">
              <Link href="/pricing" className="comparison-button comparison-button-primary">
                So sánh gói LogiVN
                <ArrowRight size={16} />
              </Link>
              <Link href="/demo" className="comparison-button comparison-button-soft">
                Xem demo trước
              </Link>
            </div>
          </div>

          <figure className="comparison-hero-visual">
            <Image
              src="/brand/logivn/02-banner-owner-dashboard.png"
              alt="Dashboard LogiVN giúp chủ quán theo dõi order, doanh thu, bàn và vận hành"
              width={1600}
              height={900}
              priority
              sizes="(min-width: 1024px) 44vw, 100vw"
            />
            <figcaption>So sánh phần mềm bằng nhịp vận hành trong ca: order, bàn, VietQR, nhân viên và báo cáo.</figcaption>
          </figure>
        </div>
      </section>

      <section className="comparison-signals" aria-label="Tín hiệu lựa chọn phần mềm">
        <div className="comparison-container comparison-signal-grid">
          {hubSignals.map(([value, label]) => (
            <article key={value}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="comparison-section">
        <div className="comparison-container">
          <div className="comparison-section-head">
            <span className="comparison-kicker">Ưu tiên đọc trước</span>
            <h2>Chọn trang so sánh theo phần mềm bạn đang cân nhắc</h2>
            <p>
              Mỗi trang trả lời trực tiếp khi nào nên chọn LogiVN, khi nào nên cân nhắc đối thủ và tiêu chí nào cần kiểm
              chứng trước khi trả tiền.
            </p>
          </div>

          <div className="comparison-card-grid">
            {pages.map((page) => (
              <article className="comparison-card" key={page.slug}>
                <div className="comparison-card-topline">
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
                <Link className="comparison-card-link" href={page.path}>
                  Mở trang so sánh
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="comparison-section comparison-section-muted">
        <div className="comparison-container comparison-evaluation-layout">
          <div className="comparison-section-head">
            <span className="comparison-kicker">Decision criteria</span>
            <h2>Đừng chọn phần mềm bằng logo quen thuộc, hãy chọn bằng điểm nghẽn của ca bán</h2>
            <p>
              LogiVN cần được so sánh như một SaaS F&B QR-first và AI-first: nhẹ để thử, rõ để vận hành, đủ mở rộng khi
              quán bắt đầu có dữ liệu.
            </p>
          </div>

          <div className="comparison-criteria-grid">
            {evaluationCriteria.map((item) => {
              const Icon = item.icon;
              return (
                <article className="comparison-criterion" key={item.title}>
                  <Icon size={22} />
                  <span>{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="comparison-section">
        <div className="comparison-container comparison-decision-layout">
          <div className="comparison-section-head">
            <span className="comparison-kicker">Cách ra quyết định</span>
            <h2>Một framework gọn cho chủ quán trước khi đăng ký dùng thử</h2>
            <p>
              Nếu phần mềm không giải quyết được luồng order, thanh toán và báo cáo trong ca thật, những module còn lại
              sẽ khó tạo cảm giác hiệu quả.
            </p>
          </div>
          <div className="comparison-decision-list">
            {decisionGuides.map((item) => (
              <Link className="comparison-decision-row" href={item.path} key={item.title}>
                <Search size={18} />
                <strong>{item.title}</strong>
                <p>{item.text}</p>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="comparison-cta">
        <div className="comparison-container comparison-cta-shell">
          <div>
            <Sparkles size={22} />
            <h2>Muốn kiểm chứng LogiVN bằng dữ liệu quán thật?</h2>
            <p>
              Bắt đầu bằng Pro nếu cần QR ordering gọn. Chọn Premium nếu muốn AI, báo cáo sâu, nhân viên, tồn kho và
              workflow vận hành nâng cao.
            </p>
          </div>
          <div className="comparison-actions">
            <Link href="/pricing" className="comparison-button comparison-button-light">
              Xem Pro và Premium
            </Link>
            <Link href="/demo" className="comparison-button comparison-button-light">
              Xem demo
            </Link>
            <Link href="/dashboard/register?plan=pro" className="comparison-button comparison-button-orange">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="comparison-footer">
        <div className="comparison-container">
          <ShieldCheck size={16} />
          <span>LogiVN comparison hub cho chủ quán Việt đang so sánh QR ordering, AI vận hành, VietQR và POS F&B.</span>
        </div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-comparison-index {
  --comparison-green: #0F4D3A;
  --comparison-deep: #092E23;
  --comparison-orange: #F28C28;
  --comparison-ivory: #FFF7EB;
  --comparison-paper: #FFFCF6;
  --comparison-line: rgba(15, 77, 58, 0.16);
  --comparison-text: #21342B;
  --comparison-muted: rgba(33, 52, 43, 0.72);
  min-height: 100vh;
  color: var(--comparison-text);
  background: linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 38%, #F7FBF5 74%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-comparison-index * { box-sizing: border-box; }
.logivn-comparison-index a { color: inherit; text-decoration: none; }
.logivn-comparison-index h1,
.logivn-comparison-index h2,
.logivn-comparison-index h3,
.logivn-comparison-index p { margin: 0; }

.comparison-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.comparison-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.comparison-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.comparison-nav-links {
  display: flex;
  gap: 20px;
  color: var(--comparison-muted);
  font-size: 14px;
  font-weight: 800;
}

.comparison-nav-links a,
.comparison-nav-cta,
.comparison-button,
.comparison-card-link,
.comparison-decision-row {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease;
}

.comparison-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}

.comparison-nav-links .is-active,
.comparison-nav-links a:hover { color: var(--comparison-green); }

.comparison-nav-cta,
.comparison-button,
.comparison-card-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
}

.comparison-nav-cta {
  min-height: 44px;
  padding: 0 18px;
  color: var(--comparison-ivory);
  background: var(--comparison-green);
}

.comparison-hero {
  padding: 72px 0 34px;
}

.comparison-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.82fr);
  gap: 34px;
  align-items: center;
}

.comparison-kicker {
  color: var(--comparison-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.comparison-hero h1,
.comparison-section-head h2,
.comparison-cta h2 {
  color: var(--comparison-deep);
  letter-spacing: 0;
}

.comparison-hero h1 {
  max-width: 840px;
  margin-top: 14px;
  font-size: 70px;
  line-height: 0.97;
}

.comparison-hero p,
.comparison-section-head p,
.comparison-card p,
.comparison-criterion p,
.comparison-decision-row p,
.comparison-cta p,
.comparison-footer {
  color: var(--comparison-muted);
  line-height: 1.72;
  font-weight: 650;
}

.comparison-hero p {
  max-width: 760px;
  margin-top: 20px;
  font-size: 17px;
}

.comparison-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.comparison-button {
  min-height: 48px;
  padding: 0 20px;
}

.comparison-button:hover,
.comparison-nav-cta:hover,
.comparison-card-link:hover,
.comparison-decision-row:hover {
  transform: translateY(-1px);
}

.comparison-button-primary,
.comparison-button-orange {
  color: var(--comparison-ivory);
  background: var(--comparison-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.18);
}

.comparison-button-soft,
.comparison-button-light {
  border: 1px solid var(--comparison-line);
  color: var(--comparison-green);
  background: rgba(255, 255, 255, 0.74);
}

.comparison-hero-visual {
  margin: 0;
}

.comparison-hero-visual img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(15, 77, 58, 0.16);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.16);
}

.comparison-hero-visual figcaption {
  margin-top: 12px;
  color: var(--comparison-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.comparison-signals {
  padding: 14px 0 30px;
}

.comparison-signal-grid,
.comparison-card-grid,
.comparison-criteria-grid {
  display: grid;
  gap: 14px;
}

.comparison-signal-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.comparison-signal-grid article,
.comparison-card,
.comparison-criterion,
.comparison-decision-row {
  border: 1px solid var(--comparison-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.comparison-signal-grid article {
  padding: 18px;
}

.comparison-signal-grid strong {
  display: block;
  color: var(--comparison-deep);
  font-size: 24px;
}

.comparison-signal-grid span {
  display: block;
  margin-top: 6px;
  color: var(--comparison-muted);
  font-size: 13px;
  font-weight: 750;
}

.comparison-section {
  padding: 56px 0;
}

.comparison-section-muted {
  background: rgba(15, 77, 58, 0.045);
}

.comparison-section-head {
  max-width: 800px;
}

.comparison-section-head h2 {
  margin-top: 12px;
  font-size: 44px;
  line-height: 1.04;
}

.comparison-section-head p {
  margin-top: 14px;
  font-size: 16px;
}

.comparison-card-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
}

.comparison-card,
.comparison-criterion {
  padding: 20px;
}

.comparison-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--comparison-orange);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.comparison-card-topline small {
  color: var(--comparison-muted);
  font-size: 12px;
  font-weight: 800;
}

.comparison-card h3,
.comparison-criterion h3 {
  margin-top: 12px;
  color: var(--comparison-deep);
  font-size: 25px;
  line-height: 1.12;
  letter-spacing: 0;
}

.comparison-card p,
.comparison-criterion p {
  margin-top: 12px;
  font-size: 14px;
}

.comparison-card ul {
  display: grid;
  gap: 9px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.comparison-card li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--comparison-green);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.5;
}

.comparison-card li svg {
  flex: 0 0 auto;
  margin-top: 3px;
}

.comparison-card-link {
  min-height: 44px;
  margin-top: 18px;
  color: var(--comparison-green);
}

.comparison-evaluation-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(360px, 0.86fr);
  gap: 34px;
  align-items: start;
}

.comparison-criteria-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.comparison-criterion svg {
  color: var(--comparison-orange);
}

.comparison-criterion span {
  display: block;
  margin-top: 14px;
  color: var(--comparison-orange);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.comparison-criterion h3 {
  font-size: 22px;
}

.comparison-decision-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(360px, 0.72fr);
  gap: 34px;
  align-items: start;
}

.comparison-decision-list {
  display: grid;
  gap: 12px;
}

.comparison-decision-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  min-height: 118px;
  padding: 18px;
}

.comparison-decision-row svg {
  color: var(--comparison-orange);
}

.comparison-decision-row > svg:last-child {
  align-self: center;
  color: var(--comparison-green);
}

.comparison-decision-row strong {
  color: var(--comparison-deep);
  font-size: 22px;
  line-height: 1.14;
}

.comparison-decision-row p {
  grid-column: 2 / -1;
  max-width: 560px;
  font-size: 14px;
}

.comparison-cta {
  padding: 58px 0;
}

.comparison-cta-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  border-radius: 8px;
  padding: 30px;
  color: var(--comparison-ivory);
  background: linear-gradient(135deg, #092E23, #0F4D3A);
}

.comparison-cta svg {
  color: var(--comparison-orange);
}

.comparison-cta h2 {
  max-width: 760px;
  margin-top: 12px;
  color: var(--comparison-ivory);
  font-size: 40px;
  line-height: 1.05;
}

.comparison-cta p {
  max-width: 700px;
  margin-top: 10px;
  color: rgba(255, 247, 235, 0.82);
}

.comparison-button-light {
  background: rgba(255, 255, 255, 0.94);
}

.comparison-footer {
  padding: 26px 0 34px;
  font-size: 13px;
}

.comparison-footer .comparison-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.comparison-footer svg {
  color: var(--comparison-orange);
}

@media (max-width: 1080px) {
  .comparison-hero-grid,
  .comparison-evaluation-layout,
  .comparison-decision-layout {
    grid-template-columns: 1fr;
  }

  .comparison-card-grid,
  .comparison-signal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .comparison-nav-links {
    display: none;
  }

  .comparison-cta-shell {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .comparison-container {
    width: min(100% - 24px, 520px);
  }

  .comparison-hero {
    padding-top: 42px;
  }

  .comparison-hero h1 {
    font-size: 42px;
    line-height: 1.02;
  }

  .comparison-section-head h2,
  .comparison-cta h2 {
    font-size: 31px;
  }

  .comparison-card-grid,
  .comparison-signal-grid,
  .comparison-criteria-grid {
    grid-template-columns: 1fr;
  }

  .comparison-actions,
  .comparison-button {
    width: 100%;
  }

  .comparison-button {
    min-height: 50px;
  }

  .comparison-decision-row {
    grid-template-columns: auto 1fr;
  }

  .comparison-decision-row > svg:last-child,
  .comparison-decision-row p {
    grid-column: 1 / -1;
  }
}
`;
