import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { planCatalog } from "@/lib/billing/catalog";
import { PremiumBadge } from "@/components/billing/premium-badge";

const rows = [
  { label: "Số bàn", pro: "20", premium: "300" },
  { label: "Nhân viên", pro: "10", premium: "50" },
  { label: "Món menu", pro: "500", premium: "2.000" },
  { label: "Gọi món QR", pro: true, premium: true },
  { label: "Tạo menu thông minh", pro: "60 lượt/tháng", premium: "300 lượt/tháng" },
  { label: "Trợ lý hỏi đáp", pro: "500 lượt/tháng", premium: "5000 lượt/tháng" },
  { label: "Tạo ảnh món", pro: "1 lần dùng thử", premium: "120 ảnh/tháng" },
  { label: "Báo cáo thông minh", pro: "1 lần dùng thử", premium: "120 lượt/tháng" },
  { label: "Marketing thông minh", pro: false, premium: true },
  { label: "Quy trình tự động", pro: false, premium: true },
  { label: "Tên miền riêng", pro: false, premium: true }
];

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        {value ? <Check size={16} className="text-[var(--primary)]" /> : <Minus size={16} className="text-[var(--muted-foreground)]" />}
      </span>
    );
  }

  return <span className="text-sm font-semibold text-[var(--foreground)]">{value}</span>;
}

export function PlanComparisonTable() {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">So sánh gói</p>
        <h3 className="mt-1 text-xl font-semibold text-[var(--foreground)]">So sánh nhanh Pro và Premium</h3>
      </div>
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-px bg-[var(--border)]">
        <div className="bg-[var(--surface)] px-4 py-3" />
        <div className="bg-[var(--surface)] px-4 py-3">
          <div className="flex flex-col gap-2">
            <PremiumBadge kind="PRO" />
            <p className="font-semibold text-[var(--foreground)]">{planCatalog.pro.name}</p>
          </div>
        </div>
        <div className="bg-[var(--surface)] px-4 py-3">
          <div className="flex flex-col gap-2">
            <PremiumBadge kind="PREMIUM" />
            <p className="font-semibold text-[var(--foreground)]">{planCatalog.premium.name}</p>
          </div>
        </div>
        {rows.map((row) => (
          <Fragment key={row.label}>
            <div key={`${row.label}-label`} className="bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--muted-foreground)]">
              {row.label}
            </div>
            <div key={`${row.label}-pro`} className="bg-[var(--surface)] px-4 py-3">
              <Cell value={row.pro} />
            </div>
            <div key={`${row.label}-premium`} className="bg-[var(--surface)] px-4 py-3">
              <Cell value={row.premium} />
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
