import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bell, CheckCircle2, Download, Home, MonitorPlay, ShieldCheck, Share2, Smartphone } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { InstallActionPanel } from "@/components/download/install-action-panel";
import {
  INSTALL_PLATFORM_GUIDES,
  INSTALL_PLATFORM_SLUGS,
  type InstallPlatformSlug,
  getInstallPlatformGuide
} from "@/lib/pwa/install-platform";

const genericInstallSteps = [
  "Mở trang này trên thiết bị bạn muốn cài LogiVN.",
  "Dùng nút cài nếu trình duyệt hiển thị prompt tự động.",
  "Nếu không thấy nút, chọn đúng nền tảng bên dưới và làm theo hướng dẫn thủ công.",
  "Mở LogiVN từ biểu tượng mới để dùng như một ứng dụng riêng."
];

const benefits: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Bell,
    title: "Nhận tín hiệu vận hành nhanh hơn",
    text: "Đơn mới, bàn, thanh toán và việc cần xử lý nằm trong một cửa sổ app riêng khi ca bán đang chạy."
  },
  {
    icon: Home,
    title: "Mở bằng một chạm",
    text: "Chủ quán và nhân viên không cần tìm lại tab trình duyệt giữa giờ cao điểm."
  },
  {
    icon: ShieldCheck,
    title: "An toàn theo chính sách PWA hiện tại",
    text: "Dashboard, auth, payment, order và API nhạy cảm vẫn không bị đưa vào cache offline."
  }
];

const platformVisuals: Record<InstallPlatformSlug, { icon: LucideIcon; detail: string }> = {
  android: { icon: Smartphone, detail: "Chrome hoặc Edge trên điện thoại Android" },
  ios: { icon: Share2, detail: "Safari, Share, Add to Home Screen" },
  windows: { icon: MonitorPlay, detail: "Chrome hoặc Edge trên máy Windows" },
  mac: { icon: MonitorPlay, detail: "Chrome, Edge hoặc Safari Add to Dock" }
};

type DownloadCenterProps = {
  selectedPlatform?: InstallPlatformSlug;
};

