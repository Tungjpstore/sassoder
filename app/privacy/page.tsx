import Link from "next/link";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { createSeoMetadata } from "@/lib/seo/metadata";

export const metadata = createSeoMetadata({
  title: "Chính sách bảo mật LogiVN",
  description: "Cách LogiVN xử lý dữ liệu tài khoản, vận hành nhà hàng, email thông báo và quyền riêng tư của người dùng.",
  path: "/privacy"
});

const sections = [
  {
    title: "Dữ liệu LogiVN xử lý",
    items: [
      "Thông tin tài khoản như email, tên hiển thị, vai trò và trạng thái xác thực.",
      "Dữ liệu vận hành quán như menu, đơn hàng, đặt bàn, thanh toán, báo cáo và cấu hình nhân sự.",
      "Thông tin kỹ thuật cần thiết để bảo mật, chống lạm dụng, đo lỗi và duy trì dịch vụ."
    ]
  },
  {
    title: "Email và thông báo",
    items: [
      "LogiVN gửi email bắt buộc cho bảo mật tài khoản, OTP, khôi phục mật khẩu, billing và trạng thái dịch vụ.",
      "Email báo cáo, AI Morning Brief và thông báo vận hành không bắt buộc có thể được quản lý trong dashboard khi tính năng tương ứng được bật.",
      "LogiVN không mua, thuê, scrape hoặc nhập danh sách email bên thứ ba để gửi hàng loạt."
    ]
  },
  {
    title: "Bounce, complaint và suppression",
    items: [
      "Địa chỉ hard bounce, complaint hoặc bị đánh dấu không hợp lệ có thể bị đưa vào suppression list để dừng gửi tiếp.",
      "Postmaster và abuse mailbox được duy trì để tiếp nhận phản hồi vận hành email.",
      "LogiVN theo dõi SPF, DKIM, DMARC và các tín hiệu deliverability để bảo vệ uy tín domain."
    ]
  },
  {
    title: "Chia sẻ dữ liệu",
    items: [
      "LogiVN chỉ chia sẻ dữ liệu với provider cần thiết để vận hành dịch vụ như hạ tầng hosting, email, lưu trữ, phân tích lỗi và thanh toán.",
      "Thông tin nhạy cảm không được đưa vào client-side code hoặc log công khai.",
      "Dữ liệu có thể được xử lý theo yêu cầu pháp lý hợp lệ hoặc để bảo vệ hệ thống khỏi lạm dụng."
    ]
  }
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fffaf0] text-[#102a1f]">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-5 py-8 sm:px-8 lg:px-0">
        <header className="flex items-center justify-between gap-4 border-b border-[#eadfce] pb-5">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav className="flex gap-4 text-sm font-semibold text-[#516158]" aria-label="Điều hướng chính sách">
            <Link href="/terms" className="hover:text-[#0f4d3a]">Điều khoản</Link>
            <Link href="/pricing" className="hover:text-[#0f4d3a]">Bảng giá</Link>
          </nav>
        </header>

        <section className="space-y-5">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#0f4d3a]">Privacy</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">Chính sách bảo mật LogiVN</h1>
          <p className="max-w-3xl text-base leading-8 text-[#516158]">
            Chính sách này mô tả cách LogiVN xử lý dữ liệu để vận hành phần mềm gọi món QR, dashboard quản lý quán, thông báo email và các luồng hỗ trợ liên quan. Cập nhật gần nhất: 22/06/2026.
          </p>
        </section>

        <section className="grid gap-5">
          {sections.map((section) => (
            <article key={section.title} className="rounded-lg border border-[#eadfce] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black tracking-normal">{section.title}</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-[#516158]">
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-[#d6eadf] bg-[#f1fbf6] p-6 text-sm leading-7 text-[#305144]">
          <h2 className="text-xl font-black text-[#102a1f]">Liên hệ</h2>
          <p className="mt-3">Câu hỏi về quyền riêng tư hoặc email: <a className="font-bold text-[#0f4d3a]" href="mailto:support@logivn.com">support@logivn.com</a>.</p>
          <p>Lạm dụng email hoặc vấn đề deliverability: <a className="font-bold text-[#0f4d3a]" href="mailto:abuse@logivn.com">abuse@logivn.com</a> hoặc <a className="font-bold text-[#0f4d3a]" href="mailto:postmaster@logivn.com">postmaster@logivn.com</a>.</p>
        </section>
      </div>
    </main>
  );
}
