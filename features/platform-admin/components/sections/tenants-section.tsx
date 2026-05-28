import { CircleDot } from "lucide-react";
import { updateTenantPlatformStatusAction } from "@/features/platform-admin/actions";
import {
  PrimaryButton,
  SectionCard,
  badgeTone,
  formatDateTime,
  statusTone
} from "@/features/platform-admin/components/primitives";
import { subscriptionStatusLabel, tenantStatusLabel } from "@/features/platform-admin/labels";
import type { Snapshot, Tenant } from "@/features/platform-admin/types";
import type { PlatformAdminPermission, PlatformAdminSession } from "@/lib/platform-admin-auth";

function hasPermission(session: PlatformAdminSession, permission: PlatformAdminPermission) {
  return session.permissions.includes(permission);
}

export function Tenants({ snapshot, session }: { snapshot: Snapshot; session: PlatformAdminSession }) {
  return (
    <SectionCard title="Quản lý vòng đời cửa hàng">
      <div className="grid gap-3">
        {snapshot.tenants.map((tenant) => (
          <details key={tenant.id} className="group rounded-2xl border border-slate-200 bg-white open:bg-slate-50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold text-slate-950">{tenant.name}</h3>
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">{tenant.slug}</span>
                  <span className={badgeTone(statusTone(tenant.platformStatus))}>{tenantStatusLabel[tenant.platformStatus]}</span>
                  <span className={badgeTone(statusTone(tenant.subscriptionStatus ?? "neutral"))}>{subscriptionStatusLabel[tenant.subscriptionStatus ?? ""] ?? "Chưa có gói"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{tenant.planName}</span>
                  <span>{tenant.userCount} user</span>
                  <span>{tenant.daysLeft} ngày còn lại</span>
                  <span>{tenant.domain}</span>
                </div>
              </div>
              <CircleDot className="shrink-0 text-slate-400 transition group-open:rotate-180" size={18} />
            </summary>

            <div className="grid gap-4 border-t border-slate-200 p-4 xl:grid-cols-[1fr_1fr_340px]">
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                {[
                  ["Email chủ quán", tenant.ownerEmails.join(", ") || tenant.contactEmail || "Chưa có"],
                  ["Hotline", tenant.hotline || "Chưa có"],
                  ["Địa chỉ", tenant.address || "Chưa có"],
                  ["Ngày tạo", formatDateTime(tenant.createdAt)],
                  ["Hết hạn kỳ hiện tại", formatDateTime(tenant.periodEnd)],
                  ["Lý do hạn chế", tenant.suspendedReason || "Không có"]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
                    <dd className="mt-2 break-words font-semibold text-slate-950">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Cờ rủi ro</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tenant.riskFlags.map((flag) => <span key={flag} className={badgeTone("warning")}>{flag}</span>)}
                  {!tenant.riskFlags.length ? <span className={badgeTone("good")}>Ổn</span> : null}
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Control plane chỉ quản lý trạng thái và gói của cửa hàng. Dữ liệu đơn hàng/doanh thu vẫn thuộc dashboard riêng của quán.
                </p>
              </div>

              <TenantActions tenant={tenant} session={session} />
            </div>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}

function TenantActions({ tenant, session }: { tenant: Tenant; session: PlatformAdminSession }) {
  const canRestore = tenant.platformStatus !== "active" && hasPermission(session, "tenants.restore");
  const canSuspend = tenant.platformStatus === "active" && hasPermission(session, "tenants.suspend");
  const canDelete = tenant.platformStatus !== "deleted" && hasPermission(session, "tenants.delete");

  return (
    <div className="grid gap-2">
      {canRestore ? <TenantStatusForm tenant={tenant} status="active" label="Mở lại" tone="dark" /> : null}
      {canSuspend ? <TenantStatusForm tenant={tenant} status="suspended" label="Tạm dừng" tone="soft" /> : null}
      {canDelete ? <TenantStatusForm tenant={tenant} status="deleted" label="Xóa mềm" tone="danger" /> : null}
      {!canRestore && !canSuspend && !canDelete ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-500">Chế độ chỉ xem</div>
      ) : null}
    </div>
  );
}

function TenantStatusForm({
  tenant,
  status,
  label,
  tone
}: {
  tenant: Tenant;
  status: "active" | "suspended" | "deleted";
  label: string;
  tone: "dark" | "soft" | "danger";
}) {
  return (
    <form action={updateTenantPlatformStatusAction} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <input type="hidden" name="restaurantId" value={tenant.id} />
      <input type="hidden" name="status" value={status} />
      <input
        name="reason"
        placeholder={status === "active" ? "Ghi chú mở lại" : "Lý do hiển thị trong audit"}
        required={status !== "active"}
        className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
      />
      <PrimaryButton tone={tone}>{label}</PrimaryButton>
    </form>
  );
}
