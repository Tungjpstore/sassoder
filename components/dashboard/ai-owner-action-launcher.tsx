import Link from "next/link";
import {
  ArrowRight,
  BotMessageSquare,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gift,
  GitBranch,
  Megaphone,
  PackagePlus,
  Sparkles,
  Utensils,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type AiOwnerAction = {
  href: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  tone?: "green" | "yellow" | "blue" | "red" | "neutral";
  premium?: boolean;
};

const actionsByVariant: Record<string, AiOwnerAction[]> = {
  ops: [
    { href: "/dashboard/ai-execution", title: "Duyệt việc AI đề xuất", detail: "Xem các việc đáng làm hôm nay và bấm duyệt.", icon: ClipboardCheck, tone: "yellow" },
    { href: "/dashboard/ai-automation", title: "Bật tự động hóa", detail: "Tạo workflow tồn kho, giờ vắng, nhân sự và khách hàng.", icon: GitBranch, tone: "green", premium: true },
    { href: "/dashboard/ai-growth", title: "Tạo chương trình bán hàng", detail: "Viết ưu đãi/caption theo tình hình quán.", icon: Megaphone, tone: "blue", premium: true },
    { href: "/dashboard/ai-menu", title: "Tối ưu menu", detail: "Tạo combo, topping, mô tả và ảnh món.", icon: Utensils, tone: "green" }
  ],
  execution: [
    { href: "/dashboard/ai-apply", title: "Áp dụng việc đã duyệt", detail: "Chuyển đề xuất đã duyệt thành checklist thao tác.", icon: FileCheck2, tone: "green" },
    { href: "/dashboard/ai-automation", title: "Duyệt workflow", detail: "Bật/tắt các workflow cần xác nhận.", icon: GitBranch, tone: "yellow", premium: true },
    { href: "/dashboard/ai-menu", title: "Xử lý menu", detail: "Mở đúng khu vực menu để áp dụng đề xuất.", icon: PackagePlus, tone: "blue" }
  ],
  apply: [
    { href: "/dashboard/ai-execution", title: "Quay lại duyệt", detail: "Duyệt thêm đề xuất trước khi áp dụng.", icon: ClipboardCheck, tone: "yellow" },
    { href: "/dashboard/menu", title: "Mở menu món", detail: "Áp dụng combo, giá, ảnh hoặc mô tả.", icon: Utensils, tone: "green" },
    { href: "/dashboard/promotions", title: "Mở khuyến mãi", detail: "Áp dụng ưu đãi sau khi đã kiểm tra điều kiện.", icon: Gift, tone: "blue" }
  ],
  automation: [
    { href: "/dashboard/ai-execution", title: "Duyệt workflow chờ xử lý", detail: "Các workflow cần chủ quán xác nhận sẽ nằm ở đây.", icon: CheckCircle2, tone: "yellow" },
    { href: "/dashboard/inventory", title: "Xử lý kho", detail: "Mở kho khi AI phát hiện thiếu hàng hoặc hàng bán chậm.", icon: PackagePlus, tone: "green" },
    { href: "/dashboard/staff", title: "Xử lý nhân sự", detail: "Điều chỉnh ca khi AI thấy khung giờ quá tải.", icon: GitBranch, tone: "blue" }
  ],
  menu: [
    { href: "/dashboard/menu", title: "Sửa menu thật", detail: "Mở màn hình menu để đổi món, giá, ảnh và topping.", icon: Utensils, tone: "green" },
    { href: "/dashboard/ai-growth", title: "Tạo campaign từ menu", detail: "Biến món bán chạy thành combo hoặc bài đăng.", icon: Megaphone, tone: "blue", premium: true },
    { href: "/dashboard/ai-execution", title: "Đưa vào hàng duyệt", detail: "Duyệt các đề xuất menu trước khi áp dụng.", icon: ClipboardCheck, tone: "yellow" }
  ],
  growth: [
    { href: "/dashboard/promotions", title: "Tạo khuyến mãi", detail: "Mở khu vực ưu đãi để publish campaign.", icon: Gift, tone: "green" },
    { href: "/dashboard/ai-menu", title: "Lấy ý tưởng từ menu", detail: "Tạo combo và upsell từ món đang bán tốt.", icon: PackagePlus, tone: "blue" },
    { href: "/dashboard/ai-execution", title: "Duyệt campaign", detail: "Chốt nội dung và phạm vi trước khi chạy.", icon: ClipboardCheck, tone: "yellow" }
  ],
  support: [
    { href: "/dashboard/settings", title: "Cập nhật thông tin quán", detail: "Giờ mở cửa, hotline, chính sách và FAQ cho chatbot.", icon: BotMessageSquare, tone: "green" },
    { href: "/dashboard/reservations", title: "Kiểm tra đặt bàn", detail: "Chuẩn hóa câu trả lời về booking và tình trạng bàn.", icon: ClipboardCheck, tone: "blue", premium: true },
    { href: "/dashboard/ai-execution", title: "Duyệt kịch bản hỗ trợ", detail: "Luồng nhạy cảm cần chủ quán xác nhận trước.", icon: CheckCircle2, tone: "yellow" }
  ]
};

export function AiOwnerActionLauncher({
  variant,
  title = "Thao tác nhanh theo ca",
  planCode
}: {
  variant: keyof typeof actionsByVariant;
  title?: string;
  planCode?: string | null;
}) {
  const actions = actionsByVariant[variant] ?? actionsByVariant.ops;
  const showPremiumBadges = planCode !== "premium";

  return (
    <section className="dashboard-panel p-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(240px,0.55fr)_minmax(0,1.45fr)] xl:items-center">
        <div className="min-w-0">
          <p className="dashboard-eyebrow inline-flex items-center gap-2">
            <Sparkles size={15} />
            Shift actions
          </p>
          <h2 className="dashboard-section-title mt-1">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-[var(--muted-foreground)]">
            Chọn đúng việc cần xử lý ngay; mọi nút đều quay về cùng vòng phát hiện, duyệt, tạo nháp và hoàn tất.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {actions.map((action) => {
          const Icon = action.icon;
          const showPremium = showPremiumBadges && action.premium;
          return (
            <Link
              key={`${action.href}-${action.title}`}
              href={action.href}
              className="group flex min-h-20 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--soft-surface)] px-3 py-2.5 transition hover:border-[var(--primary)] hover:bg-[var(--surface)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] transition group-hover:border-[var(--primary)]">
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-[var(--foreground)]">
                  {action.title}
                  {showPremium ? <span className="rounded-full border border-[#F2B36E]/55 bg-[#FFF2DF] px-2 py-0.5 text-[9px] font-black uppercase tracking-normal text-[#A95712]">Premium</span> : null}
                  <ArrowRight className="shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" size={14} />
                </span>
                <span className="mt-0.5 block line-clamp-2 text-xs font-medium leading-5 text-[var(--muted-foreground)]">{action.detail}</span>
              </span>
              <Badge tone={action.tone ?? "neutral"}>Mở</Badge>
            </Link>
          );
          })}
        </div>
      </div>
    </section>
  );
}