export function DownloadCenter({ selectedPlatform }: DownloadCenterProps) {
  const guide = selectedPlatform ? getInstallPlatformGuide(selectedPlatform) : null;
  const steps = guide?.steps ?? genericInstallSteps;

  return (
    <main className="logivn-download-page">
      <style>{styles}</style>
      <header className="download-header">
        <div className="download-container download-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav className="download-nav-links" aria-label="Điều hướng tải ứng dụng">
            <Link href="/">Trang chủ</Link>
            <Link href="/download" className="is-active">
              Tải ứng dụng
            </Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/dashboard/login?source=download_nav">Đăng nhập</Link>
          </nav>
        </div>
      </header>

      <section className="download-workspace" aria-labelledby="download-title">
        <div className="download-container">
          <div className="download-title-row">
            <div>
              <span className="download-kicker">LogiVN PWA</span>
              <h1 id="download-title">Tải ứng dụng LogiVN</h1>
              <p>Biến LogiVN thành ứng dụng trên điện thoại, máy tính bảng và máy tính của bạn chỉ trong vài giây.</p>
            </div>
            <Link className="download-top-action" href="/dashboard/login?source=download_cta">
              Mở dashboard
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="download-main-grid">
            <InstallActionPanel selectedPlatform={selectedPlatform} />

            <section className="download-guide-panel" id="install-steps" aria-labelledby="install-steps-title">
              <span className="download-panel-label">
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>{guide?.eyebrow ?? "Tự phát hiện thiết bị"}</span>
              </span>
              <h2 id="install-steps-title">{guide?.title ?? "Cài LogiVN theo thiết bị của bạn"}</h2>
              <p>{guide?.summary ?? "Trang này tự phát hiện thiết bị khi có thể, đồng thời luôn giữ bộ chọn thủ công nếu trình duyệt nhận diện sai."}</p>
              <ol className="download-step-list">
                {steps.map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              <div className="download-caveat">
                <ShieldCheck size={16} aria-hidden="true" />
                <p>{guide?.caveat ?? "LogiVN chỉ dùng prompt thật từ trình duyệt. Khi prompt chưa có, bạn vẫn có hướng dẫn thủ công cho từng nền tảng."}</p>
              </div>
            </section>

            <section className="download-platform-panel" aria-labelledby="manual-platform-title">
              <div className="download-section-head">
                <span className="download-panel-label">
                  <Download size={17} aria-hidden="true" />
                  <span>Chọn thủ công</span>
                </span>
                <h2 id="manual-platform-title">Nếu nhận diện sai, chọn đúng nền tảng</h2>
              </div>
              <div className="download-platform-grid">
                {INSTALL_PLATFORM_SLUGS.map((platform) => {
                  const platformGuide = INSTALL_PLATFORM_GUIDES[platform];
                  const visual = platformVisuals[platform];
                  const Icon = visual.icon;

                  return (
                    <Link className={`download-platform-link ${selectedPlatform === platform ? "is-active" : ""}`} href={platformGuide.path} key={platform}>
                      <Icon size={20} aria-hidden="true" />
                      <span>{platformGuide.label}</span>
                      <small>{visual.detail}</small>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="download-preview-panel" aria-labelledby="preview-title">
              <div className="download-preview-image">
                <Image
                  src="/brand/logivn/02-banner-owner-dashboard.png"
                  alt="Dashboard LogiVN sau khi cài như ứng dụng"
                  fill
                  sizes="(max-width: 900px) 100vw, 42vw"
                  priority
                />
              </div>
              <div className="download-preview-copy">
                <span className="download-kicker">Trải nghiệm như app</span>
                <h2 id="preview-title">Dashboard riêng cho ca vận hành</h2>
                <p>Cài PWA giúp LogiVN tách khỏi các tab khác, thuận tiện cho tablet quầy, laptop quản lý và điện thoại nhân viên.</p>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="download-benefits" aria-labelledby="download-benefits-title">
        <div className="download-container">
          <div className="download-section-head download-section-head-wide">
            <span className="download-kicker">Lợi ích chính</span>
            <h2 id="download-benefits-title">Ứng dụng PWA cho đúng nhịp vận hành quán</h2>
            <p>LogiVN vẫn là web-first, nhưng khi được cài vào thiết bị, các thao tác thường ngày trở nên gần hơn với một ứng dụng native.</p>
          </div>
          <div className="download-benefit-grid">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article className="download-benefit-item" key={benefit.title}>
                  <Icon size={20} aria-hidden="true" />
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

const styles = `
.logivn-download-page {
  --download-green: #0F4D3A;
  --download-green-strong: #0A2F25;
  --download-sage: #A9C5A1;
  --download-orange: #F28C28;
  --download-ivory: #FFF7EB;
  --download-paper: #FFFCF6;
  --download-line: rgba(15, 77, 58, 0.16);
  --download-text: #203329;
  --download-muted: rgba(32, 51, 41, 0.68);
  --download-shadow: 0 18px 46px rgba(26, 34, 31, 0.08);
  min-height: 100vh;
  color: var(--download-text);
  background: linear-gradient(180deg, #FFF7EB 0%, #FFFCF6 48%, #F7F1E7 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-download-page * { box-sizing: border-box; }
.logivn-download-page a { color: inherit; text-decoration: none; }
.logivn-download-page h1,
.logivn-download-page h2,
.logivn-download-page h3,
.logivn-download-page p { margin: 0; }

.download-container {
  width: min(1140px, calc(100% - 32px));
  margin: 0 auto;
}

.download-header {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid rgba(15, 77, 58, 0.1);
  background: rgba(255, 247, 235, 0.9);
  backdrop-filter: blur(16px);
}

.download-nav {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.download-nav-links {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(32, 51, 41, 0.8);
  font-size: 13px;
  font-weight: 800;
}

.download-nav-links a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border-radius: 8px;
  transition: background-color 160ms ease, color 160ms ease;
}

.download-nav-links a:hover,
.download-nav-links .is-active {
  color: var(--download-green);
  background: rgba(169, 197, 161, 0.34);
}

.download-workspace {
  padding: 34px 0 54px;
}

.download-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 24px;
  margin-bottom: 22px;
}

.download-kicker,
.download-panel-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--download-green);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.download-title-row h1 {
  max-width: 820px;
  margin-top: 10px;
  color: var(--download-green-strong);
  font-size: clamp(2rem, 4.4vw, 4.7rem);
  line-height: 0.98;
  letter-spacing: 0;
}

.download-title-row p {
  max-width: 680px;
  margin-top: 14px;
  color: var(--download-muted);
  font-size: 17px;
  line-height: 1.7;
}

.download-top-action,
.download-primary-action,
.download-dismiss-action {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-weight: 900;
  cursor: pointer;
  transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.download-top-action:hover,
.download-primary-action:hover,
.download-dismiss-action:hover {
  transform: translateY(-1px);
}

.download-top-action {
  padding: 0 18px;
  color: #FFF7EB;
  background: var(--download-green);
  box-shadow: 0 14px 28px rgba(15, 77, 58, 0.16);
}

.download-main-grid {
  display: grid;
  grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
  gap: 16px;
  align-items: stretch;
}

.download-install-panel,
.download-guide-panel,
.download-platform-panel,
.download-preview-panel {
  border: 1px solid var(--download-line);
  border-radius: 8px;
  background: rgba(255, 252, 246, 0.86);
  box-shadow: var(--download-shadow);
}

.download-install-panel {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.download-device-line {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-block: 1px solid rgba(15, 77, 58, 0.1);
  color: var(--download-muted);
  font-size: 14px;
  font-weight: 800;
}

.download-device-line strong {
  color: var(--download-green-strong);
  font-size: 18px;
}

.download-install-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid rgba(15, 77, 58, 0.12);
  background: rgba(169, 197, 161, 0.2);
}

.download-install-status.is-manual {
  border-color: rgba(242, 140, 40, 0.26);
  background: rgba(242, 140, 40, 0.1);
}

.download-install-status.is-muted {
  background: rgba(32, 51, 41, 0.05);
}

.download-install-status svg {
  margin-top: 2px;
  color: var(--download-green);
  flex: 0 0 auto;
}

.download-install-status strong {
  display: block;
  color: var(--download-green-strong);
  font-size: 15px;
  line-height: 1.35;
}

.download-install-status p {
  margin-top: 4px;
  color: var(--download-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.download-primary-action {
  width: 100%;
  min-height: 56px;
  padding: 0 18px;
  color: #FFF7EB;
  background: var(--download-orange);
  box-shadow: 0 16px 30px rgba(242, 140, 40, 0.2);
}

.download-primary-action:disabled {
  cursor: wait;
  opacity: 0.74;
}

.download-dismiss-action {
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  color: var(--download-green);
  border-color: rgba(15, 77, 58, 0.18);
  background: rgba(255, 247, 235, 0.62);
}

.download-browser-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: auto;
  padding-top: 2px;
  color: var(--download-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.55;
}

.download-browser-note svg {
  margin-top: 2px;
  color: var(--download-green);
  flex: 0 0 auto;
}

.download-browser-note strong { color: var(--download-green-strong); }

.download-guide-panel {
  padding: 22px;
}

.download-guide-panel h2,
.download-section-head h2,
.download-preview-copy h2 {
  margin-top: 10px;
  color: var(--download-green-strong);
  font-size: clamp(1.35rem, 2.1vw, 2rem);
  line-height: 1.15;
  letter-spacing: 0;
}

.download-guide-panel > p,
.download-section-head > p,
.download-preview-copy p {
  margin-top: 10px;
  color: var(--download-muted);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.65;
}

.download-step-list {
  display: grid;
  gap: 12px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}

.download-step-list li {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.download-step-list span {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  color: #FFF7EB;
  background: var(--download-green);
  font-size: 14px;
  font-weight: 900;
}

.download-step-list p {
  min-height: 34px;
  display: flex;
  align-items: center;
  color: var(--download-text);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.5;
}

.download-caveat {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(15, 77, 58, 0.1);
  color: var(--download-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.55;
}

.download-caveat svg {
  margin-top: 2px;
  color: var(--download-green);
  flex: 0 0 auto;
}

.download-platform-panel,
.download-preview-panel {
  grid-column: span 1;
}

.download-platform-panel {
  padding: 20px;
}

.download-section-head-wide {
  max-width: 760px;
}

.download-platform-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.download-platform-link {
  display: grid;
  min-height: 92px;
  grid-template-columns: 32px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-content: center;
  column-gap: 10px;
  row-gap: 3px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(15, 77, 58, 0.14);
  background: rgba(255, 255, 255, 0.48);
  transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease;
}

.download-platform-link:hover,
.download-platform-link.is-active {
  transform: translateY(-1px);
  border-color: rgba(242, 140, 40, 0.55);
  background: rgba(255, 247, 235, 0.9);
}

.download-platform-link svg {
  grid-row: 1 / span 2;
  align-self: center;
  color: var(--download-green);
}

.download-platform-link span {
  color: var(--download-green-strong);
  font-size: 15px;
  font-weight: 900;
  line-height: 1.25;
}

.download-platform-link small {
  min-width: 0;
  color: var(--download-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}

.download-preview-panel {
  overflow: hidden;
  display: grid;
  grid-template-rows: minmax(190px, 1fr) auto;
}

.download-preview-image {
  position: relative;
  min-height: 238px;
  background: #0A2F25;
}

.download-preview-image img { object-fit: cover; }

.download-preview-copy {
  padding: 18px 20px 20px;
}

.download-benefits {
  padding: 12px 0 62px;
}

.download-benefit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 22px;
}

.download-benefit-item {
  min-height: 178px;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--download-line);
  background: rgba(255, 252, 246, 0.72);
  box-shadow: 0 12px 26px rgba(26, 34, 31, 0.05);
}

.download-benefit-item svg {
  color: var(--download-orange);
}

.download-benefit-item h3 {
  margin-top: 14px;
  color: var(--download-green-strong);
  font-size: 18px;
  line-height: 1.25;
}

.download-benefit-item p {
  margin-top: 9px;
  color: var(--download-muted);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.6;
}

.download-spin { animation: download-spin 900ms linear infinite; }

@keyframes download-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 980px) {
  .download-nav {
    align-items: flex-start;
    flex-direction: column;
    padding: 12px 0;
  }

  .download-nav-links {
    width: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .download-title-row,
  .download-main-grid,
  .download-benefit-grid {
    grid-template-columns: 1fr;
  }

  .download-top-action {
    width: fit-content;
  }
}

@media (max-width: 640px) {
  .download-container {
    width: min(100% - 24px, 1140px);
  }

  .download-workspace {
    padding-top: 24px;
  }

  .download-title-row h1 {
    font-size: 2.35rem;
    line-height: 1.02;
  }

  .download-title-row p {
    font-size: 15px;
  }

  .download-platform-grid {
    grid-template-columns: 1fr;
  }

  .download-install-panel,
  .download-guide-panel,
  .download-platform-panel,
  .download-preview-copy,
  .download-benefit-item {
    padding: 16px;
  }

  .download-primary-action {
    min-height: 58px;
  }
}
`;
