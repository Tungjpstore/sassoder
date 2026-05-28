import {
  SectionCard,
  badgeTone,
  formatDateTime
} from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";

export function Security({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <SectionCard title="Audit 8 lớp bảo mật">
        <div className="grid gap-2">
          {snapshot.securityControls.map((control, index) => (
            <div key={control.layer} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{index + 1}. {control.layer}</p>
                <span className={badgeTone(control.status === "OK" ? "good" : control.status.includes("migration") ? "danger" : "warning")}>{control.status}</span>
              </div>
              <p className="text-xs leading-5 text-slate-500">{control.note}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Biến môi trường">
        <div className="grid gap-2">
          {snapshot.env.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{item.name}</p>
              </div>
              <span className={badgeTone(item.configured ? "good" : item.required ? "danger" : "warning")}>{item.status}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard title="Nhật ký Control Center gần đây">
          <div className="grid max-h-[360px] gap-2 overflow-auto pr-1">
            {snapshot.auditLogs.slice(0, 12).map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-950">{log.action}</span>
                  <span className="text-xs font-semibold text-slate-500">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{log.targetType}{log.targetId ? ` · ${log.targetId}` : ""}</p>
              </div>
            ))}
            {!snapshot.auditLogs.length ? <p className="text-sm text-slate-500">Chưa có log audit hoặc chưa chạy migration audit.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Tín hiệu lạm dụng trial">
          <div className="grid gap-2">
            {snapshot.abuseSignals.map((signal) => (
              <div key={signal.email} className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
                <span className="font-semibold text-slate-950">{signal.email}</span>
                <span className="font-semibold text-orange-700">{signal.count} trial</span>
              </div>
            ))}
            {!snapshot.abuseSignals.length ? <p className="text-sm text-slate-500">Chưa thấy email tạo nhiều trial.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Đăng ký gần đây">
          <div className="grid gap-2">
            {snapshot.registrationIntents.slice(0, 8).map((intent) => (
              <div key={intent.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <span className="min-w-0 truncate font-semibold text-slate-950">{intent.email}</span>
                <span className={badgeTone(intent.consumed ? "good" : "warning")}>{intent.consumed ? "Đã dùng" : "Chờ OTP"}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
