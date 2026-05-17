import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, ClipboardList, MapPin, QrCode, Search, Sparkles, UsersRound } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { getAllLocalSeoPages } from "@/lib/seo/local-pages";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "LogiVN theo địa phương: TP.HCM, Hà Nội, Đà Nẵng, Cần Thơ, Hải Phòng",
  description:
    "Khám phá LogiVN theo từng địa phương: QR ordering, VietQR, quản lý bàn, nhân viên, tồn kho, AI và báo cáo cho quán cafe, trà sữa, quán ăn, nhà hàng Việt.",
  path: "/dia-phuong"
});

const localPillars = [
  {
    icon: MapPin,
    label: "City intent",
    title: "Nói đúng bối cảnh vận hành từng thành phố",
    text: "Mỗi trang tập trung vào nhịp khách, mô hình quán và điểm nghẽn tại địa phương, không chỉ đổi tên tỉnh thành."
  },
  {
    icon: QrCode,
    label: "QR-first",
    title: "Bắt đầu bằng menu QR, order tại bàn và VietQR",
    text: "Đây là nhóm tính năng dễ thử, dễ đo và tạo khác biệt ngay trong ca bán cho quán nhỏ và vừa."
  },
  {
    icon: Bot,
    label: "AI-ready",
    title: "Chuẩn bị dữ liệu cho AI assistant thực dụng",
    text: "Khi order, bàn, thanh toán và báo cáo nằm cùng hệ thống, AI có nền để tóm tắt và gợi ý việc cần làm."
  },
  {
    icon: UsersRound,
    label: "F&B Việt",
    title: "Tối ưu cho đội ngũ nhân viên part-time và chủ quán bận rộn",
    text: "Luồng triển khai nhẹ giúp nhân viên dễ học, còn chủ quán nhìn được hiệu quả mà không cần dự án phần mềm nặng."
  }
];

const hubSignals = [
  ["5", "thành phố ưu tiên"],
  ["Bắc - Trung - Nam", "cụm địa phương mở rộng được"],
  ["QR + VietQR", "entry point dễ thử"],
  ["Nội dung rõ", "bối cảnh từng thành phố"]
];

const rolloutSteps = [
  {
    title: "Pilot bằng TP.HCM và Hà Nội",
    text: "Hai thị trường này có nhu cầu tìm kiếm lớn, nhiều mô hình quán và nhiều truy vấn thương mại rõ.",
    path: "/dia-phuong/tphcm"
  },
  {
    title: "Mở rộng theo bối cảnh khác biệt",
    text: "Đà Nẵng gắn với du lịch và reservation, Cần Thơ phù hợp số hóa nhẹ, Hải Phòng mạnh ở quán ăn và nhà hàng theo bàn.",
    path: "/dia-phuong/da-nang"
  },
  {
    title: "Đưa người đọc về pricing hoặc solution page",
    text: "Nội dung địa phương chỉ có giá trị khi có đường chuyển đổi rõ từ nhu cầu theo thành phố sang gói Pro, Premium hoặc trang giải pháp liên quan.",
    path: "/pricing"
  }
];

function sortedLocalPages() {
  return getAllLocalSeoPages().sort((left, right) => right.priority - left.priority);
}

