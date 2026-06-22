import Link from "next/link";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { createSeoMetadata } from "@/lib/seo/metadata";

export const metadata = createSeoMetadata({
  title: "Điều khoản sử dụng LogiVN",
  description: "Điều khoản sử dụng LogiVN cho tài khoản, dữ liệu quán, email thông báo, giới hạn sử dụng và trách nhiệm vận hành.",
  path: "/terms"
});

const terms = [
  {
    title: "Tài khoản và quyền truy cập",
    body: "Bạn chịu trách nhiệm bảo mật tài khoản, phân quyền nhân sự đúng vai trò và thu hồi quyền khi thành viên không còn làm việc với quán."
  },
  {
    title: "Dữ liệu quán và khách hàng",
    body: "Bạn chỉ nhập dữ liệu mà bạn có quyền xử lý. LogiVN xử lý dữ liệu để cung cấp dashboard, QR ordering, báo cáo, thông báo và các tính năng vận hành đã bật."
  },
  {
    title: "Quy định email hợp lệ",
    body: "LogiVN chỉ hỗ trợ email transactional, account, billing và operational notification hợp lệ. Không sử dụng LogiVN để gửi cold outreach, purchased list, scraped list, affiliate spam hoặc nội dung vi phạm chính sách nhà cung cấp hạ tầng."
  },
  {
    title: "Bounce, complaint và tạm dừng gửi",
    body: "LogiVN có thể chặn hoặc tạm dừng gửi email tới địa chỉ hard bounce, complaint hoặc có tín hiệu lạm dụng. Luồng email có bounce/complaint bất thường có thể bị dừng để bảo vệ domain reputation."
  },
  {
    title: "Thông báo không bắt buộc",
    body: "Báo cáo định kỳ, AI Morning Brief và một số thông báo vận hành có thể được quản lý trong dashboard khi tính năng tương ứng khả dụng. Email bảo mật, billing và trạng thái tài khoản có thể là bắt buộc để duy trì dịch vụ."
  },
  {
    title: "Thay đổi dịch vụ",
    body: "LogiVN có thể cập nhật tính năng, provider hạ tầng hoặc chính sách vận hành để cải thiện bảo mật, độ ổn định và khả năng gửi email. Các thay đổi quan trọng sẽ được phản ánh trong tài liệu hoặc giao diện sản phẩm."
  }
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fffaf0] text-[#102a1f]">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-5 py-8 sm:px-8 lg:px-0">
        <header className="flex items-center justify-between gap-4 border-b border-[#eadfce] pb-5">
          <LogiVNLogo href="/" className="h-10" priority />
          <nav className="flex gap-4 text-sm font-semibold text-[#516158]" aria-label="Điều hướng điều khoản">
            <Link href="/privacy" className="hover:text-[#0f4d3a]">Bảo mật</Link>
            <Link href="/pricing" className="hover:text-[#0f4d3a]">Bảng giá</Link>
          </nav>
        </header>

        <section className="space-y-5">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#0f4d3a]">Terms</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">Điều khoản sử dụng LogiVN</h1>
          <p className="max-w-3xl text-base leading-8 text-[#516158]">
            Các điều khoản này áp dụng cho việc sử dụng LogiVN, bao gồm tài khoản, dashboard vận hành, email thông báo, dữ liệu quán và các tích hợp hạ tầng. Cập nhật gần nhất: 22/06/2026.
          </p>
        </section>

        <section className="grid gap-5">
          {terms.map((term) => (
            <article key={term.title} className="rounded-lg border border-[#eadfce] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black tracking-normal">{term.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#516158]">{term.body}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-[#d6eadf] bg-[#f1fbf6] p-6 text-sm leading-7 text-[#305144]">
          <h2 className="text-xl font-black text-[#102a1f]">Liên hệ vận hành</h2>
          <p className="mt-3">Hỗ trợ chung: <a className="font-bold text-[#0f4d3a]" href="mailto:support@logivn.com">support@logivn.com</a>.</p>
          <p>Vấn đề email abuse hoặc deliverability: <a className="font-bold text-[#0f4d3a]" href="mailto:abuse@logivn.com">abuse@logivn.com</a>.</p>
        </section>
      </div>
    </main>
  );
}
