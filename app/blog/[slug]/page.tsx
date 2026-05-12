import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock } from "lucide-react";
import { JsonLdScript } from "next-seo";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import {
  BLOG_AUTHOR_NAME,
  getAllBlogPosts,
  getAllBlogTopicHubs,
  getBlogPath,
  getBlogPost,
  getBlogPostsForTopicHub,
  getBlogTopicHub,
  getBlogTopicHubPath,
  getRelatedBlogPosts,
  type BlogIllustration,
  type BlogTopicHub
} from "@/lib/seo/blog";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { buildBlogPostingSchema, buildBreadcrumbSchema, buildFaqSchema, buildItemListSchema } from "@/lib/seo/schema";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return [...getAllBlogPosts(), ...getAllBlogTopicHubs()].map((entry) => ({
    slug: entry.slug
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  const hub = post ? null : getBlogTopicHub(slug);

  if (!post && !hub) {
    return createSeoMetadata({
      title: "Bài viết không tồn tại",
      description: "Bài viết LogiVN không tồn tại hoặc đã được di chuyển.",
      path: "/blog",
      noIndex: true
    });
  }

  if (hub) {
    return createSeoMetadata({
      title: hub.title,
      description: hub.description,
      path: getBlogTopicHubPath(hub.slug)
    });
  }

  if (post) {
    return createSeoMetadata({
      title: post.title,
      description: post.description,
      path: getBlogPath(post.slug),
      type: "article"
    });
  }

  return createSeoMetadata({
    title: "Bài viết không tồn tại",
    description: "Bài viết LogiVN không tồn tại hoặc đã được di chuyển.",
    path: "/blog",
    noIndex: true
  });
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  const hub = post ? null : getBlogTopicHub(slug);

  if (hub) return <BlogTopicHubPage hub={hub} />;
  if (!post) notFound();

  const relatedPosts = getRelatedBlogPosts(post);

  return (
    <main className="logivn-article-page">
      <JsonLdScript
        id="logivn-article-breadcrumb-jsonld"
        scriptKey={`logivn-article-breadcrumb-${post.slug}`}
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path: getBlogPath(post.slug) }
        ])}
      />
      <JsonLdScript id="logivn-article-jsonld" scriptKey={`logivn-article-${post.slug}`} data={buildBlogPostingSchema(post)} />
      <JsonLdScript id="logivn-article-faq-jsonld" scriptKey={`logivn-article-faq-${post.slug}`} data={buildFaqSchema(post.faq)} />
      <style>{styles}</style>

      <header className="article-header">
        <div className="article-container article-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng bài viết" className="article-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/blog">Blog</Link>
          </nav>
        </div>
      </header>

      <article>
        <section className="article-hero">
          <div className="article-container article-hero-grid">
            <div>
              <Link className="article-back" href="/blog">
                <ArrowLeft size={16} />
                Blog LogiVN
              </Link>
              <div className="article-meta">
                <span>{post.category}</span>
                <span>
                  <Clock size={14} />
                  {post.readingTimeMinutes} phút đọc
                </span>
                {post.wordCount ? <span>{post.wordCount} từ</span> : null}
                <span>{post.topic}</span>
                <span>Cập nhật {post.updatedAt}</span>
              </div>
              <h1>{post.title}</h1>
              <p>{post.description}</p>
            </div>

            <aside className="article-summary" aria-label="Tóm tắt bài viết">
              <span>Điểm chính</span>
              <ul>
                {post.takeaways.map((takeaway) => (
                  <li key={takeaway}>
                    <Check size={16} />
                    {takeaway}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="article-body-section">
          <div className="article-container article-layout">
            <div className="article-content">
              {post.illustration ? <ArticleSketch slug={post.slug} illustration={post.illustration} /> : null}

              {post.sections.map((section) => (
                <section key={section.heading}>
                  <h2>{section.heading}</h2>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}

              <section className="article-faq">
                <h2>Câu hỏi thường gặp</h2>
                {post.faq.map((item) => (
                  <details key={item.question}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </section>

              <section className="article-citation-note" aria-labelledby="citation-note-heading">
                <span>Tóm tắt nhanh</span>
                <h2 id="citation-note-heading">Điểm cần nhớ cho chủ quán</h2>
                <p>
                  {post.title} thuộc cụm {post.category.toLowerCase()} của LogiVN, cập nhật ngày {post.updatedAt} bởi{" "}
                  {BLOG_AUTHOR_NAME}. Bài viết giải thích {post.topic.toLowerCase()} cho chủ quán cafe, nhà hàng Việt và
                  liên kết tới các bài viết liên quan trong cùng nhóm chủ đề.
                </p>
              </section>
            </div>

            <aside className="article-sidebar">
              <div className="article-side-card">
                <span>Bước tiếp theo</span>
                <h2>Muốn thử luồng vận hành thật?</h2>
                <p>Đi từ kiến thức sang dùng thử: xem nền tảng hoặc bảng giá để chọn gói phù hợp với quán.</p>
                <Link href="/pricing">
                  Xem bảng giá
                  <ArrowRight size={16} />
                </Link>
              </div>

              <div className="article-side-card article-side-links">
                <span>Đọc tiếp</span>
                <h2>Đường dẫn nên đọc tiếp</h2>
                <Link href="/">Nền tảng LogiVN</Link>
                <Link href="/pricing">Bảng giá LogiVN</Link>
                <Link href="/blog">Toàn bộ blog</Link>
              </div>
            </aside>
          </div>
        </section>
      </article>

      <section className="article-related">
        <div className="article-container">
          <div className="article-related-head">
            <span>Bài liên quan</span>
            <h2>Đọc tiếp trong cùng cụm chủ đề</h2>
          </div>
          <div className="article-related-grid">
            {relatedPosts.map((relatedPost) => (
              <article key={relatedPost.slug}>
                <span>{relatedPost.category}</span>
                <h3>{relatedPost.title}</h3>
                <p>{relatedPost.excerpt}</p>
                <Link href={getBlogPath(relatedPost.slug)}>
                  Đọc tiếp
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="article-footer">
        <div className="article-container">Tác giả: {BLOG_AUTHOR_NAME}. Nội dung được viết cho chủ quán cafe, nhà hàng đang cân nhắc chuyển đổi số.</div>
      </footer>
    </main>
  );
}

function ArticleSketch({ slug, illustration }: { slug: string; illustration: BlogIllustration }) {
  const titleId = `article-sketch-title-${slug}`;
  const descriptionId = `article-sketch-description-${slug}`;
  const [first, second, third, fourth] = illustration.labels;

  return (
    <figure className="article-sketch">
      <svg viewBox="0 0 720 300" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
        <title id={titleId}>{illustration.alt}</title>
        <desc id={descriptionId}>{illustration.caption}</desc>
        <defs>
          <linearGradient id={`article-sketch-gradient-${slug}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#FFF7EB" />
            <stop offset="100%" stopColor="#E7F0E1" />
          </linearGradient>
          <filter id={`article-sketch-shadow-${slug}`} x="-10%" y="-20%" width="120%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#092E23" floodOpacity="0.12" />
          </filter>
        </defs>
        <rect width="720" height="300" rx="32" fill={`url(#article-sketch-gradient-${slug})`} />
        <path d="M55 238 C165 180 240 238 350 177 S542 114 662 154" fill="none" stroke="rgba(15,77,58,0.18)" strokeWidth="4" strokeDasharray="10 12" />
        <g filter={`url(#article-sketch-shadow-${slug})`}>
          <rect x="46" y="64" width="140" height="94" rx="22" fill="#FFFFFF" />
          <rect x="214" y="116" width="140" height="94" rx="22" fill="#FFFFFF" />
          <rect x="382" y="64" width="140" height="94" rx="22" fill="#FFFFFF" />
          <rect x="550" y="116" width="124" height="94" rx="22" fill="#FFFFFF" />
        </g>
        <g fill="none" stroke="#0F4D3A" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
          <path d="M186 111 H214" />
          <path d="M354 163 H382" />
          <path d="M522 111 H550" />
          <path d="M204 101 L214 111 L204 121" />
          <path d="M372 153 L382 163 L372 173" />
          <path d="M540 101 L550 111 L540 121" />
        </g>
        <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="850" textAnchor="middle">
          <circle cx="116" cy="92" r="18" fill="#F28C28" opacity="0.9" />
          <circle cx="284" cy="144" r="18" fill="#0F4D3A" opacity="0.9" />
          <circle cx="452" cy="92" r="18" fill="#F28C28" opacity="0.9" />
          <circle cx="612" cy="144" r="18" fill="#0F4D3A" opacity="0.9" />
          <text x="116" y="131" fill="#092E23" fontSize="18">
            {first}
          </text>
          <text x="284" y="183" fill="#092E23" fontSize="18">
            {second}
          </text>
          <text x="452" y="131" fill="#092E23" fontSize="18">
            {third}
          </text>
          <text x="612" y="183" fill="#092E23" fontSize="18">
            {fourth}
          </text>
        </g>
        <text x="52" y="256" fill="#0F4D3A" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="18" fontWeight="900">
          {illustration.title}
        </text>
      </svg>
      <figcaption>{illustration.caption}</figcaption>
    </figure>
  );
}

function BlogTopicHubPage({ hub }: { hub: BlogTopicHub }) {
  const hubPosts = getBlogPostsForTopicHub(hub);

  return (
    <main className="logivn-article-page">
      <JsonLdScript
        id="logivn-topic-breadcrumb-jsonld"
        scriptKey={`logivn-topic-breadcrumb-${hub.slug}`}
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: hub.topic, path: getBlogTopicHubPath(hub.slug) }
        ])}
      />
      <JsonLdScript
        id="logivn-topic-itemlist-jsonld"
        scriptKey={`logivn-topic-itemlist-${hub.slug}`}
        data={buildItemListSchema(hubPosts.map((post) => ({ name: post.title, path: getBlogPath(post.slug), description: post.description })))}
      />
      <JsonLdScript id="logivn-topic-faq-jsonld" scriptKey={`logivn-topic-faq-${hub.slug}`} data={buildFaqSchema(hub.faq)} />
      <style>{styles}</style>

      <header className="article-header">
        <div className="article-container article-nav">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav aria-label="Điều hướng nhóm bài viết" className="article-nav-links">
            <Link href="/">Trang chủ</Link>
            <Link href="/pricing">Bảng giá</Link>
            <Link href="/blog">Blog</Link>
          </nav>
        </div>
      </header>

      <article>
        <section className="article-hero">
          <div className="article-container article-hero-grid">
            <div>
              <Link className="article-back" href="/blog">
                <ArrowLeft size={16} />
                Nhóm bài viết LogiVN
              </Link>
              <div className="article-meta">
                <span>{hub.category}</span>
                <span>{hub.topic}</span>
                <span>{hubPosts.length} bài liên quan</span>
                <span>Cập nhật {hub.updatedAt}</span>
              </div>
              <h1>{hub.title}</h1>
              <p>{hub.description}</p>
            </div>

            <aside className="article-summary" aria-label="Tóm tắt nhóm bài viết">
              <span>Lộ trình đọc</span>
              <ul>
                {hub.takeaways.map((takeaway) => (
                  <li key={takeaway}>
                    <Check size={16} />
                    {takeaway}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="article-body-section">
          <div className="article-container article-layout">
            <div className="article-content">
              {hub.sections.map((section) => (
                <section key={section.heading}>
                  <h2>{section.heading}</h2>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}

              <section className="article-faq">
                <h2>Câu hỏi thường gặp</h2>
                {hub.faq.map((item) => (
                  <details key={item.question}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </section>

              <section className="article-citation-note" aria-labelledby="topic-citation-note-heading">
                <span>Tóm tắt nhanh</span>
                <h2 id="topic-citation-note-heading">Điểm cần nhớ cho chủ quán</h2>
                <p>
                  {hub.title} là nhóm bài viết của LogiVN về {hub.topic.toLowerCase()}, cập nhật ngày {hub.updatedAt}. Trang này gom
                  {` ${hubPosts.length} `}bài liên quan để giúp chủ quán cafe, nhà hàng Việt đi từ tìm hiểu vấn đề tới chọn luồng vận hành phù hợp.
                </p>
              </section>
            </div>

            <aside className="article-sidebar">
              <div className="article-side-card article-side-links">
                <span>Bài liên quan</span>
                <h2>Bài trong cụm này</h2>
                {hubPosts.map((post) => (
                  <Link key={post.slug} href={getBlogPath(post.slug)}>
                    {post.title}
                  </Link>
                ))}
              </div>

              <div className="article-side-card">
                <span>Bước tiếp theo</span>
                <h2>Muốn thử trên quán thật?</h2>
                <p>Đi từ nhóm bài viết sang nền tảng hoặc bảng giá để chọn gói phù hợp với mô hình vận hành của quán.</p>
                <Link href="/pricing">
                  Xem bảng giá
                  <ArrowRight size={16} />
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </article>

      <section className="article-related">
        <div className="article-container">
          <div className="article-related-head">
            <span>Nhóm chủ đề</span>
            <h2>Các bài nền tảng trong cụm {hub.topic.toLowerCase()}</h2>
          </div>
          <div className="article-related-grid">
            {hubPosts.map((post) => (
              <article key={post.slug}>
                <span>{post.category}</span>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
                <Link href={getBlogPath(post.slug)}>
                  Đọc bài viết
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="article-footer">
        <div className="article-container">Nhóm bài viết được biên tập bởi {BLOG_AUTHOR_NAME} để giúp chủ quán đọc liền mạch từ vấn đề đến giải pháp phù hợp.</div>
      </footer>
    </main>
  );
}

const styles = `
.logivn-article-page {
  --article-green: #0F4D3A;
  --article-green-strong: #092E23;
  --article-orange: #F28C28;
  --article-ivory: #FFF7EB;
  --article-paper: #FFFCF6;
  --article-line: rgba(15, 77, 58, 0.14);
  --article-text: #203329;
  --article-muted: rgba(32, 51, 41, 0.72);
  min-height: 100vh;
  color: var(--article-text);
  background:
    radial-gradient(circle at 8% 0%, rgba(242, 140, 40, 0.14), transparent 26rem),
    linear-gradient(180deg, #FFF8EF 0%, #FFF4E8 36%, #FFFCF6 100%);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

.logivn-article-page * {
  box-sizing: border-box;
}

.logivn-article-page a {
  color: inherit;
  text-decoration: none;
}

.logivn-article-page h1,
.logivn-article-page h2,
.logivn-article-page h3,
.logivn-article-page p {
  margin: 0;
}

.article-container {
  width: min(1080px, calc(100% - 40px));
  margin: 0 auto;
}

.article-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(255, 255, 255, 0.32);
  background: rgba(255, 248, 239, 0.86);
  backdrop-filter: blur(18px);
}

.article-nav {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.article-nav-links {
  display: flex;
  gap: 28px;
  color: var(--article-muted);
  font-size: 14px;
  font-weight: 760;
}

.article-nav-links a:hover {
  color: var(--article-green);
}

.article-hero {
  padding: 52px 0 36px;
}

.article-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.48fr);
  gap: 28px;
  align-items: end;
}

.article-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--article-green);
  font-size: 14px;
  font-weight: 850;
}

.article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
  color: var(--article-orange);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.article-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.article-hero h1,
.article-content h2,
.article-side-card h2,
.article-related-head h2,
.article-related h3 {
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: -0.04em;
}

.article-hero h1 {
  max-width: 820px;
  margin-top: 16px;
  color: var(--article-green-strong);
  font-size: clamp(3rem, 7vw, 5.5rem);
  line-height: 0.96;
}

.article-hero p,
.article-summary li,
.article-content p,
.article-side-card p,
.article-related p,
.article-footer {
  color: var(--article-muted);
  line-height: 1.82;
  font-weight: 600;
}

.article-hero p {
  max-width: 720px;
  margin-top: 20px;
  font-size: 17px;
}

.article-summary,
.article-side-card,
.article-related article {
  border: 1px solid var(--article-line);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.64);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.07);
}

.article-summary {
  padding: 24px;
}

.article-summary span,
.article-side-card span,
.article-related-head span,
.article-related article > span {
  color: var(--article-orange);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.article-summary ul {
  display: grid;
  gap: 12px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.article-summary li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 14px;
}

.article-summary svg {
  flex: 0 0 auto;
  margin-top: 6px;
  color: var(--article-green);
}

.article-body-section {
  padding: 26px 0 54px;
}

.article-layout {
  display: grid;
  grid-template-columns: minmax(0, 720px) minmax(260px, 1fr);
  gap: 34px;
  align-items: start;
}

.article-content {
  display: grid;
  gap: 34px;
}

.article-content h2 {
  color: var(--article-green-strong);
  font-size: clamp(2rem, 4vw, 2.9rem);
  line-height: 1;
}

.article-content p {
  margin-top: 14px;
  font-size: 17px;
}

.article-sketch {
  margin: 0;
  padding: 18px;
  border: 1px solid rgba(15, 77, 58, 0.14);
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 18px 42px rgba(26, 34, 31, 0.07);
}

.article-sketch svg {
  display: block;
  width: 100%;
  height: auto;
}

.article-sketch figcaption {
  margin-top: 14px;
  color: var(--article-muted);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.65;
}

.article-faq {
  display: grid;
  gap: 12px;
}

.article-faq details {
  border: 1px solid var(--article-line);
  border-radius: 22px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.58);
}

.article-faq summary {
  color: var(--article-green-strong);
  cursor: pointer;
  font-weight: 850;
}

.article-faq p {
  font-size: 15px;
}

.article-citation-note {
  padding: 22px;
  border: 1px solid rgba(242, 140, 40, 0.26);
  border-radius: 26px;
  background: rgba(255, 247, 235, 0.74);
}

.article-citation-note span {
  color: var(--article-orange);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.article-citation-note h2 {
  margin-top: 10px;
}

.article-sidebar {
  display: grid;
  gap: 14px;
  position: sticky;
  top: 96px;
}

.article-side-card {
  padding: 22px;
}

.article-side-card h2 {
  margin-top: 12px;
  color: var(--article-green-strong);
  font-size: 29px;
  line-height: 1;
}

.article-side-card p {
  margin-top: 12px;
  font-size: 14px;
}

.article-side-card a,
.article-related a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 18px;
  padding: 0 16px;
  border-radius: 999px;
  color: #FFF8EF;
  background: var(--article-green);
  font-size: 14px;
  font-weight: 850;
}

.article-side-links {
  display: grid;
}

.article-side-links a {
  width: 100%;
  margin-top: 10px;
  color: var(--article-green);
  border: 1px solid rgba(15, 77, 58, 0.16);
  background: rgba(15, 77, 58, 0.06);
}

.article-related {
  padding: 0 0 54px;
}

.article-related-head h2 {
  margin-top: 10px;
  color: var(--article-green-strong);
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1;
}

.article-related-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.article-related article {
  padding: 22px;
}

.article-related h3 {
  margin-top: 12px;
  color: var(--article-green-strong);
  font-size: 27px;
  line-height: 1.04;
}

.article-related p {
  margin-top: 12px;
  font-size: 14px;
}

.article-footer {
  padding: 24px 0 34px;
  border-top: 1px solid rgba(15, 77, 58, 0.1);
  font-size: 13px;
}

@media (max-width: 900px) {
  .article-hero-grid,
  .article-layout,
  .article-related-grid {
    grid-template-columns: 1fr;
  }

  .article-sidebar {
    position: static;
  }

  .article-nav-links {
    display: none;
  }
}

@media (max-width: 640px) {
  .article-container {
    width: min(100% - 28px, 640px);
  }

  .article-hero {
    padding-top: 34px;
  }
}
`;
