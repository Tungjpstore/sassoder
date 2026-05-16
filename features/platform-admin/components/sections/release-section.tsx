import { ModuleMap } from "@/features/platform-admin/components/module-map";
import { SectionCard } from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";

export function Release({ snapshot }: { snapshot: Snapshot }) {
  const checklist = [
    "Chạy migration platform billing trên Supabase trước khi bật thu phí",
    "Đặt PLATFORM_ADMIN_PASSWORD và PLATFORM_ADMIN_SESSION_SECRET mạnh ở Vercel",
    "Kết nối Resend để gửi nhắc trial/gia hạn",
    "Thêm cron tự đánh dấu hết hạn/past_due và nhắc thanh toán",
    "Bổ sung audit log bất biến cho mọi thao tác xác minh thanh toán"
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard title="Release hiện tại">
        <dl className="grid gap-3 text-sm">
          {[
            ["App URL", snapshot.environment.appUrl],
            ["Root domain", snapshot.environment.rootDomain],
            ["Supabase", snapshot.environment.supabaseHost],
            ["Vercel env", snapshot.environment.vercelEnv],
            ["Region", snapshot.environment.region],
            ["Commit", snapshot.environment.commit]
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
              <dd className="mt-2 break-all font-mono text-sm text-slate-950">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <div className="grid gap-4">
        <ModuleMap snapshot={snapshot} />
        <SectionCard title="Việc cần làm trước thương mại hoá">
          <div className="grid gap-2">
            {checklist.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-xs font-semibold text-[#FFF7EB]">{index + 1}</span>
                <p className="text-sm leading-6 text-[var(--muted-foreground)]">{item}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