export default function LocalSeoIndexPage() {
  const pages = sortedLocalPages();

  return (
    <main className="logivn-local-index">
      <JsonLdScript
        id="logivn-local-index-breadcrumb-jsonld"
        scriptKey="logivn-local-index-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Địa phương", path: "/dia-phuong" }
        ])}
      />
      <JsonLdScript
        id="logivn-local-index-itemlist-jsonld"
        scriptKey="logivn-local-index-itemlist"
        data={buildItemListSchema(pages.map((page) => ({ name: page.h1, path: page.path, description: page.description })))}
      />
      <style>{styles}</style>

      <header className="local-header">
        <div className="local-container local-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng địa phương" className="local-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/so-sanh">So sánh</Link>
            <Link href="/dia-phuong" className="is-active">
              Địa phương
            </Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Bảng giá</Link>
          </nav>
          <Link className="local-nav-cta" href="/demo">
            Xem demo
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="local-hero">
        <div className="local-container local-hero-grid">
          <div className="local-hero-copy">
            <span className="local-kicker">LogiVN theo địa phương</span>
            <h1>Trang địa phương cho chủ quán cafe, trà sữa, quán ăn và nhà hàng Việt.</h1>
            <p>
              Cụm trang địa phương giúp chủ quán đọc đúng bối cảnh vận hành tại thành phố của mình: nhịp khách, mô hình
              quán, QR ordering, VietQR, AI, nhân viên, tồn kho và bảng giá.
            </p>
            <div className="local-actions">
              <Link href="/dia-phuong/tphcm" className="local-button local-button-primary">
                Bắt đầu với TP.HCM
                <ArrowRight size={16} />
              </Link>
              <Link href="/demo" className="local-button local-button-soft">
                Xem demo vận hành
              </Link>
            </div>
          </div>

          <figure className="local-hero-visual">
            <Image
              src="/brand/logivn/01-banner-overview-hero-v2.png"
              alt="Tổng quan LogiVN cho các quán cafe, trà sữa và nhà hàng Việt theo từng địa phương"
              width={1600}
              height={900}
              priority
              sizes="(min-width: 1024px) 44vw, 100vw"
            />
            <figcaption>LogiVN tập trung vào nhu cầu vận hành thật theo từng thành phố, không phải trang đổi tên địa danh.</figcaption>
          </figure>
        </div>
      </section>

      <section className="local-signals" aria-label="Tín hiệu nội dung địa phương">
        <div className="local-container local-signal-grid">
          {hubSignals.map(([value, label]) => (
            <article key={value}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="local-section">
        <div className="local-container">
          <div className="local-section-head">
            <span className="local-kicker">City pages</span>
            <h2>Chọn địa phương để đọc theo bối cảnh vận hành của quán</h2>
            <p>
              Mỗi trang trả lời nhanh các câu hỏi chủ quán thường gặp, nối sang giải pháp liên quan và gợi ý bước thử
              nhỏ có thể đo trong một ca bán.
            </p>
          </div>

          <div className="local-card-grid">
            {pages.map((page) => (
              <article className="local-card" key={page.slug}>
                <div className="local-card-topline">
                  <span>{page.regionLabel}</span>
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
                <Link className="local-card-link" href={page.path}>
                  Mở trang {page.cityName}
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="local-section local-section-muted">
        <div className="local-container local-pillar-layout">
          <div className="local-section-head">
            <span className="local-kicker">Chiến lược địa phương</span>
            <h2>Scale địa phương nhưng vẫn giữ chất lượng nội dung</h2>
            <p>
              Mở rộng nội dung theo thành phố chỉ bền khi mỗi trang có góc nhìn riêng, đường đọc rõ và không hứa sai về
              hiện diện vật lý hay phạm vi hỗ trợ.
            </p>
          </div>
          <div className="local-pillar-grid">
            {localPillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article className="local-pillar" key={pillar.title}>
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

      <section className="local-section">
        <div className="local-container local-rollout-layout">
          <div className="local-section-head">
            <span className="local-kicker">Rollout path</span>
            <h2>Lộ trình mở rộng địa phương mà không tạo nội dung mỏng</h2>
            <p>
              Mỗi trang thành phố nên có mục tiêu chuyển đổi rõ: đưa chủ quán từ truy vấn địa phương sang pricing, signup hoặc
              trang giải pháp đúng nhu cầu.
            </p>
          </div>
          <div className="local-rollout-list">
            {rolloutSteps.map((step) => (
              <Link href={step.path} className="local-rollout-row" key={step.title}>
                <Search size={18} />
                <strong>{step.title}</strong>
                <p>{step.text}</p>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="local-cta">
        <div className="local-container local-cta-shell">
          <div>
            <Sparkles size={22} />
            <h2>Muốn biến local traffic thành tài khoản dùng thử LogiVN?</h2>
            <p>
              Dẫn người đọc từ thành phố của họ đến một phạm vi triển khai nhỏ: QR ordering, VietQR, dashboard, AI hoặc
              gói Pro/Premium phù hợp.
            </p>
          </div>
          <div className="local-actions">
            <Link href="/pricing" className="local-button local-button-light">
              Xem bảng giá
            </Link>
            <Link href="/demo" className="local-button local-button-light">
              Xem demo
            </Link>
            <Link href="/dashboard/register?plan=pro" className="local-button local-button-orange">
              Tạo quán dùng thử
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="local-footer">
        <div className="local-container">
          <ClipboardList size={16} />
          <span>LogiVN theo địa phương cho thị trường Việt Nam trước khi mở rộng Đông Nam Á.</span>
        </div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-local-index {
  --local-green: #0F4D3A;
  --local-deep: #092E23;
  --local-orange: #F28C28;
  --local-ivory: #FFF7EB;
  --local-line: rgba(15, 77, 58, 0.16);
  --local-text: #21342B;
  --local-muted: rgba(33, 52, 43, 0.72);
  min-height: 100vh;
  color: var(--local-text);
  background: linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 38%, #F8FBF5 74%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-local-index * { box-sizing: border-box; }
.logivn-local-index a { color: inherit; text-decoration: none; }
.logivn-local-index h1,
.logivn-local-index h2,
.logivn-local-index h3,
.logivn-local-index p { margin: 0; }

.local-container {
  width: min(1160px, calc(100% - 40px));
  margin: 0 auto;
}

.local-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 248, 239, 0.94);
  backdrop-filter: blur(16px);
}

.local-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.local-nav-links {
  display: flex;
  gap: 20px;
  color: var(--local-muted);
  font-size: 14px;
  font-weight: 800;
}

.local-nav-links a,
.local-nav-cta,
.local-button,
.local-card-link,
.local-rollout-row {
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, transform 180ms ease;
}

.local-nav-links a {
  display: inline-flex;
  min-width: 48px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}

.local-nav-links .is-active,
.local-nav-links a:hover { color: var(--local-green); }

.local-nav-cta,
.local-button,
.local-card-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 900;
}

.local-nav-cta {
  min-height: 44px;
  padding: 0 18px;
  color: var(--local-ivory);
  background: var(--local-green);
}

.local-hero {
  padding: 72px 0 34px;
}

.local-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.98fr) minmax(360px, 0.82fr);
  gap: 34px;
  align-items: center;
}

.local-kicker {
  color: var(--local-orange);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.local-hero h1,
.local-section-head h2,
.local-cta h2 {
  color: var(--local-deep);
  letter-spacing: 0;
}

.local-hero h1 {
  max-width: 840px;
  margin-top: 14px;
  font-size: 70px;
  line-height: 0.97;
}

.local-hero p,
.local-section-head p,
.local-card p,
.local-pillar p,
.local-rollout-row p,
.local-cta p,
.local-footer {
  color: var(--local-muted);
  line-height: 1.72;
  font-weight: 650;
}

.local-hero p {
  max-width: 760px;
  margin-top: 20px;
  font-size: 17px;
}

.local-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.local-button {
  min-height: 48px;
  padding: 0 20px;
}

.local-button:hover,
.local-nav-cta:hover,
.local-card-link:hover,
.local-rollout-row:hover {
  transform: translateY(-1px);
}

.local-button-primary,
.local-button-orange {
  color: var(--local-ivory);
  background: var(--local-orange);
  box-shadow: 0 18px 36px rgba(242, 140, 40, 0.18);
}

.local-button-soft,
.local-button-light {
  border: 1px solid var(--local-line);
  color: var(--local-green);
  background: rgba(255, 255, 255, 0.74);
}

.local-hero-visual {
  margin: 0;
}

.local-hero-visual img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid rgba(15, 77, 58, 0.16);
  border-radius: 8px;
  box-shadow: 0 24px 70px rgba(9, 46, 35, 0.16);
}

.local-hero-visual figcaption {
  margin-top: 12px;
  color: var(--local-muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
}

.local-signals {
  padding: 14px 0 30px;
}

.local-signal-grid,
.local-card-grid,
.local-pillar-grid {
  display: grid;
  gap: 14px;
}

.local-signal-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.local-signal-grid article,
.local-card,
.local-pillar,
.local-rollout-row {
  border: 1px solid var(--local-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.06);
}

.local-signal-grid article {
  padding: 18px;
}

.local-signal-grid strong {
  display: block;
  color: var(--local-deep);
  font-size: 24px;
}

.local-signal-grid span {
  display: block;
  margin-top: 6px;
  color: var(--local-muted);
  font-size: 13px;
  font-weight: 750;
}

.local-section {
  padding: 56px 0;
}

.local-section-muted {
  background: rgba(15, 77, 58, 0.045);
}

.local-section-head {
  max-width: 800px;
}

.local-section-head h2 {
  margin-top: 12px;
  font-size: 44px;
  line-height: 1.04;
}

.local-section-head p {
  margin-top: 14px;
  font-size: 16px;
}

.local-card-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 28px;
}

.local-card,
.local-pillar {
  padding: 20px;
}

.local-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--local-orange);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0;
  text-transform: uppercase;
}

.local-card-topline small {
  color: var(--local-muted);
  font-size: 12px;
  font-weight: 800;
}

.local-card h3,
.local-pillar h3 {
  margin-top: 12px;
  color: var(--local-deep);
  font-size: 25px;
  line-height: 1.12;
  letter-spacing: 0;
}

.local-card p,
.local-pillar p {
  margin-top: 12px;
  font-size: 14px;
}

.local-card ul {
  display: grid;
  gap: 9px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.local-card li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--local-green);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.5;
}

.local-card li svg {
  flex: 0 0 auto;
  margin-top: 3px;
}

.local-card-link {
  min-height: 44px;
  margin-top: 18px;
  color: var(--local-green);
}

.local-pillar-layout,
.local-rollout-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(360px, 0.86fr);
  gap: 34px;
  align-items: start;
}

.local-pillar-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.local-pillar svg {
  color: var(--local-orange);
}

.local-pillar span {
  display: block;
  margin-top: 14px;
  color: var(--local-orange);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.local-pillar h3 {
  font-size: 22px;
}

.local-rollout-list {
  display: grid;
  gap: 12px;
}

.local-rollout-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  min-height: 118px;
  padding: 18px;
}

.local-rollout-row svg {
  color: var(--local-orange);
}

.local-rollout-row > svg:last-child {
  align-self: center;
  color: var(--local-green);
}

.local-rollout-row strong {
  color: var(--local-deep);
  font-size: 22px;
  line-height: 1.14;
}

.local-rollout-row p {
  grid-column: 2 / -1;
  max-width: 560px;
  font-size: 14px;
}

.local-cta {
  padding: 58px 0;
}

.local-cta-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  border-radius: 8px;
  padding: 30px;
  color: var(--local-ivory);
  background: linear-gradient(135deg, #092E23, #0F4D3A);
}

.local-cta svg {
  color: var(--local-orange);
}

.local-cta h2 {
  max-width: 760px;
  margin-top: 12px;
  color: var(--local-ivory);
  font-size: 40px;
  line-height: 1.05;
}

.local-cta p {
  max-width: 700px;
  margin-top: 10px;
  color: rgba(255, 247, 235, 0.82);
}

.local-button-light {
  background: rgba(255, 255, 255, 0.94);
}

.local-footer {
  padding: 26px 0 34px;
  font-size: 13px;
}

.local-footer .local-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.local-footer svg {
  color: var(--local-orange);
}

@media (max-width: 1080px) {
  .local-hero-grid,
  .local-pillar-layout,
  .local-rollout-layout {
    grid-template-columns: 1fr;
  }

  .local-card-grid,
  .local-signal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .local-nav-links {
    display: none;
  }

  .local-cta-shell {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .local-container {
    width: min(100% - 24px, 520px);
  }

  .local-hero {
    padding-top: 42px;
  }

  .local-hero h1 {
    font-size: 42px;
    line-height: 1.02;
  }

  .local-section-head h2,
  .local-cta h2 {
    font-size: 31px;
  }

  .local-card-grid,
  .local-signal-grid,
  .local-pillar-grid {
    grid-template-columns: 1fr;
  }

  .local-actions,
  .local-button {
    width: 100%;
  }

  .local-button {
    min-height: 50px;
  }

  .local-rollout-row {
    grid-template-columns: auto 1fr;
  }

  .local-rollout-row > svg:last-child,
  .local-rollout-row p {
    grid-column: 1 / -1;
  }
}
`;
