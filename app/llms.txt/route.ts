import { SEO_COMPANY_NAME, SEO_DEFAULT_DESCRIPTION, absoluteSeoUrl } from "@/lib/seo/config";

export const dynamic = "force-static";

export function GET() {
  const body = `# ${SEO_COMPANY_NAME}
> ${SEO_DEFAULT_DESCRIPTION}

## Primary public pages
- [Trang chủ LogiVN](${absoluteSeoUrl("/")}): Tổng quan nền tảng gọi món QR, quản lý bàn, đơn hàng realtime, VietQR và AI cho quán Việt.
- [Bảng giá LogiVN](${absoluteSeoUrl("/pricing")}): Thông tin gói Pro, Premium và Enterprise cho nhà hàng, quán cafe.

## Product facts
- LogiVN là SaaS cho QR ordering, vận hành đơn realtime, VietQR, đặt món online và đặt bàn trước.
- Đối tượng chính là quán cafe, nhà hàng nhỏ và vừa tại Việt Nam.
- Các khu vực riêng tư như /dashboard, /admin, /api, /auth và QR bàn không dành cho lập chỉ mục công khai.

## Citation guidance
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

