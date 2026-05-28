import Link from "next/link";
import { CheckCircle2, FileText, Globe2 } from "lucide-react";
import {
  MetricCard,
  SectionCard,
  badgeTone,
  formatNumber,
  statusTone
} from "@/features/platform-admin/components/primitives";
import { moduleStatusLabel } from "@/features/platform-admin/labels";
import type { Snapshot } from "@/features/platform-admin/types";

export function ContentControl({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Surfaces" value={formatNumber(snapshot.contentSurfaces.length)} detail="Landing, pricing, blog, QR menu và SEO feed" icon={FileText} tone="info" />
        <MetricCard label="Blog posts" value={formatNumber(snapshot.contentSurfaces.find((item) => item.key === "blog")?.items ?? 0)} detail="Hiện là content-as-code, chưa có draft CMS" icon={Globe2} tone="warning" />
        <MetricCard label="Editable trực tiếp" value={formatNumber(snapshot.contentSurfaces.filter((item) => item.editable === "direct").length)} detail="Các vùng có server action an toàn trên admin.logivn.com" icon={CheckCircle2} tone="good" />
      </div>

      <SectionCard title="Bề mặt public đang quản lý">
        <div className="grid gap-3">
          {snapshot.contentSurfaces.map((surface) => (
            <div key={surface.key} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{surface.name}</p>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">{surface.route}</span>
                    <span className={badgeTone(statusTone(surface.status))}>{moduleStatusLabel[surface.status] ?? surface.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{surface.note}</p>
                </div>
                <Link href={surface.route.startsWith("http") ? surface.route : surface.route} className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
                  Mở trang
                </Link>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                <span>Nguồn: <strong className="text-slate-700">{surface.source}</strong></span>
                <span>Owner: <strong className="text-slate-700">{surface.owner}</strong></span>
                <span>Items: <strong className="text-slate-700">{surface.items}</strong></span>
                <span>Update: <strong className="text-slate-700">{surface.lastUpdated ?? "Theo deploy/data"}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Nâng cấp CMS an toàn">
        <div className="grid gap-2 md:grid-cols-3">
          {[
            ["Draft/Preview", "Mọi sửa landing/blog/pricing đi qua bản nháp và preview URL trước khi publish."],
            ["Publish/Rollback", "Lưu revision immutable để quay lại nội dung cũ nếu SEO hoặc conversion giảm."],
            ["Approval", "Blog, pricing và legal copy cần role Content/Owner duyệt, không sửa thẳng production."]
          ].map(([title, detail]) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">{title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
