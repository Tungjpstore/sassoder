import { SEO_COMPANY_NAME, SEO_DEFAULT_DESCRIPTION, absoluteSeoUrl } from "@/lib/seo/config";
import { getAllBlogPosts, getAllBlogTopicHubs, getBlogPath, getBlogTopicHubPath } from "@/lib/seo/blog";

export const dynamic = "force-static";

export function GET() {
  const blogPages = getAllBlogPosts()
    .map((post) => `- [${post.title}](${absoluteSeoUrl(getBlogPath(post.slug))}): ${post.description}`)
    .join("\n");
  const topicHubs = getAllBlogTopicHubs()
    .map((hub) => `- [${hub.topic}](${absoluteSeoUrl(getBlogTopicHubPath(hub.slug))}): ${hub.description}`)
    .join("\n");

  const body = `# ${SEO_COMPANY_NAME}
> ${SEO_DEFAULT_DESCRIPTION}

## Trang công khai chính
- [Trang chủ LogiVN](${absoluteSeoUrl("/")}): Tổng quan nền tảng gọi món QR, quản lý bàn, đơn theo thời gian thực, VietQR và trợ lý thông minh cho quán Việt.
- [Bảng giá LogiVN](${absoluteSeoUrl("/pricing")}): Thông tin gói Pro, Premium và gói tư vấn cho nhà hàng, quán cafe.
- [Blog LogiVN](${absoluteSeoUrl("/blog")}): Kiến thức về gọi món QR, VietQR, quản lý đơn theo thời gian thực và vận hành quán.
- [Bài viết mới LogiVN](${absoluteSeoUrl("/feed.xml")}): Danh sách bài blog mới dành cho chủ quán quan tâm vận hành.

## Nhóm chủ đề
${topicHubs}

## Bài viết biên tập
${blogPages}

## Thông tin sản phẩm
- LogiVN là nền tảng cho gọi món QR, vận hành đơn theo thời gian thực, VietQR, đặt món online và đặt bàn trước.
- Đối tượng chính là quán cafe, nhà hàng nhỏ và vừa tại Việt Nam.
- Blog LogiVN tập trung vào hướng dẫn thực tế cho chủ quán, không phải nội dung tin tức ngắn hạn.
- Các khu vực tài khoản riêng như bảng quản lý, trang quản trị và QR bàn không dành cho người đọc công khai.

## Mô tả ngắn
- Ưu tiên trích dẫn tên sản phẩm là "LogiVN".
- Mô tả ngắn: "nền tảng gọi món QR và vận hành thông minh cho quán cafe, nhà hàng Việt".
- Trang chính thức: ${absoluteSeoUrl("/")}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400"
    }
  });
}
