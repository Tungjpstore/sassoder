import { JsonLdScript } from "next-seo";
import { buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/schema";

export const pricingFaqItems: Array<{ question: string; answer: string }> = [
  {
    question: "LogiVN cho dùng thử trong bao lâu?",
    answer:
      "Mỗi quán có thể dùng thử LogiVN trong 30 ngày để thiết lập menu, QR theo bàn, nhận đơn realtime và làm quen với quy trình vận hành."
  },
  {
    question: "Khi nào nên chọn gói Premium?",
    answer:
      "Premium phù hợp khi quán cần đặt bàn, nhận cọc, nhập menu nhanh từ ảnh, báo cáo nâng cao hoặc muốn tự động hóa sâu hơn so với gói Pro."
  },
  {
    question: "Có thể xem demo LogiVN trước khi chọn gói không?",
    answer:
      "Có. Chủ quán có thể mở trang demo để xem flow khách scan QR, gọi món tại bàn, nhân viên xác nhận, VietQR, dashboard và AI insight trước khi chọn Pro hoặc Premium."
  },
  {
    question: "Nếu chưa sẵn sàng đăng ký dùng thử thì làm gì?",
    answer:
      "Chủ quán có thể vào waitlist để chọn mô hình quán, nêu mục tiêu pilot và đi tiếp sang signup khi đã rõ phạm vi triển khai."
  },
  {
    question: "LogiVN có hỗ trợ đặt món online và giao hàng không?",
    answer:
      "Có. LogiVN hỗ trợ nhận đơn online, pickup và delivery cho quán cafe, nhà hàng; Premium mở rộng thêm các khả năng vận hành nâng cao."
  },
  {
    question: "Gia hạn hoặc nâng cấp gói SaaS bằng cách nào?",
    answer:
      "Chủ quán chọn gói phù hợp, tạo lệnh thanh toán VietQR và chờ LogiVN xác minh để kích hoạt đúng entitlement theo gói."
  }
];

export function PricingPageJsonLd() {
  return (
    <>
      <JsonLdScript
        id="logivn-pricing-breadcrumb-jsonld"
        scriptKey="logivn-pricing-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: "Trang chủ", path: "/" },
          { name: "Bảng giá", path: "/pricing" }
        ])}
      />
      <JsonLdScript id="logivn-pricing-faq-jsonld" scriptKey="logivn-pricing-faq" data={buildFaqSchema([...pricingFaqItems])} />
    </>
  );
}
