import { updatePlatformUserStatusAction } from "@/features/platform-admin/actions";
import {
  PrimaryButton,
  SectionCard,
  badgeTone,
  statusTone
} from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";
import type { PlatformAdminPermission, PlatformAdminSession } from "@/lib/platform-admin-auth";

function hasPermission(session: PlatformAdminSession, permission: PlatformAdminPermission) {
  return session.permissions.includes(permission);
}

export function Users({ snapshot, session }: { snapshot: Snapshot; session: PlatformAdminSession }) {
  return (
    <SectionCard title="Quản lý user nền tảng">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
            <tr>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Quán</th>
              <th className="px-3 py-3">Vai trò</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-3 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {snapshot.users.map((user) => (
              <tr key={user.id} className="bg-white">
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-950">{user.email}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{user.id.slice(0, 8)}</p>
                </td>
                <td className="px-3 py-3 text-slate-600">{user.restaurantName}</td>
                <td className="px-3 py-3 text-slate-600">{user.role}</td>
                <td className="px-3 py-3"><span className={badgeTone(statusTone(user.accountStatus))}>{user.accountStatus === "blocked" ? "Đã chặn" : "Đang hoạt động"}</span></td>
                <td className="px-3 py-3">
                  {user.accountStatus === "blocked" && hasPermission(session, "users.restore") ? (
                    <UserStatusForm userId={user.id} status="active" label="Mở" tone="dark" />
                  ) : null}
                  {user.accountStatus !== "blocked" && hasPermission(session, "users.block") ? (
                    <UserStatusForm userId={user.id} status="blocked" label="Chặn" tone="danger" />
                  ) : null}
                  {user.accountStatus === "blocked" && !hasPermission(session, "users.restore") ? <ReadOnlyAction /> : null}
                  {user.accountStatus !== "blocked" && !hasPermission(session, "users.block") ? <ReadOnlyAction /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function UserStatusForm({
  userId,
  status,
  label,
  tone
}: {
  userId: string;
  status: "active" | "blocked";
  label: string;
  tone: "dark" | "danger";
}) {
  return (
    <form action={updatePlatformUserStatusAction} className="ml-auto flex max-w-[360px] justify-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={status} />
      <input name="reason" placeholder="Lý do" required={status === "blocked"} className="h-9 w-40 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
      <PrimaryButton tone={tone}>{label}</PrimaryButton>
    </form>
  );
}

function ReadOnlyAction() {
  return <span className="ml-auto block text-right text-sm font-medium text-slate-500">Chỉ xem</span>;
}
