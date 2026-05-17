import Link from "next/link";
import { ArrowRight, BookOpen, Clock, Search } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import {
  BLOG_AUTHOR_NAME,
  getAllBlogPosts,
  getAllBlogTopicHubs,
  getBlogCategories,
  getBlogPath,
  getBlogPostsForTopicHub,
  getBlogTopicClusters,
  getBlogTopicHubPath
} from "@/lib/seo/blog";
import { getFeaturedSeoIntentPages } from "@/lib/seo/intent-pages";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBreadcrumbSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export const metadata = createSeoMetadata({
  title: "Blog LogiVN - Gọi món QR, VietQR và vận hành quán cafe",
  description:
    "Kiến thức thực chiến về gọi món QR, thanh toán VietQR, quản lý đơn theo thời gian thực và chuyển đổi số cho quán cafe, nhà hàng Việt.",
  path: "/blog"
});

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  const categories = getBlogCategories();
  const topicClusters = getBlogTopicClusters();
  const topicHubs = getAllBlogTopicHubs();
  const intentPages = getFeaturedSeoIntentPages();
  const featuredPost = posts[0];
  const secondaryPosts = posts.slice(1);

  return (
    <main className="logivn-blog-page">
      <JsonLdScript
        id="logivn-blog-breadcrumb-jsonld"
        scriptKey="logivn-blog-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Blog", path: "/blog" }
        ])}
      />
      <JsonLdScript
        id="logivn-blog-itemlist-jsonld"
        scriptKey="logivn-blog-itemlist"
        data={buildItemListSchema(posts.map((post) => ({ name: post.title, path: getBlogPath(post.slug), description: post.description })))}
      />
      <style>{styles}</style>

      <header className="blog-header">
        <div className="blog-container blog-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng blog" className="blog-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/giai-phap">Giải pháp</Link>
            <Link href="/so-sanh">So sánh</Link>
            <Link href="/dia-phuong">Địa phương</Link>
            <Link href="/demo">Demo</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/blog" className="is-active">
              Blog
            </Link>
          </nav>
          <Link className="blog-nav-cta" href="/demo">
            Xem demo
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="blog-hero">
        <div className="blog-container blog-hero-grid">
          <div>
            <span className="blog-kicker">Cẩm nang LogiVN</span>
            <h1>Blog về gọi món QR, VietQR và vận hành quán cafe Việt</h1>
            <p>
              Nơi chủ quán tìm câu trả lời thực tế trước khi số hóa vận hành: bắt đầu từ menu QR, thanh toán VietQR,
              đặt món online, báo cáo doanh thu và trải nghiệm phục vụ trong giờ cao điểm.
            </p>
            <div className="blog-topic-row" aria-label="Chủ đề bài viết">
              {categories.map((category) => (
                <span key={category}>{category}</span>
              ))}
            </div>
          </div>

          <aside className="blog-hero-panel" aria-label="Tổng quan nội dung blog">
            <Search size={22} />
            <strong>Dành cho chủ quán</strong>
            <p>
              {posts.length} bài viết giúp quán hiểu cách gọi món QR, VietQR, chi phí triển khai, quản lý đơn theo thời gian
              thực và đặt món online trước khi chọn gói phù hợp.
            </p>
          </aside>
        </div>
      </section>

      <section className="blog-clusters" aria-labelledby="blog-intent-pages-heading">
        <div className="blog-container">
          <div className="blog-section-head">
            <span className="blog-kicker">Trang giải pháp</span>
            <h2 id="blog-intent-pages-heading">Cửa vào giải pháp cho nhu cầu triển khai cụ thể</h2>
            <p>
              Các trang giải pháp nối nội dung blog với truy vấn có ý định mua rõ hơn: gọi món QR, VietQR, trà sữa và đặt
              bàn nhận cọc.
            </p>
          </div>
          <Link className="blog-cluster-index-link" href="/giai-phap">
            Xem tất cả trang giải pháp
            <ArrowRight size={15} />
          </Link>

          <div className="blog-cluster-grid">
            {intentPages.map((page) => (
              <article className="blog-cluster-card" key={page.slug}>
                <div className="blog-cluster-topline">
                  <span>Giải pháp</span>
                  <span>{page.eyebrow}</span>
                </div>
                <h3>
                  <Link href={page.path}>{page.h1}</Link>
                </h3>
                <p>{page.description}</p>
                <ul>
                  {page.takeaways.slice(0, 2).map((takeaway) => (
                    <li key={takeaway}>{takeaway}</li>
                  ))}
                </ul>
                <Link className="blog-cluster-hub-link" href={page.path}>
                  Xem trang giải pháp
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="blog-section">
        <div className="blog-container">
          <div className="blog-section-head">
            <span className="blog-kicker">Bài viết nền tảng</span>
            <h2>{posts.length} bài viết giúp chủ quán hiểu rõ LogiVN giải quyết vấn đề gì</h2>
          </div>

          <div className="blog-grid">
            <article className="blog-featured-card">
              <div className="blog-card-meta">
                <span>{featuredPost.category}</span>
                <span>
                  <Clock size={14} />
                  {featuredPost.readingTimeMinutes} phút đọc
                </span>
              </div>
              <h3>{featuredPost.title}</h3>
              <p>{featuredPost.excerpt}</p>
              <Link href={getBlogPath(featuredPost.slug)}>
                Đọc bài nền tảng
                <ArrowRight size={16} />
              </Link>
            </article>

            <div className="blog-card-stack">
              {secondaryPosts.map((post) => (
                <article className="blog-card" key={post.slug}>
                  <div className="blog-card-meta">
                    <span>{post.category}</span>
                    <span>
                      <Clock size={14} />
                      {post.readingTimeMinutes} phút đọc
                    </span>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  <Link href={getBlogPath(post.slug)}>
                    Xem bài viết
                    <ArrowRight size={15} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="blog-clusters" aria-labelledby="blog-clusters-heading">
        <div className="blog-container">
          <div className="blog-section-head">
            <span className="blog-kicker">Chủ đề nổi bật</span>
            <h2 id="blog-clusters-heading">Các cụm chủ đề đang mở rộng theo nhu cầu tìm kiếm thật</h2>
            <p>
              Mỗi cụm gom các bài viết liên quan để chủ quán đọc liền mạch từ vấn đề vận hành đến lựa chọn giải pháp phù
              hợp cho mô hình quán của mình.
            </p>
          </div>

          <div className="blog-cluster-grid">
            {topicClusters.map((cluster) => (
              <article className="blog-cluster-card" key={cluster.category}>
                <div className="blog-cluster-topline">
                  <span>{cluster.count} bài</span>
                  <span>{cluster.primaryPost.topic}</span>
                </div>
                <h3>{cluster.category}</h3>
                <ul>
                  {cluster.posts.map((post) => (
                    <li key={post.slug}>
                      <Link href={getBlogPath(post.slug)}>{post.title}</Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="blog-clusters" aria-labelledby="blog-topic-hubs-heading">
        <div className="blog-container">
          <div className="blog-section-head">
            <span className="blog-kicker">Tổng hợp theo nhu cầu</span>
            <h2 id="blog-topic-hubs-heading">Cửa vào nhanh cho từng nhóm bài toán lớn của quán</h2>
            <p>
              Các nhóm bài viết giúp chủ quán đi từ câu hỏi ban đầu đến bức tranh vận hành đầy đủ: gọi món, thanh toán,
              đặt bàn, báo cáo và mở rộng kênh bán.
            </p>
          </div>

          <div className="blog-cluster-grid">
            {topicHubs.map((hub) => {
              const hubPosts = getBlogPostsForTopicHub(hub);
              return (
                <article className="blog-cluster-card" key={hub.slug}>
                  <div className="blog-cluster-topline">
                    <span>{hubPosts.length} bài</span>
                    <span>{hub.topic}</span>
                  </div>
                  <h3>
                    <Link href={getBlogTopicHubPath(hub.slug)}>{hub.title}</Link>
                  </h3>
                  <p>{hub.excerpt}</p>
                  <ul>
                    {hubPosts.slice(0, 4).map((post) => (
                      <li key={post.slug}>
                        <Link href={getBlogPath(post.slug)}>{post.title}</Link>
                      </li>
                    ))}
                  </ul>
                  <Link className="blog-cluster-hub-link" href={getBlogTopicHubPath(hub.slug)}>
                    Xem nhóm bài viết
                    <ArrowRight size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="blog-cta">
        <div className="blog-container blog-cta-shell">
          <div>
            <BookOpen size={22} />
            <h2>Đọc xong vấn đề, bước tiếp theo là thử luồng vận hành thật</h2>
            <p>
              Sau khi hiểu vấn đề, chủ quán có thể xem nền tảng và bảng giá để thử LogiVN trên nhịp vận hành thật của quán.
            </p>
          </div>
          <div className="blog-cta-actions">
            <Link href="/demo" className="blog-button blog-button-light">
              Xem demo
            </Link>
            <Link href="/pricing" className="blog-button blog-button-orange">
              Xem bảng giá
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="blog-footer">
        <div className="blog-container">
          Nội dung được biên tập bởi {BLOG_AUTHOR_NAME}. Các bài viết tập trung vào vận hành thực tế cho quán cafe, nhà hàng Việt.{" "}
          <a href="/feed.xml">Theo dõi bài viết mới</a>.
        </div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-blog-page {
  --blog-green: #0F4D3A;
  --blog-green-strong: #092E23;
  --blog-orange: #F28C28;
  --blog-ivory: #FFF7EB;
  --blog-paper: #FFFCF6;
  --blog-line: rgba(15, 77, 58, 0.14);
  --blog-text: #203329;
  --blog-muted: rgba(32, 51, 41, 0.72);
  min-height: 100vh;
  color: var(--blog-text);
  background:
    radial-gradient(circle at 0% 0%, rgba(242, 140, 40, 0.16), transparent 28rem),
    radial-gradient(circle at 100% 12%, rgba(15, 77, 58, 0.13), transparent 28rem),
    linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 42%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-blog-page * {
  box-sizing: border-box;
}

.logivn-blog-page a {
  color: inherit;
  text-decoration: none;
}

.logivn-blog-page h1,
.logivn-blog-page h2,
.logivn-blog-page h3,
.logivn-blog-page p {
  margin: 0;
}

.blog-container {
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
}

.blog-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 248, 239, 0.86);
  backdrop-filter: blur(18px);
}

.blog-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.blog-nav-links {
  display: flex;
  gap: 28px;
  color: var(--blog-muted);
  font-size: 14px;
  font-weight: 750;
}

.blog-nav-links a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding-inline: 8px;
}

.blog-nav-links .is-active,
.blog-nav-links a:hover {
  color: var(--blog-green);
}

.blog-nav-cta,
.blog-button,
.blog-featured-card a,
.blog-card a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
}

.blog-nav-cta {
  min-height: 44px;
  padding: 0 18px;
  color: #FFF8EF;
  background: var(--blog-green);
}

.blog-hero {
  padding: 58px 0 38px;
}

.blog-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.55fr);
  gap: 28px;
  align-items: end;
}

.blog-kicker {
  color: var(--blog-orange);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.blog-hero h1,
.blog-section-head h2,
.blog-featured-card h3,
.blog-card h3,
.blog-cta h2 {
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: -0.04em;
}

.blog-hero h1 {
  max-width: 820px;
  margin-top: 14px;
  color: var(--blog-green-strong);
  font-size: clamp(3rem, 7vw, 5.8rem);
  line-height: 0.95;
}

.blog-hero p,
.blog-hero-panel p,
.blog-section-head p,
.blog-card p,
.blog-featured-card p,
.blog-cta p,
.blog-footer {
  color: var(--blog-muted);
  line-height: 1.78;
  font-weight: 600;
}

.blog-hero p {
  max-width: 720px;
  margin-top: 20px;
  font-size: 17px;
}

.blog-topic-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.blog-topic-row span {
  border: 1px solid rgba(15, 77, 58, 0.16);
  border-radius: 999px;
  padding: 9px 13px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--blog-green);
  font-size: 13px;
  font-weight: 800;
}

.blog-hero-panel,
.blog-featured-card,
.blog-card,
.blog-cta-shell {
  border: 1px solid var(--blog-line);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.07);
}

.blog-hero-panel {
  padding: 24px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.6);
}

.blog-hero-panel svg {
  color: var(--blog-orange);
}

.blog-hero-panel strong {
  display: block;
  margin-top: 16px;
  color: var(--blog-green-strong);
  font-size: 22px;
}

.blog-hero-panel p {
  margin-top: 10px;
  font-size: 14px;
}

.blog-section {
  padding: 30px 0 54px;
}

.blog-section-head {
  max-width: 780px;
}

.blog-section-head h2 {
  margin-top: 12px;
  color: var(--blog-green-strong);
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  line-height: 1;
}

.blog-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 16px;
  margin-top: 28px;
}

.blog-featured-card,
.blog-card {
  background: rgba(255, 255, 255, 0.64);
}

.blog-featured-card {
  display: flex;
  min-height: 430px;
  flex-direction: column;
  justify-content: flex-end;
  padding: 30px;
  border-radius: 34px;
  background:
    radial-gradient(circle at 10% 8%, rgba(242, 140, 40, 0.18), transparent 18rem),
    linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(248, 238, 221, 0.94));
}

.blog-card-stack {
  display: grid;
  gap: 16px;
}

.blog-card {
  padding: 24px;
  border-radius: 28px;
}

.blog-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--blog-orange);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.blog-card-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.blog-featured-card h3,
.blog-card h3 {
  margin-top: 14px;
  color: var(--blog-green-strong);
  line-height: 1.04;
}

.blog-featured-card h3 {
  font-size: clamp(2.1rem, 4.6vw, 3.6rem);
}

.blog-card h3 {
  font-size: 28px;
}

.blog-featured-card p,
.blog-card p {
  margin-top: 14px;
  font-size: 15px;
}

.blog-featured-card a,
.blog-card a {
  width: fit-content;
  min-height: 44px;
  margin-top: 22px;
  padding: 0 17px;
  color: var(--blog-green);
  background: rgba(15, 77, 58, 0.08);
}

.blog-clusters {
  padding: 0 0 54px;
}

.blog-section-head p {
  max-width: 720px;
  margin-top: 12px;
}

.blog-cluster-index-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin-top: 18px;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 999px;
  padding: 0 16px;
  color: var(--blog-green);
  background: rgba(255, 255, 255, 0.56);
  font-size: 14px;
  font-weight: 850;
}

.blog-cluster-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 24px;
}

.blog-cluster-card {
  min-height: 220px;
  padding: 22px;
  border: 1px solid var(--blog-line);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.58);
}

.blog-cluster-topline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--blog-orange);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.blog-cluster-card h3 {
  margin-top: 12px;
  color: var(--blog-green-strong);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 28px;
  letter-spacing: -0.04em;
}

.blog-cluster-card p {
  margin-top: 10px;
  color: var(--blog-muted);
  font-size: 14px;
  font-weight: 620;
  line-height: 1.65;
}

.blog-cluster-card ul {
  display: grid;
  gap: 10px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.blog-cluster-card a {
  display: flex;
  min-height: 44px;
  align-items: center;
  color: var(--blog-muted);
  font-size: 14px;
  font-weight: 750;
  line-height: 1.5;
}

.blog-cluster-card a:hover {
  color: var(--blog-green);
}

.blog-cluster-hub-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  color: var(--blog-green) !important;
}

.blog-cta {
  padding: 0 0 54px;
}

.blog-cta-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  padding: 28px;
  border-radius: 32px;
  color: #FFF8EF;
  background:
    radial-gradient(circle at top right, rgba(242, 140, 40, 0.22), transparent 18rem),
    linear-gradient(150deg, #092E23 0%, #0F4D3A 100%);
}

.blog-cta svg {
  color: rgba(248, 184, 106, 0.95);
}

.blog-cta h2 {
  margin-top: 12px;
  max-width: 680px;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1;
}

.blog-cta p {
  max-width: 680px;
  margin-top: 12px;
  color: rgba(255, 248, 239, 0.75);
}

.blog-cta-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.blog-button {
  min-height: 46px;
  padding: 0 18px;
}

.blog-button-light {
  color: #FFF8EF;
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.logivn-blog-page .blog-button-orange {
  color: #102D24;
  background: var(--blog-orange);
}

.blog-footer {
  padding: 26px 0 34px;
  border-top: 1px solid rgba(15, 77, 58, 0.1);
  font-size: 13px;
}

.blog-footer a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
}

@media (max-width: 900px) {
  .blog-hero-grid,
  .blog-grid,
  .blog-cluster-grid,
  .blog-cta-shell {
    grid-template-columns: 1fr;
  }

  .blog-cta-shell {
    align-items: flex-start;
    flex-direction: column;
  }

  .blog-nav-links {
    display: none;
  }
}

@media (max-width: 640px) {
  .blog-container {
    width: min(100% - 28px, 640px);
  }

  .blog-nav-cta {
    display: none;
  }

  .blog-hero {
    padding-top: 34px;
  }

  .blog-hero h1 {
    font-size: clamp(2.35rem, 10vw, 3rem);
    line-height: 1;
  }

  .blog-featured-card {
    min-height: auto;
    padding: 24px;
  }

  .blog-cta-actions,
  .blog-button {
    width: 100%;
  }
}
`;
